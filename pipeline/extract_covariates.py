#!/usr/bin/env python3
"""
Extract environmental covariates for H3 cells.

Pre-computes land cover composition and elevation statistics for each H3 cell
at all active resolutions. Output is used by the stixel ensemble in process_ebd.py
to weight spatial pooling by habitat similarity.

Usage:
  python pipeline/extract_covariates.py              # Extract for all cells in grid files
  python pipeline/extract_covariates.py --check      # Show what's cached

Inputs:
  - pipeline/reference/earthenv/*.tif   (EarthEnv 1km land cover classes)
  - pipeline/reference/elevation/       (GMTED2010 mean 30-arc-second)
  - frontend/public/data/r{3,4}/grid.geojson  (H3 cell definitions)

Output:
  - data/archive/cell_covariates_r{3,4}.json
    {h3_index: {trees: 0.45, shrub: 0.10, herb: 0.15, cultivated: 0.20,
                urban: 0.05, water: 0.03, flooded: 0.02, elev_mean: 150, elev_std: 30}}
"""

import json
import sys
import time
import os
from pathlib import Path
from collections import defaultdict

import numpy as np

try:
    import rasterio
    from rasterio.windows import from_bounds
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False
    print("WARNING: rasterio not installed — pip install rasterio")

try:
    import h3
    HAS_H3 = True
except ImportError:
    HAS_H3 = False

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = PROJECT_DIR / "data" / "archive"
EARTHENV_DIR = SCRIPT_DIR / "reference" / "earthenv"
ELEVATION_DIR = SCRIPT_DIR / "reference" / "elevation"

RESOLUTIONS = [3, 4]

# EarthEnv class files and how to aggregate them
LANDCOVER_CLASSES = {
    "trees": ["needleleaf_trees.tif", "evergreen_broadleaf.tif",
              "deciduous_broadleaf.tif", "mixed_trees.tif"],
    "shrub": ["shrubs.tif"],
    "herb": ["herbaceous.tif"],
    "cultivated": ["cultivated.tif"],
    "urban": ["urban.tif"],
    "water": ["open_water.tif"],
    "flooded": ["flooded_veg.tif"],
}


def get_cell_bbox(h3_cell):
    """Get bounding box (min_lng, min_lat, max_lng, max_lat) for an H3 cell."""
    boundary = h3.cell_to_boundary(h3_cell)  # [(lat, lng), ...]
    lats = [p[0] for p in boundary]
    lngs = [p[1] for p in boundary]
    return (min(lngs), min(lats), max(lngs), max(lats))


def sample_raster_for_cell(raster, h3_cell):
    """Sample raster values within an H3 cell's bounding box.
    Returns array of valid pixel values."""
    bbox = get_cell_bbox(h3_cell)
    try:
        window = from_bounds(*bbox, transform=raster.transform)
        # Clamp window to raster bounds
        window = window.intersection(rasterio.windows.Window(
            0, 0, raster.width, raster.height))
        if window.width < 1 or window.height < 1:
            return np.array([])
        data = raster.read(1, window=window)
        # Filter nodata
        nodata = raster.nodata
        if nodata is not None:
            valid = data[data != nodata]
        else:
            valid = data[~np.isnan(data)] if np.issubdtype(data.dtype, np.floating) else data.ravel()
        return valid
    except Exception:
        return np.array([])


