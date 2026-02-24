"""
Extract eBird Status & Trends abundance data into Find-A-Lifer weekly JSON format.

Reads 27km abundance rasters from the ebirdst R package cache,
reprojects them to match grid_unified.tif (EPSG:3857), and writes
compact weekly data files.

Output format per week file: cell-grouped JSON array
  [[cell_id, [species_id_1, species_id_2, ...]], ...]

Also generates summary files:
  [[cell_id, species_count, max_abundance_uint8], ...]

Usage:
    python backend/extract_st_data.py
"""

import json
import os
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer

# === CONFIGURATION ===
EBIRDST_DIR = Path("C:/Users/Christopher Wells/AppData/Roaming/R/data/R/ebirdst/2023")
GRID_TIF = Path("C:/Users/Christopher Wells/OneDrive - Bowdoin College/Research/Find-A-Lifer/app_data/grid_unified.tif")
SPECIES_JSON = Path("backend/data/species.json")
OUTPUT_DIR = Path("backend/data/weeks")


def load_grid_and_mapping():
    """Load grid template and precompute source-to-destination pixel mapping."""
    print("Loading grid template and computing pixel mapping...")

    # Load grid cell IDs
    with rasterio.open(GRID_TIF) as src:
        cell_ids = src.read(1)
        grid_transform = src.transform
        grid_crs = src.crs
        grid_shape = (src.height, src.width)

    print(f"  Grid: {grid_shape[1]}x{grid_shape[0]}, CRS={grid_crs}")

    # Get source raster params from a reference species
    ref_path = None
    for code_dir in sorted(EBIRDST_DIR.iterdir()):
        tif = code_dir / "weekly" / f"{code_dir.name}_abundance_median_27km_2023.tif"
        if tif.exists():
            ref_path = tif
            break
    if ref_path is None:
        raise RuntimeError("No reference S&T raster found")

    with rasterio.open(ref_path) as src:
        src_transform = src.transform
        src_crs = src.crs
        src_shape = (src.height, src.width)

    print(f"  S&T rasters: {src_shape[1]}x{src_shape[0]}, CRS={src_crs}")

    # Precompute: for each dst pixel, find corresponding src pixel
    dst_rows, dst_cols = np.meshgrid(
        np.arange(grid_shape[0]), np.arange(grid_shape[1]), indexing="ij"
    )
    dst_xs = grid_transform.c + (dst_cols + 0.5) * grid_transform.a
    dst_ys = grid_transform.f + (dst_rows + 0.5) * grid_transform.e

    transformer = Transformer.from_crs(grid_crs, src_crs, always_xy=True)
    src_xs, src_ys = transformer.transform(dst_xs.ravel(), dst_ys.ravel())
    src_xs = np.array(src_xs).reshape(grid_shape)
    src_ys = np.array(src_ys).reshape(grid_shape)

    src_pixel_cols = ((src_xs - src_transform.c) / src_transform.a).astype(np.int32)
    src_pixel_rows = ((src_ys - src_transform.f) / src_transform.e).astype(np.int32)

    in_bounds = (
        (src_pixel_rows >= 0) & (src_pixel_rows < src_shape[0])
        & (src_pixel_cols >= 0) & (src_pixel_cols < src_shape[1])
    )

    # Flatten for fast vectorized extraction
    ib_flat = in_bounds.ravel()
    src_r = src_pixel_rows.ravel()[ib_flat]
    src_c = src_pixel_cols.ravel()[ib_flat]
    cid_flat = cell_ids.ravel()[ib_flat]

    print(f"  Pixel mapping: {ib_flat.sum():,} in-bounds pixels")
    return cid_flat, src_r, src_c, ib_flat


def load_species_mapping():
    """Load species.json and build speciesCode -> species_id mapping."""
    with open(SPECIES_JSON) as f:
        species_list = json.load(f)
    mapping = {s["speciesCode"]: s["species_id"] for s in species_list}
    print(f"Species mapping: {len(mapping)} species")
    return mapping


