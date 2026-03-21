#!/usr/bin/env python3
"""
Post-smoothing validation for Find-A-Lifer pipeline output.

Checks pipeline output quality by detecting:
1. Species range plausibility (smoothed cells far from any observation cell)
2. Non-pelagic species in ocean-dominated cells
3. Species appearing outside their observed seasonal window
4. Summary statistics

Usage:
    python pipeline/validate_smoothing.py              # Standard report
    python pipeline/validate_smoothing.py --verbose    # Include per-species details
    python pipeline/validate_smoothing.py --res 3      # Check a specific resolution (default: 4)
"""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

try:
    import h3
    HAS_H3 = True
except ImportError:
    HAS_H3 = False

from common import (
    ARCHIVE_DIR, OUTPUT_DIR, OCEAN_FAMILIES,
    res_path, load_json, load_species_json, load_grid, load_covariates,
    build_h3_to_cell_id, build_cell_centroids,
)


# ── Configuration ─────────────────────────────────────────────────────

# Maximum hex rings from nearest observation cell before flagging as implausible
MAX_RING_DISTANCE = 5

# Minimum ocean covariate fraction to consider a cell "ocean-dominated"
OCEAN_CELL_THRESHOLD = 0.90

# Minimum weeks outside observed window before flagging a seasonal anomaly.
# The observed window is the contiguous range of weeks where the species
# was directly detected (from archive detections). If smoothed output
# places the species more than this many weeks outside that range, it's flagged.
SEASONAL_MARGIN_WEEKS = 4


# ── Helpers ───────────────────────────────────────────────────────────

def load_species_meta():
    """Load species metadata: code->family mapping and code->id mapping."""
    species_list, _ = load_species_json()
    code_to_family = {}
    code_to_id = {}
    id_to_code = {}
    for sp in species_list:
        code = sp["speciesCode"]
        code_to_family[code] = sp.get("familyComName", "")
        sid = sp.get("species_id")
        if sid is not None:
            code_to_id[code] = sid
            id_to_code[sid] = code
    return code_to_family, code_to_id, id_to_code


def load_frontend_covariates(res):
    """Load frontend covariates (cell_id keyed, integers).
    Returns {int(cell_id): covariate_dict}."""
    cov_path = res_path(res) / "covariates.json"
    if not cov_path.exists():
        return {}
    raw = load_json(cov_path)
    return {int(k): v for k, v in raw.items()}


def load_all_species_weeks(res):
    """Load all species-weeks files for a resolution.
    Returns {species_code: {week_str: [[cell_id, freq], ...]}}.
    """
    sw_dir = res_path(res) / "species-weeks"
    if not sw_dir.exists():
        return {}
    result = {}
    for f in sorted(sw_dir.glob("*.json")):
        code = f.stem
        result[code] = load_json(f)
    return result


def get_observation_cells_from_archive(res):
    """Load archive detections to find the set of cells where each species
    was directly observed (before smoothing).
    Returns {taxon_id_str: set_of_h3_indices}.
    """
    det_path = ARCHIVE_DIR / f"detections_r{res}.json"
    if not det_path.exists():
        print(f"  WARNING: {det_path} not found, skipping range plausibility check")
        return None
    print(f"  Loading archive detections (this may take a moment)...")
    detections = load_json(det_path)
    # detections: {taxon_id_str: {h3_index: {week_str: count}}}
    result = {}
    for taxon_id, cell_data in detections.items():
        result[taxon_id] = set(cell_data.keys())
    return result


def get_observed_weeks_from_archive(res):
    """Load archive detections to find the observed week range for each species.
    Returns {taxon_id_str: set_of_week_ints}.
    """
    det_path = ARCHIVE_DIR / f"detections_r{res}.json"
    if not det_path.exists():
        return None
    detections = load_json(det_path)
    result = {}
    for taxon_id, cell_data in detections.items():
        weeks = set()
        for _cell, week_counts in cell_data.items():
            for week_str in week_counts:
                weeks.add(int(week_str))
        result[taxon_id] = weeks
    return result


# ── Validation checks ─────────────────────────────────────────────────

