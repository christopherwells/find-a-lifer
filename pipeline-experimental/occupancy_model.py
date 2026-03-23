#!/usr/bin/env python3
"""
Single-Season Occupancy Model for Find-A-Lifer

Separates detection probability (p) from occupancy probability (psi)
using maximum likelihood estimation. Based on MacKenzie et al. (2002).

Model:
    P(detected at site i, visit j | present) = p(covariates_ij)
    P(present at site i) = psi(covariates_i)
    P(detection history h_i) = psi * prod(p^d * (1-p)^(1-d)) + (1-psi) * I(all zeros)

Where:
    d_ij = 1 if species detected on visit j at site i, 0 otherwise
    covariates_ij = [duration, month, observer_experience]
    covariates_i = [habitat, elevation, latitude]

Usage:
    from occupancy_model import fit_occupancy, borrow_detection_probs
    results = fit_occupancy(detection_histories, visit_covariates, site_covariates)
"""

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit  # logistic function

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "pipeline"))


# ── Logistic regression helpers ───────────────────────────────────────

def logistic(x):
    """Numerically stable logistic function."""
    return expit(x)


def log_likelihood_occupancy(params, detection_histories, visit_covs, site_covs):
    """Negative log-likelihood for single-season occupancy model.

    Args:
        params: [beta_psi_0, beta_psi_1, ..., beta_p_0, beta_p_1, ...]
        detection_histories: list of lists, each inner list is [0,1,0,1,...] per site
        visit_covs: list of lists of covariate vectors per visit per site
        site_covs: list of covariate vectors per site

    Returns:
        Negative log-likelihood (for minimization)
    """
    n_site_covs = site_covs.shape[1] if len(site_covs.shape) > 1 else 1
    n_visit_covs = visit_covs[0].shape[1] if len(visit_covs[0].shape) > 1 else 1

    # Split parameters
    beta_psi = params[:n_site_covs + 1]  # +1 for intercept
    beta_p = params[n_site_covs + 1:]    # +1 for intercept

    nll = 0.0

    for i in range(len(detection_histories)):
        hist = detection_histories[i]
        if len(hist) == 0:
            continue

        # Occupancy probability for site i
        site_x = np.concatenate([[1.0], site_covs[i]])  # prepend intercept
        psi = logistic(np.dot(beta_psi, site_x))

        # Detection probability for each visit
        log_p_hist_given_present = 0.0
        all_zeros = True

        for j, d in enumerate(hist):
            if j < len(visit_covs[i]):
                visit_x = np.concatenate([[1.0], visit_covs[i][j]])
            else:
                visit_x = np.array([1.0])

            p = logistic(np.dot(beta_p, visit_x))

            # Clamp to avoid log(0)
            p = np.clip(p, 1e-10, 1 - 1e-10)

            if d == 1:
                log_p_hist_given_present += np.log(p)
                all_zeros = False
            else:
                log_p_hist_given_present += np.log(1 - p)

        # Log-likelihood contribution
        if all_zeros:
            # Could be absent OR present but undetected
            p_hist_given_present = np.exp(log_p_hist_given_present)
            likelihood = psi * p_hist_given_present + (1 - psi)
        else:
            # Must be present (at least one detection)
            likelihood = psi * np.exp(log_p_hist_given_present)

        likelihood = max(likelihood, 1e-300)
        nll -= np.log(likelihood)

    return nll


# ── Model fitting ─────────────────────────────────────────────────────

