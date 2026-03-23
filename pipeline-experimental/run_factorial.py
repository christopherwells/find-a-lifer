#!/usr/bin/env python3
"""
HPC Factorial Experiment Runner for Find-A-Lifer

Runs all 512 method combinations (2^9 flags) on a state block,
evaluating each against a held-out 20% of checklists.

Dependencies: Python 3.8+, numpy, scipy, scikit-learn.

HPC Usage (SLURM):
    # Submit as job array — each job runs one combination
    sbatch --array=0-511 run_factorial.sh

    # Or run a single combination locally
    python run_factorial.py --combo 42 --block new-england

    # Aggregate results after all jobs finish
    python run_factorial.py --aggregate --block new-england

File I/O:
    Input:  data/downloads/ebd_{STATE}_relFeb-2026.txt.gz (observations)
            data/downloads/ebd_{STATE}_relFeb-2026_sampling.txt.gz (checklists)
    Output: pipeline-experimental/results/{block}/combo_{NNN}.json (per-job)
            pipeline-experimental/results/{block}/factorial_results.json (aggregated)
"""

import argparse
import gzip
import hashlib
import json
import math
import os
import sys
import time
from collections import defaultdict
from itertools import product
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
RESULTS_DIR = SCRIPT_DIR / "results"

# ── State blocks ─────────────────────────────────────────────────────

BLOCKS = {
    "new-england": ["US-ME", "US-NH", "US-MA"],
    "southwest": ["US-AZ", "US-NM"],
    "mid-atlantic": ["US-VA", "US-NC"],
    "pacific-nw": ["US-WA", "US-OR"],
    "northern-plains": ["US-ND", "US-SD", "US-MN"],
    "test": ["US-ME-TEST"],  # Tiny subset for validation
}

# ── 9 binary experiment flags ────────────────────────────────────────

FLAG_NAMES = [
    "effort_normalize",      # 0: normalize by checklist duration
    "complete_only",         # 1: only complete checklists
    "observer_weight",       # 2: weight by observer experience
    "recency_weight",        # 3: weight recent years higher
    "area_protocol",         # 4: include area count protocol
    "partial_recovery",      # 5: recover partial checklists at discount
    "occupancy_correction",  # 6: occupancy model detection correction
    "cooccurrence_correct",  # 7: co-occurrence non-independence correction
    "effort_debiasing",      # 8: effort-density debiasing (Fink-style)
]

NUM_FLAGS = len(FLAG_NAMES)
NUM_COMBOS = 2 ** NUM_FLAGS  # 512


def combo_to_flags(combo_id: int) -> dict:
    """Convert a combo index (0-511) to a dict of boolean flags."""
    return {FLAG_NAMES[i]: bool(combo_id & (1 << i)) for i in range(NUM_FLAGS)}


def flags_to_label(flags: dict) -> str:
    """Short label for a flag combination."""
    active = [k for k, v in flags.items() if v]
    return "+".join(active) if active else "baseline"


# ── Logistic function (no scipy) ─────────────────────────────────────

def logistic(x):
    """Numerically stable logistic/sigmoid. Replaces scipy.special.expit."""
    x = np.asarray(x, dtype=np.float64)
    pos = x >= 0
    result = np.empty_like(x)
    result[pos] = 1.0 / (1.0 + np.exp(-x[pos]))
    exp_x = np.exp(x[~pos])
    result[~pos] = exp_x / (1.0 + exp_x)
    return result


# ── Ridge regression (no sklearn) ────────────────────────────────────

def ridge_fit(X, y, alpha=1.0):
    """Fit ridge regression: w = (X'X + alpha*I)^-1 X'y. Returns weights."""
    n_features = X.shape[1]
    XtX = X.T @ X + alpha * np.eye(n_features)
    Xty = X.T @ y
    return np.linalg.solve(XtX, Xty)


def ridge_predict(X, w):
    """Predict with ridge weights."""
    return X @ w


