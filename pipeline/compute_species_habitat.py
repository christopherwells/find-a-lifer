#!/usr/bin/env python3
"""Compute per-species habitat profiles from cell covariates and occurrence data.

For each species, aggregates frequency-weighted environmental covariates across
all cells where the species occurs. Derives habitat labels from thresholds and
computes preferred elevation ranges.

Merges habitatLabels and preferredElevation into species.json.

Usage:
    python pipeline/compute_species_habitat.py
"""

import json
from pathlib import Path
from collections import defaultdict

PROJECT = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
REFERENCE_DIR = SCRIPT_DIR / "reference"
FRONTEND_DATA = PROJECT / "frontend" / "public" / "data"
SPECIES_JSON = FRONTEND_DATA / "species.json"

# Use res 4 (medium detail) for habitat computation
RESOLUTION = 4

# Habitat label thresholds (minimum weighted average to qualify)
# Forest types get specific labels when one type dominates (>60% of total forest)
# Otherwise falls back to generic "Forest"
NON_FOREST_THRESHOLDS = [
    ("Freshwater", "water", 0.25),    # high bar — avoid labeling land birds near lakes
    ("Ocean", "ocean", 0.40),         # high bar — only species truly in ocean-dominated cells
    ("Wetland", "flooded", 0.03),
    ("Grassland", "herb", 0.08),
    ("Agricultural", "cultivated", 0.20),  # raised to avoid labeling generalists near farms
    ("Urban-tolerant", "urban", 0.005),
    ("Scrubland", "shrub", 0.10),
]

# Families where freshwater/ocean thresholds should be lowered
# (these birds use water even when frequency-weighted cell averages are diluted)
WATER_ASSOCIATED_FAMILIES = {
    "Ducks, Geese, and Waterfowl", "Herons, Egrets, and Bitterns",
    "Grebes", "Loons", "Cormorants and Shags", "Pelicans",
    "Rails, Gallinules, and Coots", "Ibises and Spoonbills",
    "Kingfishers", "Storks", "Cranes", "Sunbittern",
    "Sandpipers and Allies", "Plovers and Lapwings",
    "Gulls, Terns, and Skimmers",
}
WATER_FAMILY_FRESHWATER_THRESHOLD = 0.05  # much lower for known water birds
WATER_FAMILY_OCEAN_THRESHOLD = 0.20

FOREST_THRESHOLD = 0.15  # min total forest to qualify for any forest label
# Per-type dominance thresholds: specific types get lower bar, mixed is harder
FOREST_TYPE_LABELS = {
    "needleleaf":          ("Conifer Forest",    0.45),  # lower bar — informative
    "evergreen_broadleaf": ("Tropical Forest",   0.45),  # lower bar — informative
    "deciduous_broadleaf": ("Deciduous Forest",  0.45),  # lower bar — informative
    "mixed_forest":        ("Mixed Forest",      0.75),  # higher bar — less informative, downweighted
}

# All covariate keys to aggregate (supports both split and legacy formats)
FOREST_KEYS = ["needleleaf", "evergreen_broadleaf", "deciduous_broadleaf", "mixed_forest"]
LEGACY_FOREST_KEY = "trees"
ALL_LAND_KEYS = FOREST_KEYS + ["shrub", "herb", "cultivated", "urban", "water", "flooded", "ocean"]


