#!/usr/bin/env python3
"""
Compute difficulty scores for each species based on:
1. Spatial constraint: fraction of cells where species occurs (inverted)
2. Average reporting frequency: mean freq across cells where present (inverted)
3. Seasonality: how narrow the peak season window is

Also computes per-sub-region difficulty using the same methodology.

Reads from archive/detections_r4.json and archive/checklists_r4.json.
Outputs pipeline/reference/difficulty_scores.json for merging into species.json.
"""

import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

try:
    import jenkspy
    HAS_JENKSPY = True
except ImportError:
    HAS_JENKSPY = False

# Resolve paths relative to this script
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
REFERENCE_DIR = SCRIPT_DIR / "reference"
REFERENCE_DIR.mkdir(exist_ok=True)
FRONTEND_DATA_DIR = SCRIPT_DIR.parent / "frontend" / "public" / "data"

# Sub-region definitions: key -> (display_name, state_codes, fallback_bbox)
# state_codes: set of eBird STATE CODE values (e.g., "US-ME", "CA-BC")
# fallback_bbox: [west, south, east, north] used when state code is unknown
SUB_REGIONS = {
    'ca-west': ('Western Canada',
                {'CA-BC', 'CA-AB'},
                [-141, 48, -125, 70]),
    'ca-central': ('Central Canada',
                   {'CA-SK', 'CA-MB'},
                   [-120, 48, -89, 70]),
    'ca-east': ('Eastern Canada',
                {'CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-NL', 'CA-PE'},
                [-89, 42, -50, 63]),
    'ca-north': ('Northern Canada',
                 {'CA-YT', 'CA-NT', 'CA-NU'},
                 [-141, 60, -60, 84]),
    'mx-north': ('Northern Mexico',
                 {f'MX-{s}' for s in ['BCN','BCS','SON','CHH','COA','NLE','TAM','SIN',
                  'DUR','ZAC','SLP','AGU','NAY','JAL']},
                 [-118, 20, -86, 33]),
    'mx-south': ('Southern Mexico',
                 {f'MX-{s}' for s in ['COL','MIC','GUA','GRO','OAX','CHP','TAB','VER',
                  'PUE','TLA','HID','MEX','MOR','QUE','CAM','ROO','YUC','CMX','DIF']},
                 [-118, 14, -100, 20]),
    'ca-c-north': ('Northern Central America',
                   {'BZ', 'GT', 'SV', 'HN', 'NI'},
                   [-92, 12, -83, 18]),
    'ca-c-south': ('Southern Central America',
                   {'CR', 'PA'},
                   [-86, 7, -77, 12]),
    'caribbean-greater': ('Greater Antilles',
                          {'CU', 'JM', 'HT', 'DO', 'PR'},
                          [-85, 17, -64, 24]),
    'caribbean-lesser': ('Lesser Antilles',
                         {'TT', 'BB', 'KN', 'VI', 'VG', 'AW', 'MF', 'MQ', 'BQ', 'SX', 'AG', 'DM', 'GD', 'LC', 'VC'},
                         [-70, 10, -59, 19]),
    'atlantic-west': ('Western Atlantic Islands',
                      {'BM', 'BS', 'TC'},
                      [-80, 20, -60, 33]),
    'us-ne': ('Northeastern US',
              {'US-ME', 'US-NH', 'US-VT', 'US-MA', 'US-RI', 'US-CT',
               'US-NY', 'US-NJ', 'US-PA', 'US-DE', 'US-MD', 'US-DC'},
              [-80, 37, -66, 48]),
    'us-se': ('Southeastern US',
              {'US-VA', 'US-WV', 'US-NC', 'US-SC', 'US-GA', 'US-FL',
               'US-AL', 'US-MS', 'US-TN', 'US-KY', 'US-LA', 'US-AR'},
              [-95, 24, -75, 39]),
    'us-mw': ('Midwestern US',
              {'US-OH', 'US-IN', 'US-IL', 'US-MI', 'US-WI', 'US-MN',
               'US-IA', 'US-MO', 'US-ND', 'US-SD', 'US-NE', 'US-KS'},
              [-105, 36, -80, 49]),
    'us-sw': ('Southwestern US',
              {'US-TX', 'US-OK', 'US-NM', 'US-AZ'},
              [-115, 25, -93, 37]),
    'us-west': ('Western US',
                {'US-CA', 'US-OR', 'US-WA'},
                [-125, 32, -116, 49]),
    'us-rockies': ('US Rockies',
                   {'US-NV', 'US-UT', 'US-CO', 'US-WY', 'US-MT', 'US-ID'},
                   [-117, 35, -102, 49]),
    'us-ak': ('Alaska',
              {'US-AK'},
              [-180, 51, -130, 72]),
    'us-hi': ('Hawaii',
              {'US-HI'},
              [-161, 18, -154, 23]),
}

