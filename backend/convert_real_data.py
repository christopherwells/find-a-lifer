"""
Convert real eBird Status & Trends RDS data to Find-A-Lifer JSON format.

Reads:
  - grid_unified.tif (27km cell grid in EPSG:3857)
  - app_data/weeks/week_*.rds (presence/absence by cell_id, week, species_id)
  - app_data/species_extended.rds (50-species subset metadata)

Writes:
  - backend/data/grid.geojson (cell centers + polygons for 229K cells)
  - backend/data/weeks/week_*.json (presence data in app format)
  - backend/data/species.json (updated with real 50-species subset)
"""

import json
import os
import sys
import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform
import pyreadr

# Paths
R_PROJECT = "C:/Users/Christopher Wells/OneDrive - Bowdoin College/Research/Find-A-Lifer/app_data"
TIF_PATH = os.path.join(R_PROJECT, "grid_unified.tif")
WEEKS_RDS_DIR = os.path.join(R_PROJECT, "weeks")
SPECIES_RDS = os.path.join(R_PROJECT, "species_extended.rds")
OUTPUT_DIR = "C:/Users/Christopher Wells/find-a-lifer/backend/data"
WEEKS_OUTPUT_DIR = os.path.join(OUTPUT_DIR, "weeks")


def build_cell_lookup():
    """Build cell_id -> (lat, lng) lookup from the GeoTIFF."""
    print("Reading grid_unified.tif...")

    # First, collect all cell_ids from all weeks
    all_cell_ids = set()
    for w in range(1, 53):
        path = os.path.join(WEEKS_RDS_DIR, f"week_{w:02d}.rds")
        df = list(pyreadr.read_r(path).values())[0]
        all_cell_ids.update(int(x) for x in df["cell_id"].unique())
        print(f"  Scanned week {w:02d}: {len(all_cell_ids):,} total cells so far")

    print(f"\nTotal unique cells: {len(all_cell_ids):,}")

    with rasterio.open(TIF_PATH) as src:
        data = src.read(1)
        transform = src.transform
        res_x = transform.a  # pixel width in EPSG:3857 meters
        res_y = abs(transform.e)  # pixel height in EPSG:3857 meters
        half_x = res_x / 2
        half_y = res_y / 2

        print(f"Raster shape: {data.shape}, resolution: {res_x:.1f}m x {res_y:.1f}m")

        # Find all needed cells in the raster
        print("Mapping cell_ids to pixel locations...")
        needed = np.array(sorted(all_cell_ids))

        # Build lookup: cell_id -> (row, col)
        cell_pixels = {}
        rows, cols = np.where(np.isin(data, needed))
        for r, c in zip(rows, cols):
            cell_id = int(data[r, c])
            if cell_id in all_cell_ids:
                cell_pixels[cell_id] = (int(r), int(c))

        print(f"Mapped {len(cell_pixels):,} cells to pixels")

        # Convert to center coordinates in EPSG:3857
        cell_centers_3857 = {}
        for cell_id, (r, c) in cell_pixels.items():
            x, y = rasterio.transform.xy(transform, r, c)
            cell_centers_3857[cell_id] = (x, y)

        # Convert centers to WGS84 (EPSG:4326)
        print("Converting to WGS84...")
        ids = list(cell_centers_3857.keys())
        xs = [cell_centers_3857[i][0] for i in ids]
        ys = [cell_centers_3857[i][1] for i in ids]

        lngs, lats = warp_transform("EPSG:3857", "EPSG:4326", xs, ys)

        # Also convert corners for polygon generation
        # Each cell is a square: center +/- half_res in EPSG:3857
        corners_x = []
        corners_y = []
        for x, y in zip(xs, ys):
            # SW, SE, NE, NW corners
            corners_x.extend([x - half_x, x + half_x, x + half_x, x - half_x])
            corners_y.extend([y - half_y, y - half_y, y + half_y, y + half_y])

        corner_lngs, corner_lats = warp_transform("EPSG:3857", "EPSG:4326", corners_x, corners_y)

        cell_data = {}
        for i, cell_id in enumerate(ids):
            ci = i * 4  # corner index
            cell_data[cell_id] = {
                "center": (round(float(lats[i]), 4), round(float(lngs[i]), 4)),
                "corners": [
                    (round(float(corner_lngs[ci]), 4), round(float(corner_lats[ci]), 4)),      # SW
                    (round(float(corner_lngs[ci+1]), 4), round(float(corner_lats[ci+1]), 4)),  # SE
                    (round(float(corner_lngs[ci+2]), 4), round(float(corner_lats[ci+2]), 4)),  # NE
                    (round(float(corner_lngs[ci+3]), 4), round(float(corner_lats[ci+3]), 4)),  # NW
                ]
            }

    return cell_data


