#!/usr/bin/env python3
"""
Pre-compute static data files for Find-A-Lifer.

Reads backend data and generates static files in frontend/public/data/
so the app can run without a backend API at runtime.

Outputs:
  data/species.json              - species metadata (copy)
  data/grid.geojson              - grid geometry (copy, prefers 27km)
  data/regions.geojson           - region polygons (copy)
  data/weeks/week_XX_summary.json - weekly summaries (copy, 52 files)
  data/weeks/week_XX_cells.json  - compact cell->species lists (52 files)
  data/species-weeks/{code}.json - per-species 52-week occurrence data
"""

import json
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path

# Resolve paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DATA = PROJECT_DIR / "backend" / "data"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"


def fmt_size(nbytes: int) -> str:
    if nbytes < 1024:
        return f"{nbytes} B"
    elif nbytes < 1024 * 1024:
        return f"{nbytes / 1024:.1f} KB"
    elif nbytes < 1024 * 1024 * 1024:
        return f"{nbytes / (1024 * 1024):.1f} MB"
    else:
        return f"{nbytes / (1024 * 1024 * 1024):.2f} GB"


def load_species() -> tuple[list[dict], dict[int, str]]:
    path = BACKEND_DATA / "species.json"
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        species_list = json.load(f)
    id_to_code = {sp["species_id"]: sp["speciesCode"] for sp in species_list}
    print(f"  Loaded {len(species_list)} species")
    return species_list, id_to_code


def load_week(week_num: int) -> list[list]:
    path = BACKEND_DATA / "weeks" / f"week_{week_num:02d}.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if not raw:
        return []
    if isinstance(raw[0], list):
        return raw
    elif isinstance(raw[0], dict):
        cells: dict[int, list[int]] = {}
        for r in raw:
            cid = r["cell_id"]
            sid = r["species_id"]
            if cid not in cells:
                cells[cid] = []
            cells[cid].append(sid)
        return [[cid, sids] for cid, sids in cells.items()]
    return []


def main():
    t_start = time.time()
    print("=" * 60)
    print("Find-A-Lifer: Pre-compute Static Data")
    print("=" * 60)

    if not BACKEND_DATA.exists():
        print(f"ERROR: Backend data directory not found: {BACKEND_DATA}")
        sys.exit(1)

    # Create output dirs
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "weeks").mkdir(exist_ok=True)
    (OUTPUT_DIR / "species-weeks").mkdir(exist_ok=True)

    # --- Step 1: Load species ---
    print("\n[1/5] Loading species metadata...")
    species_list, id_to_code = load_species()

    # --- Step 2: Copy simple files ---
    print("\n[2/5] Copying simple files...")
    simple_bytes = 0

    src = BACKEND_DATA / "species.json"
    dst = OUTPUT_DIR / "species.json"
    shutil.copy2(src, dst)
    sz = dst.stat().st_size
    simple_bytes += sz
    print(f"  species.json -> {fmt_size(sz)}")

    grid_src = BACKEND_DATA / "grid_27km.geojson"
    if not grid_src.exists():
        grid_src = BACKEND_DATA / "grid.geojson"
    if grid_src.exists():
        dst = OUTPUT_DIR / "grid.geojson"
        shutil.copy2(grid_src, dst)
        sz = dst.stat().st_size
        simple_bytes += sz
        print(f"  grid.geojson ({grid_src.name}) -> {fmt_size(sz)}")

    regions_src = BACKEND_DATA / "regions.geojson"
    dst = OUTPUT_DIR / "regions.geojson"
    if regions_src.exists():
        shutil.copy2(regions_src, dst)
    else:
        with open(dst, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": []}, f)
    simple_bytes += dst.stat().st_size
    print(f"  regions.geojson -> {fmt_size(dst.stat().st_size)}")

    # Copy summaries
    summary_bytes = 0
    for week in range(1, 53):
        src = BACKEND_DATA / "weeks" / f"week_{week:02d}_summary.json"
        if src.exists():
            dst = OUTPUT_DIR / "weeks" / f"week_{week:02d}_summary.json"
            shutil.copy2(src, dst)
            summary_bytes += dst.stat().st_size
    print(f"  Copied 52 summary files -> {fmt_size(summary_bytes)}")

    # --- Step 3: Process weeks → cells files + accumulate species data ---
    print("\n[3/5] Processing week files...")
    # Use compact storage: species_data[code][week_str] = list of cell_ids (not [cell_id, 255] pairs)
    species_data: dict[str, dict[str, list[int]]] = defaultdict(dict)
    cells_bytes = 0

    for week in range(1, 53):
        t0 = time.time()
        raw = load_week(week)
        if not raw:
            print(f"  Week {week:02d}: NO DATA")
            sys.stdout.flush()
            continue

        # Write cells file
        dst = OUTPUT_DIR / "weeks" / f"week_{week:02d}_cells.json"
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(raw, f, separators=(",", ":"))
        sz = dst.stat().st_size
        cells_bytes += sz

        # Accumulate species data (just cell_ids, not pairs)
        week_str = str(week)
        unique_species = set()
        for entry in raw:
            cell_id = entry[0]
            for sid in entry[1]:
                unique_species.add(sid)
                code = id_to_code.get(sid)
                if code:
                    if week_str not in species_data[code]:
                        species_data[code][week_str] = []
                    species_data[code][week_str].append(cell_id)

        elapsed = time.time() - t0
        print(f"  Week {week:02d}: {len(raw)} cells, {len(unique_species)} species, {fmt_size(sz)}, {elapsed:.1f}s")
        sys.stdout.flush()
        del raw

    print(f"  Total cells files: {fmt_size(cells_bytes)}")

    # --- Step 4: Write species-weeks files ---
    print(f"\n[4/5] Writing per-species files ({len(species_data)} species)...")
    sys.stdout.flush()
    species_bytes = 0
    species_count = 0

    for i, (code, weeks) in enumerate(sorted(species_data.items()), 1):
        # Convert cell_ids list to [[cell_id, 255], ...] format
        out = {}
        for wk, cell_ids in weeks.items():
            out[wk] = [[cid, 255] for cid in cell_ids]

        dst = OUTPUT_DIR / "species-weeks" / f"{code}.json"
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(out, f, separators=(",", ":"))
        species_bytes += dst.stat().st_size
        species_count += 1

        if i % 500 == 0 or i == len(species_data):
            print(f"  {i}/{len(species_data)} species written...")
            sys.stdout.flush()

    del species_data

    # --- Step 5: Print stats ---
    total = simple_bytes + summary_bytes + cells_bytes + species_bytes
    print(f"\n[5/5] Done!")
    print("=" * 60)
    print(f"  Simple files:  {fmt_size(simple_bytes)}")
    print(f"  Summaries:     {fmt_size(summary_bytes)}")
    print(f"  Cell files:    {fmt_size(cells_bytes)}")
    print(f"  Species files: {fmt_size(species_bytes)} ({species_count} files)")
    print(f"  Total:         {fmt_size(total)}")
    print(f"  Completed in {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()
