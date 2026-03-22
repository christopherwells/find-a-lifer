#!/usr/bin/env python3
"""
Extract eBird hotspot names per H3 cell from EBD sampling files.

Reads LOCALITY and LOCALITY TYPE columns from sampling event files.
Filters for LOCALITY TYPE == 'H' (eBird hotspots).
Counts checklists per hotspot per H3 cell at each resolution.
Outputs top 5 hotspots per cell.

Usage:
    python pipeline/extract_hotspots.py

Input: data/downloads/ (EBD zip files with _smp_ or _sampling patterns)
Output: Merges hotspots into grid.geojson files as properties.hotspots
"""

import csv
import gzip
import json
import os
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

try:
    import h3
except ImportError:
    print("ERROR: h3 package required. pip install h3")
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
DOWNLOADS_DIR = DATA_DIR / "downloads"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"

RESOLUTIONS = [3, 4]
TOP_N = 5  # Top hotspots per cell


def find_sampling_files():
    """Find all sampling event files (from zips or extracted)."""
    files = []
    for search_dir in [DATA_DIR, DOWNLOADS_DIR]:
        if not search_dir.exists():
            continue

        # Check zips
        for zf_path in sorted(search_dir.glob("ebd_*_smp_rel*.zip")):
            try:
                zf = zipfile.ZipFile(zf_path)
                sampling_name = next(
                    (n for n in zf.namelist() if "_sampling" in n and n.endswith(".txt")),
                    None,
                )
                if sampling_name:
                    files.append(("zip", zf_path, sampling_name))
            except Exception as e:
                print(f"  WARNING: Could not read {zf_path.name}: {e}")

        # Check extracted .txt and .txt.gz files
        for ext in ["txt", "txt.gz"]:
            for f in sorted(search_dir.glob(f"ebd_*_sampling*.{ext}")):
                files.append(("file", f, None))

    return files


def read_sampling_events(file_type, file_path, zip_member=None):
    """Generator yielding (latitude, longitude, locality_name) for hotspot events."""
    if file_type == "zip":
        zf = zipfile.ZipFile(file_path)
        fh = zf.open(zip_member)
        reader = csv.DictReader(
            (line.decode("utf-8", errors="replace") for line in fh),
            delimiter="\t",
        )
    elif str(file_path).endswith(".gz"):
        fh = gzip.open(file_path, "rt", errors="replace")
        reader = csv.DictReader(fh, delimiter="\t")
    else:
        fh = open(file_path, "r", errors="replace")
        reader = csv.DictReader(fh, delimiter="\t")

    count = 0
    hotspot_count = 0
    for row in reader:
        count += 1
        if count % 500000 == 0:
            print(f"    {count:,} events scanned, {hotspot_count:,} hotspots...")
            sys.stdout.flush()

        # Only include eBird hotspots
        loc_type = row.get("LOCALITY TYPE", "").strip()
        if loc_type != "H":
            continue

        try:
            lat = float(row.get("LATITUDE", "0"))
            lng = float(row.get("LONGITUDE", "0"))
        except (ValueError, TypeError):
            continue

        locality = row.get("LOCALITY", "").strip()
        if not locality:
            continue

        hotspot_count += 1
        yield lat, lng, locality

    print(f"    {count:,} total events, {hotspot_count:,} hotspots")
    try:
        fh.close()
    except Exception:
        pass


def main():
    print("=" * 60)
    print("Extract eBird Hotspot Names per H3 Cell")
    print("=" * 60)

    sampling_files = find_sampling_files()
    if not sampling_files:
        print("No sampling files found in data/ or data/downloads/")
        return

    print(f"Found {len(sampling_files)} sampling files")

    # cell_hotspots[res][h3_index][locality_name] = checklist_count
    cell_hotspots: dict[int, dict[str, dict[str, int]]] = {
        res: defaultdict(lambda: defaultdict(int)) for res in RESOLUTIONS
    }

    for file_type, file_path, zip_member in sampling_files:
        name = file_path.name
        if zip_member:
            name = f"{file_path.name}/{zip_member}"
        print(f"\nProcessing: {name}")

        for lat, lng, locality in read_sampling_events(file_type, file_path, zip_member):
            for res in RESOLUTIONS:
                try:
                    h3_index = h3.latlng_to_cell(lat, lng, res)
                    cell_hotspots[res][h3_index][locality] += 1
                except Exception:
                    continue

    # Merge into grid.geojson files
    for res in RESOLUTIONS:
        grid_path = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        if not grid_path.exists():
            print(f"\n  r{res}: no grid.geojson")
            continue

        grid = json.load(open(grid_path))

        # Build h3_index → cell_id mapping
        h3_to_id = {}
        for feature in grid["features"]:
            props = feature["properties"]
            if "h3_index" in props:
                h3_to_id[props["h3_index"]] = props["cell_id"]

        cells_with_hotspots = 0
        for feature in grid["features"]:
            h3_idx = feature["properties"].get("h3_index", "")
            hotspots = cell_hotspots[res].get(h3_idx, {})

            if hotspots:
                # Sort by checklist count, take top N
                top = sorted(hotspots.items(), key=lambda x: -x[1])[:TOP_N]
                feature["properties"]["hotspots"] = [
                    {"name": name, "count": count} for name, count in top
                ]
                cells_with_hotspots += 1
            # Don't add empty hotspots array (save space)

        with open(grid_path, "w") as f:
            json.dump(grid, f, separators=(",", ":"))

        total_hotspots = sum(len(v) for v in cell_hotspots[res].values())
        print(f"\n  r{res}: {cells_with_hotspots} cells with hotspots, {total_hotspots} total hotspot records")

    # Also copy to root grid for backward compat
    r4_grid = OUTPUT_DIR / "r4" / "grid.geojson"
    root_grid = OUTPUT_DIR / "grid.geojson"
    if r4_grid.exists():
        import shutil
        shutil.copy2(r4_grid, root_grid)
        print(f"\n  Copied r4 grid to root")

    print("\nDone! Hotspot names added to grid.geojson files.")


if __name__ == "__main__":
    main()