# Sub-region bounding boxes (must match frontend/src/lib/subRegions.ts)
# Sub-region definitions: key -> (display_name, state_codes, fallback_bbox)
# state_codes used for exact matching via cell_states archive; bbox as fallback
SUB_REGIONS = {
    "ca-west": ("Western Canada", {"CA-BC", "CA-AB"}, [-141, 48, -125, 70]),
    "ca-central": ("Central Canada", {"CA-SK", "CA-MB"}, [-120, 48, -89, 70]),
    "ca-east": ("Eastern Canada", {"CA-ON", "CA-QC", "CA-NB", "CA-NS", "CA-NL", "CA-PE"}, [-89, 42, -50, 63]),
    "ca-north": ("Northern Canada", {"CA-YT", "CA-NT", "CA-NU"}, [-141, 60, -60, 84]),
    "mx-north": ("Northern Mexico",
                  {f"MX-{s}" for s in ["BCN","BCS","SON","CHH","COA","NLE","TAM","SIN","DUR","ZAC","SLP","AGU","NAY","JAL"]},
                  [-118, 20, -86, 33]),
    "mx-south": ("Southern Mexico",
                  {f"MX-{s}" for s in ["COL","MIC","GUA","GRO","OAX","CHP","TAB","VER","PUE","TLA","HID","MEX","MOR","QUE","CAM","ROO","YUC","CMX","DIF"]},
                  [-118, 14, -100, 20]),
    "ca-c-north": ("Northern Central America", {"BZ", "GT", "SV", "HN", "NI"}, [-92, 12, -83, 18]),
    "ca-c-south": ("Southern Central America", {"CR", "PA"}, [-86, 7, -77, 12]),
    "caribbean-greater": ("Greater Antilles", {"CU", "JM", "HT", "DO", "PR"}, [-85, 17, -64, 24]),
    "caribbean-lesser": ("Lesser Antilles", {"TT", "BB", "KN", "VI", "VG", "AW", "MF", "MQ", "BQ", "SX", "AG", "DM", "GD", "LC", "VC"}, [-70, 10, -59, 19]),
    "atlantic-west": ("Western Atlantic Islands", {"BM", "BS", "TC"}, [-80, 20, -60, 33]),
    "us-ne": ("Northeastern US", {"US-ME","US-NH","US-VT","US-MA","US-RI","US-CT","US-NY","US-NJ","US-PA","US-DE","US-MD","US-DC"}, [-80, 37, -66, 48]),
    "us-se": ("Southeastern US", {"US-VA","US-WV","US-NC","US-SC","US-GA","US-FL","US-AL","US-MS","US-TN","US-KY","US-LA","US-AR"}, [-95, 24, -75, 39]),
    "us-mw": ("Midwestern US", {"US-OH","US-IN","US-IL","US-MI","US-WI","US-MN","US-IA","US-MO","US-ND","US-SD","US-NE","US-KS"}, [-105, 36, -80, 49]),
    "us-sw": ("Southwestern US", {"US-TX","US-OK","US-NM","US-AZ"}, [-115, 25, -93, 37]),
    "us-west": ("Western US", {"US-CA","US-OR","US-WA"}, [-125, 32, -116, 49]),
    "us-rockies": ("US Rockies", {"US-NV","US-UT","US-CO","US-WY","US-MT","US-ID"}, [-117, 35, -102, 49]),
    "us-ak": ("Alaska", {"US-AK"}, [-180, 51, -130, 72]),
    "us-hi": ("Hawaii", {"US-HI"}, [-161, 18, -154, 23]),
}

# Build reverse lookup: state_code -> sub_region_id
STATE_TO_REGION = {}
for _region_id, (_, _state_codes, _) in SUB_REGIONS.items():
    for _sc in _state_codes:
        STATE_TO_REGION[_sc] = _region_id


def compute_habitat_for_cells(weeks_data, covariates, cell_filter=None):
    """Compute frequency-weighted habitat covariates for a species.

    Args:
        weeks_data: {week_str: [[cell_id, freq], ...]}
        covariates: {cell_id: {covariate_dict}}
        cell_filter: optional set of cell_ids to include (None = all)

    Returns:
        (norm_cov, elev_values, total_weight) or (None, None, 0) if no data
    """
    weighted_cov = defaultdict(float)
    total_weight = 0.0
    elev_values = []

    for _week, cells in weeks_data.items():
        for cell_id, freq in cells:
            if cell_filter is not None and cell_id not in cell_filter:
                continue
            cov = covariates.get(cell_id)
            if not cov:
                continue
            weight = freq / 255.0
            if weight < 0.01:
                continue

            if "needleleaf" in cov:
                for key in ALL_LAND_KEYS:
                    weighted_cov[key] += cov.get(key, 0) * weight
            else:
                weighted_cov["trees"] += cov.get("trees", 0) * weight
                for key in ["shrub", "herb", "cultivated", "urban", "water", "flooded"]:
                    weighted_cov[key] += cov.get(key, 0) * weight
            total_weight += weight

            if cov.get("elev_mean", 0) > 0:
                elev_values.append((cov["elev_mean"], weight))

    if total_weight == 0:
        return None, None, 0

    norm_cov = {k: v / total_weight for k, v in weighted_cov.items()}
    return norm_cov, elev_values, total_weight


