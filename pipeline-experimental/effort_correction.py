#!/usr/bin/env python3
"""
Effort-Corrected Frequency Estimation (Fink et al. 2023 inspired)

Separates the observation process from the ecological process using
two model components:
    1. Observation model (nuisance): effort covariates → detection rate
    2. Ecological model (target): habitat/spatial covariates → true frequency

The ecological component provides effort-corrected frequency estimates
that remove urban sampling bias.

Uses both Random Forest and GLM for comparison.

Based on: Fink, D. et al. 2023. "A Double Machine Learning Trend Model
for Citizen Science Data." Methods in Ecology and Evolution, 14, 2435-2448.

Usage:
    python pipeline-experimental/effort_correction.py --region US-ME
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "pipeline"))


def build_feature_matrix(cell_data, checklists, covariates, cells):
    """Build feature matrix for effort correction model.

    For each cell-week, we compute:
        Effort features: mean_duration_proxy, checklist_count, temporal_coverage
        Ecological features: habitat composition from EarthEnv covariates

    Args:
        cell_data: {cell_id: {week: [(species_code, freq), ...]}}
        checklists: {cell_id: {week: count}}
        covariates: {cell_id: {covariate_dict}}
        cells: list of cell_ids

    Returns:
        X_effort: (n_samples, n_effort_features)
        X_ecology: (n_samples, n_ecology_features)
        y: (n_samples,) — species richness per cell-week
        cell_week_ids: list of (cell_id, week) tuples
    """
    X_effort = []
    X_ecology = []
    y = []
    cell_week_ids = []

    for cell_id in cells:
        cell_covs = covariates.get(str(cell_id), covariates.get(cell_id, {}))
        if not cell_covs:
            continue

        cell_cl = checklists.get(str(cell_id), checklists.get(cell_id, {}))
        cell_sp = cell_data.get(cell_id, cell_data.get(str(cell_id), {}))

        # Compute annual checklist count for this cell
        annual_checklists = sum(cell_cl.get(str(w), cell_cl.get(w, 0)) for w in range(1, 53))
        temporal_coverage = sum(1 for w in range(1, 53)
                               if cell_cl.get(str(w), cell_cl.get(w, 0)) > 0) / 52.0

        for week in range(1, 53):
            w_key = str(week)
            n_cl = cell_cl.get(w_key, cell_cl.get(week, 0))
            if n_cl == 0:
                continue

            # Species richness this cell-week
            week_species = cell_sp.get(w_key, cell_sp.get(week, []))
            if isinstance(week_species, list):
                richness = len(week_species)
            elif isinstance(week_species, dict):
                richness = len(week_species)
            else:
                richness = 0

            # Effort features
            effort = [
                n_cl,                    # checklist count this week
                annual_checklists,       # total annual checklists (observer density proxy)
                temporal_coverage,       # fraction of weeks with data
                week / 52.0,             # seasonality
            ]

            # Ecological features (from EarthEnv covariates)
            ecology = [
                cell_covs.get("evergreen_needleleaf", 0),
                cell_covs.get("evergreen_broadleaf", 0),
                cell_covs.get("deciduous_needleleaf", 0),
                cell_covs.get("deciduous_broadleaf", 0),
                cell_covs.get("mixed_forest", 0),
                cell_covs.get("shrub", 0),
                cell_covs.get("herbaceous", 0),
                cell_covs.get("cultivated", 0),
                cell_covs.get("urban", 0),
                cell_covs.get("water", 0),
                cell_covs.get("ocean", cell_covs.get("ocean_fraction", 0)),
                cell_covs.get("elevation_mean", 0) / 3000.0,  # normalize
            ]

            X_effort.append(effort)
            X_ecology.append(ecology)
            y.append(richness)
            cell_week_ids.append((cell_id, week))

    return (
        np.array(X_effort, dtype=np.float32),
        np.array(X_ecology, dtype=np.float32),
        np.array(y, dtype=np.float32),
        cell_week_ids,
    )


def fit_effort_correction(X_effort, X_ecology, y, method="rf"):
    """Fit effort correction model.

    Two approaches:
        1. Full model: y ~ effort + ecology
        2. Ecology-only model: y ~ ecology
        3. Correction = full_prediction - (full_prediction - ecology_prediction)

    The ecology-only predictions represent effort-corrected estimates.

    Args:
        X_effort: effort feature matrix
        X_ecology: ecological feature matrix
        y: response (species richness)
        method: "rf" for Random Forest, "glm" for GLM

    Returns:
        y_full: full model predictions
        y_ecology: ecology-only predictions (effort-corrected)
        model_info: dict with model details
    """
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.linear_model import Ridge
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import cross_val_score

    X_full = np.hstack([X_effort, X_ecology])

    if method == "rf":
        # Random Forest
        model_full = RandomForestRegressor(
            n_estimators=100, max_depth=10, min_samples_leaf=5,
            n_jobs=-1, random_state=42
        )
        model_ecology = RandomForestRegressor(
            n_estimators=100, max_depth=10, min_samples_leaf=5,
            n_jobs=-1, random_state=42
        )
    else:
        # GLM (Ridge regression)
        scaler_full = StandardScaler()
        scaler_eco = StandardScaler()
        X_full = scaler_full.fit_transform(X_full)
        X_ecology_scaled = scaler_eco.fit_transform(X_ecology)

        model_full = Ridge(alpha=1.0)
        model_ecology = Ridge(alpha=1.0)
        X_ecology = X_ecology_scaled

    # Fit models
    model_full.fit(X_full, y)
    model_ecology.fit(X_ecology, y)

    # Predictions
    y_full = model_full.predict(X_full)
    y_ecology = model_ecology.predict(X_ecology)

    # Cross-validation scores
    if method == "rf":
        cv_full = cross_val_score(model_full, X_full, y, cv=5, scoring='r2')
        cv_eco = cross_val_score(model_ecology, X_ecology, y, cv=5, scoring='r2')
    else:
        cv_full = cross_val_score(model_full, X_full, y, cv=5, scoring='r2')
        cv_eco = cross_val_score(model_ecology, X_ecology, y, cv=5, scoring='r2')

    # Feature importance (RF only)
    feature_importance = None
    if method == "rf":
        effort_names = ["checklists_week", "checklists_annual", "temporal_coverage", "season"]
        ecology_names = ["evergreen_needle", "evergreen_broad", "deciduous_needle",
                        "deciduous_broad", "mixed_forest", "shrub", "herbaceous",
                        "cultivated", "urban", "water", "ocean", "elevation"]
        all_names = effort_names + ecology_names

        importances = model_full.feature_importances_
        feature_importance = sorted(
            zip(all_names, importances),
            key=lambda x: -x[1]
        )

    model_info = {
        "method": method,
        "r2_full": float(np.mean(cv_full)),
        "r2_ecology": float(np.mean(cv_eco)),
        "r2_effort_contribution": float(np.mean(cv_full) - np.mean(cv_eco)),
        "n_samples": len(y),
        "feature_importance": feature_importance,
    }

    return y_full, y_ecology, model_info


def run_effort_correction(region="US-ME"):
    """Run effort correction analysis on a region.

    Args:
        region: region code
    """
    from common import ARCHIVE_DIR, load_json

    print(f"\nEffort-Corrected Frequency Analysis — {region}")
    print("=" * 60)

    # Load data
    print("Loading archive data...")
    checklists = load_json(ARCHIVE_DIR / "checklists_r4.json")
    detections = load_json(ARCHIVE_DIR / "detections_r4.json")
    cell_states = load_json(ARCHIVE_DIR / "cell_states_r4.json")
    covariates = load_json(ARCHIVE_DIR / "cell_covariates_r4.json")

    species_meta = load_json(ARCHIVE_DIR / "species_meta.json")
    id_to_code = {}
    for sp in species_meta:
        if isinstance(sp, dict):
            id_to_code[str(sp.get("species_id", ""))] = sp.get("speciesCode", "")

    # Build cell_data: {cell_id: {week: [(species_code, freq)]}}
    region_cells = [c for c, s in cell_states.items() if s == region]
    print(f"Region {region}: {len(region_cells)} cells")

    cell_data = defaultdict(lambda: defaultdict(list))
    for taxon_id, cells in detections.items():
        sp_code = id_to_code.get(taxon_id, taxon_id)
        for cell_id, weeks in cells.items():
            if cell_id not in set(region_cells):
                continue
            for week, count in weeks.items():
                if count > 0:
                    # Use count/checklists as freq proxy
                    cl_count = checklists.get(cell_id, {}).get(week, 1)
                    freq = min(1.0, count / cl_count)
                    cell_data[cell_id][week].append((sp_code, freq))

    # Build feature matrices
    print("Building feature matrices...")
    X_effort, X_ecology, y, cell_week_ids = build_feature_matrix(
        cell_data, checklists, covariates, region_cells
    )

    print(f"Samples: {len(y)}")
    print(f"Effort features: {X_effort.shape[1]}")
    print(f"Ecology features: {X_ecology.shape[1]}")
    print(f"Mean richness: {np.mean(y):.1f}")

    if len(y) < 50:
        print("Too few samples for meaningful analysis.")
        return

    # Fit models
    results = {}

    for method in ["rf", "glm"]:
        print(f"\n--- {method.upper()} ---")
        y_full, y_ecology, info = fit_effort_correction(X_effort, X_ecology, y, method)

        print(f"R² (full model):     {info['r2_full']:.4f}")
        print(f"R² (ecology only):   {info['r2_ecology']:.4f}")
        print(f"R² from effort:      {info['r2_effort_contribution']:.4f}")
        print(f"  → Effort explains {info['r2_effort_contribution']/max(0.001, info['r2_full'])*100:.1f}% "
              f"of the full model's explanatory power")

        if info["feature_importance"]:
            print(f"\nTop feature importances:")
            for name, imp in info["feature_importance"][:8]:
                bar = "█" * int(imp * 100)
                print(f"  {name:<20} {imp:.3f} {bar}")

        # Compare raw vs corrected
        correction = y_full - y_ecology
        print(f"\nCorrection magnitude:")
        print(f"  Mean: {np.mean(correction):+.2f} species")
        print(f"  Std:  {np.std(correction):.2f}")
        print(f"  Max:  {np.max(np.abs(correction)):.2f}")

        # Cells most affected by correction
        corrections = [(cell_week_ids[i], correction[i]) for i in range(len(correction))]
        corrections.sort(key=lambda x: -abs(x[1]))

        print(f"\nMost effort-biased cell-weeks (largest correction):")
        for (cell_id, week), corr in corrections[:5]:
            cl = checklists.get(str(cell_id), {}).get(str(week), 0)
            print(f"  Cell {str(cell_id)[:8]} wk{week:02d}: "
                  f"raw={y[cell_week_ids.index((cell_id, week))]:.0f} "
                  f"corrected={y_ecology[cell_week_ids.index((cell_id, week))]:.1f} "
                  f"({corr:+.1f}) checklists={cl}")

        results[method] = info

    # Save results
    output_path = SCRIPT_DIR / "results" / "effort_correction_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        # Convert feature importances to serializable format
        for method, info in results.items():
            if info["feature_importance"]:
                info["feature_importance"] = [(n, float(v)) for n, v in info["feature_importance"]]
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {output_path}")

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="US-ME")
    args = parser.parse_args()
    run_effort_correction(args.region)
