#!/usr/bin/env python3
"""
Add human-readable labels to grid cells using GeoNames city data.

For each cell, finds the best nearby city using population-weighted distance:
larger cities "pull" from further away, so Portland gets chosen over Yarmouth.

Adds a "label" property to each feature in grid.geojson files.

Usage:
  python scripts/label_cells.py           # Label all resolution grids
  python scripts/label_cells.py --preview  # Show labels without writing
"""

import json
import math
import sys
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
GEONAMES_FILE = SCRIPT_DIR / "reference" / "cities500.txt"

# US state FIPS → abbreviation
ADMIN1_TO_STATE = {}  # populated from admin1 codes

# Country + admin1 → short label (US states, CA provinces)
# GeoNames uses admin1 codes: US.NY, CA.ON, etc.
US_STATES = {
    "AL": "AL", "AK": "AK", "AZ": "AZ", "AR": "AR", "CA": "CA",
    "CO": "CO", "CT": "CT", "DE": "DE", "FL": "FL", "GA": "GA",
    "HI": "HI", "ID": "ID", "IL": "IL", "IN": "IN", "IA": "IA",
    "KS": "KS", "KY": "KY", "LA": "LA", "ME": "ME", "MD": "MD",
    "MA": "MA", "MI": "MI", "MN": "MN", "MS": "MS", "MO": "MO",
    "MT": "MT", "NE": "NE", "NV": "NV", "NH": "NH", "NJ": "NJ",
    "NM": "NM", "NY": "NY", "NC": "NC", "ND": "ND", "OH": "OH",
    "OK": "OK", "OR": "OR", "PA": "PA", "RI": "RI", "SC": "SC",
    "SD": "SD", "TN": "TN", "TX": "TX", "UT": "UT", "VT": "VT",
    "VA": "VA", "WA": "WA", "WV": "WV", "WI": "WI", "WY": "WY",
    "DC": "DC",
}

CA_PROVINCES = {
    "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL",
    "07": "NS", "08": "ON", "09": "PE", "10": "QC", "11": "SK",
    "12": "YT", "13": "NT", "14": "NU",
}

# US state FIPS codes → abbreviation
US_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06",
    "CO": "08", "CT": "09", "DE": "10", "DC": "11", "FL": "12",
    "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18",
    "IA": "19", "KS": "20", "KY": "21", "LA": "22", "ME": "23",
    "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28",
    "MO": "29", "MT": "30", "NE": "31", "NV": "32", "NH": "33",
    "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38",
    "OH": "39", "OK": "40", "OR": "41", "PA": "42", "RI": "44",
    "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49",
    "VT": "50", "VA": "51", "WA": "53", "WV": "54", "WI": "55",
    "WY": "56",
}
FIPS_TO_STATE = {v: k for k, v in US_FIPS.items()}