def derive_labels(norm_cov, family=""):
    """Derive habitat labels from normalized covariates."""
    labels = []

    # Forest
    if "needleleaf" in norm_cov:
        total_forest = sum(norm_cov.get(k, 0) for k in FOREST_KEYS)
    else:
        total_forest = norm_cov.get("trees", 0)

    if total_forest >= FOREST_THRESHOLD:
        assigned = False
        if total_forest > 0:
            type_fracs = [(fkey, norm_cov.get(fkey, 0)) for fkey in FOREST_KEYS]
            type_fracs.sort(key=lambda x: -x[1])
            for fkey, val in type_fracs:
                label_name, threshold = FOREST_TYPE_LABELS[fkey]
                if val / total_forest >= threshold:
                    labels.append(label_name)
                    assigned = True
                    break
        if not assigned:
            labels.append("Forest")

    # Freshwater
    raw_water = norm_cov.get("water", 0)
    ocean_val = norm_cov.get("ocean", 0)
    freshwater = max(0, raw_water - ocean_val)
    norm_cov["_freshwater"] = freshwater

    is_water_family = family in WATER_ASSOCIATED_FAMILIES

    for label, key, threshold in NON_FOREST_THRESHOLDS:
        actual_key = "_freshwater" if key == "water" else key
        t = threshold
        if is_water_family:
            if key == "water":
                t = WATER_FAMILY_FRESHWATER_THRESHOLD
            elif key == "ocean":
                t = WATER_FAMILY_OCEAN_THRESHOLD
        if norm_cov.get(actual_key, 0) >= t:
            labels.append(label)

    if len(labels) >= 4:
        labels.append("Habitat Generalist")
    elif len(labels) == 0:
        labels.append("Habitat Generalist")

    return labels


def compute_elevation(elev_values):
    """Compute preferred elevation from weighted values."""
    if not elev_values:
        return None
    total_weight = sum(w for _, w in elev_values)
    if total_weight <= 0:
        return None
    weighted_mean = sum(e * w for e, w in elev_values) / total_weight
    elevs = [e for e, _ in elev_values]
    return {
        "mean": round(weighted_mean),
        "min": round(min(elevs)),
        "max": round(max(elevs)),
    }