# Build reverse lookup: state_code -> sub_region_id
STATE_TO_REGION = {}
for region_id, (_, state_codes, _) in SUB_REGIONS.items():
    for sc in state_codes:
        STATE_TO_REGION[sc] = region_id


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def compute_species_metrics(species_id, cell_data, checklists, total_cells):
    """Compute raw difficulty metrics for a species given its cell data.

    Args:
        species_id: Species identifier
        cell_data: dict of cell_id -> {week_str: detection_count}
        checklists: dict of cell_id -> {week_str: checklist_count}
        total_cells: Total number of cells in the region (for spatial breadth)

    Returns:
        dict with spatialBreadth, avgFreq, seasonality, numCells,
        totalDetections or None if no data
    """
    num_cells = len(cell_data)
    if num_cells == 0 or total_cells == 0:
        return None

    spatial_breadth = num_cells / total_cells

    total_freq = 0.0
    total_cell_weeks = 0
    weekly_detections = defaultdict(int)

    for cell_id, week_counts in cell_data.items():
        cell_checklists = checklists.get(cell_id, {})
        for week_str, det_count in week_counts.items():
            cl_count = cell_checklists.get(week_str, 0)
            if cl_count > 0:
                freq = det_count / cl_count
                total_freq += freq
                total_cell_weeks += 1
            weekly_detections[int(week_str)] += det_count

    avg_freq = total_freq / total_cell_weeks if total_cell_weeks > 0 else 0

    total_det = sum(weekly_detections.values())
    if total_det > 0 and len(weekly_detections) > 1:
        entropy = 0.0
        for count in weekly_detections.values():
            p = count / total_det
            if p > 0:
                entropy -= p * math.log2(p)
        max_entropy = math.log2(52)
        seasonality = 1 - (entropy / max_entropy)
    else:
        seasonality = 1.0

    return {
        "spatialBreadth": round(spatial_breadth, 4),
        "avgFreq": round(avg_freq, 4),
        "seasonality": round(seasonality, 4),
        "numCells": num_cells,
        "totalDetections": total_det,
    }


def jenks_breaks_10(values):
    """Compute 10-class break points using Jenks natural breaks if available,
    otherwise fall back to decile thresholds.

    Args:
        values: list of float scores

    Returns:
        list of 11 thresholds (10 bin edges + upper bound)
    """
    sorted_vals = sorted(values)
    n = len(sorted_vals)

    if HAS_JENKSPY and n >= 10:
        try:
            breaks = jenkspy.jenks_breaks(sorted_vals, n_classes=10)
            # jenkspy returns n_classes+1 values: [min, break1, ..., max]
            # We need thresholds where bin i covers [breaks[i], breaks[i+1])
            # Add a small epsilon to the last break so the max value is included
            breaks[-1] += 0.01
            return breaks
        except Exception:
            pass  # Fall back to deciles

    # Decile fallback
    thresholds = [sorted_vals[int(n * d / 10)] for d in range(10)] + [sorted_vals[-1] + 0.01]
    return thresholds


def score_to_rating(raw_score, thresholds):
    """Map a raw 0-1 score to a 1-10 rating using pre-computed thresholds."""
    for d in range(10):
        if raw_score < thresholds[d + 1]:
            return d + 1
    return 10


