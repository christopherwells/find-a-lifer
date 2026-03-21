#!/usr/bin/env python3
"""
Shared constants and utilities for Find-A-Lifer pipeline scripts.

Centralizes path definitions, resolution configs, sub-region definitions,
and small helper functions used across multiple pipeline scripts.
"""

import json
from pathlib import Path


# ── Path constants ────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
DOWNLOADS_DIR = DATA_DIR / "downloads"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
REFERENCE_DIR = SCRIPT_DIR / "reference"
TAXONOMY_FILE = REFERENCE_DIR / "ebird_taxonomy.json"
SPECIES_JSON = OUTPUT_DIR / "species.json"
LAND_SHAPEFILE = REFERENCE_DIR / "ne_50m_land" / "ne_50m_land.shp"


def res_path(res):
    """Return the output directory for a given H3 resolution: OUTPUT_DIR / 'r{res}'."""
    return OUTPUT_DIR / f"r{res}"


# ── Resolution configs ────────────────────────────────────────────────

# Active H3 resolutions used throughout the pipeline.
# process_ebd uses [2, 3, 4]; downstream scripts use [3, 4].
RESOLUTIONS = [3, 4]
RESOLUTIONS_ALL = [2, 3, 4]


# ── Sub-region definitions ────────────────────────────────────────────
# key -> (display_name, state_codes, fallback_bbox)
# state_codes: set of eBird STATE CODE values (e.g., "US-ME", "CA-BC")
# fallback_bbox: [west, south, east, north] used when state code is unknown

SUB_REGIONS = {
    "ca-west": ("Western Canada",
                {"CA-BC", "CA-AB"},
                [-141, 48, -125, 70]),
    "ca-central": ("Central Canada",
                   {"CA-SK", "CA-MB"},
                   [-120, 48, -89, 70]),
    "ca-east": ("Eastern Canada",
                {"CA-ON", "CA-QC", "CA-NB", "CA-NS", "CA-NL", "CA-PE"},
                [-89, 42, -50, 63]),
    "ca-north": ("Northern Canada",
                 {"CA-YT", "CA-NT", "CA-NU"},
                 [-141, 60, -60, 84]),
    "mx-north": ("Northern Mexico",
                 {f"MX-{s}" for s in ["BCN", "BCS", "SON", "CHH", "COA", "NLE", "TAM",
                                      "SIN", "DUR", "ZAC", "SLP", "AGU", "NAY", "JAL"]},
                 [-118, 20, -86, 33]),
    "mx-south": ("Southern Mexico",
                 {f"MX-{s}" for s in ["COL", "MIC", "GUA", "GRO", "OAX", "CHP", "TAB",
                                      "VER", "PUE", "TLA", "HID", "MEX", "MOR", "QUE",
                                      "CAM", "ROO", "YUC", "CMX", "DIF"]},
                 [-118, 14, -100, 20]),
    "ca-c-north": ("Northern Central America",
                   {"BZ", "GT", "SV", "HN", "NI"},
                   [-92, 12, -83, 18]),
    "ca-c-south": ("Southern Central America",
                   {"CR", "PA"},
                   [-86, 7, -77, 12]),
    "caribbean-greater": ("Greater Antilles",
                          {"CU", "JM", "HT", "DO", "PR"},
                          [-85, 17, -64, 24]),
    "caribbean-lesser": ("Lesser Antilles",
                         {"TT", "BB", "KN", "VI", "VG", "AW", "MF", "MQ", "BQ",
                          "SX", "AG", "DM", "GD", "LC", "VC"},
                         [-70, 10, -59, 19]),
    "atlantic-west": ("Western Atlantic Islands",
                      {"BM", "BS", "TC"},
                      [-80, 20, -60, 33]),
    "us-ne": ("Northeastern US",
              {"US-ME", "US-NH", "US-VT", "US-MA", "US-RI", "US-CT",
               "US-NY", "US-NJ", "US-PA", "US-DE", "US-MD", "US-DC"},
              [-80, 37, -66, 48]),
    "us-se": ("Southeastern US",
              {"US-VA", "US-WV", "US-NC", "US-SC", "US-GA", "US-FL",
               "US-AL", "US-MS", "US-TN", "US-KY", "US-LA", "US-AR"},
              [-95, 24, -75, 39]),
    "us-mw": ("Midwestern US",
              {"US-OH", "US-IN", "US-IL", "US-MI", "US-WI", "US-MN",
               "US-IA", "US-MO", "US-ND", "US-SD", "US-NE", "US-KS"},
              [-105, 36, -80, 49]),
    "us-sw": ("Southwestern US",
              {"US-TX", "US-OK", "US-NM", "US-AZ"},
              [-115, 25, -93, 37]),
    "us-west": ("Western US",
                {"US-CA", "US-OR", "US-WA"},
                [-125, 32, -116, 49]),
    "us-rockies": ("US Rockies",
                   {"US-NV", "US-UT", "US-CO", "US-WY", "US-MT", "US-ID"},
                   [-117, 35, -102, 49]),
    "us-ak": ("Alaska",
              {"US-AK"},
              [-180, 51, -130, 72]),
    "us-hi": ("Hawaii",
              {"US-HI"},
              [-161, 18, -154, 23]),
}