def generate_grid_geojson(cell_data):
    """Generate GeoJSON with polygon features for each cell."""
    print(f"\nGenerating grid.geojson for {len(cell_data):,} cells...")

    features = []
    for cell_id, info in sorted(cell_data.items()):
        sw, se, ne, nw = info["corners"]
        center_lat, center_lng = info["center"]

        feature = {
            "type": "Feature",
            "properties": {
                "cell_id": cell_id,
                "center_lat": center_lat,
                "center_lng": center_lng
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    list(sw), list(se), list(ne), list(nw), list(sw)  # closed ring
                ]]
            }
        }
        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    path = os.path.join(OUTPUT_DIR, "grid.geojson")
    with open(path, "w") as f:
        json.dump(geojson, f, separators=(",", ":"))  # compact

    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f"  Written: {path} ({size_mb:.1f} MB, {len(features):,} features)")
    return path


def convert_species():
    """Convert species_extended.rds to species.json."""
    print("\nConverting species data...")

    df = list(pyreadr.read_r(SPECIES_RDS).values())[0]
    print(f"  {len(df)} species from RDS")

    # Load existing species.json to preserve additional fields
    existing_path = os.path.join(OUTPUT_DIR, "species.json")
    with open(existing_path) as f:
        existing = json.load(f)

    # Build lookup by speciesCode
    existing_by_code = {s["speciesCode"]: s for s in existing}

    species_list = []
    for _, row in df.iterrows():
        code = row["speciesCode"]
        species_id = int(row["species_id"])

        # Start with existing data if available (preserves difficulty, photoUrl, etc.)
        if code in existing_by_code:
            entry = existing_by_code[code].copy()
            entry["species_id"] = species_id  # use RDS species_id
        else:
            entry = {
                "species_id": species_id,
                "speciesCode": code,
                "comName": row["comName"],
                "sciName": row["sciName"],
                "familyComName": row["familyComName"],
                "taxonOrder": float(row["taxonOrder"]),
                "invasionStatus": row.get("invasionStatus", "Unknown"),
                "conservStatus": row.get("conservStatus", "Unknown"),
                "difficultyScore": 0.5,
                "difficultyLabel": "Moderate",
                "isRestrictedRange": False,
                "ebirdUrl": f"https://ebird.org/species/{code}",
                "photoUrl": "",
                "seasonalityScore": 0.0,
                "peakWeek": 26,
                "rangeShiftScore": 0.0
            }

        species_list.append(entry)

    # Sort by species_id
    species_list.sort(key=lambda s: s["species_id"])

    with open(existing_path, "w") as f:
        json.dump(species_list, f, indent=2)

    print(f"  Written: {existing_path} ({len(species_list)} species)")


def convert_weekly_data(cell_data):
    """Convert weekly RDS files to JSON."""
    print("\nConverting weekly data...")

    # Get set of valid cell_ids (ones we have coordinates for)
    valid_cells = set(cell_data.keys())

    for w in range(1, 53):
        rds_path = os.path.join(WEEKS_RDS_DIR, f"week_{w:02d}.rds")
        df = list(pyreadr.read_r(rds_path).values())[0]

        records = []
        for _, row in df.iterrows():
            cell_id = int(row["cell_id"])
            if cell_id in valid_cells:
                records.append({
                    "cell_id": cell_id,
                    "species_id": int(row["species_id"]),
                    "probability": 1.0  # presence = 1.0
                })

        out_path = os.path.join(WEEKS_OUTPUT_DIR, f"week_{w:02d}.json")
        with open(out_path, "w") as f:
            json.dump(records, f, separators=(",", ":"))

        size_mb = os.path.getsize(out_path) / (1024 * 1024)
        print(f"  Week {w:02d}: {len(records):,} records ({size_mb:.1f} MB)")


def main():
    print("=" * 60)
    print("Find-A-Lifer: Real Data Conversion Pipeline")
    print("=" * 60)

    # Step 1: Build cell coordinate lookup
    cell_data = build_cell_lookup()

    # Step 2: Generate grid GeoJSON
    generate_grid_geojson(cell_data)

    # Step 3: Convert species
    convert_species()

    # Step 4: Convert weekly data
    convert_weekly_data(cell_data)

    print("\n" + "=" * 60)
    print("Conversion complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