def rank_and_score(species_metrics):
    """Given a dict of species_id -> metrics, compute 1-10 difficulty ratings.

    Weights: 50% spatial (numCells), 35% frequency, 15% seasonality.

    Args:
        species_metrics: dict of species_id -> {spatialBreadth, avgFreq, seasonality,
                         numCells, totalDetections}

    Returns:
        dict of species_id -> int (1-10 difficulty rating)
    """
    species_ids = list(species_metrics.keys())
    n = len(species_ids)
    if n == 0:
        return {}

    def rank_percentiles(values):
        """Convert raw values to 0-1 percentiles (higher value = higher percentile)."""
        indexed = sorted(enumerate(values), key=lambda x: x[1])
        percentiles = [0.0] * len(values)
        for rank, (idx, _) in enumerate(indexed):
            percentiles[idx] = rank / max(n - 1, 1)
        return percentiles

    # Spatial: more cells = easier -> invert so rare = high percentile
    spatial_vals = [species_metrics[sid]["spatialBreadth"] for sid in species_ids]
    spatial_pct = rank_percentiles(spatial_vals)
    spatial_pct = [1 - p for p in spatial_pct]

    # Frequency: higher freq = easier -> invert
    freq_vals = [species_metrics[sid]["avgFreq"] for sid in species_ids]
    freq_pct = rank_percentiles(freq_vals)
    freq_pct = [1 - p for p in freq_pct]

    # Seasonality: higher = more seasonal = harder (no invert)
    season_vals = [species_metrics[sid]["seasonality"] for sid in species_ids]
    season_pct = rank_percentiles(season_vals)

    # Compute combined scores: 50% spatial, 35% frequency, 15% seasonality
    combined = []
    for i, sid in enumerate(species_ids):
        raw_score = (
            0.50 * spatial_pct[i] +
            0.35 * freq_pct[i] +
            0.15 * season_pct[i]
        )
        combined.append((sid, raw_score))

    # Use Jenks natural breaks (or decile fallback) for 1-10 rating
    all_scores = [s for _, s in combined]
    thresholds = jenks_breaks_10(all_scores)

    ratings = {}
    for sid, raw_score in combined:
        rating = score_to_rating(raw_score, thresholds)

        # Apply minimum difficulty floors
        m = species_metrics[sid]
        if m["numCells"] < 20:
            rating = max(rating, 7)
        if m.get("totalDetections", 0) < 500:
            rating = max(rating, 8)

        ratings[sid] = rating

    return ratings


def load_cell_centroids():
    """Load h3_index -> (lng, lat) mapping from r4 grid.geojson."""
    grid_path = FRONTEND_DATA_DIR / "r4" / "grid.geojson"
    if not grid_path.exists():
        print(f"  WARNING: {grid_path} not found, skipping regional difficulty")
        return {}

    grid = load_json(grid_path)
    centroids = {}
    for feat in grid["features"]:
        props = feat["properties"]
        h3_index = props["h3_index"]
        centroids[h3_index] = (props["center_lng"], props["center_lat"])
    return centroids


def cells_in_bbox(centroids, bbox):
    """Return set of h3 indices whose centroids fall within the bounding box.

    Args:
        centroids: dict of h3_index -> (lng, lat)
        bbox: [west, south, east, north]
    """
    west, south, east, north = bbox
    result = set()
    for h3_index, (lng, lat) in centroids.items():
        if west <= lng <= east and south <= lat <= north:
            result.add(h3_index)
    return result


