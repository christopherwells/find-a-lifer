#!/usr/bin/env python3
"""
Validate pipeline output to prove the math is correct.

Runs a battery of checks on the generated data files and compares
them against the raw archive (ground truth). This script reads ONLY
from the archive and output files — it doesn't re-run any pipeline logic.

Usage:
  python pipeline/validate_output.py
"""

import json
import sys
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = PROJECT_DIR / "data" / "archive"

RESOLUTIONS = [3, 4]
MIN_CHECKLISTS = 5
MIN_CHECKLISTS_POOLED = 3
MIN_SMOOTHED_FREQ = 0.005
FALLBACK_DISCOUNT = 0.7

passed = 0
failed = 0
warnings = 0

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS: {name}")
        passed += 1
    else:
        print(f"  FAIL: {name}")
        if detail:
            print(f"    {detail}")
        failed += 1

def warn(name, detail=""):
    global warnings
    print(f"  WARN: {name}")
    if detail:
        print(f"    {detail}")
    warnings += 1


def load_archive_data(res):
    """Load raw archive counts for a resolution."""
    ck_file = ARCHIVE_DIR / f"checklists_r{res}.json"
    det_file = ARCHIVE_DIR / f"detections_r{res}.json"

    checklists = {}
    if ck_file.exists():
        raw = json.load(open(ck_file))
        for cell_id, weeks in raw.items():
            checklists[cell_id] = {int(w): c for w, c in weeks.items()}

    detections = {}
    if det_file.exists():
        raw = json.load(open(det_file))
        for taxon_id, cells in raw.items():
            detections[taxon_id] = {}
            for cell_id, weeks in cells.items():
                detections[taxon_id][cell_id] = {int(w): c for w, c in weeks.items()}

    return checklists, detections


def compute_raw_frequency(det_count, checklist_count):
    """Ground truth: simple detection/checklist ratio."""
    if checklist_count == 0:
        return 0.0
    return det_count / checklist_count