def main():
    cov_path = FRONTEND_DATA / f"r{RESOLUTION}" / "covariates.json"
    species_weeks_dir = FRONTEND_DATA / f"r{RESOLUTION}" / "species-weeks"

    if not cov_path.exists():
        print(f"Error: {cov_path} not found. Run ship_covariates.py first.")
        return

    if not SPECIES_JSON.exists():
        print(f"Error: {SPECIES_JSON} not found.")
        return

    # Load covariates (cell_id -> covariates)
    with open(cov_path) as f:
        raw_cov = json.load(f)
    covariates = {int(k): v for k, v in raw_cov.items()}
    print(f"Loaded covariates for {len(covariates)} cells")

    # Load species.json
    with open(SPECIES_JSON) as f:
        species_data = json.load(f)

    # Handle both flat array and {species, regionNames} formats
    if isinstance(species_data, list):
        species_list = species_data
        wrapper = None
    elif isinstance(species_data, dict) and "species" in species_data:
        species_list = species_data["species"]
        wrapper = species_data
    else:
        print("Error: Unexpected species.json format")
        return

    print(f"Loaded {len(species_list)} species")

    # Build species code -> species index lookup and family lookup
    code_to_idx = {sp["speciesCode"]: i for i, sp in enumerate(species_list)}
    code_to_family = {sp["speciesCode"]: sp.get("familyComName", "") for sp in species_list}

    # Build cell_id → centroid mapping for sub-region filtering
    grid_path = FRONTEND_DATA / f"r{RESOLUTION}" / "grid.geojson"
    cell_centroids = {}
    if grid_path.exists():
        grid = json.load(open(grid_path))
        for f in grid["features"]:
            p = f["properties"]
            cell_centroids[p["cell_id"]] = (p.get("center_lng", 0), p.get("center_lat", 0))

    # Load cell state codes for exact sub-region assignment
    cell_states = {}
    cell_states_file = Path(__file__).parent.parent / "data" / "archive" / f"cell_states_r{RESOLUTION}.json"
    if cell_states_file.exists():
        cell_states = json.load(open(cell_states_file))
        print(f"  Loaded cell state codes: {len(cell_states)} cells")

    # Build per-sub-region cell ID sets (state codes first, bbox fallback)
    region_cell_sets = {k: set() for k in SUB_REGIONS}
    for cid in cell_centroids:
        state_code = cell_states.get(str(cid), "")
        # Try exact match first, then country prefix (CU-03 → CU)
        resolved = STATE_TO_REGION.get(state_code) or STATE_TO_REGION.get(state_code.split('-')[0]) if state_code else None
        if resolved:
            region_cell_sets[resolved].add(cid)
        elif cid in cell_centroids:
            lng, lat = cell_centroids[cid]
            for region_id, (_, _, bbox) in SUB_REGIONS.items():
                west, south, east, north = bbox
                if west <= lng <= east and south <= lat <= north:
                    region_cell_sets[region_id].add(cid)
                    break
    # Remove empty regions
    region_cell_sets = {k: v for k, v in region_cell_sets.items() if v}

    # Process each species-weeks file
    habitat_results = {}  # speciesCode -> {labels, elevation, regionalHabitat}
    processed = 0
    skipped = 0

    for sw_file in sorted(species_weeks_dir.glob("*.json")):
        code = sw_file.stem
        if code not in code_to_idx:
            skipped += 1
            continue

        with open(sw_file) as f:
            weeks_data = json.load(f)

        family = code_to_family.get(code, "")

        # Global habitat computation
        norm_cov, elev_values, total_weight = compute_habitat_for_cells(weeks_data, covariates)
        if norm_cov is None:
            skipped += 1
            continue

        labels = derive_labels(norm_cov, family)
        preferred_elev = compute_elevation(elev_values) if elev_values else None

        # Per-sub-region habitat computation
        regional_habitat = {}
        for region_id, cell_set in region_cell_sets.items():
            r_norm, r_elev, r_weight = compute_habitat_for_cells(weeks_data, covariates, cell_set)
            if r_norm is not None:
                r_labels = derive_labels(r_norm, family)
                r_elevation = compute_elevation(r_elev) if r_elev else None
                regional_habitat[region_id] = {
                    "labels": r_labels,
                    "elevation": r_elevation,
                }

        habitat_results[code] = {
            "labels": labels,
            "elevation": preferred_elev,
            "regionalHabitat": regional_habitat if regional_habitat else None,
        }
        processed += 1

    print(f"Computed habitat for {processed} species ({skipped} skipped)")

    # Count label distribution
    label_counts = defaultdict(int)
    for result in habitat_results.values():
        for label in result["labels"]:
            label_counts[label] += 1
    print("\nHabitat label distribution:")
    for label, count in sorted(label_counts.items(), key=lambda x: -x[1]):
        print(f"  {label}: {count} species")

    # Count regional habitat coverage
    with_regional = sum(1 for r in habitat_results.values() if r.get("regionalHabitat"))
    print(f"  {with_regional} species with regional habitat data")

    # Save to reference file for process_ebd.py to load during species.json assembly
    REFERENCE_DIR.mkdir(exist_ok=True)
    habitat_ref_path = REFERENCE_DIR / "species_habitat.json"
    with open(habitat_ref_path, "w") as f:
        json.dump(habitat_results, f, separators=(",", ":"))
    print(f"\nSaved habitat reference: {habitat_ref_path} ({len(habitat_results)} species)")

    # Merge into species.json
    merged = 0
    for sp in species_list:
        code = sp["speciesCode"]
        result = habitat_results.get(code)
        if result:
            if result["labels"]:
                sp["habitatLabels"] = result["labels"]
            if result["elevation"]:
                sp["preferredElevation"] = result["elevation"]
            if result.get("regionalHabitat"):
                sp["regionalHabitat"] = result["regionalHabitat"]
            merged += 1

    # Write back
    output = wrapper if wrapper else species_list
    if wrapper:
        wrapper["species"] = species_list

    with open(SPECIES_JSON, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_kb = SPECIES_JSON.stat().st_size / 1024
    print(f"\nMerged habitat data into species.json ({merged} species, {size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
