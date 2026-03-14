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

Uses a local temp directory for all writes to avoid OneDrive sync overhead,
then copies the final result to the output directory.
"""

import json
import os
import shutil
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path

# Resolve paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
BACKEND_DATA = PROJECT_DIR / "backend" / "data"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"


def fmt_size(nbytes: int) -> str:
    """Format byte count as human-readable string."""
    if nbytes < 1024:
        return f"{nbytes} B"
    elif nbytes < 1024 * 1024:
        return f"{nbytes / 1024:.1f} KB"
    elif nbytes < 1024 * 1024 * 1024:
        return f"{nbytes / (1024 * 1024):.1f} MB"
    else:
        return f"{nbytes / (1024 * 1024 * 1024):.2f} GB"


def load_species() -> tuple[list[dict], dict[int, str]]:
    """Load species.json, return (species_list, id_to_code_map)."""
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
    """Load a week file and return raw cell-grouped data: [[cell_id, [species_ids]], ...]."""
    path = BACKEND_DATA / "weeks" / f"week_{week_num:02d}.json"
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if not raw:
        return []
    # Detect format (same logic as backend main.py)
    if isinstance(raw[0], list):
        # Cell-grouped: [[cell_id, [species_ids]], ...]
        return raw
    elif isinstance(raw[0], dict):
        # Record-based (old format) - convert to cell-grouped
        cells: dict[int, list[int]] = {}
        for r in raw:
            cid = r["cell_id"]
            sid = r["species_id"]
            if cid not in cells:
                cells[cid] = []
            cells[cid].append(sid)
        return [[cid, sids] for cid, sids in cells.items()]
    return []


def copy_simple_files(tmp_dir: Path) -> int:
    """Copy species.json, grid.geojson, regions.geojson to tmp_dir. Returns bytes written."""
    total = 0

    # species.json
    src = BACKEND_DATA / "species.json"
    dst = tmp_dir / "species.json"
    shutil.copy2(src, dst)
    sz = dst.stat().st_size
    total += sz
    print(f"  species.json -> {fmt_size(sz)}")

    # grid.geojson (prefer 27km)
    grid_src = BACKEND_DATA / "grid_27km.geojson"
    if not grid_src.exists():
        grid_src = BACKEND_DATA / "grid.geojson"
    if grid_src.exists():
        dst = tmp_dir / "grid.geojson"
        shutil.copy2(grid_src, dst)
        sz = dst.stat().st_size
        total += sz
        print(f"  grid.geojson ({grid_src.name}) -> {fmt_size(sz)}")
    else:
        print("  WARNING: No grid file found")

    # regions.geojson
    regions_src = BACKEND_DATA / "regions.geojson"
    if regions_src.exists():
        dst = tmp_dir / "regions.geojson"
        shutil.copy2(regions_src, dst)
        sz = dst.stat().st_size
        total += sz
        print(f"  regions.geojson -> {fmt_size(sz)}")
    else:
        dst = tmp_dir / "regions.geojson"
        empty = {"type": "FeatureCollection", "features": []}
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(empty, f)
        sz = dst.stat().st_size
        total += sz
        print(f"  regions.geojson (empty) -> {fmt_size(sz)}")

    return total


def copy_summaries(tmp_dir: Path) -> int:
    """Copy week_XX_summary.json files to tmp_dir. Returns bytes written."""
    weeks_dir = tmp_dir / "weeks"
    total = 0
    count = 0
    for week in range(1, 53):
        src = BACKEND_DATA / "weeks" / f"week_{week:02d}_summary.json"
        if src.exists():
            dst = weeks_dir / f"week_{week:02d}_summary.json"
            shutil.copy2(src, dst)
            total += dst.stat().st_size
            count += 1
    print(f"  Copied {count} summary files -> {fmt_size(total)}")
    return total


def process_weeks(id_to_code: dict[int, str], tmp_dir: Path) -> tuple[int, int, dict[str, dict[str, list]]]:
    """
    Process all 52 week files to generate:
    1. week_XX_cells.json files (compact cell->species)
    2. Accumulate per-species data for species-weeks files

    Returns (cells_bytes, cells_file_count, species_data).
    """
    weeks_dir = tmp_dir / "weeks"
    species_data: dict[str, dict[str, list]] = defaultdict(dict)
    cells_bytes = 0
    cells_count = 0

    for week in range(1, 53):
        t0 = time.time()
        raw = load_week(week)
        if not raw:
            print(f"  Week {week:02d}: NO DATA")
            continue

        # Write week_XX_cells.json (same format as raw cell-grouped)
        dst = weeks_dir / f"week_{week:02d}_cells.json"
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(raw, f, separators=(",", ":"))
        sz = dst.stat().st_size
        cells_bytes += sz
        cells_count += 1

        # Accumulate per-species data
        week_str = str(week)
        unique_species = set()
        for entry in raw:
            cell_id = entry[0]
            species_ids = entry[1]
            for sid in species_ids:
                unique_species.add(sid)
                code = id_to_code.get(sid)
                if code:
                    if week_str not in species_data[code]:
                        species_data[code][week_str] = []
                    species_data[code][week_str].append([cell_id, 255])

        elapsed = time.time() - t0
        print(
            f"  Week {week:02d}: {len(raw)} cells, "
            f"{len(unique_species)} species, "
            f"cells file {fmt_size(sz)}, "
            f"{elapsed:.1f}s"
        )

        # Free memory
        del raw

    return cells_bytes, cells_count, species_data


def write_species_files(species_data: dict[str, dict[str, list]], tmp_dir: Path) -> tuple[int, int, list[int]]:
    """
    Write per-species files: species-weeks/{speciesCode}.json to tmp_dir.
    Returns (total_bytes, file_count, sizes_list).
    """
    sp_dir = tmp_dir / "species-weeks"
    total_bytes = 0
    sizes = []
    count = 0

    total_species = len(species_data)
    for i, (code, weeks) in enumerate(sorted(species_data.items()), 1):
        dst = sp_dir / f"{code}.json"
        with open(dst, "w", encoding="utf-8") as f:
            json.dump(weeks, f, separators=(",", ":"))
        sz = dst.stat().st_size
        total_bytes += sz
        sizes.append(sz)
        count += 1

        if i % 500 == 0 or i == total_species:
            print(f"  Species files: {i}/{total_species} written...")

    return total_bytes, count, sizes


def print_stats(
    simple_bytes: int,
    summary_bytes: int,
    cells_bytes: int,
    cells_count: int,
    species_bytes: int,
    species_count: int,
    species_sizes: list[int],
):
    """Print final statistics."""
    total = simple_bytes + summary_bytes + cells_bytes + species_bytes
    total_files = 3 + 52 + cells_count + species_count

    print("\n" + "=" * 60)
    print("FINAL STATISTICS")
    print("=" * 60)
    print(f"  Simple files (species, grid, regions): {fmt_size(simple_bytes)}")
    print(f"  Summary files (52):                    {fmt_size(summary_bytes)}")
    print(f"  Cell files ({cells_count}):                       {fmt_size(cells_bytes)}")
    print(f"  Species files ({species_count}):                  {fmt_size(species_bytes)}")
    print(f"  ---")
    print(f"  Total files created: {total_files}")
    print(f"  Total size:          {fmt_size(total)}")

    if species_sizes:
        species_sizes.sort()
        print(f"\n  Per-species file size distribution:")
        print(f"    Min:    {fmt_size(species_sizes[0])}")
        print(f"    P25:    {fmt_size(species_sizes[len(species_sizes) // 4])}")
        print(f"    Median: {fmt_size(species_sizes[len(species_sizes) // 2])}")
        print(f"    P75:    {fmt_size(species_sizes[3 * len(species_sizes) // 4])}")
        print(f"    Max:    {fmt_size(species_sizes[-1])}")
        print(f"    Mean:   {fmt_size(sum(species_sizes) // len(species_sizes))}")


def main():
    t_start = time.time()
    print("=" * 60)
    print("Find-A-Lifer: Pre-compute Static Data")
    print("=" * 60)
    sys.stdout.flush()

    # Validate backend data exists
    if not BACKEND_DATA.exists():
        print(f"ERROR: Backend data directory not found: {BACKEND_DATA}")
        sys.exit(1)

    # Use a local temp directory for all writes to avoid OneDrive sync overhead
    tmp_base = tempfile.mkdtemp(prefix="fal-static-")
    tmp_dir = Path(tmp_base) / "data"
    tmp_dir.mkdir()
    (tmp_dir / "weeks").mkdir()
    (tmp_dir / "species-weeks").mkdir()
    print(f"  Working in temp directory: {tmp_base}")
    sys.stdout.flush()

    try:
        print("\n[1/6] Loading species metadata...")
        sys.stdout.flush()
        species_list, id_to_code = load_species()

        print("\n[2/6] Copying simple files...")
        sys.stdout.flush()
        simple_bytes = copy_simple_files(tmp_dir)

        print("\n[3/6] Copying summary files...")
        sys.stdout.flush()
        summary_bytes = copy_summaries(tmp_dir)

        print("\n[4/6] Processing week files (generating cells + accumulating species data)...")
        sys.stdout.flush()
        cells_bytes, cells_count, species_data = process_weeks(id_to_code, tmp_dir)

        print(f"\n[5/6] Writing per-species files ({len(species_data)} species with data)...")
        sys.stdout.flush()
        species_bytes, species_count, species_sizes = write_species_files(species_data, tmp_dir)

        # Free species_data memory before the copy
        del species_data

        print(f"\n[6/6] Copying results to output directory...")
        sys.stdout.flush()
        # Remove existing output dir contents if present, then copy
        if OUTPUT_DIR.exists():
            shutil.rmtree(OUTPUT_DIR)
        shutil.copytree(tmp_dir, OUTPUT_DIR)
        print(f"  Copied to {OUTPUT_DIR}")

        elapsed = time.time() - t_start
        print_stats(simple_bytes, summary_bytes, cells_bytes, cells_count, species_bytes, species_count, species_sizes)
        print(f"\n  Completed in {elapsed:.1f}s")

    finally:
        # Clean up temp directory
        shutil.rmtree(tmp_base, ignore_errors=True)
        print(f"  Cleaned up temp directory")


if __name__ == "__main__":
    main()