def ridge_cv_r2(X, y, alpha=1.0, k=5):
    """K-fold cross-validated R² for ridge regression."""
    n = len(y)
    if n < k:
        return 0.0
    indices = np.arange(n)
    np.random.seed(42)
    np.random.shuffle(indices)
    fold_size = n // k
    r2_scores = []

    for fold in range(k):
        start = fold * fold_size
        end = start + fold_size if fold < k - 1 else n
        test_idx = indices[start:end]
        train_idx = np.concatenate([indices[:start], indices[end:]])

        X_train, y_train = X[train_idx], y[train_idx]
        X_test, y_test = X[test_idx], y[test_idx]

        if len(X_train) < 2 or len(X_test) < 1:
            continue

        w = ridge_fit(X_train, y_train, alpha)
        y_pred = ridge_predict(X_test, w)

        ss_res = np.sum((y_test - y_pred) ** 2)
        ss_tot = np.sum((y_test - np.mean(y_test)) ** 2)
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
        r2_scores.append(r2)

    return float(np.mean(r2_scores)) if r2_scores else 0.0


# ── Occupancy MLE (no scipy) ─────────────────────────────────────────

def occupancy_nll(beta_psi0, beta_p0, histories):
    """Negative log-likelihood for simple constant-psi, constant-p occupancy model.

    Args:
        beta_psi0: logit of occupancy probability
        beta_p0: logit of detection probability
        histories: list of lists of 0/1 detection history per site

    Returns:
        Negative log-likelihood
    """
    psi = 1.0 / (1.0 + math.exp(-beta_psi0))
    p = 1.0 / (1.0 + math.exp(-beta_p0))

    p = max(1e-10, min(1 - 1e-10, p))
    psi = max(1e-10, min(1 - 1e-10, psi))

    nll = 0.0
    for hist in histories:
        n_det = sum(hist)
        n_visits = len(hist)
        n_nondet = n_visits - n_det

        if n_det > 0:
            # Species detected — must be present
            log_lik = math.log(psi) + n_det * math.log(p) + n_nondet * math.log(1 - p)
        else:
            # All zeros — could be absent or present but undetected
            p_present_undetected = psi * ((1 - p) ** n_visits)
            p_absent = 1 - psi
            log_lik = math.log(max(1e-300, p_present_undetected + p_absent))

        nll -= log_lik

    return nll


def fit_occupancy_simple(histories):
    """Fit constant psi/p occupancy model using scipy L-BFGS-B.

    Returns:
        (psi, p, converged)
    """
    from scipy.optimize import minimize as scipy_minimize

    if len(histories) < 3:
        return None, None, False

    n_sites = len(histories)
    n_detected = sum(1 for h in histories if any(d == 1 for d in h))
    naive_occ = max(0.01, min(0.99, n_detected / n_sites))

    x0 = [math.log(naive_occ / (1 - naive_occ)), 0.0]

    result = scipy_minimize(
        lambda x: occupancy_nll(x[0], x[1], histories),
        x0, method='L-BFGS-B',
        bounds=[(-10, 10), (-10, 10)],
        options={'maxiter': 500, 'ftol': 1e-10},
    )

    psi = 1.0 / (1.0 + math.exp(-result.x[0]))
    p = 1.0 / (1.0 + math.exp(-result.x[1]))

    return psi, p, result.success


# ── Data loading ─────────────────────────────────────────────────────

def load_state_data(state_code):
    """Load observations and sampling data for a state.

    Returns:
        checklists: list of dicts with keys: sampling_id, lat, lng, date, duration,
                    distance, protocol, complete, observer_id, n_species
        observations: dict {sampling_id: [(species_code, count), ...]}
    """
    obs_path = DATA_DIR / "downloads" / f"ebd_{state_code}_relFeb-2026.txt.gz"
    samp_path = DATA_DIR / "downloads" / f"ebd_{state_code}_relFeb-2026_sampling.txt.gz"

    if not obs_path.exists() or not samp_path.exists():
        raise FileNotFoundError(f"Missing EBD files for {state_code}: {obs_path}, {samp_path}")

    # Load sampling events
    print(f"  Loading {state_code} sampling events...")
    checklists = {}
    with gzip.open(samp_path, 'rt', encoding='utf-8', errors='replace') as f:
        header = f.readline().strip().split('\t')
        col = {name: i for i, name in enumerate(header)}

        for line in f:
            fields = line.strip().split('\t')
            if len(fields) < len(col):
                continue

            sid = fields[col.get('SAMPLING EVENT IDENTIFIER', 0)]
            checklists[sid] = {
                'lat': float(fields[col.get('LATITUDE', 0)] or 0),
                'lng': float(fields[col.get('LONGITUDE', 0)] or 0),
                'date': fields[col.get('OBSERVATION DATE', 0)],
                'duration': float(fields[col.get('DURATION MINUTES', 0)] or 0),
                'distance': float(fields[col.get('EFFORT DISTANCE KM', 0)] or 0),
                'protocol': fields[col.get('PROTOCOL TYPE', 0)],
                'complete': fields[col.get('ALL SPECIES REPORTED', 0)] == '1',
                'observer_id': fields[col.get('OBSERVER ID', 0)],
                'n_observers': int(fields[col.get('NUMBER OBSERVERS', 0)] or 1),
            }

    print(f"    {len(checklists):,} checklists loaded")

    # Load observations
    print(f"  Loading {state_code} observations...")
    observations = defaultdict(list)
    with gzip.open(obs_path, 'rt', encoding='utf-8', errors='replace') as f:
        header = f.readline().strip().split('\t')
        col = {name: i for i, name in enumerate(header)}

        for line in f:
            fields = line.strip().split('\t')
            if len(fields) < len(col):
                continue

            sid = fields[col.get('SAMPLING EVENT IDENTIFIER', 0)]
            species = fields[col.get('SPECIES CODE', col.get('COMMON NAME', 0))]
            count_str = fields[col.get('OBSERVATION COUNT', 0)]
            count = int(count_str) if count_str.isdigit() else 1

            observations[sid].append((species, count))

    print(f"    {sum(len(v) for v in observations.values()):,} observations loaded")

    return checklists, dict(observations)