def fit_occupancy(detection_histories, visit_covariates, site_covariates,
                  species_name="unknown"):
    """Fit a single-season occupancy model for one species.

    Args:
        detection_histories: list of N lists, each [0,1,0,...] for visits at site i
        visit_covariates: list of N arrays, each (n_visits, n_covs) for site i
        site_covariates: (N, n_site_covs) array

    Returns:
        dict with keys:
            psi_mean: mean occupancy probability across sites
            p_mean: mean detection probability
            psi_per_site: array of per-site occupancy estimates
            p_per_visit: mean detection prob per visit covariate level
            beta_psi: occupancy model coefficients
            beta_p: detection model coefficients
            converged: bool
            n_sites: int
            n_detections: int
            naive_occupancy: fraction of sites with at least one detection
    """
    N = len(detection_histories)
    if N < 5:
        return None  # Too few sites

    site_covs = np.array(site_covariates, dtype=float)
    if len(site_covs.shape) == 1:
        site_covs = site_covs.reshape(-1, 1)

    n_site_covs = site_covs.shape[1]

    # Standardize covariates for numerical stability
    site_means = np.mean(site_covs, axis=0)
    site_stds = np.std(site_covs, axis=0)
    site_stds[site_stds == 0] = 1.0
    site_covs_std = (site_covs - site_means) / site_stds

    # Determine visit covariate dimensions
    n_visit_covs = 0
    for vc in visit_covariates:
        if len(vc) > 0:
            vc_arr = np.array(vc)
            if len(vc_arr.shape) > 1:
                n_visit_covs = max(n_visit_covs, vc_arr.shape[1])
            else:
                n_visit_covs = max(n_visit_covs, 1)

    # Standardize visit covariates
    all_visit_covs = []
    for vc in visit_covariates:
        if len(vc) > 0:
            arr = np.array(vc, dtype=float)
            if len(arr.shape) == 1:
                arr = arr.reshape(-1, 1)
            all_visit_covs.append(arr)

    if all_visit_covs:
        stacked = np.vstack(all_visit_covs)
        visit_means = np.mean(stacked, axis=0)
        visit_stds = np.std(stacked, axis=0)
        visit_stds[visit_stds == 0] = 1.0

        visit_covs_std = []
        for vc in visit_covariates:
            if len(vc) > 0:
                arr = np.array(vc, dtype=float)
                if len(arr.shape) == 1:
                    arr = arr.reshape(-1, 1)
                visit_covs_std.append((arr - visit_means) / visit_stds)
            else:
                visit_covs_std.append(np.zeros((0, n_visit_covs)))
    else:
        visit_covs_std = [np.zeros((0, max(1, n_visit_covs))) for _ in range(N)]

    # Initial parameters (all zeros = 0.5 probability on logit scale)
    n_params = (n_site_covs + 1) + (n_visit_covs + 1)
    x0 = np.zeros(n_params)

    # Naive occupancy as starting point for psi intercept
    n_detected = sum(1 for h in detection_histories if any(d == 1 for d in h))
    naive_occ = n_detected / N if N > 0 else 0.5
    if naive_occ > 0 and naive_occ < 1:
        x0[0] = np.log(naive_occ / (1 - naive_occ))  # logit of naive occupancy

    # Fit
    try:
        result = minimize(
            log_likelihood_occupancy,
            x0,
            args=(detection_histories, visit_covs_std, site_covs_std),
            method='L-BFGS-B',
            options={'maxiter': 500, 'ftol': 1e-8},
        )
        converged = result.success
        params = result.x
    except Exception as e:
        print(f"  Optimization failed for {species_name}: {e}")
        return None

    # Extract results
    beta_psi = params[:n_site_covs + 1]
    beta_p = params[n_site_covs + 1:]

    # Compute per-site occupancy
    psi_per_site = np.array([
        logistic(np.dot(beta_psi, np.concatenate([[1.0], site_covs_std[i]])))
        for i in range(N)
    ])

    # Compute mean detection probability
    all_p = []
    for i in range(N):
        for j in range(len(visit_covs_std[i])):
            visit_x = np.concatenate([[1.0], visit_covs_std[i][j]])
            all_p.append(logistic(np.dot(beta_p, visit_x)))

    p_mean = np.mean(all_p) if all_p else 0.5
    total_detections = sum(sum(h) for h in detection_histories)

    return {
        "species": species_name,
        "psi_mean": float(np.mean(psi_per_site)),
        "p_mean": float(p_mean),
        "psi_per_site": psi_per_site.tolist(),
        "beta_psi": beta_psi.tolist(),
        "beta_p": beta_p.tolist(),
        "converged": converged,
        "n_sites": N,
        "n_detections": total_detections,
        "naive_occupancy": naive_occ,
        "occupancy_vs_naive": float(np.mean(psi_per_site)) - naive_occ,
    }


# ── Detection probability borrowing ──────────────────────────────────