def check_range_plausibility(species_weeks, grid, archive_obs_cells,
                             id_to_code, code_to_id, verbose=False):
    """Check if smoothed species appear far from any observation cell.

    For each species, finds all cells in the smoothed output and checks
    whether any are more than MAX_RING_DISTANCE hex rings from the nearest
    cell where the species was directly observed.
    """
    if not HAS_H3:
        print("  SKIPPED: h3 not installed, cannot compute ring distances")
        return []

    if archive_obs_cells is None:
        print("  SKIPPED: archive detections not available")
        return []

    # Build h3_index -> cell_id and cell_id -> h3_index from grid
    h3_to_cid = {}
    cid_to_h3 = {}
    for feat in grid["features"]:
        p = feat["properties"]
        h3idx = p.get("h3_index")
        cid = p["cell_id"]
        if h3idx:
            h3_to_cid[h3idx] = cid
            cid_to_h3[cid] = h3idx

    flagged = []

    for code, weeks_data in species_weeks.items():
        # Find the taxon_id for this species code
        sid = code_to_id.get(code)
        if sid is None:
            continue
        taxon_id_str = str(sid)

        obs_h3 = archive_obs_cells.get(taxon_id_str, set())
        if not obs_h3:
            continue

        # Collect all output cell IDs for this species
        output_cids = set()
        for _week, cells in weeks_data.items():
            for cell_id, _freq in cells:
                output_cids.add(cell_id)

        # Convert output cell IDs to h3 indices
        output_h3 = set()
        for cid in output_cids:
            h3idx = cid_to_h3.get(cid)
            if h3idx:
                output_h3.add(h3idx)

        # Find smoothed-only cells (in output but not in observations)
        smoothed_only = output_h3 - obs_h3
        if not smoothed_only:
            continue

        # For each smoothed-only cell, check distance to nearest observation cell
        far_cells = []
        for cell in smoothed_only:
            # Expand rings outward from the smoothed cell to find nearest observation
            found = False
            for ring in range(1, MAX_RING_DISTANCE + 1):
                try:
                    ring_cells = h3.grid_ring(cell, ring)
                except Exception:
                    break
                if ring_cells & obs_h3:
                    found = True
                    break
            if not found:
                far_cells.append(cell)

        if far_cells:
            flagged.append({
                "code": code,
                "far_cells": len(far_cells),
                "total_output_cells": len(output_h3),
                "total_obs_cells": len(obs_h3),
            })

    flagged.sort(key=lambda x: x["far_cells"], reverse=True)

    print(f"\n  Range plausibility (>{MAX_RING_DISTANCE} rings from nearest observation):")
    print(f"    {len(flagged)} species with implausible spread out of {len(species_weeks)} total")
    if verbose and flagged:
        for item in flagged[:30]:
            print(f"      {item['code']}: {item['far_cells']} far cells "
                  f"(output: {item['total_output_cells']}, obs: {item['total_obs_cells']})")
        if len(flagged) > 30:
            print(f"      ... and {len(flagged) - 30} more")

    return flagged


def check_ocean_cells(species_weeks, covariates, code_to_family, verbose=False):
    """Flag non-pelagic species appearing in cells with high ocean covariate.

    Uses the frontend covariates (cell_id keyed) to find ocean-dominated cells,
    then checks which species in those cells belong to non-ocean families.
    """
    if not covariates:
        print("  SKIPPED: covariates not available")
        return []

    # Identify ocean-dominated cells
    ocean_cells = set()
    for cid, cov in covariates.items():
        ocean_frac = cov.get("ocean", 0)
        water_frac = cov.get("water", 0)
        # Use the higher of ocean and water (some cells may have legacy format)
        if max(ocean_frac, water_frac) >= OCEAN_CELL_THRESHOLD:
            ocean_cells.add(cid)

    if not ocean_cells:
        print(f"\n  Ocean cell check: no cells with ocean >= {OCEAN_CELL_THRESHOLD}")
        return []

    # Check each species for appearances in ocean cells
    flagged = []
    for code, weeks_data in species_weeks.items():
        family = code_to_family.get(code, "")
        if family in OCEAN_FAMILIES:
            continue  # Expected to be in ocean cells

        ocean_appearances = 0
        total_cell_weeks = 0
        for _week, cells in weeks_data.items():
            for cell_id, freq in cells:
                total_cell_weeks += 1
                if cell_id in ocean_cells:
                    ocean_appearances += 1

        if ocean_appearances > 0:
            flagged.append({
                "code": code,
                "family": family,
                "ocean_cell_weeks": ocean_appearances,
                "total_cell_weeks": total_cell_weeks,
                "pct": round(100 * ocean_appearances / max(total_cell_weeks, 1), 1),
            })

    flagged.sort(key=lambda x: x["ocean_cell_weeks"], reverse=True)

    print(f"\n  Ocean cell check ({len(ocean_cells)} ocean-dominated cells):")
    print(f"    {len(flagged)} non-pelagic species found in ocean cells")
    if verbose and flagged:
        for item in flagged[:30]:
            print(f"      {item['code']} ({item['family']}): "
                  f"{item['ocean_cell_weeks']} ocean cell-weeks "
                  f"({item['pct']}% of {item['total_cell_weeks']} total)")
        if len(flagged) > 30:
            print(f"      ... and {len(flagged) - 30} more")

    return flagged