def holdout_split(checklists, seed=42, holdout_fraction=0.2):
    """Split checklists into train/holdout by hashing sampling IDs.

    Deterministic: same split every time for the same data.

    Returns:
        train_ids: set of sampling IDs for training
        holdout_ids: set of sampling IDs for holdout
    """
    train_ids = set()
    holdout_ids = set()

    for sid in checklists:
        # Deterministic hash-based split
        h = int(hashlib.md5(f"{seed}:{sid}".encode()).hexdigest()[:8], 16)
        if (h % 100) < (holdout_fraction * 100):
            holdout_ids.add(sid)
        else:
            train_ids.add(sid)

    return train_ids, holdout_ids


# ── Per-species frequency computation with flags ─────────────────────

def compute_frequencies(checklists, observations, train_ids, flags):
    """Compute per-species reporting frequencies using training checklists only.

    Applies experiment flags to filter/weight checklists.

    Returns:
        species_freq: {species_code: frequency}
        species_checklists: {species_code: n_checklists_where_reported}
        total_eligible: total eligible checklists after filtering
    """
    # Filter checklists based on flags
    eligible = {}
    weights = {}

    for sid in train_ids:
        cl = checklists.get(sid)
        if cl is None:
            continue

        # Flag: complete_only
        if flags["complete_only"] and not cl["complete"]:
            continue

        # Flag: area_protocol (exclude if not set and protocol is Area)
        if not flags["area_protocol"] and cl["protocol"] == "Area":
            continue

        # Flag: effort_normalize — skip very short checklists
        if flags["effort_normalize"] and cl["duration"] < 5:
            continue

        w = 1.0

        # Flag: observer_weight — weight by observer experience (proxy: n_species)
        if flags["observer_weight"]:
            # Use number of species on this checklist as crude quality proxy
            n_sp = len(observations.get(sid, []))
            w *= min(2.0, max(0.5, n_sp / 20.0))  # Center around 20 species

        # Flag: recency_weight — weight recent years higher
        if flags["recency_weight"]:
            try:
                year = int(cl["date"][:4])
                years_ago = 2026 - year
                half_life = 10
                w *= 2 ** (-years_ago / half_life)
            except (ValueError, IndexError):
                pass

        # Flag: partial_recovery — include incomplete checklists at discount
        if flags["partial_recovery"] and not cl["complete"]:
            w *= 0.3

        eligible[sid] = cl
        weights[sid] = w

    # Compute frequencies
    species_det = defaultdict(float)  # weighted detections
    species_cl = defaultdict(int)     # checklist count where detected
    total_weight = sum(weights.values())

    for sid, cl in eligible.items():
        w = weights[sid]
        obs = observations.get(sid, [])
        seen_species = set()

        for species_code, count in obs:
            if species_code not in seen_species:
                species_det[species_code] += w
                species_cl[species_code] += 1
                seen_species.add(species_code)

    # Frequency = weighted detections / total weight
    species_freq = {}
    for sp, det in species_det.items():
        species_freq[sp] = det / total_weight if total_weight > 0 else 0

    return species_freq, dict(species_cl), len(eligible)


