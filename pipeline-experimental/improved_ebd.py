#!/usr/bin/env python3
"""
Improved EBD Processor — Experimental Fork

This is an isolated fork of pipeline/process_ebd.py with toggleable improvement
flags. It does NOT modify the production pipeline. Used by experiment.py to
test each improvement independently.

Each improvement is controlled by a flag dict:
    flags = {
        'normalize_effort': True,         # Exp 1: per-hour normalization
        'min_duration': 10,               # Exp 1: lowered minimum (default 30)
        'include_area_protocol': True,     # Exp 2: add Area protocol
        'include_nocturnal': True,         # Exp 6: add Nocturnal Flight Call
        'include_historical_presence': True, # Exp 6: Historical as presence-only
        'observer_weight': True,           # Exp 3: weight by observer experience
        'recency_weight': True,            # Exp 4: time-decay weighting
        'recency_half_life': 10,           # Exp 4: half-life in years
        'partial_checklists': True,        # Exp 5: partial checklist recovery
        'partial_discount': 0.3,           # Exp 5: discount factor
        'min_checklists': 2,              # Exp 6: lower min threshold
        'max_distance': 16,               # Exp 6: relaxed distance filter
    }
"""

import gzip
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

# Add paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "pipeline"))

from common import (
    DATA_DIR, DOWNLOADS_DIR, ARCHIVE_DIR, REFERENCE_DIR,
    SUB_REGIONS, STATE_TO_REGION, OCEAN_FAMILIES,
)

import h3

# ── Default configuration (matches current production pipeline) ───────

DEFAULTS = {
    "min_duration": 30,
    "max_duration": 300,
    "max_distance": 8,
    "protocols": {"Stationary", "Traveling"},
    "min_checklists": 5,
    "min_checklists_pooled": 3,
    "year_min": 1900,
    "year_max": 2025,
    "normalize_effort": False,
    "include_area_protocol": False,
    "include_nocturnal": False,
    "include_historical_presence": False,
    "observer_weight": False,
    "recency_weight": False,
    "recency_half_life": 10,
    "partial_checklists": False,
    "partial_discount": 0.3,
}

CURRENT_YEAR = 2025
RESOLUTION = 4  # Test at res 4 only


def get_config(flags: dict) -> dict:
    """Merge experiment flags with defaults."""
    cfg = dict(DEFAULTS)
    cfg.update(flags)

    # Build protocol set
    protocols = {"Stationary", "Traveling"}
    if cfg.get("include_area_protocol"):
        protocols.add("Area")
    if cfg.get("include_nocturnal"):
        protocols.add("Nocturnal Flight Call")
    cfg["protocols"] = protocols

    return cfg


# ── EBD file reading ──────────────────────────────────────────────────

def open_ebd(path):
    """Open EBD file (handles .gz and plain text)."""
    if str(path).endswith(".gz"):
        return gzip.open(str(path), "rt", encoding="utf-8", errors="replace")
    return open(str(path), "r", encoding="utf-8", errors="replace")


