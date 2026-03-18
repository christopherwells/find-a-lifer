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
FRONTEND_DATA = PROJECT / "frontend" / "public" / "data"
SPECIES_JSON = FRONTEND_DATA / "species.json"

# Use res 4 (medium detail) for habitat computation
RESOLUTION = 4

# Habitat label thresholds (minimum weighted average to qualify)
# Forest types get specific labels when one type dominates (>60% of total forest)
# Otherwise falls back to generic "Forest"
NON_FOREST_THRESHOLDS = [
    ("Freshwater", "water", 0.20),
    ("Ocean", "ocean", 0.15),
    ("Wetland", "flooded", 0.03),
    ("Grassland", "herb", 0.08),
    ("Agricultural", "cultivated", 0.10),
    ("Urban-tolerant", "urban", 0.005),
    ("Scrubland", "shrub", 0.10),
]

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

    # Build species code -> species index lookup
    code_to_idx = {sp["speciesCode"]: i for i, sp in enumerate(species_list)}

    # Process each species-weeks file
    habitat_results = {}  # speciesCode -> {labels, elevation}
    processed = 0
    skipped = 0

    for sw_file in sorted(species_weeks_dir.glob("*.json")):
        code = sw_file.stem
        if code not in code_to_idx:
            skipped += 1
            continue

        with open(sw_file) as f:
            weeks_data = json.load(f)

        # Aggregate frequency-weighted covariates across all weeks and cells
        weighted_cov = defaultdict(float)
        total_weight = 0.0
        elev_values = []  # (elev_mean, weight) tuples

        for _week, cells in weeks_data.items():
            for cell_id, freq in cells:
                cov = covariates.get(cell_id)
                if not cov:
                    continue
                weight = freq / 255.0  # freq is uint8
                if weight < 0.01:
                    continue  # Skip very low frequencies

                # Support both split forest (new) and combined trees (legacy)
                if "needleleaf" in cov:
                    for key in ALL_LAND_KEYS:
                        weighted_cov[key] += cov.get(key, 0) * weight
                else:
                    # Legacy format with combined 'trees'
                    weighted_cov["trees"] += cov.get("trees", 0) * weight
                    for key in ["shrub", "herb", "cultivated", "urban", "water", "flooded"]:
                        weighted_cov[key] += cov.get(key, 0) * weight
                total_weight += weight

                if cov.get("elev_mean", 0) > 0:
                    elev_values.append((cov["elev_mean"], weight))

        if total_weight == 0:
            skipped += 1
            continue

        # Normalize weighted covariates
        norm_cov = {k: v / total_weight for k, v in weighted_cov.items()}

        # Derive habitat labels
        labels = []

        # Forest: check total, then assign specific type if one dominates
        if "needleleaf" in norm_cov:
            total_forest = sum(norm_cov.get(k, 0) for k in FOREST_KEYS)
        else:
            total_forest = norm_cov.get("trees", 0)

        if total_forest >= FOREST_THRESHOLD:
            # Check if a specific forest type dominates (per-type thresholds)
            assigned = False
            if total_forest > 0:
                # Sort by value desc, check each against its own threshold
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

        # Compute true freshwater: EarthEnv 'water' includes ocean pixels,
        # so freshwater = water - ocean (clamped >= 0)
        raw_water = norm_cov.get("water", 0)
        ocean_val = norm_cov.get("ocean", 0)
        norm_cov["_freshwater"] = max(0, raw_water - ocean_val)

        # Non-forest habitats (use _freshwater instead of raw water)
        for label, key, threshold in NON_FOREST_THRESHOLDS:
            actual_key = "_freshwater" if key == "water" else key
            if norm_cov.get(actual_key, 0) >= threshold:
                labels.append(label)

        # Compute preferred elevation
        preferred_elev = None
        if elev_values:
            total_elev_weight = sum(w for _, w in elev_values)
            if total_elev_weight > 0:
                weighted_mean = sum(e * w for e, w in elev_values) / total_elev_weight
                elevs = [e for e, _ in elev_values]
                preferred_elev = {
                    "mean": round(weighted_mean),
                    "min": round(min(elevs)),
                    "max": round(max(elevs)),
                }

        habitat_results[code] = {
            "labels": labels,
            "elevation": preferred_elev,
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