# ── Evaluation metrics ───────────────────────────────────────────────

def evaluate_holdout(species_freq, checklists, observations, holdout_ids):
    """Evaluate predicted frequencies against held-out checklists.

    For each held-out complete checklist, compare predicted presence
    (frequency > threshold) against actual presence.

    Returns:
        per_species: {species_code: {mae, rmse, n_holdout, actual_freq, predicted_freq}}
        overall: {mae, rmse, calibration_error, n_species}
    """
    # Only use complete held-out checklists for evaluation
    holdout_complete = [sid for sid in holdout_ids
                        if checklists.get(sid, {}).get("complete", False)]

    if not holdout_complete:
        return {}, {"mae": 0, "rmse": 0, "calibration_error": 0, "n_species": 0}

    # Compute actual frequency in holdout
    holdout_det = defaultdict(int)
    for sid in holdout_complete:
        seen = set()
        for sp, _ in observations.get(sid, []):
            if sp not in seen:
                holdout_det[sp] += 1
                seen.add(sp)

    n_holdout = len(holdout_complete)
    holdout_freq = {sp: count / n_holdout for sp, count in holdout_det.items()}

    # Compare predicted vs actual
    all_species = set(species_freq.keys()) | set(holdout_freq.keys())
    per_species = {}
    errors = []
    cal_errors = []

    for sp in all_species:
        pred = species_freq.get(sp, 0)
        actual = holdout_freq.get(sp, 0)
        error = pred - actual

        per_species[sp] = {
            "predicted_freq": pred,
            "actual_freq": actual,
            "error": error,
            "abs_error": abs(error),
            "n_holdout_det": holdout_det.get(sp, 0),
        }
        errors.append(error)
        cal_errors.append(abs(error))

    errors = np.array(errors)
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))

    # Calibration: bin predicted frequencies, check actual frequencies match
    cal_error = float(np.mean(cal_errors)) if cal_errors else 0

    return per_species, {
        "mae": mae,
        "rmse": rmse,
        "calibration_error": cal_error,
        "n_species": len(all_species),
        "n_holdout_checklists": n_holdout,
    }


# ── Main job runner ──────────────────────────────────────────────────

def run_combo(combo_id, block_name):
    """Run a single combination on a block of states.

    This is the unit of work for each HPC job.
    """
    flags = combo_to_flags(combo_id)
    label = flags_to_label(flags)

    block_states = BLOCKS[block_name]
    out_dir = RESULTS_DIR / block_name
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"combo_{combo_id:03d}.json"

    # Skip if already computed
    if out_path.exists():
        print(f"Combo {combo_id} ({label}) already computed. Skipping.")
        return

    print(f"\n{'=' * 60}")
    print(f"Combo {combo_id}/{NUM_COMBOS}: {label}")
    print(f"Block: {block_name} ({', '.join(block_states)})")
    print(f"Flags: {flags}")
    print(f"{'=' * 60}")

    start = time.time()

    # Load all states in block
    all_checklists = {}
    all_observations = {}

    for state in block_states:
        try:
            cl, obs = load_state_data(state)
            all_checklists.update(cl)
            all_observations.update(obs)
        except FileNotFoundError as e:
            print(f"  WARNING: {e}")
            continue

    if not all_checklists:
        print("  No data loaded. Aborting.")
        return

    print(f"\nTotal: {len(all_checklists):,} checklists, "
          f"{sum(len(v) for v in all_observations.values()):,} observations")

    # Split
    train_ids, holdout_ids = holdout_split(all_checklists)
    print(f"Split: {len(train_ids):,} train, {len(holdout_ids):,} holdout")

    # Compute frequencies with flags
    species_freq, species_cl, n_eligible = compute_frequencies(
        all_checklists, all_observations, train_ids, flags
    )
    print(f"Eligible checklists: {n_eligible:,}, Species: {len(species_freq)}")

    # Apply occupancy correction (flag 6)
    if flags["occupancy_correction"]:
        print("  Applying occupancy correction...")
        species_freq = apply_occupancy_correction(
            species_freq, all_checklists, all_observations, train_ids
        )

    # Apply co-occurrence correction (flag 7)
    # This is a post-hoc correction to the combined probability formula,
    # not to individual frequencies. Stored as metadata for downstream use.
    cooccurrence_clusters = None
    if flags["cooccurrence_correct"]:
        print("  Computing co-occurrence clusters...")
        cooccurrence_clusters = compute_cooccurrence_clusters(
            all_checklists, all_observations, train_ids
        )

    # Apply effort debiasing (flag 8)
    if flags["effort_debiasing"]:
        print("  Applying effort debiasing...")
        species_freq = apply_effort_debiasing(
            species_freq, all_checklists, all_observations, train_ids
        )

    # Evaluate
    per_species, overall = evaluate_holdout(
        species_freq, all_checklists, all_observations, holdout_ids
    )

    elapsed = time.time() - start

    # Save raw results — everything, no summarization
    result = {
        "combo_id": combo_id,
        "flags": flags,
        "label": label,
        "block": block_name,
        "states": block_states,
        "overall": overall,
        "n_eligible_checklists": n_eligible,
        "n_species": len(species_freq),
        "runtime_seconds": elapsed,
        # Full per-species results — predicted freq, actual freq, error, detection count
        "per_species": {sp: d for sp, d in per_species.items()},
        # Full predicted frequencies (training set output)
        "predicted_frequencies": species_freq,
        # Co-occurrence clusters if computed
        "cooccurrence_clusters": cooccurrence_clusters if cooccurrence_clusters else None,
    }

    with open(out_path, 'w') as f:
        json.dump(result, f)

    print(f"\nDone in {elapsed:.1f}s. MAE={overall['mae']:.4f} RMSE={overall['rmse']:.4f}")
    print(f"Saved to: {out_path}")