def get_week(month, day):
    """Convert month/day to week number (1-52)."""
    from datetime import date
    try:
        d = date(2024, month, day)  # Use a leap year
        day_of_year = d.timetuple().tm_yday
        week = max(1, min(52, (day_of_year - 1) // 7 + 1))
        return week
    except (ValueError, OverflowError):
        return None


# ── Phase 1: Process Sampling Events ──────────────────────────────────

def process_sampling(ebd_files, cfg, region_cells):
    """Read sampling event data from EBD files. Returns valid checklists.

    Returns:
        valid_checklists: {sampling_event_id: {
            'cell_id': int, 'week': int, 'duration': float,
            'year': int, 'observer_id': str, 'complete': bool
        }}
        observer_counts: {observer_id: total_checklists} (for observer weighting)
    """
    valid_checklists = {}
    partial_checklists = {}  # For partial checklist recovery
    observer_counts = defaultdict(int)

    accepted = 0
    rejected = 0
    partial_accepted = 0

    for ebd_path in ebd_files:
        print(f"  Reading sampling events from: {ebd_path.name}")
        with open_ebd(ebd_path) as f:
            header = f.readline().strip().split("\t")

            # Find column indices
            col = {}
            needed = [
                "SAMPLING EVENT IDENTIFIER", "OBSERVATION DATE", "PROTOCOL TYPE",
                "ALL SPECIES REPORTED", "DURATION MINUTES", "EFFORT DISTANCE KM",
                "LATITUDE", "LONGITUDE", "OBSERVER ID", "CATEGORY",
                "TAXONOMIC ORDER", "COMMON NAME", "SCIENTIFIC NAME",
            ]
            for i, name in enumerate(header):
                if name in needed:
                    col[name] = i

            # Check if this is the sampling file or the obs file
            has_category = "CATEGORY" in col
            if has_category:
                # This is the observations file — we need to extract sampling data from it
                seen_events = set()
                for line in f:
                    fields = line.strip().split("\t")
                    if len(fields) <= max(col.values()):
                        continue

                    event_id = fields[col["SAMPLING EVENT IDENTIFIER"]]
                    if event_id in seen_events:
                        continue  # Already processed this event

                    # Parse observation date
                    try:
                        date_str = fields[col["OBSERVATION DATE"]]
                        parts = date_str.split("-")
                        year = int(parts[0])
                        month = int(parts[1])
                        day = int(parts[2])
                    except (ValueError, IndexError):
                        rejected += 1
                        continue

                    if year < cfg["year_min"] or year > cfg["year_max"]:
                        rejected += 1
                        continue

                    # Protocol filter
                    protocol = fields[col["PROTOCOL TYPE"]]
                    is_historical = protocol == "Historical"
                    is_partial_protocol = is_historical and cfg.get("include_historical_presence")

                    if protocol not in cfg["protocols"] and not is_partial_protocol:
                        rejected += 1
                        continue

                    # Completeness
                    complete = fields[col["ALL SPECIES REPORTED"]] == "1"
                    if not complete and not cfg["partial_checklists"] and not is_partial_protocol:
                        rejected += 1
                        continue

                    # Duration
                    try:
                        duration = float(fields[col["DURATION MINUTES"]])
                    except (ValueError, IndexError):
                        if is_partial_protocol:
                            duration = 60  # Assume 1hr for historical
                        else:
                            rejected += 1
                            continue

                    if duration < cfg["min_duration"] or duration > cfg["max_duration"]:
                        if not is_partial_protocol:
                            rejected += 1
                            continue

                    # Distance
                    try:
                        dist_str = fields[col["EFFORT DISTANCE KM"]]
                        if dist_str and dist_str.strip():
                            dist = float(dist_str)
                            if dist > cfg["max_distance"]:
                                rejected += 1
                                continue
                    except (ValueError, IndexError):
                        pass  # Missing distance is OK for stationary

                    # Coordinates → H3 cell
                    try:
                        lat = float(fields[col["LATITUDE"]])
                        lng = float(fields[col["LONGITUDE"]])
                    except (ValueError, IndexError):
                        rejected += 1
                        continue

                    cell_id = h3.latlng_to_cell(lat, lng, RESOLUTION)
                    cell_int = int(cell_id, 16)

                    week = get_week(month, day)
                    if week is None:
                        rejected += 1
                        continue

                    # Observer ID
                    observer_id = fields[col.get("OBSERVER ID", 0)] if "OBSERVER ID" in col else "unknown"
                    observer_counts[observer_id] += 1

                    seen_events.add(event_id)

                    checklist_data = {
                        "cell_id": cell_int,
                        "week": week,
                        "duration": duration,
                        "year": year,
                        "observer_id": observer_id,
                        "complete": complete,
                        "is_presence_only": is_partial_protocol or (not complete and cfg["partial_checklists"]),
                    }

                    if complete:
                        valid_checklists[event_id] = checklist_data
                        accepted += 1
                    elif cfg["partial_checklists"] or is_partial_protocol:
                        partial_checklists[event_id] = checklist_data
                        partial_accepted += 1

    print(f"  Sampling events: {accepted:,} complete, {partial_accepted:,} partial, {rejected:,} rejected")
    print(f"  Unique observers: {len(observer_counts):,}")

    return valid_checklists, partial_checklists, observer_counts


# ── Phase 2: Process Observations ─────────────────────────────────────

def process_observations(ebd_files, valid_checklists, partial_checklists, cfg):
    """Read species observations from EBD files. Returns detection data.

    Returns:
        detections: {cell_id: {week: {species_code: [checklist_metadata...]}}}
        partial_detections: {cell_id: {week: {species_code: count}}}
    """
    detections = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    partial_detections = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))

    matched = 0
    skipped = 0

    all_checklists = {**valid_checklists, **partial_checklists}

    for ebd_path in ebd_files:
        print(f"  Reading observations from: {ebd_path.name}")
        with open_ebd(ebd_path) as f:
            header = f.readline().strip().split("\t")
            col = {}
            for i, name in enumerate(header):
                col[name] = i

            if "CATEGORY" not in col or "SAMPLING EVENT IDENTIFIER" not in col:
                print(f"    Skipping {ebd_path.name}: missing required columns")
                continue

            for line in f:
                fields = line.strip().split("\t")
                if len(fields) <= col.get("CATEGORY", 0):
                    continue

                # Only count species-level observations
                if fields[col["CATEGORY"]] != "species":
                    continue

                event_id = fields[col["SAMPLING EVENT IDENTIFIER"]]
                cl = all_checklists.get(event_id)
                if cl is None:
                    skipped += 1
                    continue

                species_code = fields[col.get("SPECIES CODE", col.get("COMMON NAME", 0))]
                cell_id = cl["cell_id"]
                week = cl["week"]

                if cl.get("is_presence_only"):
                    partial_detections[cell_id][week][species_code] += 1
                else:
                    detections[cell_id][week][species_code].append({
                        "duration": cl["duration"],
                        "year": cl["year"],
                        "observer_id": cl["observer_id"],
                    })
                    matched += 1

    print(f"  Observations matched: {matched:,}, skipped: {skipped:,}")
    return detections, partial_detections


