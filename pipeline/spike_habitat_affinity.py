#!/usr/bin/env python3
"""
Feasibility spike: species-habitat affinity smoothing.

Tests whether per-species habitat profiles improve gap-filling compared to
the current cell-to-cell covariate similarity approach.

Approach:
1. Pick a test species (Wood Thrush - forest specialist)
2. Compute its habitat profile: weighted average of covariates across detection cells
3. Compare current smoothing (cell-to-cell similarity) vs habitat-informed
   smoothing (cell-to-species-profile similarity)
4. Evaluate: does it fill forested gaps? Does it stop bleeding into urban cells?

Usage:
  python pipeline/spike_habitat_affinity.py                    # Run for Wood Thrush
  python pipeline/spike_habitat_affinity.py --species norcar   # Run for Northern Cardinal
  python pipeline/spike_habitat_affinity.py --all              # Top 20 species comparison
"""

import json
import math
import argparse
from pathlib import Path
from collections import defaultdict

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
ARCHIVE_DIR = PROJECT_DIR / "data" / "archive"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
TAXONOMY_FILE = SCRIPT_DIR / "reference" / "ebird_taxonomy.json"

RES = 4  # Test at res 4 where ensemble runs


def load_json(path):
    with open(path) as f:
        return json.load(f)


def load_covariates():
    """Load cell covariates for res 4."""
    path = ARCHIVE_DIR / f"cell_covariates_r{RES}.json"
    if not path.exists():
        print(f"  ERROR: No covariates found at {path}")
        print(f"  Run: python pipeline/extract_covariates.py")
        return {}
    return load_json(path)


def load_detections():
    """Load archived detections for res 4."""
    path = ARCHIVE_DIR / f"detections_r{RES}.json"
    if not path.exists():
        print(f"  ERROR: No detections found at {path}")
        return {}
    return load_json(path)


def load_checklists():
    """Load archived checklists for res 4."""
    path = ARCHIVE_DIR / f"checklists_r{RES}.json"
    if not path.exists():
        print(f"  ERROR: No checklists found at {path}")
        return {}
    return load_json(path)


def load_species_meta():
    """Load species_meta.json to map species codes to avibase taxon IDs.
    Detection keys in the archive use avibase IDs like 'avibase-8E1D9327'."""
    meta_path = ARCHIVE_DIR / "species_meta.json"
    meta = load_json(meta_path)
    names = meta.get("names", {})  # {avibase_id: common_name}

    # Also load species.json for species codes
    sp_path = OUTPUT_DIR / "species.json"
    sp_data = load_json(sp_path)
    if isinstance(sp_data, dict) and "species" in sp_data:
        sp_data = sp_data["species"]

    # Build name→avibase mapping
    name_to_avibase = {v: k for k, v in names.items()}

    # Build code→avibase mapping via common name
    code_to_id = {}
    id_to_code = {}
    id_to_name = dict(names)  # avibase_id → common name
    for sp in sp_data:
        avibase = name_to_avibase.get(sp["comName"])
        if avibase:
            code_to_id[sp["speciesCode"]] = avibase
            id_to_code[avibase] = sp["speciesCode"]

    return code_to_id, id_to_code, id_to_name


def covariate_keys(cov):
    """Get the right land cover keys based on format."""
    if "needleleaf" in cov:
        return ["needleleaf", "evergreen_broadleaf", "deciduous_broadleaf", "mixed_forest",
                "shrub", "herb", "cultivated", "urban", "water", "flooded"]
    return ["trees", "shrub", "herb", "cultivated", "urban", "water", "flooded"]


def covariate_similarity(cov_a, cov_b):
    """Gaussian similarity between two covariate vectors (from process_ebd.py)."""
    if not cov_a or not cov_b:
        return 0.5
    keys = covariate_keys(cov_a)
    diff_sq = sum((cov_a.get(k, 0) - cov_b.get(k, 0)) ** 2 for k in keys)
    elev_diff = (cov_a.get("elev_mean", 0) - cov_b.get("elev_mean", 0)) / 1000.0
    diff_sq += elev_diff ** 2
    return math.exp(-diff_sq * 4.0)


