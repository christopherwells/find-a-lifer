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


def score_city(city, center_lat, center_lon, max_radius_km, cell_region=None):
    """
    Score a city for labeling a cell. Returns (score, dist) or (0, inf).
    Uses population / (distance + 1)^1.5 with a same-region bonus.
    Deduplication is handled externally via max_cells_per_city.
    """
    dist = haversine_km(center_lat, center_lon, city["lat"], city["lon"])
    if dist > max_radius_km:
        return 0, dist

    score = city["pop"] / (dist + 1) ** 1.5

    # Boost cities in same state/province so NH cells prefer NH cities
    if cell_region and city["region"] == cell_region:
        score *= 1.5

    return score, dist


def guess_cell_region(center_lat, center_lng, cities):
    """Guess which state/province a cell is in by finding the nearest city."""
    best_dist = float("inf")
    best_region = None
    for city in cities:
        dist = haversine_km(center_lat, center_lng, city["lat"], city["lon"])
        if dist < best_dist:
            best_dist = dist
            best_region = city["region"]
    return best_region


# Named islands — checked before ocean regions. (lat, lng, radius_deg, name)
# Cells within radius_deg of the point get the island name.
NAMED_ISLANDS = [
    (5.53, -87.07, 0.8, "Cocos Island"),
    (32.32, -64.75, 2.0, "Bermuda"),
    (18.73, -110.95, 1.0, "Revillagigedo Islands"),
    (29.03, -118.28, 0.8, "Guadalupe Island"),
    (20.43, -86.92, 0.6, "Cozumel"),
    (24.53, -81.80, 0.8, "Florida Keys"),
    (21.47, -71.14, 1.0, "Turks and Caicos"),
    (18.22, -66.50, 1.0, "Puerto Rico"),
    (18.47, -69.90, 1.0, "Hispaniola"),
    (18.11, -77.30, 1.0, "Jamaica"),
    (22.00, -79.50, 2.0, "Cuba"),
    (25.03, -77.50, 1.0, "Nassau, Bahamas"),
    (26.53, -78.80, 0.8, "Grand Bahama"),
    (24.07, -74.53, 0.8, "Exuma, Bahamas"),
    (19.82, -155.47, 1.0, "Hawaii (Big Island)"),
    (20.80, -156.33, 0.8, "Maui"),
    (21.47, -158.00, 0.8, "Oahu"),
    (22.07, -159.50, 0.8, "Kauai"),
    (56.80, -135.33, 1.5, "Sitka, AK"),
    (57.05, -170.27, 1.0, "St. Paul Island, AK"),
    (51.88, -176.65, 1.0, "Adak, AK"),
]

# Ocean/sea region names for unlabeled offshore cells
# Polygons defined as (min_lat, max_lat, min_lng, max_lng, name)
OCEAN_REGIONS = [
    # Caribbean
    (10, 22, -88, -60, "Caribbean Sea"),
    # Gulf of Mexico
    (18, 31, -98, -80, "Gulf of Mexico"),
    # North Atlantic — by latitude bands
    (45, 70, -65, -10, "North Atlantic"),
    (25, 45, -80, -40, "Western Atlantic"),
    (25, 45, -40, -10, "Central Atlantic"),
    # Pacific
    (30, 60, -180, -120, "North Pacific"),
    (10, 30, -130, -80, "Eastern Pacific"),
    (0, 10, -120, -75, "Tropical Eastern Pacific"),
    # Arctic
    (60, 90, -180, 0, "Arctic Ocean"),
    # Hudson Bay / Labrador
    (50, 65, -95, -60, "Hudson Bay"),
    (45, 60, -60, -45, "Labrador Sea"),
    # Bering Sea
    (52, 66, -180, -160, "Bering Sea"),
    # Gulf of Alaska
    (52, 62, -160, -130, "Gulf of Alaska"),
    # Bay of Fundy / Gulf of St. Lawrence
    (43, 52, -70, -56, "Gulf of St. Lawrence"),
    # Bahamas / Turks
    (20, 28, -80, -72, "Bahamas"),
]


def get_ocean_label(lat, lng, nearby_city=None):
    """Get a descriptive name for an offshore/island cell.
    Checks named islands first, then ocean regions, then uses nearby city.
    """
    # Check named islands first (highest priority)
    for ilat, ilng, radius, iname in NAMED_ISLANDS:
        if abs(lat - ilat) < radius and abs(lng - ilng) < radius:
            dist = ((lat - ilat)**2 + (lng - ilng)**2)**0.5
            if dist <= radius:
                return iname

    # Try specific ocean regions (smaller, more specific polygons)
    region_name = None
    for min_lat, max_lat, min_lng, max_lng, name in OCEAN_REGIONS:
        if min_lat <= lat <= max_lat and min_lng <= lng <= max_lng:
            region_name = name
            break

    # Fallback: generic based on hemisphere
    if not region_name:
        if lng < -30:
            if lat > 40:
                region_name = "North Atlantic"
            elif lat > 0:
                region_name = "Western Atlantic"
            else:
                region_name = "South Atlantic"
        else:
            if lat > 40:
                region_name = "North Pacific"
            else:
                region_name = "Eastern Pacific"

    # Add nearby city for uniqueness if available
    if nearby_city:
        return f"{region_name} off {nearby_city}"
    return region_name