def compute_difficulty_scores():
    print("Loading archive data...")
    detections = load_json(ARCHIVE_DIR / "detections_r4.json")
    checklists = load_json(ARCHIVE_DIR / "checklists_r4.json")
    species_meta = load_json(ARCHIVE_DIR / "species_meta.json")

    total_cells = len(checklists)
    print(f"  {len(detections)} species, {total_cells} cells")

    # ── Global difficulty ──────────────────────────────────────────────

    # Build per-species metrics (global)
    results = {}
    global_metrics = {}
    for species_id, cell_data in detections.items():
        metrics = compute_species_metrics(species_id, cell_data, checklists, total_cells)
        if metrics is None:
            continue
        global_metrics[species_id] = metrics
        results[species_id] = {
            "difficultyScore": 0,
            "difficultyLabel": "",
            "metrics": metrics,
        }

    # Rank-based scoring (global) using shared rank_and_score logic
    # But we need the raw 0-100 score too, so we compute inline with
    # the same weights: 50% spatial, 35% frequency, 15% seasonality
    species_ids = list(results.keys())
    n = len(species_ids)

    def rank_percentiles(values):
        """Convert raw values to 0-1 percentiles (higher value = higher percentile)."""
        indexed = sorted(enumerate(values), key=lambda x: x[1])
        percentiles = [0.0] * len(values)
        for rank, (idx, _) in enumerate(indexed):
            percentiles[idx] = rank / max(n - 1, 1)
        return percentiles

    spatial_vals = [results[sid]["metrics"]["spatialBreadth"] for sid in species_ids]
    spatial_pct = rank_percentiles(spatial_vals)
    spatial_pct = [1 - p for p in spatial_pct]

    freq_vals = [results[sid]["metrics"]["avgFreq"] for sid in species_ids]
    freq_pct = rank_percentiles(freq_vals)
    freq_pct = [1 - p for p in freq_pct]

    season_vals = [results[sid]["metrics"]["seasonality"] for sid in species_ids]
    season_pct = rank_percentiles(season_vals)

    combined = []
    for i, sid in enumerate(species_ids):
        raw_score = (
            0.50 * spatial_pct[i] +
            0.35 * freq_pct[i] +
            0.15 * season_pct[i]
        )
        combined.append((sid, raw_score))

    # Use Jenks natural breaks (or decile fallback) for 1-10 rating
    all_scores = [s for _, s in combined]
    thresholds = jenks_breaks_10(all_scores)

    for sid, raw_score in combined:
        score_1_10 = score_to_rating(raw_score, thresholds)

        # Apply minimum difficulty floors
        m = results[sid]["metrics"]
        if m["numCells"] < 20:
            score_1_10 = max(score_1_10, 7)
        if m.get("totalDetections", 0) < 500:
            score_1_10 = max(score_1_10, 8)

        score_0_100 = round(raw_score * 100, 1)

        if score_1_10 <= 2:
            label = "Easy"
        elif score_1_10 <= 4:
            label = "Moderate"
        elif score_1_10 <= 6:
            label = "Hard"
        elif score_1_10 <= 8:
            label = "Very Hard"
        else:
            label = "Extremely Hard"

        results[sid]["difficultyScore"] = score_0_100
        results[sid]["difficultyRating"] = score_1_10
        results[sid]["difficultyLabel"] = label

    # Distribution on 1-10 scale
    scale_dist = defaultdict(int)
    for r in results.values():
        s = max(1, min(10, round(r["difficultyScore"] / 10)))
        scale_dist[s] += 1
    print(f"\n1-10 scale distribution (global):")
    for i in range(1, 11):
        bar = "#" * (scale_dist.get(i, 0) // 5)
        print(f"  {i:2d}: {scale_dist.get(i, 0):4d} {bar}")

    dist = defaultdict(int)
    for r in results.values():
        dist[r["difficultyLabel"]] += 1
    print(f"\nDifficulty distribution (global):")
    for label in ["Easy", "Moderate", "Hard", "Very Hard", "Extremely Hard"]:
        print(f"  {label}: {dist.get(label, 0)}")

    # ── Regional difficulty ────────────────────────────────────────────

    print("\nComputing regional difficulty...")
    centroids = load_cell_centroids()

    # Load cell state codes from archive (exact state-level assignment)
    cell_states = {}
    cell_states_file = ARCHIVE_DIR / "cell_states_r4.json"
    if cell_states_file.exists():
        cell_states = load_json(cell_states_file)
        print(f"  Loaded cell state codes: {len(cell_states)} cells")

    if centroids:
        # Build region -> set of h3 cells using state codes first, bbox fallback
        region_cells = {k: set() for k in SUB_REGIONS}
        assigned = 0
        for h3_index in checklists.keys():
            state_code = cell_states.get(h3_index, "")
            # Try exact match first, then country prefix (CU-03 → CU)
            resolved = STATE_TO_REGION.get(state_code) or STATE_TO_REGION.get(state_code.split('-')[0]) if state_code else None
            if resolved:
                region_cells[resolved].add(h3_index)
                assigned += 1
            elif h3_index in centroids:
                # Fallback: use bbox detection
                lng, lat = centroids[h3_index]
                for region_key, (_, _, bbox) in SUB_REGIONS.items():
                    west, south, east, north = bbox
                    if west <= lng <= east and south <= lat <= north:
                        region_cells[region_key].add(h3_index)
                        assigned += 1
                        break

        print(f"  Assigned {assigned}/{len(checklists)} cells to sub-regions")
        for region_key, (region_name, _, _) in SUB_REGIONS.items():
            if region_cells[region_key]:
                print(f"  {region_key} ({region_name}): {len(region_cells[region_key])} cells")

        # For each region, compute per-species metrics using only that region's cells
        for region_key, (region_name, _, _) in SUB_REGIONS.items():
            rcells = region_cells[region_key]
            if len(rcells) == 0:
                print(f"  Skipping {region_key}: no cells")
                continue

            # Filter checklists to this region
            region_checklists = {c: v for c, v in checklists.items() if c in rcells}
            region_total_cells = len(region_checklists)
            if region_total_cells == 0:
                continue

            # Compute metrics for each species within this region
            region_metrics = {}
            for species_id, cell_data in detections.items():
                # Filter cell_data to only cells in this region
                filtered_cells = {c: v for c, v in cell_data.items() if c in rcells}
                if not filtered_cells:
                    continue

                metrics = compute_species_metrics(
                    species_id, filtered_cells, region_checklists, region_total_cells
                )
                if metrics is not None:
                    region_metrics[species_id] = metrics

            if len(region_metrics) < 2:
                print(f"  Skipping {region_key}: only {len(region_metrics)} species")
                continue

            # Rank and score within this region
            regional_ratings = rank_and_score(region_metrics)

            # Assign to results
            for sid, rating in regional_ratings.items():
                if sid in results:
                    if "regionalDifficulty" not in results[sid]:
                        results[sid]["regionalDifficulty"] = {}
                    results[sid]["regionalDifficulty"][region_key] = rating

            print(f"  {region_key}: scored {len(regional_ratings)} species")

        # Print summary of regional coverage
        species_with_regional = sum(
            1 for r in results.values() if "regionalDifficulty" in r
        )
        print(f"\n  {species_with_regional}/{len(results)} species have regional difficulty scores")
    else:
        print("  Skipped (no grid data)")

    # ── Manual overrides ─────────────────────────────────────────────

    overrides_path = REFERENCE_DIR / "difficulty_overrides.json"
    if overrides_path.exists():
        with open(overrides_path) as f:
            overrides = json.load(f)
        if overrides:
            overrides_applied = 0
            for sid, override in overrides.items():
                if sid not in results:
                    # Create a stub entry for species not in the computed set
                    results[sid] = {
                        "difficultyScore": 0,
                        "difficultyLabel": "",
                        "metrics": {},
                    }
                if "difficultyScore" in override:
                    results[sid]["difficultyScore"] = override["difficultyScore"]
                if "difficultyRating" in override:
                    rating = override["difficultyRating"]
                    results[sid]["difficultyRating"] = rating
                    if rating <= 2:
                        results[sid]["difficultyLabel"] = "Easy"
                    elif rating <= 4:
                        results[sid]["difficultyLabel"] = "Moderate"
                    elif rating <= 6:
                        results[sid]["difficultyLabel"] = "Hard"
                    elif rating <= 8:
                        results[sid]["difficultyLabel"] = "Very Hard"
                    else:
                        results[sid]["difficultyLabel"] = "Extremely Hard"
                overrides_applied += 1
            print(f"\n  Applied {overrides_applied} manual difficulty overrides")
    else:
        print(f"\n  No difficulty overrides file found — skipping")

    # Save results
    output_path = REFERENCE_DIR / "difficulty_scores.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {len(results)} difficulty scores to {output_path}")

    return results


if __name__ == "__main__":
    compute_difficulty_scores()