def compute_species_habitat_profile(taxon_key, detections, covariates):
    """Compute weighted-average habitat profile for a species.

    Weights each cell by total detection count across all weeks.
    Returns a covariate dict representing the species' habitat preference.
    """
    if taxon_key not in detections:
        return None

    cell_dets = detections[taxon_key]  # {cell_id: {week: count}}
    profile = defaultdict(float)
    total_weight = 0

    for cell_id, week_counts in cell_dets.items():
        cov = covariates.get(cell_id)
        if not cov:
            continue
        weight = sum(week_counts.values())  # Total detections in this cell
        total_weight += weight

        keys = covariate_keys(cov)
        for k in keys:
            profile[k] += cov.get(k, 0) * weight
        profile["elev_mean"] += cov.get("elev_mean", 0) * weight
        profile["elev_std"] += cov.get("elev_std", 0) * weight

    if total_weight == 0:
        return None

    # Normalize
    for k in profile:
        profile[k] /= total_weight

    return dict(profile)


def analyze_species(species_code, taxon_id, species_name, detections, checklists,
                    covariates, verbose=False):
    """Compare cell-to-cell vs species-habitat-affinity similarity for one species."""

    taxon_key = taxon_id  # Already a string (avibase ID)
    if taxon_key not in detections:
        print(f"  No detections found for {species_code} ({taxon_id})")
        return None

    # Step 1: Compute species habitat profile
    profile = compute_species_habitat_profile(taxon_key, detections, covariates)
    if not profile:
        print(f"  Could not compute habitat profile for {species_code}")
        return None

    # Step 2: Get detection cells and non-detection cells
    det_cells = set(detections[taxon_key].keys())
    all_cells_with_data = set(checklists.keys())
    non_det_cells = all_cells_with_data - det_cells

    # Step 3: For each non-detection cell, compute both similarity scores
    #   (a) cell-to-nearest-detection-cell (current approach)
    #   (b) cell-to-species-profile (proposed approach)
    results = {
        "species_code": species_code,
        "species_name": species_name,
        "detection_cells": len(det_cells),
        "non_detection_cells": len(non_det_cells),
        "profile": profile,
    }

    # Sample non-detection cells for speed (full set can be huge)
    import random
    random.seed(42)
    sample_cells = list(non_det_cells)
    if len(sample_cells) > 2000:
        sample_cells = random.sample(sample_cells, 2000)

    # Pre-compute detection cell covariates for nearest-cell similarity
    det_cell_covs = {c: covariates.get(c) for c in det_cells if covariates.get(c)}

    cell_to_cell_sims = []
    cell_to_profile_sims = []
    agreements = 0
    disagreements_profile_higher = 0
    disagreements_cell_higher = 0
    interesting_cases = []

    for cell_id in sample_cells:
        cell_cov = covariates.get(cell_id)
        if not cell_cov:
            continue

        # (a) Cell-to-nearest-detection-cell similarity (current)
        if det_cell_covs:
            max_cell_sim = max(
                covariate_similarity(cell_cov, dc)
                for dc in det_cell_covs.values()
            )
        else:
            max_cell_sim = 0.5

        # (b) Cell-to-species-profile similarity (proposed)
        profile_sim = covariate_similarity(cell_cov, profile)

        cell_to_cell_sims.append(max_cell_sim)
        cell_to_profile_sims.append(profile_sim)

        # Track agreement/disagreement
        threshold = 0.3
        both_high = max_cell_sim > threshold and profile_sim > threshold
        both_low = max_cell_sim <= threshold and profile_sim <= threshold
        if both_high or both_low:
            agreements += 1
        elif profile_sim > max_cell_sim:
            disagreements_profile_higher += 1
            if verbose and len(interesting_cases) < 5:
                interesting_cases.append({
                    "cell": cell_id,
                    "cell_sim": round(max_cell_sim, 3),
                    "profile_sim": round(profile_sim, 3),
                    "cell_cov": {k: round(v, 2) for k, v in cell_cov.items()
                                 if k in covariate_keys(cell_cov) and v > 0.05},
                    "reason": "Profile finds habitat match that nearest-cell misses"
                })
        else:
            disagreements_cell_higher += 1

    total = agreements + disagreements_profile_higher + disagreements_cell_higher
    if total == 0:
        return None

    results["sample_size"] = total
    results["agreement_rate"] = round(agreements / total, 3)
    results["profile_better_rate"] = round(disagreements_profile_higher / total, 3)
    results["cell_better_rate"] = round(disagreements_cell_higher / total, 3)
    results["avg_cell_sim"] = round(sum(cell_to_cell_sims) / len(cell_to_cell_sims), 4)
    results["avg_profile_sim"] = round(sum(cell_to_profile_sims) / len(cell_to_profile_sims), 4)
    results["interesting_cases"] = interesting_cases

    return results