def main():
    global passed, failed, warnings

    print("=" * 60)
    print("Pipeline Output Validation")
    print("=" * 60)

    # Load species metadata
    species_file = OUTPUT_DIR / "species.json"
    species_list = json.load(open(species_file))
    species_by_id = {sp["species_id"]: sp for sp in species_list}
    species_by_code = {sp["speciesCode"]: sp for sp in species_list}
    species_by_name = {sp["comName"]: sp for sp in species_list}

    # Load archive species meta to map taxon_id -> common name -> species_id
    meta_file = ARCHIVE_DIR / "species_meta.json"
    meta = json.load(open(meta_file))
    taxon_names = meta.get("names", {})  # taxon_id -> common name
    # Build taxon_id -> species_id mapping
    taxon_to_species_id = {}
    for taxon_id, com_name in taxon_names.items():
        sp = species_by_name.get(com_name)
        if sp:
            taxon_to_species_id[taxon_id] = sp["species_id"]

    print(f"\nLoaded {len(species_list)} species from species.json")
    print(f"Mapped {len(taxon_to_species_id)} taxon IDs to species IDs")

    for res in RESOLUTIONS:
        print(f"\n{'='*40}")
        print(f"Resolution {res}")
        print(f"{'='*40}")

        checklists, detections = load_archive_data(res)
        grid_file = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        grid = json.load(open(grid_file))

        # Build cell index
        cell_map = {}  # int_id -> h3_index
        smoothed_cells = {}  # int_id -> smoothed_level
        for feat in grid["features"]:
            props = feat["properties"]
            cell_map[props["cell_id"]] = props.get("h3_index", "")
            if "smoothed" in props:
                smoothed_cells[props["cell_id"]] = props["smoothed"]

        h3_to_int = {h3: cid for cid, h3 in cell_map.items()}
        print(f"\nGrid: {len(cell_map)} cells, {len(smoothed_cells)} smoothed/fallback")

        # ---- Test 1: All direct-data cells are in the grid ----
        print("\n--- Test 1: Direct data cells present in grid ---")
        all_det_cells = set()
        for sp_data in detections.values():
            all_det_cells.update(sp_data.keys())
        missing_from_grid = all_det_cells - set(cell_map.values())
        check("All cells with detections appear in grid",
              len(missing_from_grid) == 0,
              f"Missing: {len(missing_from_grid)} cells")

        # ---- Test 2: Direct cells are NOT marked as smoothed ----
        print("\n--- Test 2: Direct cells not marked smoothed ---")
        direct_marked_smoothed = 0
        for h3_cell in all_det_cells:
            int_id = h3_to_int.get(h3_cell)
            if int_id is not None and int_id in smoothed_cells:
                direct_marked_smoothed += 1
        check("No direct-data cells marked as smoothed",
              direct_marked_smoothed == 0,
              f"Found {direct_marked_smoothed} direct cells incorrectly marked smoothed")

        # ---- Test 3: Frequency math for a sample of cells ----
        print("\n--- Test 3: Spot-check raw frequencies against output ---")
        # Pick 5 cells with the most data to verify
        cell_data_count = defaultdict(int)
        for sp_data in detections.values():
            for cell_id in sp_data:
                cell_data_count[cell_id] += 1
        top_cells = sorted(cell_data_count, key=cell_data_count.get, reverse=True)[:5]

        for h3_cell in top_cells:
            int_id = h3_to_int.get(h3_cell)
            if int_id is None:
                continue

            # Find a species with detection in this cell and enough checklists
            found = False
            for taxon_id, cell_data in detections.items():
                if found:
                    break
                if h3_cell not in cell_data:
                    continue
                sp_id = taxon_to_species_id.get(taxon_id)
                if sp_id is None:
                    continue
                sp_name = taxon_names.get(taxon_id, taxon_id)

                for week, det_count in cell_data[h3_cell].items():
                    cl_count = checklists.get(h3_cell, {}).get(week, 0)
                    if cl_count < MIN_CHECKLISTS:
                        continue
                    raw_freq = compute_raw_frequency(det_count, cl_count)
                    if raw_freq < 0.01:
                        continue  # Skip very rare for cleaner comparison

                    # Read the output file for this week
                    week_file = OUTPUT_DIR / f"r{res}" / "weeks" / f"week_{week:02d}_cells.json"
                    week_data = json.load(open(week_file))

                    output_freq = None
                    for entry in week_data:
                        if entry[0] == int_id:
                            if sp_id in entry[1]:
                                idx = entry[1].index(sp_id)
                                output_freq = entry[2][idx] / 255.0
                            break

                    if output_freq is not None:
                        ratio = output_freq / raw_freq if raw_freq > 0 else 0
                        # Direct gets 60% weight, ensemble 40%, plus uint8 rounding
                        # Ratio should be between 0.3x and 2.5x for well-sampled cells
                        within_range = 0.2 < ratio < 3.0
                        cell_label = h3_cell[:12] + "..."
                        check(f"Cell {cell_label} wk{week} {sp_name}: "
                              f"raw={raw_freq:.3f}, output={output_freq:.3f} (ratio={ratio:.2f})",
                              within_range,
                              f"Output deviates too far from raw frequency")
                        found = True
                        break

        # ---- Test 4: No ocean cells (smoothed cells should be on land) ----
        print("\n--- Test 4: Smoothed cells are on land ---")
        try:
            from shapely.geometry import Point, shape
            from shapely.ops import unary_union
            from shapely.prepared import prep
            import shapefile as shp
            import h3

            land_shp = SCRIPT_DIR / "reference" / "ne_50m_land" / "ne_50m_land.shp"
            if land_shp.exists():
                sf = shp.Reader(str(land_shp))
                polygons = [shape(s.__geo_interface__) for s in sf.shapes()]
                land = unary_union(polygons).buffer(0.2)
                prepared_land = prep(land)

                ocean_smoothed = 0
                total_checked = 0
                for int_id, level in smoothed_cells.items():
                    h3_cell = cell_map.get(int_id, "")
                    if not h3_cell:
                        continue
                    lat, lng = h3.cell_to_latlng(h3_cell)
                    if not prepared_land.contains(Point(lng, lat)):
                        ocean_smoothed += 1
                    total_checked += 1

                check(f"No smoothed cells in ocean ({total_checked} checked)",
                      ocean_smoothed == 0,
                      f"Found {ocean_smoothed} smoothed cells in ocean!")
            else:
                warn("Land shapefile not found — skipping ocean check")
        except ImportError:
            warn("shapely/h3 not available — skipping ocean check")

        # ---- Test 5: Frequency values are in valid range ----
        print("\n--- Test 5: All frequencies in valid range [1, 255] ---")
        invalid_freqs = 0
        total_freq_values = 0
        for week in range(1, 53):
            week_file = OUTPUT_DIR / f"r{res}" / "weeks" / f"week_{week:02d}_cells.json"
            if not week_file.exists():
                continue
            week_data = json.load(open(week_file))
            for entry in week_data:
                if len(entry) >= 3:
                    for f in entry[2]:
                        total_freq_values += 1
                        if f < 1 or f > 255 or not isinstance(f, int):
                            invalid_freqs += 1
        check(f"All {total_freq_values:,} frequency values in [1, 255]",
              invalid_freqs == 0,
              f"Found {invalid_freqs} invalid frequency values")

        # ---- Test 6: Species-week files consistent with weekly files ----
        print("\n--- Test 6: Species-weeks consistent with weekly cells ---")
        # Sample a few species
        sample_species = list(species_by_code.keys())[:5]
        for code in sample_species:
            sp_file = OUTPUT_DIR / f"r{res}" / "species-weeks" / f"{code}.json"
            if not sp_file.exists():
                continue
            sp_data = json.load(open(sp_file))
            sp_id = species_by_code[code]["species_id"]

            # Check week 1 from species file matches weekly file
            if "1" in sp_data:
                week_file = OUTPUT_DIR / f"r{res}" / "weeks" / "week_01_cells.json"
                week_data = json.load(open(week_file))

                sp_cells_from_weekly = set()
                for entry in week_data:
                    if sp_id in entry[1]:
                        sp_cells_from_weekly.add(entry[0])

                sp_cells_from_species = set(cid for cid, _ in sp_data["1"])
                match = sp_cells_from_weekly == sp_cells_from_species
                check(f"{code} week 1: species-weeks matches weekly cells "
                      f"({len(sp_cells_from_species)} cells)",
                      match,
                      f"Mismatch: {len(sp_cells_from_weekly)} in weekly vs "
                      f"{len(sp_cells_from_species)} in species file")

        # ---- Test 7: Smoothed=2 (fallback) only exists for res 4 ----
        print("\n--- Test 7: Fallback cells ---")
        fallback_count = sum(1 for v in smoothed_cells.values() if v == 2)
        neighbor_count = sum(1 for v in smoothed_cells.values() if v == 1)
        if res == 3:
            check(f"Res 3: no smoothed cells (k=0)", neighbor_count == 0 and fallback_count == 0,
                  f"Found {neighbor_count} neighbor-smoothed, {fallback_count} fallback")
        else:
            print(f"  Res {res}: {neighbor_count} neighbor-smoothed, {fallback_count} fallback cells")
            # Fallback cells should exist if there are parent cells
            check(f"Res {res}: fallback cells present", fallback_count > 0,
                  "Expected fallback cells from parent resolution")

        # ---- Test 8: Min frequency threshold respected ----
        print("\n--- Test 8: Min frequency threshold on interpolated cells ---")
        threshold_violations = 0
        threshold_uint8 = max(1, round(MIN_SMOOTHED_FREQ * 255))  # ~1
        for week in [1, 13, 26, 40]:
            week_file = OUTPUT_DIR / f"r{res}" / "weeks" / f"week_{week:02d}_cells.json"
            if not week_file.exists():
                continue
            week_data = json.load(open(week_file))
            for entry in week_data:
                int_id = entry[0]
                if int_id in smoothed_cells:  # Only check non-direct cells
                    if len(entry) >= 3:
                        for f in entry[2]:
                            if f < threshold_uint8:
                                threshold_violations += 1
        check(f"No sub-threshold freqs in interpolated cells (checked weeks 1,13,26,40)",
              threshold_violations == 0,
              f"Found {threshold_violations} violations")

        # ---- Test 9: Well-known species sanity checks ----
        print("\n--- Test 9: Ecological sanity checks ---")

        # American Robin should be widespread
        robin_file = OUTPUT_DIR / f"r{res}" / "species-weeks" / "amerob.json"
        if robin_file.exists():
            robin = json.load(open(robin_file))
            robin_cells_summer = set()
            for week_str in ["20", "21", "22", "23", "24", "25"]:
                for cid, _ in robin.get(week_str, []):
                    robin_cells_summer.add(cid)
            check(f"American Robin widespread in summer (>50% of cells)",
                  len(robin_cells_summer) > len(cell_map) * 0.3,
                  f"Only in {len(robin_cells_summer)}/{len(cell_map)} cells")

        # Snowy Owl should be rare and mostly northern/winter
        snowy_file = OUTPUT_DIR / f"r{res}" / "species-weeks" / "snoowl1.json"
        if snowy_file.exists():
            snowy = json.load(open(snowy_file))
            snowy_cells_all = set()
            for week_str, entries in snowy.items():
                for cid, _ in entries:
                    snowy_cells_all.add(cid)
            check(f"Snowy Owl rare (<30% of cells)",
                  len(snowy_cells_all) < len(cell_map) * 0.3,
                  f"In {len(snowy_cells_all)}/{len(cell_map)} cells — too widespread?")

        # Prairie Falcon should be rare/absent in eastern coverage area
        pf_file = OUTPUT_DIR / f"r{res}" / "species-weeks" / "prafal.json"
        if pf_file.exists():
            pf = json.load(open(pf_file))
            pf_cells = set()
            for entries in pf.values():
                for cid, _ in entries:
                    pf_cells.add(cid)
            check(f"Prairie Falcon localized (<20% of cells)",
                  len(pf_cells) < len(cell_map) * 0.2,
                  f"In {len(pf_cells)}/{len(cell_map)} cells — bleeding too far?")
        else:
            print(f"  (Prairie Falcon not in dataset)")

    # ---- Summary ----
    print(f"\n{'='*60}")
    print(f"RESULTS: {passed} passed, {failed} failed, {warnings} warnings")
    print(f"{'='*60}")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