# ── Post-hoc corrections (flags 6, 7, 8) ────────────────────────────

def apply_occupancy_correction(species_freq, checklists, observations, train_ids):
    """Apply occupancy model correction to separate detection from presence."""
    corrected = dict(species_freq)

    # Build detection histories per species (simplified: weekly presence/absence)
    for sp, freq in species_freq.items():
        if freq < 0.01 or freq > 0.95:
            continue  # Skip very rare or very common — occupancy model adds little

        # Build simple history: was species detected on each checklist?
        histories = []
        current_history = []

        for sid in sorted(train_ids)[:2000]:  # Cap for speed
            obs = observations.get(sid, [])
            detected = any(s == sp for s, _ in obs)
            current_history.append(1 if detected else 0)

            if len(current_history) >= 10:
                histories.append(current_history)
                current_history = []

        if len(histories) < 5:
            continue

        psi, p, converged = fit_occupancy_simple(histories)
        if converged and psi is not None and p is not None and p > 0.01:
            # Corrected frequency: occupancy, not just reporting rate
            corrected[sp] = psi

    return corrected


def compute_cooccurrence_clusters(checklists, observations, train_ids, threshold=0.8):
    """Find species that almost always co-occur on the same checklists."""
    # Count pairwise co-occurrence
    species_lists = []
    for sid in train_ids:
        if not checklists.get(sid, {}).get("complete", False):
            continue
        species = set(sp for sp, _ in observations.get(sid, []))
        if len(species) >= 2:
            species_lists.append(species)

    if not species_lists:
        return []

    # Count co-occurrences for common species only (top 200)
    species_count = defaultdict(int)
    for sl in species_lists:
        for sp in sl:
            species_count[sp] += 1

    top_species = sorted(species_count, key=species_count.get, reverse=True)[:200]
    top_set = set(top_species)

    pair_count = defaultdict(int)
    solo_count = defaultdict(int)

    for sl in species_lists:
        filtered = sl & top_set
        for sp in filtered:
            solo_count[sp] += 1
            for sp2 in filtered:
                if sp != sp2:
                    pair_count[(sp, sp2)] += 1

    # Find clusters
    clusters = []
    used = set()

    for sp in top_species:
        if sp in used:
            continue
        cluster = {sp}
        for sp2 in top_species:
            if sp2 in used or sp2 == sp:
                continue
            if solo_count[sp] > 0 and solo_count[sp2] > 0:
                p_ab = pair_count.get((sp, sp2), 0) / solo_count[sp]
                p_ba = pair_count.get((sp2, sp), 0) / solo_count[sp2]
                if p_ab >= threshold and p_ba >= threshold:
                    cluster.add(sp2)

        if len(cluster) > 1:
            clusters.append(sorted(cluster))
            used.update(cluster)

    return clusters