def find_valid_species(species_mapping):
    """Find species with 27km abundance rasters in the ebirdst cache."""
    valid = []
    for code in sorted(species_mapping.keys()):
        tif_path = EBIRDST_DIR / code / "weekly" / f"{code}_abundance_median_27km_2023.tif"
        if tif_path.exists():
            valid.append((code, species_mapping[code], tif_path))
    return valid


def main():
    start_time = time.time()

    # Load grid + precomputed pixel mapping
    cid_flat, src_r, src_c, ib_flat = load_grid_and_mapping()

    # Load species mapping
    species_mapping = load_species_mapping()

    # Find valid species
    valid_species = find_valid_species(species_mapping)
    print(f"Found {len(valid_species)} species with 27km rasters\n")

    # Weekly accumulators: week -> cell_id -> list of species_ids
    # Using defaultdict(lambda: defaultdict(list)) for efficiency
    weekly_cells = {w: defaultdict(list) for w in range(1, 53)}

    # Process each species
    total = len(valid_species)
    species_processed = 0
    species_errors = 0

    for i, (code, species_id, tif_path) in enumerate(valid_species):
        t0 = time.time()
        try:
            with rasterio.open(tif_path) as src:
                all_bands = src.read()  # shape: (52, height, width)

            weeks_with_data = 0
            total_cells = 0
            for band_idx in range(min(all_bands.shape[0], 52)):
                values = all_bands[band_idx][src_r, src_c]
                valid = ~np.isnan(values) & (values > 0)

                if valid.any():
                    week_num = band_idx + 1
                    valid_cids = cid_flat[valid]
                    weeks_with_data += 1
                    total_cells += len(valid_cids)

                    cell_dict = weekly_cells[week_num]
                    for cid in valid_cids:
                        cell_dict[int(cid)].append(species_id)

            species_processed += 1
            elapsed = time.time() - t0

            if (i + 1) % 100 == 0 or i == 0 or (i + 1) == total:
                print(f"  [{i+1}/{total}] {code} (id={species_id}): "
                      f"{total_cells:,} cell-weeks across {weeks_with_data} weeks "
                      f"({elapsed:.1f}s)")

        except Exception as e:
            species_errors += 1
            print(f"  [{i+1}/{total}] ERROR {code}: {e}")

    print(f"\nExtraction complete: {species_processed} species, {species_errors} errors")

    # Write weekly files
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_records = 0

    for week_num in range(1, 53):
        cell_dict = weekly_cells[week_num]

        # Cell-grouped format: [[cell_id, [sp_id_1, sp_id_2, ...]], ...]
        cell_data = []
        for cid in sorted(cell_dict.keys()):
            sp_list = sorted(cell_dict[cid])
            cell_data.append([cid, sp_list])
            total_records += len(sp_list)

        # Write main data file
        out_path = OUTPUT_DIR / f"week_{week_num:02d}.json"
        with open(out_path, "w") as f:
            json.dump(cell_data, f, separators=(",", ":"))

        # Write summary file: [[cell_id, species_count], ...]
        summary = [[cid, len(sps)] for cid, sps in cell_data]
        summary_path = OUTPUT_DIR / f"week_{week_num:02d}_summary.json"
        with open(summary_path, "w") as f:
            json.dump(summary, f, separators=(",", ":"))

        size_mb = out_path.stat().st_size / (1024 * 1024)
        sum_size = summary_path.stat().st_size / (1024 * 1024)

        if week_num % 10 == 0 or week_num == 1 or week_num == 52:
            print(f"  Week {week_num:02d}: {len(cell_data):,} cells, "
                  f"data={size_mb:.1f}MB, summary={sum_size:.1f}MB")

        # Free memory
        weekly_cells[week_num] = None

    total_time = time.time() - start_time
    print(f"\nDone! {total_records:,} total species-cell records")
    print(f"Species: {species_processed} processed, {species_errors} errors")
    print(f"Time: {total_time:.0f}s ({total_time/60:.1f}min)")
    print(f"Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