# Reverse lookup: state_code -> sub_region_id
STATE_TO_REGION = {}
for _region_id, (_, _state_codes, _) in SUB_REGIONS.items():
    for _sc in _state_codes:
        STATE_TO_REGION[_sc] = _region_id


# ── Pelagic/ocean-allowed families ────────────────────────────────────
# Bird families exempt from land-obligate ocean filtering.
# These families are expected to occur in cells dominated by water.

OCEAN_FAMILIES = {
    "Albatrosses", "Auks, Murres, and Puffins", "Boobies and Gannets",
    "Cormorants and Shags", "Ducks, Geese, and Waterfowl", "Frigatebirds",
    "Grebes", "Gulls, Terns, and Skimmers", "Loons", "Northern Storm-Petrels",
    "Oystercatchers", "Pelicans", "Plovers and Lapwings", "Sandpipers and Allies",
    "Shearwaters and Petrels", "Skuas and Jaegers", "Southern Storm-Petrels",
    "Tropicbirds",
}


# ── Small helpers ─────────────────────────────────────────────────────

def load_json(path):
    """Load and return parsed JSON from a file path."""
    with open(path, "r") as f:
        return json.load(f)


def load_species_json():
    """Load species.json and return the species list.

    Handles both the flat-array format and the {species, regionNames} wrapper.
    Returns (species_list, wrapper_or_None).
    """
    data = load_json(SPECIES_JSON)
    if isinstance(data, list):
        return data, None
    if isinstance(data, dict) and "species" in data:
        return data["species"], data
    raise ValueError(f"Unexpected species.json format: {type(data)}")


def load_grid(res):
    """Load grid.geojson for a resolution. Returns the parsed GeoJSON dict."""
    return load_json(res_path(res) / "grid.geojson")


def load_covariates(res):
    """Load cell covariates from the archive for a resolution.

    Returns dict: {h3_index: {covariate_dict}} or empty dict if missing.
    """
    path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
    if not path.exists():
        return {}
    return load_json(path)


def build_h3_to_cell_id(grid):
    """Build h3_index -> cell_id mapping from a grid GeoJSON dict."""
    return {
        f["properties"]["h3_index"]: f["properties"]["cell_id"]
        for f in grid["features"]
    }


def build_cell_centroids(grid):
    """Build cell_id -> (lng, lat) mapping from a grid GeoJSON dict."""
    result = {}
    for f in grid["features"]:
        p = f["properties"]
        key = p.get("h3_index", p.get("cell_id"))
        result[key] = (p.get("center_lng", 0), p.get("center_lat", 0))
    return result