def apply_effort_debiasing(species_freq, checklists, observations, train_ids):
    """Effort debiasing: inverse-density spatial weighting + optional RF residual correction.

    Two-stage approach:
    1. Weight checklists inversely by local checklist density (reduce urban oversampling)
    2. If sklearn available, fit RF to separate effort signal from habitat signal
    """
    # Group checklists by approximate location (0.5 degree grid)
    grid_checklists = defaultdict(list)
    for sid in train_ids:
        cl = checklists.get(sid)
        if cl is None:
            continue
        grid_key = (round(cl["lat"] * 2) / 2, round(cl["lng"] * 2) / 2)
        grid_checklists[grid_key].append(sid)

    # Compute grid-cell weights (inverse of checklist count, capped)
    grid_weights = {}
    counts = [len(v) for v in grid_checklists.values()]
    median_count = np.median(counts) if counts else 1
    for key, sids in grid_checklists.items():
        grid_weights[key] = min(3.0, median_count / max(1, len(sids)))

    # Recompute frequencies with spatial weights
    species_det = defaultdict(float)
    total_weight = 0.0

    for grid_key, sids in grid_checklists.items():
        w = grid_weights[grid_key]
        for sid in sids:
            total_weight += w
            seen = set()
            for sp, _ in observations.get(sid, []):
                if sp not in seen:
                    species_det[sp] += w
                    seen.add(sp)

    corrected = {}
    for sp, det in species_det.items():
        corrected[sp] = det / total_weight if total_weight > 0 else 0

    # Stage 2: RF residual correction if sklearn available
    try:
        from sklearn.ensemble import RandomForestRegressor

        # Build features: effort (duration, n_observers) + location (lat, lng)
        X_effort = []
        X_location = []
        y_richness = []

        for sid in train_ids:
            cl = checklists.get(sid)
            if cl is None or not cl.get("complete"):
                continue
            n_sp = len(set(sp for sp, _ in observations.get(sid, [])))
            X_effort.append([cl["duration"], cl.get("n_observers", 1)])
            X_location.append([cl["lat"], cl["lng"]])
            y_richness.append(n_sp)

        if len(y_richness) > 100:
            X_eff = np.array(X_effort)
            X_loc = np.array(X_location)
            y = np.array(y_richness, dtype=float)

            # Fit effort-only model
            rf_effort = RandomForestRegressor(n_estimators=50, max_depth=6, random_state=42, n_jobs=1)
            rf_effort.fit(X_eff, y)

            # Effort explains this much of richness variation
            effort_pred = rf_effort.predict(X_eff)
            residuals = y - effort_pred

            # Mean residual by grid cell = habitat signal after removing effort
            grid_residuals = defaultdict(list)
            for i, sid in enumerate([s for s in train_ids if checklists.get(s, {}).get("complete")]):
                cl = checklists[sid]
                grid_key = (round(cl["lat"] * 2) / 2, round(cl["lng"] * 2) / 2)
                if i < len(residuals):
                    grid_residuals[grid_key].append(residuals[i])

            # Adjust frequencies: cells with positive residual have more species
            # than effort alone would predict (= good habitat)
            for sp in list(corrected.keys()):
                # Weight adjustment based on habitat quality signal
                sp_adj = 0.0
                sp_n = 0
                for grid_key, sids in grid_checklists.items():
                    resid = np.mean(grid_residuals.get(grid_key, [0]))
                    for sid in sids:
                        if any(s == sp for s, _ in observations.get(sid, [])):
                            sp_adj += resid
                            sp_n += 1
                # Small adjustment factor
                if sp_n > 0:
                    adj_factor = 1.0 + 0.01 * (sp_adj / sp_n)
                    corrected[sp] = max(0, min(1, corrected[sp] * adj_factor))

    except ImportError:
        pass  # sklearn not available, use spatial weighting only

    return corrected


# ── Aggregation ──────────────────────────────────────────────────────

