#!/usr/bin/env python3
"""
Compute ocean fraction for each H3 cell using Natural Earth land polygons.

For each cell in grid.geojson, computes what fraction of the cell area
overlaps with the ocean (i.e., NOT land). This allows splitting the
covariate 'water' field into freshwater vs. ocean.

Requires: shapely, pyshp (shapefile)
Input: pipeline/reference/ne_50m_land/ne_50m_land.shp, frontend/public/data/r{3,4}/grid.geojson
Output: Updates frontend/public/data/r{3,4}/covariates.json in-place, adding 'ocean' field
        and converting 'water' to freshwater (water minus ocean fraction where applicable).
"""

import json
import sys
import time
from pathlib import Path

import shapefile
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union
from shapely.prepared import prep

SCRIPT_DIR = Path(__file__).parent
REFERENCE_DIR = SCRIPT_DIR / "reference"
FRONTEND_DATA = SCRIPT_DIR.parent / "frontend" / "public" / "data"

ARCHIVE_DIR = SCRIPT_DIR.parent / "data" / "archive"
LAND_SHP = REFERENCE_DIR / "ne_50m_land" / "ne_50m_land.shp"


def load_land_polygons():
    """Load Natural Earth land polygons and build a prepared geometry for fast intersection tests."""
    print("Loading Natural Earth land polygons...")
    t0 = time.time()
    sf = shapefile.Reader(str(LAND_SHP))
    land_parts = []
    for shp_rec in sf.shapes():
        geom = shape(shp_rec.__geo_interface__)
        if geom.is_valid:
            land_parts.append(geom)
        else:
            land_parts.append(geom.buffer(0))

    # Merge into a single MultiPolygon for fast intersection
    # This is memory-intensive but only done once
    land_union = unary_union(land_parts)
    prepared_land = prep(land_union)
    print(f"  Loaded {len(land_parts)} land polygons in {time.time()-t0:.1f}s")
    return land_union, prepared_land


def compute_ocean_for_resolution(res: int, land_union, prepared_land):
    """Compute ocean fraction for each cell at a given resolution."""
    grid_path = FRONTEND_DATA / f"r{res}" / "grid.geojson"
    cov_path = FRONTEND_DATA / f"r{res}" / "covariates.json"

    if not grid_path.exists():
        print(f"  Skipping r{res}: no grid.geojson")
        return
    if not cov_path.exists():
        print(f"  Skipping r{res}: no covariates.json")
        return

    print(f"\n  Resolution {res}:")
    grid = json.load(open(grid_path))
    covariates = json.load(open(cov_path))

    updated = 0
    ocean_cells = 0
    coastal_cells = 0

    for feature in grid["features"]:
        cell_id = str(feature["properties"]["cell_id"])
        if cell_id not in covariates:
            continue

        # Build cell polygon from GeoJSON coordinates
        coords = feature["geometry"]["coordinates"]
        if feature["geometry"]["type"] == "Polygon":
            cell_poly = Polygon(coords[0])
        elif feature["geometry"]["type"] == "MultiPolygon":
            cell_poly = MultiPolygon([Polygon(ring[0]) for ring in coords])
        else:
            continue

        if not cell_poly.is_valid:
            cell_poly = cell_poly.buffer(0)

        cell_area = cell_poly.area
        if cell_area <= 0:
            continue

        # Quick check: if cell is entirely within land, ocean = 0
        if prepared_land.contains(cell_poly):
            ocean_frac = 0.0
        # Quick check: if cell doesn't intersect land at all, ocean = 1
        elif not prepared_land.intersects(cell_poly):
            ocean_frac = 1.0
            ocean_cells += 1
        else:
            # Partial overlap — compute intersection
            try:
                land_intersection = land_union.intersection(cell_poly)
                land_frac = land_intersection.area / cell_area
                ocean_frac = max(0.0, 1.0 - land_frac)
                if ocean_frac > 0.01:
                    coastal_cells += 1
            except Exception:
                ocean_frac = 0.0

        # Update covariates
        cov = covariates[cell_id]

        cov["ocean"] = round(ocean_frac, 4)
        # Keep 'water' as freshwater (it already represents inland water from EarthEnv)
        # The key insight: EarthEnv 'water' = freshwater; ocean was the unmapped gap

        updated += 1

    # Write updated frontend covariates
    with open(cov_path, "w") as f:
        json.dump(covariates, f, separators=(",", ":"))

    # Also update archive covariates (keyed by h3_index) so similarity function can use ocean
    archive_cov_path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
    if archive_cov_path.exists():
        archive_cov = json.load(open(archive_cov_path))
        # Build cell_id → h3_index reverse mapping from grid
        id_to_h3 = {}
        for feature in grid["features"]:
            props = feature["properties"]
            id_to_h3[str(props["cell_id"])] = props.get("h3_index", "")
        archive_updated = 0
        for cell_id, cov in covariates.items():
            h3_idx = id_to_h3.get(cell_id)
            if h3_idx and h3_idx in archive_cov:
                archive_cov[h3_idx]["ocean"] = cov.get("ocean", 0)
                archive_updated += 1
        with open(archive_cov_path, "w") as f:
            json.dump(archive_cov, f, separators=(",", ":"))
        print(f"    Archive updated: {archive_updated} cells")

    print(f"    Updated {updated} cells ({ocean_cells} fully ocean, {coastal_cells} coastal)")


def main():
    if not LAND_SHP.exists():
        print(f"ERROR: Land shapefile not found at {LAND_SHP}")
        sys.exit(1)

    land_union, prepared_land = load_land_polygons()

    for res in [3, 4]:
        compute_ocean_for_resolution(res, land_union, prepared_land)

    print("\nDone! Covariates updated with 'ocean' field.")
    print("  'water' = freshwater (EarthEnv inland water)")
    print("  'ocean' = ocean fraction (from Natural Earth coastline)")


if __name__ == "__main__":
    main()