def borrow_detection_probs(local_results, rangewide_results):
    """For species with insufficient local data, use range-wide detection estimates.

    Args:
        local_results: dict of {species_code: occupancy_result} from local region
        rangewide_results: dict of {species_code: occupancy_result} from all regions

    Returns:
        dict of {species_code: {p_local, p_rangewide, p_used, source}}
    """
    borrowed = {}

    for species, local in local_results.items():
        if local is not None and local["n_sites"] >= 20 and local["converged"]:
            # Enough local data — use local detection probability
            borrowed[species] = {
                "p_local": local["p_mean"],
                "p_rangewide": rangewide_results.get(species, {}).get("p_mean"),
                "p_used": local["p_mean"],
                "source": "local",
            }
        elif species in rangewide_results and rangewide_results[species] is not None:
            # Borrow from range-wide estimate
            rw = rangewide_results[species]
            borrowed[species] = {
                "p_local": local["p_mean"] if local else None,
                "p_rangewide": rw["p_mean"],
                "p_used": rw["p_mean"],
                "source": "rangewide",
            }
        elif local is not None:
            # Use local despite low sample size (better than nothing)
            borrowed[species] = {
                "p_local": local["p_mean"],
                "p_rangewide": None,
                "p_used": local["p_mean"],
                "source": "local_low_n",
            }

    return borrowed


# ── Build detection histories from archive data ───────────────────────

def build_detection_histories(detections, checklists, species_code, cells, weeks=None):
    """Build detection history matrix from archive data.

    Args:
        detections: {cell_id: {week: {species_code: count}}} or similar
        checklists: {cell_id: {week: count}}
        species_code: species to build history for
        cells: list of cell_ids to include
        weeks: list of weeks to include (default: all 52)

    Returns:
        detection_histories: list of [0,1,0,...] per cell
        visit_covariates: list of covariate arrays per cell
        site_covariates: array of site-level covariates
    """
    if weeks is None:
        weeks = list(range(1, 53))

    histories = []
    visit_covs = []
    site_covs = []

    for cell_id in cells:
        cell_cl = checklists.get(str(cell_id), checklists.get(cell_id, {}))
        cell_det = detections.get(str(cell_id), detections.get(cell_id, {}))

        history = []
        v_covs = []

        for week in weeks:
            w_key = str(week)
            n_cl = cell_cl.get(w_key, cell_cl.get(week, 0))
            if n_cl == 0:
                continue  # No visits this week

            # Was species detected?
            sp_det = 0
            if isinstance(cell_det, dict):
                week_det = cell_det.get(w_key, cell_det.get(week, {}))
                if isinstance(week_det, dict):
                    sp_det = 1 if species_code in week_det else 0
                elif isinstance(week_det, (int, float)):
                    sp_det = 1 if week_det > 0 else 0

            history.append(sp_det)
            # Visit covariate: just week/season for now
            # (we don't have per-checklist duration in the archive)
            v_covs.append([week / 52.0])  # Normalized week as seasonal covariate

        if len(history) >= 2:  # Need at least 2 visits for occupancy model
            histories.append(history)
            visit_covs.append(np.array(v_covs))
            site_covs.append([len(history) / 52.0])  # Sampling intensity as site covariate

    return histories, visit_covs, np.array(site_covs) if site_covs else np.zeros((0, 1))


# ── Main: run occupancy analysis on a region ──────────────────────────