def print_profile(profile):
    """Pretty-print a species habitat profile."""
    sorted_items = sorted(
        [(k, v) for k, v in profile.items() if k not in ("elev_mean", "elev_std") and v > 0.01],
        key=lambda x: -x[1]
    )
    parts = [f"{k}={v:.1%}" for k, v in sorted_items]
    elev = profile.get("elev_mean", 0)
    if elev > 0:
        parts.append(f"elev={elev:.0f}m")
    return ", ".join(parts)


def main():
    parser = argparse.ArgumentParser(description="Species-habitat affinity spike")
    parser.add_argument("--species", default="woothr",
                        help="Species code to test (default: woothr = Wood Thrush)")
    parser.add_argument("--all", action="store_true",
                        help="Run comparison for top 20 species by detection count")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Show interesting disagreement cases")
    args = parser.parse_args()

    print("=" * 70)
    print("  Species-Habitat Affinity Feasibility Spike")
    print("=" * 70)

    # Load data
    print("\n  Loading data...")
    covariates = load_covariates()
    if not covariates:
        return
    print(f"    Covariates: {len(covariates)} cells")

    detections = load_detections()
    if not detections:
        return
    print(f"    Detections: {len(detections)} species")

    checklists = load_checklists()
    if not checklists:
        return
    print(f"    Checklists: {len(checklists)} cells")

    code_to_id, id_to_code, id_to_name = load_species_meta()
    print(f"    Species: {len(code_to_id)} in species.json")

    if args.all:
        # Find top 20 species by detection cell count
        species_sizes = []
        for taxon_key, cell_dets in detections.items():
            code = id_to_code.get(taxon_key, taxon_key)
            name = id_to_name.get(taxon_key, code)
            total_dets = sum(sum(w.values()) for w in cell_dets.values())
            species_sizes.append((code, taxon_key, name, total_dets, len(cell_dets)))
        species_sizes.sort(key=lambda x: -x[4])  # Sort by cell count

        # Pick a diverse set: top 5 by cells, plus some specialists
        # Include known habitat specialists
        specialist_codes = {"woothr", "norcar", "baleag", "mallar3", "pilwoo",
                            "rebwoo", "amewoo", "grhowl", "barswa", "osprey"}
        test_species = []
        seen_codes = set()
        for code, tid, name, dets, cells in species_sizes[:10]:
            if code not in seen_codes:
                test_species.append((code, tid, name))
                seen_codes.add(code)
        for code, tid, name, dets, cells in species_sizes:
            if code in specialist_codes and code not in seen_codes:
                test_species.append((code, tid, name))
                seen_codes.add(code)
            if len(test_species) >= 20:
                break

        print(f"\n  Testing {len(test_species)} species...")
        print(f"  {'Species':<30} {'Det Cells':>10} {'Agree':>8} {'Profile+':>10} {'Cell+':>8}")
        print(f"  {'-'*30} {'-'*10} {'-'*8} {'-'*10} {'-'*8}")

        all_results = []
        for code, tid, name in test_species:
            result = analyze_species(code, tid, name, detections, checklists, covariates)
            if result:
                all_results.append(result)
                label = f"{name} ({code})"
                if len(label) > 30:
                    label = label[:27] + "..."
                print(f"  {label:<30} {result['detection_cells']:>10} "
                      f"{result['agreement_rate']:>7.0%} "
                      f"{result['profile_better_rate']:>9.0%} "
                      f"{result['cell_better_rate']:>7.0%}")

        # Summary
        if all_results:
            avg_agree = sum(r["agreement_rate"] for r in all_results) / len(all_results)
            avg_profile = sum(r["profile_better_rate"] for r in all_results) / len(all_results)
            avg_cell = sum(r["cell_better_rate"] for r in all_results) / len(all_results)
            print(f"\n  {'AVERAGE':<30} {'':>10} {avg_agree:>7.0%} {avg_profile:>9.0%} {avg_cell:>7.0%}")
            print(f"\n  Interpretation:")
            print(f"    Agree: Both methods give same answer (above/below threshold)")
            print(f"    Profile+: Species profile finds habitat match that nearest-cell misses")
            print(f"    Cell+: Nearest-cell finds proximity match that profile misses")
            if avg_profile > 0.05:
                print(f"\n  CONCLUSION: Profile-based similarity finds {avg_profile:.0%} more habitat")
                print(f"  matches on average. Worth integrating into the ensemble.")
            else:
                print(f"\n  CONCLUSION: Profile-based similarity adds minimal value ({avg_profile:.0%}).")
                print(f"  Current cell-to-cell approach is sufficient.")
    else:
        # Single species
        code = args.species
        if code not in code_to_id:
            print(f"\n  ERROR: Species code '{code}' not found in species.json")
            print(f"  Try: woothr (Wood Thrush), norcar (Northern Cardinal), baleag (Bald Eagle)")
            return

        tid = code_to_id[code]
        name = id_to_name.get(tid, code)
        print(f"\n  Test species: {name} ({code})")

        result = analyze_species(code, tid, name, detections, checklists, covariates,
                                 verbose=args.verbose)
        if not result:
            return

        print(f"\n  Habitat profile: {print_profile(result['profile'])}")
        print(f"\n  Results ({result['sample_size']} non-detection cells sampled):")
        print(f"    Detection cells: {result['detection_cells']}")
        print(f"    Agreement rate:  {result['agreement_rate']:.1%} (both methods agree)")
        print(f"    Profile better:  {result['profile_better_rate']:.1%} (profile finds matches cell-to-cell misses)")
        print(f"    Cell better:     {result['cell_better_rate']:.1%} (cell-to-cell finds matches profile misses)")
        print(f"    Avg cell-to-cell sim: {result['avg_cell_sim']:.4f}")
        print(f"    Avg profile sim:      {result['avg_profile_sim']:.4f}")

        if result["interesting_cases"]:
            print(f"\n  Interesting cases (profile finds habitat match that nearest-cell misses):")
            for case in result["interesting_cases"]:
                print(f"    Cell {case['cell']}: cell_sim={case['cell_sim']}, "
                      f"profile_sim={case['profile_sim']}")
                cov_str = ", ".join(f"{k}={v}" for k, v in case["cell_cov"].items())
                print(f"      Habitat: {cov_str}")

        if result["profile_better_rate"] > 0.05:
            print(f"\n  CONCLUSION: Species-profile similarity adds value for {name}.")
            print(f"  {result['profile_better_rate']:.0%} of cells get better habitat matching.")
        else:
            print(f"\n  CONCLUSION: Minimal improvement for {name}.")
            print(f"  Cell-to-cell similarity already captures habitat well for this species.")


if __name__ == "__main__":
    main()