# ── Phase 3: Compute Frequencies ──────────────────────────────────────

def compute_frequencies(detections, partial_detections, valid_checklists,
                        observer_counts, cfg):
    """Compute reporting frequencies with all experimental improvements.

    Returns:
        cell_week_species: {cell_id: {week: [(species_code, freq), ...]}}
        cell_checklists: {cell_id: {week: count}}
    """
    # Build cell→week→checklists index
    cell_checklists = defaultdict(lambda: defaultdict(int))
    cell_week_checklist_details = defaultdict(lambda: defaultdict(list))

    for event_id, cl in valid_checklists.items():
        cell_id = cl["cell_id"]
        week = cl["week"]
        cell_checklists[cell_id][week] += 1
        cell_week_checklist_details[cell_id][week].append(cl)

    min_cl = cfg.get("min_checklists", 5)
    min_cl_pooled = cfg.get("min_checklists_pooled", 3)

    cell_week_species = defaultdict(lambda: defaultdict(list))

    # Process each cell
    for cell_id, week_data in detections.items():
        for week in range(1, 53):
            # Check if enough checklists (with temporal pooling)
            direct_count = cell_checklists[cell_id].get(week, 0)

            if direct_count >= min_cl:
                # Enough data — compute frequency directly
                pass
            else:
                # Try temporal pooling ±1 week
                prev_week = 52 if week == 1 else week - 1
                next_week = 1 if week == 52 else week + 1
                pooled_count = (
                    cell_checklists[cell_id].get(prev_week, 0) +
                    direct_count +
                    cell_checklists[cell_id].get(next_week, 0)
                )
                if pooled_count < min_cl_pooled:
                    continue

            # Gather species detected this week
            species_in_week = week_data.get(week, {})

            # Also gather from adjacent weeks if pooling
            if direct_count < min_cl:
                prev_week = 52 if week == 1 else week - 1
                next_week = 1 if week == 52 else week + 1
                for adj_week in [prev_week, next_week]:
                    for sp, obs_list in week_data.get(adj_week, {}).items():
                        if sp not in species_in_week:
                            species_in_week[sp] = []
                        species_in_week[sp] = species_in_week.get(sp, []) + obs_list

            for species_code, obs_list in species_in_week.items():
                if not obs_list:
                    continue

                # ── Compute frequency with improvements ──

                if cfg.get("normalize_effort"):
                    # Exp 1: Effort-normalized frequency
                    # Each detection contributes 1/effort_hours
                    weighted_detections = 0.0
                    total_effort_weight = 0.0

                    # Get all checklists for this cell/week (and adjacent if pooling)
                    relevant_weeks = [week]
                    if direct_count < min_cl:
                        relevant_weeks = [prev_week, week, next_week]

                    all_cls = []
                    for w in relevant_weeks:
                        all_cls.extend(cell_week_checklist_details[cell_id].get(w, []))

                    for obs in obs_list:
                        effort_hours = max(obs["duration"] / 60.0, 0.25)  # Floor at 15 min
                        weight = 1.0

                        # Apply observer weight
                        if cfg.get("observer_weight"):
                            obs_count = observer_counts.get(obs["observer_id"], 1)
                            weight *= min(1.0, math.log10(max(1, obs_count)) / 3.0)

                        # Apply recency weight
                        if cfg.get("recency_weight"):
                            half_life = cfg.get("recency_half_life", 10)
                            age = CURRENT_YEAR - obs["year"]
                            weight *= 0.5 ** (age / half_life)

                        weighted_detections += weight / effort_hours

                    # Total weighted effort across all checklists
                    for cl in all_cls:
                        effort_hours = max(cl["duration"] / 60.0, 0.25)
                        cl_weight = 1.0

                        if cfg.get("observer_weight"):
                            obs_count = observer_counts.get(cl["observer_id"], 1)
                            cl_weight *= min(1.0, math.log10(max(1, obs_count)) / 3.0)

                        if cfg.get("recency_weight"):
                            half_life = cfg.get("recency_half_life", 10)
                            age = CURRENT_YEAR - cl["year"]
                            cl_weight *= 0.5 ** (age / half_life)

                        total_effort_weight += cl_weight / effort_hours

                    freq = weighted_detections / total_effort_weight if total_effort_weight > 0 else 0

                else:
                    # Standard frequency: detections / checklists
                    n_detections = len(obs_list)
                    n_checklists = 0

                    relevant_weeks = [week]
                    if direct_count < min_cl:
                        relevant_weeks = [prev_week, week, next_week]

                    for w in relevant_weeks:
                        n_checklists += cell_checklists[cell_id].get(w, 0)

                    # Apply weighting to detection count
                    if cfg.get("observer_weight") or cfg.get("recency_weight"):
                        weighted_det = 0.0
                        weighted_cl = 0.0

                        for obs in obs_list:
                            weight = 1.0
                            if cfg.get("observer_weight"):
                                obs_count = observer_counts.get(obs["observer_id"], 1)
                                weight *= min(1.0, math.log10(max(1, obs_count)) / 3.0)
                            if cfg.get("recency_weight"):
                                half_life = cfg.get("recency_half_life", 10)
                                age = CURRENT_YEAR - obs["year"]
                                weight *= 0.5 ** (age / half_life)
                            weighted_det += weight

                        # Weight checklists too
                        for w in relevant_weeks:
                            for cl in cell_week_checklist_details[cell_id].get(w, []):
                                weight = 1.0
                                if cfg.get("observer_weight"):
                                    obs_count = observer_counts.get(cl["observer_id"], 1)
                                    weight *= min(1.0, math.log10(max(1, obs_count)) / 3.0)
                                if cfg.get("recency_weight"):
                                    half_life = cfg.get("recency_half_life", 10)
                                    age = CURRENT_YEAR - cl["year"]
                                    weight *= 0.5 ** (age / half_life)
                                weighted_cl += weight

                        freq = weighted_det / weighted_cl if weighted_cl > 0 else 0
                    else:
                        freq = n_detections / n_checklists if n_checklists > 0 else 0

                # Partial checklist boost (Exp 5)
                if cfg.get("partial_checklists"):
                    partial_det = partial_detections.get(cell_id, {}).get(week, {}).get(species_code, 0)
                    if partial_det > 0 and direct_count >= 3:
                        discount = cfg.get("partial_discount", 0.3)
                        boost = partial_det / (partial_det + direct_count)
                        freq = freq + (1 - freq) * boost * discount

                # Clamp
                freq = max(0.001, min(1.0, freq))

                cell_week_species[cell_id][week].append((species_code, freq))

    print(f"  Frequency computation complete:")
    print(f"    Cells with data: {len(cell_week_species)}")
    total_records = sum(len(sp) for weeks in cell_week_species.values() for sp in weeks.values())
    print(f"    Total species-cell-week records: {total_records:,}")

    return dict(cell_week_species), dict(cell_checklists)