def label_grid(grid_path, cities, resolution, preview=False):
    """Add labels to a grid GeoJSON file."""
    with open(grid_path, "r") as f:
        grid = json.load(f)

    # Max search radius depends on resolution (bigger hexes → search further)
    # Reduced res 3 from 200→120km (roughly one hex diameter)
    max_radius = {2: 300, 3: 120, 4: 60, 5: 30}.get(resolution, 60)
    # Minimum population for label depends on resolution
    # Res 2 hexes are ~460km — only major metro areas
    # Res 3 hexes are ~120km — use larger cities for recognizable labels
    min_pop = {2: 100000, 3: 10000, 4: 2000, 5: 500}.get(resolution, 2000)
    # Max cells any single city NAME can label (prevents NYC labeling 10+ cells)
    # Uses base city name for dedup (e.g. "South Boston" counts toward "Boston")
    max_cells_per_city = {2: 1, 3: 2, 4: 3, 5: 5}.get(resolution, 3)

    # Filter cities by minimum population for this resolution
    res_cities = [c for c in cities if c["pop"] >= min_pop]

    # Build base-name dedup keys: "South Boston|MA" → "Boston|MA"
    # Strips common directional/variant prefixes so neighborhoods count
    # toward the parent city's label limit
    PREFIXES = ("South ", "North ", "East ", "West ", "New ", "Old ",
                "Upper ", "Lower ", "Greater ", "Inner ", "Outer ",
                "Mont-Saint-", "Saint-", "Sainte-")

    def dedup_key(city):
        """Group city variants under the same dedup bucket."""
        name = city["name"]
        for prefix in PREFIXES:
            if name.startswith(prefix) and len(name) > len(prefix) + 2:
                name = name[len(prefix):]
                break
        return f"{name}|{city['region']}"

    # Two-pass approach: score all (cell, city) pairs, then assign with dedup
    cell_candidates = {}  # idx -> [(city, score, dk), ...]

    for idx, feature in enumerate(grid["features"]):
        props = feature["properties"]
        center_lat = props.get("center_lat", 0)
        center_lng = props.get("center_lng", 0)

        cell_region = guess_cell_region(center_lat, center_lng, res_cities)
        candidates = []
        for city in res_cities:
            score, dist = score_city(city, center_lat, center_lng, max_radius,
                                     cell_region)
            if score > 0:
                dk = dedup_key(city)
                candidates.append((city, score, dk))

        candidates.sort(key=lambda x: -x[1])
        cell_candidates[idx] = candidates

    # Greedy assignment: process cells by their best score (descending)
    # so that cells closest to a city claim it first
    cell_best = []
    for idx, cands in cell_candidates.items():
        if cands:
            cell_best.append((idx, cands[0][1]))
    cell_best.sort(key=lambda x: -x[1])

    city_usage = {}  # dedup_key -> count
    assigned = {}    # idx -> city

    for idx, _ in cell_best:
        for city, score, dk in cell_candidates[idx]:
            if city_usage.get(dk, 0) < max_cells_per_city:
                assigned[idx] = city
                city_usage[dk] = city_usage.get(dk, 0) + 1
                break

    # Apply labels
    labeled = 0
    unlabeled = 0
    labels = []

    for idx, feature in enumerate(grid["features"]):
        props = feature["properties"]
        city = assigned.get(idx)

        if city:
            if city["country"] in ("US", "CA"):
                label = f"{city['name']}, {city['region']}"
            else:
                label = f"{city['name']}, {city['country']}"
            props["label"] = label
            labeled += 1
            labels.append((props.get("cell_id"), label, city["pop"]))
        else:
            center_lat = props.get("center_lat", 0)
            center_lng = props.get("center_lng", 0)
            # Find nearest city (extended radius)
            nearest_city = None
            nearest_dist = float("inf")
            for c in res_cities:
                d = haversine_km(center_lat, center_lng, c["lat"], c["lon"])
                if d < nearest_dist:
                    nearest_dist = d
                    nearest_city = c

            # Decide: inland cells get "Near [City]", ocean cells get ocean label
            # Use extended radius for inland: if nearest city < 400km, it's inland
            if nearest_city and nearest_dist < 400:
                # Inland cell — use "Near [City], [Region]"
                if nearest_city["country"] in ("US", "CA"):
                    props["label"] = f"Near {nearest_city['name']}, {nearest_city['region']}"
                else:
                    props["label"] = f"Near {nearest_city['name']}, {nearest_city['country']}"
            else:
                # Likely ocean or very remote — use ocean label
                qualifier = nearest_city["name"] if nearest_city and nearest_dist < 500 else None
                ocean_label = get_ocean_label(center_lat, center_lng, qualifier)
                props["label"] = ocean_label
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
    for res in [2, 3, 4, 5]:
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

    for res in [2, 3, 4, 5]:
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