def haversine_km(lat1, lon1, lat2, lon2):
    """Distance between two points in km."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def load_cities(min_pop=500, bbox=None):
    """Load cities from GeoNames. Optional bbox = (min_lat, max_lat, min_lon, max_lon)."""
    cities = []
    with open(GEONAMES_FILE, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 15:
                continue
            name = parts[1]
            lat = float(parts[4])
            lon = float(parts[5])
            country = parts[8]
            admin1 = parts[10]
            try:
                pop = int(parts[14])
            except ValueError:
                pop = 0

            if pop < min_pop:
                continue

            # Filter to bbox if provided
            if bbox:
                min_lat, max_lat, min_lon, max_lon = bbox
                if lat < min_lat or lat > max_lat or lon < min_lon or lon > max_lon:
                    continue

            # Build state/province abbreviation
            region_abbr = ""
            if country == "US":
                region_abbr = FIPS_TO_STATE.get(admin1, admin1)
            elif country == "CA":
                region_abbr = CA_PROVINCES.get(admin1, admin1)
            else:
                region_abbr = country

            cities.append({
                "name": name,
                "lat": lat,
                "lon": lon,
                "pop": pop,
                "region": region_abbr,
                "country": country,
            })

    print(f"  Loaded {len(cities)} cities (pop >= {min_pop})")
    return cities


def find_best_city(center_lat, center_lon, cities, max_radius_km, resolution):
    """
    Find the best city label for a cell center.
    Uses population-weighted scoring: score = population / (distance + 1)^2
    This naturally picks larger cities even if slightly further away.
    """
    best_score = 0
    best_city = None

    for city in cities:
        dist = haversine_km(center_lat, center_lon, city["lat"], city["lon"])
        if dist > max_radius_km:
            continue

        # Population-weighted score: bigger cities win at distance
        # The exponent controls how strongly distance matters
        score = city["pop"] / (dist + 1) ** 1.5

        if score > best_score:
            best_score = score
            best_city = city

    return best_city


def label_grid(grid_path, cities, resolution, preview=False):
    """Add labels to a grid GeoJSON file."""
    with open(grid_path, "r") as f:
        grid = json.load(f)

    # Max search radius depends on resolution (bigger hexes → search further)
    max_radius = {3: 200, 4: 80, 5: 30}.get(resolution, 80)
    # Minimum population for label depends on resolution
    min_pop = {3: 10000, 4: 2000, 5: 500}.get(resolution, 2000)

    # Filter cities by minimum population for this resolution
    res_cities = [c for c in cities if c["pop"] >= min_pop]

    labeled = 0
    unlabeled = 0
    labels = []

    for feature in grid["features"]:
        props = feature["properties"]
        center_lat = props.get("center_lat", 0)
        center_lng = props.get("center_lng", 0)

        city = find_best_city(center_lat, center_lng, res_cities, max_radius, resolution)

        if city:
            if city["country"] in ("US", "CA"):
                label = f"{city['name']}, {city['region']}"
            else:
                label = f"{city['name']}, {city['country']}"
            props["label"] = label
            labeled += 1
            labels.append((props.get("cell_id"), label, city["pop"]))
        else:
            # Fallback: use coordinates as label
            lat_dir = "N" if center_lat >= 0 else "S"
            lon_dir = "W" if center_lng < 0 else "E"
            props["label"] = f"{abs(center_lat):.1f}°{lat_dir}, {abs(center_lng):.1f}°{lon_dir}"
            unlabeled += 1

    print(f"  Resolution {resolution}: {labeled} labeled, {unlabeled} coordinate-only")

    if preview:
        # Show sample labels
        labels.sort(key=lambda x: -x[2])
        for cell_id, label, pop in labels[:15]:
            print(f"    Cell {cell_id}: {label} (pop {pop:,})")
        if unlabeled > 0:
            print(f"    ... plus {unlabeled} cells with coordinate labels")
    else:
        with open(grid_path, "w") as f:
            json.dump(grid, f, separators=(",", ":"))
        print(f"  Written: {grid_path}")

    return grid


def main():
    parser = argparse.ArgumentParser(description="Label grid cells with city names")
    parser.add_argument("--preview", action="store_true", help="Preview labels without writing")
    args = parser.parse_args()

    print("=" * 60)
    print("Label Grid Cells with City Names")
    print("=" * 60)

    if not GEONAMES_FILE.exists():
        print(f"ERROR: GeoNames file not found: {GEONAMES_FILE}")
        print("Download from: https://download.geonames.org/export/dump/cities500.zip")
        sys.exit(1)

    # Compute bounding box from all grid files to limit city loading
    all_lats = []
    all_lons = []
    for res in [3, 4, 5]:
        grid_path = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        if grid_path.exists():
            with open(grid_path) as f:
                grid = json.load(f)
            for feat in grid["features"]:
                all_lats.append(feat["properties"].get("center_lat", 0))
                all_lons.append(feat["properties"].get("center_lng", 0))

    if all_lats:
        bbox = (min(all_lats) - 3, max(all_lats) + 3, min(all_lons) - 3, max(all_lons) + 3)
        print(f"\nData extent: {bbox[0]:.1f}–{bbox[1]:.1f}°N, {bbox[2]:.1f}–{bbox[3]:.1f}°E")
    else:
        bbox = None

    cities = load_cities(min_pop=500, bbox=bbox)

    for res in [3, 4, 5]:
        grid_path = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        if not grid_path.exists():
            print(f"\n  Skipping r{res} (no grid.geojson)")
            continue
        print(f"\nLabeling resolution {res}...")
        label_grid(grid_path, cities, res, preview=args.preview)

    # Also label the root grid.geojson (backward compat, copy of r4)
    root_grid = OUTPUT_DIR / "grid.geojson"
    if root_grid.exists() and not args.preview:
        import shutil
        r4_grid = OUTPUT_DIR / "r4" / "grid.geojson"
        if r4_grid.exists():
            shutil.copy2(r4_grid, root_grid)
            print(f"\n  Copied labeled r4 grid to root")

    if args.preview:
        print("\n  (Preview mode — no files written)")
    else:
        print("\n  Done! Grid files updated with labels.")


if __name__ == "__main__":
    main()