def run_occupancy_analysis(region="US-ME", max_species=50):
    """Run occupancy models for top species in a region.

    Args:
        region: region code
        max_species: max species to model (for speed)

    Returns:
        dict of {species_code: occupancy_result}
    """
    from common import ARCHIVE_DIR, load_json

    print(f"\nOccupancy Model Analysis — {region}")
    print("=" * 60)

    # Load archive data
    det_path = ARCHIVE_DIR / "detections_r4.json"
    cl_path = ARCHIVE_DIR / "checklists_r4.json"
    states_path = ARCHIVE_DIR / "cell_states_r4.json"
    meta_path = ARCHIVE_DIR / "species_meta.json"

    if not all(p.exists() for p in [det_path, cl_path, states_path, meta_path]):
        print("Missing archive files. Run the production pipeline first.")
        return {}

    print("Loading archive data...")
    checklists = load_json(cl_path)
    cell_states = load_json(states_path)
    species_meta = load_json(meta_path)

    # Find cells in this region
    region_cells = [c for c, s in cell_states.items() if s == region]
    print(f"Region {region}: {len(region_cells)} cells")

    if not region_cells:
        print(f"No cells found for region {region}")
        return {}

    # Load detections (this is the big file)
    print("Loading detections (this may take a moment)...")
    detections_raw = load_json(det_path)

    # Restructure detections: {cell_id: {week: {species_code: count}}}
    # Archive format: {taxon_id: {cell_id: {week: count}}}
    cell_detections = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    species_id_to_code = {}

    for sp in species_meta:
        if isinstance(sp, dict):
            species_id_to_code[str(sp.get("species_id", ""))] = sp.get("speciesCode", "")

    for taxon_id, cells_data in detections_raw.items():
        sp_code = species_id_to_code.get(taxon_id, taxon_id)
        for cell_id, weeks_data in cells_data.items():
            if cell_id in region_cells:
                for week, count in weeks_data.items():
                    if count > 0:
                        cell_detections[cell_id][week][sp_code] = count

    # Find species with enough data in this region
    species_counts = defaultdict(int)
    for cell_id in region_cells:
        for week, species_dict in cell_detections.get(cell_id, {}).items():
            for sp_code in species_dict:
                species_counts[sp_code] += 1

    # Sort by detection count, take top N
    sorted_species = sorted(species_counts.items(), key=lambda x: -x[1])
    target_species = [sp for sp, count in sorted_species[:max_species] if count >= 10]
    print(f"Modeling {len(target_species)} species (of {len(species_counts)} detected)")

    # Run occupancy models
    results = {}

    for i, sp_code in enumerate(target_species):
        print(f"  [{i+1}/{len(target_species)}] {sp_code}...", end=" ")

        histories, visit_covs, site_covs = build_detection_histories(
            cell_detections, checklists, sp_code, region_cells
        )

        if len(histories) < 5:
            print(f"skip (only {len(histories)} sites)")
            continue

        result = fit_occupancy(histories, visit_covs, site_covs, species_name=sp_code)

        if result:
            results[sp_code] = result
            print(f"psi={result['psi_mean']:.3f} p={result['p_mean']:.3f} "
                  f"naive={result['naive_occupancy']:.3f} "
                  f"diff={result['occupancy_vs_naive']:+.3f}")
        else:
            print("failed")

    # Summary
    print(f"\n{'=' * 60}")
    print(f"Results: {len(results)} species modeled successfully")

    if results:
        psi_values = [r["psi_mean"] for r in results.values()]
        p_values = [r["p_mean"] for r in results.values()]
        diffs = [r["occupancy_vs_naive"] for r in results.values()]

        print(f"Occupancy (psi): mean={np.mean(psi_values):.3f}, "
              f"range=[{np.min(psi_values):.3f}, {np.max(psi_values):.3f}]")
        print(f"Detection (p):   mean={np.mean(p_values):.3f}, "
              f"range=[{np.min(p_values):.3f}, {np.max(p_values):.3f}]")
        print(f"Occupancy vs naive freq: mean diff={np.mean(diffs):+.3f}")

        # Species where occupancy >> naive (most underestimated by raw frequency)
        print(f"\nMost underestimated species (occupancy >> naive frequency):")
        sorted_by_diff = sorted(results.items(), key=lambda x: -x[1]["occupancy_vs_naive"])
        for sp, r in sorted_by_diff[:10]:
            print(f"  {sp:>12}: psi={r['psi_mean']:.3f} vs naive={r['naive_occupancy']:.3f} "
                  f"(+{r['occupancy_vs_naive']:.3f}) p={r['p_mean']:.3f}")

        print(f"\nHardest to detect (lowest p):")
        sorted_by_p = sorted(results.items(), key=lambda x: x[1]["p_mean"])
        for sp, r in sorted_by_p[:10]:
            print(f"  {sp:>12}: p={r['p_mean']:.3f} psi={r['psi_mean']:.3f}")

    # Save results
    output_path = SCRIPT_DIR / "results" / "occupancy_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        # Convert numpy types for JSON
        json_results = {}
        for sp, r in results.items():
            jr = {k: v for k, v in r.items() if k != "psi_per_site"}
            jr["psi_per_site_summary"] = {
                "mean": float(np.mean(r["psi_per_site"])),
                "min": float(np.min(r["psi_per_site"])),
                "max": float(np.max(r["psi_per_site"])),
            }
            json_results[sp] = jr
        json.dump(json_results, f, indent=2)
    print(f"\nResults saved to: {output_path}")

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="US-ME")
    parser.add_argument("--max-species", type=int, default=50)
    args = parser.parse_args()
    run_occupancy_analysis(args.region, args.max_species)