def check_seasonal_windows(species_weeks, observed_weeks, id_to_code,
                           code_to_id, verbose=False):
    """Flag species appearing in weeks far outside their observed seasonal window.

    Compares weeks present in smoothed output against the observed week range
    from archive detections. Flags species where smoothed output places them
    more than SEASONAL_MARGIN_WEEKS outside the observed range.
    """
    if observed_weeks is None:
        print("  SKIPPED: archive detections not available")
        return []

    flagged = []

    for code, weeks_data in species_weeks.items():
        sid = code_to_id.get(code)
        if sid is None:
            continue
        taxon_id_str = str(sid)

        obs_weeks = observed_weeks.get(taxon_id_str, set())
        if not obs_weeks or len(obs_weeks) >= 48:
            # Year-round species: skip (almost all weeks observed)
            continue

        # Get weeks present in smoothed output
        output_weeks = set()
        for week_str in weeks_data:
            output_weeks.add(int(week_str))

        if not output_weeks:
            continue

        # Find weeks in output but not within margin of observed weeks.
        # Account for wrap-around (week 52 is close to week 1).
        # Build the set of "allowed" weeks: observed weeks expanded by margin.
        allowed = set()
        for w in obs_weeks:
            for offset in range(-SEASONAL_MARGIN_WEEKS, SEASONAL_MARGIN_WEEKS + 1):
                aw = w + offset
                if aw < 1:
                    aw += 52
                elif aw > 52:
                    aw -= 52
                allowed.add(aw)

        anomalous_weeks = output_weeks - allowed
        if anomalous_weeks:
            flagged.append({
                "code": code,
                "anomalous_weeks": sorted(anomalous_weeks),
                "observed_range": f"{min(obs_weeks)}-{max(obs_weeks)}",
                "num_obs_weeks": len(obs_weeks),
                "num_output_weeks": len(output_weeks),
                "num_anomalous": len(anomalous_weeks),
            })

    flagged.sort(key=lambda x: x["num_anomalous"], reverse=True)

    print(f"\n  Seasonal window check (margin: +/-{SEASONAL_MARGIN_WEEKS} weeks):")
    print(f"    {len(flagged)} species with out-of-season appearances")
    if verbose and flagged:
        for item in flagged[:30]:
            print(f"      {item['code']}: {item['num_anomalous']} anomalous weeks "
                  f"{item['anomalous_weeks'][:8]}{'...' if len(item['anomalous_weeks']) > 8 else ''} "
                  f"(observed: {item['observed_range']}, {item['num_obs_weeks']} weeks)")
        if len(flagged) > 30:
            print(f"      ... and {len(flagged) - 30} more")

    return flagged