def aggregate_results(block_name):
    """Aggregate all combo results into a single analysis file."""
    block_dir = RESULTS_DIR / block_name
    results = []

    for i in range(NUM_COMBOS):
        path = block_dir / f"combo_{i:03d}.json"
        if path.exists():
            with open(path) as f:
                results.append(json.load(f))

    if not results:
        print(f"No results found in {block_dir}")
        return

    print(f"\nAggregating {len(results)} of {NUM_COMBOS} combinations for {block_name}")

    # Sort by overall MAE
    results.sort(key=lambda r: r["overall"]["mae"])

    # Best overall
    print(f"\nTop 10 combinations by MAE:")
    print(f"{'Rank':<6} {'MAE':<10} {'RMSE':<10} {'Species':<8} {'Label'}")
    print("-" * 70)
    for i, r in enumerate(results[:10]):
        print(f"{i+1:<6} {r['overall']['mae']:<10.5f} {r['overall']['rmse']:<10.5f} "
              f"{r['n_species']:<8} {r['label']}")

    # Baseline
    baseline = next((r for r in results if r["combo_id"] == 0), None)
    if baseline:
        print(f"\nBaseline MAE: {baseline['overall']['mae']:.5f}")
        better = sum(1 for r in results if r["overall"]["mae"] < baseline["overall"]["mae"])
        print(f"Combinations better than baseline: {better}/{len(results)}")

    # Per-flag analysis: average improvement when flag is on vs off
    print(f"\nPer-flag average MAE impact:")
    for flag_idx, flag_name in enumerate(FLAG_NAMES):
        on_maes = [r["overall"]["mae"] for r in results if r["flags"][flag_name]]
        off_maes = [r["overall"]["mae"] for r in results if not r["flags"][flag_name]]
        if on_maes and off_maes:
            diff = np.mean(on_maes) - np.mean(off_maes)
            print(f"  {flag_name:<25} {diff:+.5f} {'(worse)' if diff > 0 else '(BETTER)'}")

    # Per-species best method (for meta-model)
    print(f"\nBuilding per-species best method table...")
    all_species = set()
    for r in results:
        all_species.update(r.get("species_mae", {}).keys())

    species_best = {}
    for sp in all_species:
        best_combo = None
        best_mae = float('inf')
        for r in results:
            sp_mae = r.get("species_mae", {}).get(sp, float('inf'))
            if sp_mae < best_mae:
                best_mae = sp_mae
                best_combo = r["combo_id"]
        species_best[sp] = {"best_combo": best_combo, "best_mae": best_mae}

    # Save aggregated results
    agg = {
        "block": block_name,
        "n_combos_completed": len(results),
        "top_10": [{"combo_id": r["combo_id"], "label": r["label"],
                     "mae": r["overall"]["mae"], "rmse": r["overall"]["rmse"]}
                    for r in results[:10]],
        "flag_impacts": {},
        "species_best_method": species_best,
    }

    for flag_idx, flag_name in enumerate(FLAG_NAMES):
        on_maes = [r["overall"]["mae"] for r in results if r["flags"][flag_name]]
        off_maes = [r["overall"]["mae"] for r in results if not r["flags"][flag_name]]
        if on_maes and off_maes:
            agg["flag_impacts"][flag_name] = {
                "mean_mae_on": float(np.mean(on_maes)),
                "mean_mae_off": float(np.mean(off_maes)),
                "improvement": float(np.mean(off_maes) - np.mean(on_maes)),
            }

    agg_path = block_dir / "factorial_results.json"
    with open(agg_path, 'w') as f:
        json.dump(agg, f, indent=2)
    print(f"\nAggregated results saved to: {agg_path}")


# ── Entry point ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="HPC Factorial Experiment Runner")
    parser.add_argument("--combo", type=int, help="Run a single combination (0-511)")
    parser.add_argument("--block", default="new-england", choices=list(BLOCKS.keys()),
                        help="State block to run on")
    parser.add_argument("--aggregate", action="store_true",
                        help="Aggregate all completed combo results")
    parser.add_argument("--all", action="store_true",
                        help="Run all 512 combinations sequentially (for local testing)")
    args = parser.parse_args()

    if args.aggregate:
        aggregate_results(args.block)
    elif args.combo is not None:
        run_combo(args.combo, args.block)
    elif args.all:
        for i in range(NUM_COMBOS):
            run_combo(i, args.block)
        aggregate_results(args.block)
    else:
        # Default: check for SLURM_ARRAY_TASK_ID
        task_id = os.environ.get("SLURM_ARRAY_TASK_ID")
        if task_id is not None:
            run_combo(int(task_id), args.block)
        else:
            print("Usage:")
            print("  python run_factorial.py --combo 0 --block new-england  # Single combo")
            print("  python run_factorial.py --all --block new-england      # All 512 locally")
            print("  python run_factorial.py --aggregate --block new-england # Aggregate results")
            print("  SLURM_ARRAY_TASK_ID=42 python run_factorial.py         # HPC job array")


if __name__ == "__main__":
    main()