def extract_covariates_for_resolution(res, cells):
    """Extract land cover and elevation covariates for a list of H3 cells.

    Args:
        res: H3 resolution
        cells: list of H3 cell index strings

    Returns:
        dict: {h3_index: {trees: float, shrub: float, ..., elev_mean: float, elev_std: float}}
    """
    t0 = time.time()
    result = {}

    # --- Land cover ---
    # Open all raster files
    lc_rasters = {}
    for category, filenames in LANDCOVER_CLASSES.items():
        rasters = []
        for fn in filenames:
            path = EARTHENV_DIR / fn
            if path.exists():
                rasters.append(rasterio.open(str(path)))
            else:
                print(f"  WARNING: Missing {path}")
        if rasters:
            lc_rasters[category] = rasters

    if not lc_rasters:
        print("  ERROR: No land cover rasters found")
        return {}

    # Open elevation raster
    elev_raster = None
    # Look for GMTED2010 — it extracts as an ESRI grid, find the .adf or .tif
    for pattern in ["mn30_grd/*.adf", "mn30_grd/w001001.adf", "*.tif", "mn30_grd"]:
        matches = list(ELEVATION_DIR.glob(pattern))
        if matches:
            try:
                elev_raster = rasterio.open(str(matches[0]))
                print(f"  Elevation raster: {matches[0].name}")
                break
            except Exception:
                continue

    if elev_raster is None:
        print("  WARNING: No elevation raster found — using elevation=0")

    print(f"  Processing {len(cells)} cells at res {res}...")
    sys.stdout.flush()

    for i, h3_cell in enumerate(cells):
        if (i + 1) % 500 == 0:
            print(f"    {i+1}/{len(cells)}...")
            sys.stdout.flush()

        covariates = {}

        # Land cover: for each category, average the percentage values across pixels
        # EarthEnv values are 0-100 (percentage of pixel that is this land cover type)
        for category, rasters in lc_rasters.items():
            total = 0.0
            count = 0
            for raster in rasters:
                vals = sample_raster_for_cell(raster, h3_cell)
                if len(vals) > 0:
                    total += vals.sum()
                    count += len(vals)
            # Average percentage across all pixels and sub-classes, normalize to 0-1
            covariates[category] = (total / max(count, 1)) / 100.0

        # Elevation
        if elev_raster is not None:
            elev_vals = sample_raster_for_cell(elev_raster, h3_cell)
            if len(elev_vals) > 0:
                covariates["elev_mean"] = float(np.mean(elev_vals))
                covariates["elev_std"] = float(np.std(elev_vals))
            else:
                covariates["elev_mean"] = 0.0
                covariates["elev_std"] = 0.0
        else:
            covariates["elev_mean"] = 0.0
            covariates["elev_std"] = 0.0

        result[h3_cell] = covariates

    # Close rasters
    for rasters in lc_rasters.values():
        for r in rasters:
            r.close()
    if elev_raster:
        elev_raster.close()

    t1 = time.time()
    print(f"  Resolution {res}: {len(result)} cells extracted in {t1-t0:.1f}s")
    return result


def covariate_similarity(cov_a, cov_b):
    """Compute similarity between two covariate vectors (0 to 1).
    Uses inverse Euclidean distance in normalized feature space."""
    # Land cover features (already 0-1)
    lc_keys = ["trees", "shrub", "herb", "cultivated", "urban", "water", "flooded"]
    diff_sq = 0.0
    for k in lc_keys:
        diff_sq += (cov_a.get(k, 0) - cov_b.get(k, 0)) ** 2

    # Elevation difference — normalize by 1000m scale
    elev_diff = (cov_a.get("elev_mean", 0) - cov_b.get("elev_mean", 0)) / 1000.0
    diff_sq += elev_diff ** 2

    distance = diff_sq ** 0.5
    # Convert to similarity: 1/(1 + d)
    return 1.0 / (1.0 + distance * 3.0)  # scale factor for sensitivity


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Extract covariates for H3 cells")
    parser.add_argument("--check", action="store_true", help="Show cached status")
    args = parser.parse_args()

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    if args.check:
        for res in RESOLUTIONS:
            path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
            if path.exists():
                data = json.load(open(path))
                print(f"  r{res}: {len(data)} cells cached")
            else:
                print(f"  r{res}: not cached")
        return

    print("=" * 60)
    print("Extract Environmental Covariates")
    print("=" * 60)

    if not HAS_RASTERIO or not HAS_H3:
        print("ERROR: rasterio and h3 are required")
        sys.exit(1)

    for res in RESOLUTIONS:
        grid_path = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        if not grid_path.exists():
            print(f"\n  Skipping r{res} (no grid.geojson)")
            continue

        # Load H3 cells from grid
        with open(grid_path) as f:
            grid = json.load(f)
        cells = [feat["properties"]["h3_index"]
                 for feat in grid["features"]
                 if "h3_index" in feat.get("properties", {})]

        print(f"\nResolution {res}: {len(cells)} cells")
        covariates = extract_covariates_for_resolution(res, cells)

        # Save to archive
        out_path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
        with open(out_path, "w") as f:
            # Round values to save space
            compact = {}
            for h3_cell, cov in covariates.items():
                compact[h3_cell] = {
                    k: round(v, 3) if isinstance(v, float) else v
                    for k, v in cov.items()
                }
            json.dump(compact, f, separators=(",", ":"))
        print(f"  Saved: {out_path} ({os.path.getsize(out_path)/1024:.0f} KB)")

    print("\nDone!")


if __name__ == "__main__":
    main()
