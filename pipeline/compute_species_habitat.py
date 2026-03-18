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
# Based on actual cell covariate distributions (avg trees=0.12, water=0.18, etc.)
HABITAT_THRESHOLDS = [
    ("Forest", "trees", 0.15),
    ("Aquatic", "water", 0.15),
    ("Wetland", "flooded", 0.03),
    ("Grassland", "herb", 0.08),
    ("Agricultural", "cultivated", 0.10),
    ("Urban-tolerant", "urban", 0.005),
    ("Scrubland", "shrub", 0.10),
]


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

                for key in ["trees", "shrub", "herb", "cultivated", "urban", "water", "flooded"]:
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
        for label, key, threshold in HABITAT_THRESHOLDS:
            if norm_cov.get(key, 0) >= threshold:
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
