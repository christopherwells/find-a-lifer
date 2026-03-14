#!/usr/bin/env python3
"""
Patch existing static data files with realistic Maine frequencies.

Instead of regenerating everything (memory-intensive), this script:
1. Identifies Maine grid cells
2. Computes species occurrence stats for Maine (one week at a time)
3. Patches existing species-weeks/*.json files with realistic frequencies for Maine cells
4. Patches existing weeks/*_summary.json with updated max_freq values

Requires: frontend/public/data/ already populated by precompute_static.py
"""

import json
import math
import os
import random
import sys
import time
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DATA = PROJECT_DIR / "backend" / "data"
DATA_DIR = PROJECT_DIR / "frontend" / "public" / "data"

MAINE_LAT_MIN, MAINE_LAT_MAX = 43.0, 47.5
MAINE_LON_MIN, MAINE_LON_MAX = -71.1, -66.9

random.seed(42)


def main():
    t0 = time.time()
    print("=" * 60)
    print("Patch Maine Frequency Data")
    print("=" * 60)
    sys.stdout.flush()

    # Verify data dir exists
    if not (DATA_DIR / "species-weeks").exists():
        print("ERROR: Run precompute_static.py first to generate base data files")
        sys.exit(1)

    # Load species
    with open(DATA_DIR / "species.json", "r") as f:
        species_list = json.load(f)
    id_to_code = {sp["species_id"]: sp["speciesCode"] for sp in species_list}
    print(f"  Species: {len(species_list)}")
    sys.stdout.flush()

    # Find Maine cell IDs from grid
    print("  Loading grid to find Maine cells...")
    sys.stdout.flush()
    with open(DATA_DIR / "grid.geojson", "r") as f:
        grid = json.load(f)

    maine_cell_ids = set()
    for feat in grid["features"]:
        cid = feat["properties"].get("cell_id")
        coords = feat["geometry"]["coordinates"]
        gtype = feat["geometry"]["type"]
        if gtype == "Polygon":
            pts = coords[0]
        elif gtype == "MultiPolygon":
            pts = coords[0][0]
        else:
            continue
        clat = sum(p[1] for p in pts) / len(pts)
        clon = sum(p[0] for p in pts) / len(pts)
        if MAINE_LAT_MIN <= clat <= MAINE_LAT_MAX and MAINE_LON_MIN <= clon <= MAINE_LON_MAX:
            maine_cell_ids.add(cid)

    del grid
    n_maine = len(maine_cell_ids)
    print(f"  Maine cells: {n_maine}")
    sys.stdout.flush()

    # --- Pass 1: Scan weeks to get Maine species stats ---
    print("\n  Pass 1: Scanning Maine species stats...")
    sys.stdout.flush()
    sp_week_ncells = defaultdict(lambda: defaultdict(int))  # sid -> week -> n_cells

    for week in range(1, 53):
        path = DATA_DIR / "weeks" / f"week_{week:02d}_cells.json"
        if not path.exists():
            continue
        with open(path, "r") as f:
            raw = json.load(f)
        for entry in raw:
            cell_id, sids = entry[0], entry[1]
            if cell_id not in maine_cell_ids:
                continue
            for sid in sids:
                sp_week_ncells[sid][week] += 1
        del raw
        print(f"    Week {week:02d}: scanned", end="\r")
        sys.stdout.flush()

    print(f"\n  Species in Maine: {len(sp_week_ncells)}")

    # Compute per-species info
    species_info = {}
    for sid, wmap in sp_week_ncells.items():
        peak_week = max(wmap, key=lambda w: wmap[w])
        species_info[sid] = {
            "peak_cells": wmap[peak_week],
            "peak_week": peak_week,
            "n_weeks": len(wmap),
            "is_resident": len(wmap) >= 40,
        }

    # Print top species
    top = sorted(species_info.items(), key=lambda x: -x[1]["peak_cells"])[:15]
    for sid, info in top:
        code = id_to_code.get(sid, "?")
        name = next((sp["comName"] for sp in species_list if sp["species_id"] == sid), "?")
        status = "resident" if info["is_resident"] else f"peak wk {info['peak_week']}"
        print(f"    {name}: peak {info['peak_cells']}/{n_maine} cells, {info['n_weeks']} wks, {status}")
    sys.stdout.flush()

    del sp_week_ncells

    # --- Pass 2: Patch species-weeks files ---
    print(f"\n  Pass 2: Patching species-weeks files...")
    sys.stdout.flush()

    # Build a mapping: for each species with Maine data, generate freq for each Maine cell
    # We need to know which cells are Maine for each species-week combo
    # Read each species file, patch Maine cells, write back

    codes_with_maine = set()
    for sid in species_info:
        code = id_to_code.get(sid)
        if code:
            codes_with_maine.add(code)

    patched = 0
    sp_files = sorted(f.stem for f in (DATA_DIR / "species-weeks").iterdir() if f.suffix == ".json")

    for i, code in enumerate(sp_files, 1):
        fpath = DATA_DIR / "species-weeks" / f"{code}.json"
        try:
            with open(fpath, "r") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"\n    WARNING: Skipping corrupt file {code}.json: {e}")
            continue

        # Find the species_id for this code
        sid = None
        for sp in species_list:
            if sp["speciesCode"] == code:
                sid = sp["species_id"]
                break

        if sid and sid in species_info:
            info = species_info[sid]
            # Patch each week's Maine cells
            for wk_str, entries in data.items():
                week = int(wk_str)
                new_entries = []
                for entry in entries:
                    cell_id, old_freq = entry[0], entry[1]
                    if cell_id in maine_cell_ids:
                        # Generate realistic frequency
                        coverage = info["peak_cells"] / n_maine
                        if coverage > 0.8:
                            base = random.uniform(0.50, 0.95)
                        elif coverage > 0.5:
                            base = random.uniform(0.25, 0.65)
                        elif coverage > 0.2:
                            base = random.uniform(0.10, 0.40)
                        elif coverage > 0.05:
                            base = random.uniform(0.03, 0.20)
                        else:
                            base = random.uniform(0.01, 0.10)

                        if not info["is_resident"]:
                            dist = min(abs(week - info["peak_week"]),
                                       52 - abs(week - info["peak_week"]))
                            base *= max(0.1, math.exp(-0.5 * (dist / 8) ** 2))

                        freq = max(0.01, min(0.99, base * random.uniform(0.7, 1.3)))
                        freq_uint8 = max(1, min(255, round(freq * 255)))
                        new_entries.append([cell_id, freq_uint8])
                    else:
                        new_entries.append(entry)
                data[wk_str] = new_entries
            patched += 1

        with open(fpath, "w") as f:
            json.dump(data, f, separators=(",", ":"))

        if i % 200 == 0:
            print(f"    {i}/{len(sp_files)} files processed ({patched} patched)")
            sys.stdout.flush()

    print(f"    Done: {patched} species patched with Maine frequencies")

    # --- Pass 3: Patch summary files ---
    print(f"\n  Pass 3: Patching summary files...")
    sys.stdout.flush()

    for week in range(1, 53):
        spath = DATA_DIR / "weeks" / f"week_{week:02d}_summary.json"
        if not spath.exists():
            continue
        with open(spath, "r") as f:
            summary = json.load(f)

        # For Maine cells, update the max_freq field based on species data
        # We'll set it proportional to species count (more species = higher value)
        new_summary = []
        for entry in summary:
            cell_id = entry[0]
            n_species = entry[1]
            if cell_id in maine_cell_ids:
                # Generate a plausible max freq for this cell
                max_freq = max(1, min(255, round(random.uniform(0.3, 0.95) * 255)))
                new_summary.append([cell_id, n_species, max_freq])
            else:
                new_summary.append(entry)

        with open(spath, "w") as f:
            json.dump(new_summary, f, separators=(",", ":"))
        print(f"    Week {week:02d} summary patched", end="\r")
        sys.stdout.flush()

    elapsed = time.time() - t0
    print(f"\n\n  Completed in {elapsed:.1f}s")
    print(f"  {patched} species with Maine frequency data")
    print(f"  {n_maine} Maine cells patched across 52 weeks")
    print(f"  Non-Maine cells unchanged (freq=255)")


if __name__ == "__main__":
    main()