# ── Grid neighbors ────────────────────────────────────────────────────

def build_grid_neighbors(cells):
    """Build neighbor map for smoothness computation."""
    neighbors = {}
    cell_set = set(cells)
    for cell_int in cells:
        cell_hex = hex(cell_int)[2:]
        try:
            ring = h3.grid_ring(cell_hex, 1)
            neighbors[cell_int] = [int(n, 16) for n in ring if int(n, 16) in cell_set]
        except Exception:
            neighbors[cell_int] = []
    return neighbors


# ── Main entry point ──────────────────────────────────────────────────

def process_region(region: str, ebd_files: list, flags: dict):
    """Process a region with the given experiment flags.

    Args:
        region: Region code (e.g., "US-ME")
        ebd_files: List of Path objects to EBD files
        flags: Experiment flag dict

    Returns:
        cell_week_species: {cell_id: {week: [(species_code, freq), ...]}}
        cell_checklists: {cell_id: {week: count}}
        grid_neighbors: {cell_id: [neighbor_cell_ids]}
    """
    cfg = get_config(flags)

    print(f"\n  Config:")
    for k, v in cfg.items():
        if k != "protocols":
            print(f"    {k}: {v}")
    print(f"    protocols: {cfg['protocols']}")

    # Get cells for this region
    region_cells = set()  # Will be populated during processing

    # Phase 1: Process sampling events
    print(f"\n  Phase 1: Processing sampling events...")
    valid_cl, partial_cl, observer_counts = process_sampling(ebd_files, cfg, region_cells)

    # Phase 2: Process observations
    print(f"\n  Phase 2: Processing observations...")
    detections, partial_detections = process_observations(ebd_files, valid_cl, partial_cl, cfg)

    # Phase 3: Compute frequencies
    print(f"\n  Phase 3: Computing frequencies...")
    cell_week_species, cell_checklists = compute_frequencies(
        detections, partial_detections, valid_cl, observer_counts, cfg
    )

    # Build neighbor map
    all_cells = set()
    for cell_id in cell_week_species:
        all_cells.add(cell_id)
    grid_neighbors = build_grid_neighbors(all_cells)

    return cell_week_species, cell_checklists, grid_neighbors


if __name__ == "__main__":
    print("This module is meant to be imported by experiment.py")
    print("Run: python pipeline-experimental/experiment.py")