def print_summary_stats(species_weeks, grid, covariates, res):
    """Print overall summary statistics about the pipeline output."""
    total_species = len(species_weeks)

    # Count cells with data across all weeks
    cells_with_data = set()
    total_cell_species_records = 0
    for code, weeks_data in species_weeks.items():
        for _week, cells in weeks_data.items():
            for cell_id, _freq in cells:
                cells_with_data.add(cell_id)
                total_cell_species_records += 1

    total_grid_cells = len(grid["features"]) if grid else 0
    smoothed_cells = sum(
        1 for f in grid["features"]
        if f["properties"].get("smoothed")
    ) if grid else 0

    print(f"\n  Summary statistics (res {res}):")
    print(f"    Species with output data: {total_species}")
    print(f"    Grid cells: {total_grid_cells} total, "
          f"{total_grid_cells - smoothed_cells} direct, "
          f"{smoothed_cells} smoothed")
    print(f"    Cells with species data: {len(cells_with_data)}")
    print(f"    Total cell-species-week records: {total_cell_species_records:,}")
    if covariates:
        print(f"    Cells with covariates: {len(covariates)}")

    # Per-species stats
    sp_cell_counts = []
    sp_week_counts = []
    for code, weeks_data in species_weeks.items():
        sp_cells = set()
        sp_weeks = set()
        for week_str, cells in weeks_data.items():
            sp_weeks.add(int(week_str))
            for cell_id, _freq in cells:
                sp_cells.add(cell_id)
        sp_cell_counts.append(len(sp_cells))
        sp_week_counts.append(len(sp_weeks))

    if sp_cell_counts:
        sp_cell_counts.sort()
        sp_week_counts.sort()
        n = len(sp_cell_counts)
        print(f"    Species cell count: median={sp_cell_counts[n//2]}, "
              f"min={sp_cell_counts[0]}, max={sp_cell_counts[-1]}")
        print(f"    Species week count: median={sp_week_counts[n//2]}, "
              f"min={sp_week_counts[0]}, max={sp_week_counts[-1]}")


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Validate smoothed pipeline output for Find-A-Lifer")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show per-species details for flagged issues")
    parser.add_argument("--res", type=int, default=4,
                        help="H3 resolution to validate (default: 4)")
    args = parser.parse_args()

    res = args.res
    print(f"Validating pipeline output at resolution {res}...")

    # Load data
    rp = res_path(res)
    if not rp.exists():
        print(f"ERROR: resolution directory {rp} does not exist")
        sys.exit(1)

    print("Loading species metadata...")
    code_to_family, code_to_id, id_to_code = load_species_meta()

    print("Loading grid...")
    grid = load_grid(res)

    print("Loading frontend covariates...")
    covariates = load_frontend_covariates(res)

    print("Loading species-weeks files...")
    species_weeks = load_all_species_weeks(res)
    if not species_weeks:
        print(f"ERROR: no species-weeks files found in {rp / 'species-weeks'}")
        sys.exit(1)

    # Summary stats
    print_summary_stats(species_weeks, grid, covariates, res)

    # Run validation checks
    issues = {}

    # 1. Range plausibility
    print("\nLoading archive detections for range check...")
    archive_obs = get_observation_cells_from_archive(res)
    range_issues = check_range_plausibility(
        species_weeks, grid, archive_obs,
        id_to_code, code_to_id, verbose=args.verbose)
    issues["range_plausibility"] = range_issues

    # 2. Ocean cell check
    ocean_issues = check_ocean_cells(
        species_weeks, covariates, code_to_family, verbose=args.verbose)
    issues["ocean_cells"] = ocean_issues

    # 3. Seasonal window check
    print("\nLoading archive detections for seasonal check...")
    # Reuse detections if already loaded (same file), otherwise load observed weeks
    observed_weeks = get_observed_weeks_from_archive(res)
    seasonal_issues = check_seasonal_windows(
        species_weeks, observed_weeks,
        id_to_code, code_to_id, verbose=args.verbose)
    issues["seasonal_windows"] = seasonal_issues

    # Final summary
    total_issues = sum(len(v) for v in issues.values())
    print(f"\n{'='*60}")
    print(f"  Validation complete: {total_issues} species flagged across all checks")
    print(f"    Range plausibility: {len(issues['range_plausibility'])} species")
    print(f"    Ocean cells:        {len(issues['ocean_cells'])} species")
    print(f"    Seasonal windows:   {len(issues['seasonal_windows'])} species")
    print(f"{'='*60}")

    return issues


if __name__ == "__main__":
    main()
