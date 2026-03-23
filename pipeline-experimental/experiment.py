#!/usr/bin/env python3
"""
Find-A-Lifer Pipeline Experiment Harness

Runs the improved EBD processing pipeline with different improvement flags
on a test region (default: US-ME) and compares results against the baseline.

Usage:
    python pipeline-experimental/experiment.py                    # Run all experiments on US-ME
    python pipeline-experimental/experiment.py --region US-MA     # Different test region
    python pipeline-experimental/experiment.py --baseline-only    # Just run baseline for comparison
    python pipeline-experimental/experiment.py --experiment 1,2,3 # Run specific experiments

Output:
    pipeline-experimental/results/comparison.json    — raw metrics
    pipeline-experimental/results/report.txt         — human-readable comparison
"""

import argparse
import json
import sys
import time
from pathlib import Path

# Add parent dirs to path for imports
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "pipeline"))
sys.path.insert(0, str(SCRIPT_DIR))

from common import (
    DATA_DIR, ARCHIVE_DIR, REFERENCE_DIR, TAXONOMY_FILE,
    SUB_REGIONS, STATE_TO_REGION, OCEAN_FAMILIES,
)

OUTPUT_DIR = SCRIPT_DIR / "output"
RESULTS_DIR = SCRIPT_DIR / "results"

# ── Experiment configurations ─────────────────────────────────────────

EXPERIMENTS = {
    "baseline": {
        "name": "Current Pipeline (Baseline)",
        "flags": {},  # All defaults
    },
    "exp1_normalize_effort": {
        "name": "Exp 1: Checklist-Length Normalization",
        "flags": {"normalize_effort": True, "min_duration": 10},
    },
    "exp2_area_protocol": {
        "name": "Exp 2: Include Area Protocol",
        "flags": {"include_area_protocol": True},
    },
    "exp3_observer_weight": {
        "name": "Exp 3: Observer Quality Weighting",
        "flags": {"observer_weight": True},
    },
    "exp4_recency_weight": {
        "name": "Exp 4: Recency Weighting (10yr half-life)",
        "flags": {"recency_weight": True, "recency_half_life": 10},
    },
    "exp5_partial_checklists": {
        "name": "Exp 5: Partial Checklist Recovery",
        "flags": {"partial_checklists": True, "partial_discount": 0.3},
    },
    "exp6_max_data": {
        "name": "Exp 6: Maximum Data Recovery",
        "flags": {
            "normalize_effort": True,
            "min_duration": 5,
            "include_area_protocol": True,
            "include_nocturnal": True,
            "include_historical_presence": True,
            "partial_checklists": True,
            "partial_discount": 0.3,
            "min_checklists": 2,
            "max_distance": 16,
        },
    },
    "exp7_all_improvements": {
        "name": "Exp 7: All Quality Improvements Combined",
        "flags": {
            "normalize_effort": True,
            "min_duration": 10,
            "include_area_protocol": True,
            "observer_weight": True,
            "recency_weight": True,
            "recency_half_life": 10,
            "partial_checklists": True,
            "partial_discount": 0.3,
        },
    },
}


# ── Metrics computation ───────────────────────────────────────────────

def compute_metrics(cell_week_species: dict, cell_checklists: dict, label: str) -> dict:
    """Compute comparison metrics from processed data.

    Args:
        cell_week_species: {cell_id: {week: [(species_id, freq), ...]}}
        cell_checklists: {cell_id: {week: count}}
        label: experiment label

    Returns:
        dict of metrics
    """
    import numpy as np

    total_checklists = sum(
        sum(weeks.values()) for weeks in cell_checklists.values()
    )

    cells_with_data = len(cell_week_species)

    # Collect all frequencies
    all_freqs = []
    species_set = set()
    cell_species_counts = {}  # cell_id -> set of species seen across all weeks

    for cell_id, weeks in cell_week_species.items():
        cell_sp = set()
        for week, species_list in weeks.items():
            for sp_id, freq in species_list:
                all_freqs.append(freq)
                species_set.add(sp_id)
                cell_sp.add(sp_id)
        cell_species_counts[cell_id] = len(cell_sp)

    freqs = np.array(all_freqs) if all_freqs else np.array([0])

    # Species richness per cell
    richness_values = list(cell_species_counts.values())

    return {
        "label": label,
        "total_checklists": total_checklists,
        "cells_with_data": cells_with_data,
        "total_species": len(species_set),
        "total_cell_week_species_records": len(all_freqs),
        "freq_mean": float(np.mean(freqs)),
        "freq_median": float(np.median(freqs)),
        "freq_std": float(np.std(freqs)),
        "freq_p10": float(np.percentile(freqs, 10)),
        "freq_p90": float(np.percentile(freqs, 90)),
        "richness_mean": float(np.mean(richness_values)) if richness_values else 0,
        "richness_median": float(np.median(richness_values)) if richness_values else 0,
        "richness_max": max(richness_values) if richness_values else 0,
    }


def compute_smoothness(cell_week_species: dict, grid_neighbors: dict) -> float:
    """Compute smoothness: mean |freq(cell) - mean(freq(neighbors))| for a representative week.

    Uses week 26 (peak breeding) as the test week.
    """
    import numpy as np

    test_week = 26
    diffs = []

    for cell_id, weeks in cell_week_species.items():
        if test_week not in weeks:
            continue

        # Build species->freq map for this cell
        cell_freqs = {sp: f for sp, f in weeks[test_week]}

        # Get neighbor frequencies
        neighbors = grid_neighbors.get(cell_id, [])
        if not neighbors:
            continue

        for sp_id, freq in weeks[test_week]:
            neighbor_freqs = []
            for n_id in neighbors:
                n_weeks = cell_week_species.get(n_id, {})
                n_list = n_weeks.get(test_week, [])
                for n_sp, n_f in n_list:
                    if n_sp == sp_id:
                        neighbor_freqs.append(n_f)
                        break

            if neighbor_freqs:
                mean_neighbor = np.mean(neighbor_freqs)
                diffs.append(abs(freq - mean_neighbor))

    return float(np.mean(diffs)) if diffs else 0.0


# ── Report generation ─────────────────────────────────────────────────

def generate_report(all_metrics: list, output_path: Path):
    """Generate human-readable comparison report."""
    baseline = all_metrics[0]

    lines = [
        "=" * 80,
        "FIND-A-LIFER PIPELINE EXPERIMENT RESULTS",
        "=" * 80,
        "",
    ]

    # Header row
    cols = ["Metric"] + [m["label"][:20] for m in all_metrics]

    # Key metrics
    metrics_to_show = [
        ("Checklists", "total_checklists"),
        ("Cells w/ Data", "cells_with_data"),
        ("Species", "total_species"),
        ("Records", "total_cell_week_species_records"),
        ("Freq Mean", "freq_mean"),
        ("Freq Median", "freq_median"),
        ("Freq StdDev", "freq_std"),
        ("Freq P10", "freq_p10"),
        ("Freq P90", "freq_p90"),
        ("Richness Mean", "richness_mean"),
        ("Richness Max", "richness_max"),
    ]

    # Column widths
    label_w = 18
    col_w = 22

    lines.append(f"{'Metric':<{label_w}}" + "".join(f"{m['label'][:col_w-2]:>{col_w}}" for m in all_metrics))
    lines.append("-" * (label_w + col_w * len(all_metrics)))

    for label, key in metrics_to_show:
        row = f"{label:<{label_w}}"
        for m in all_metrics:
            val = m[key]
            if isinstance(val, float):
                if val < 1:
                    row += f"{val:>{col_w}.4f}"
                else:
                    row += f"{val:>{col_w},.1f}"
            else:
                row += f"{val:>{col_w},}"

        lines.append(row)

    # Delta from baseline
    lines.append("")
    lines.append("=" * 80)
    lines.append("DELTA FROM BASELINE (% change)")
    lines.append("=" * 80)
    lines.append("")

    for m in all_metrics[1:]:
        lines.append(f"\n--- {m['label']} ---")
        for label, key in metrics_to_show:
            base_val = baseline[key]
            exp_val = m[key]
            if base_val == 0:
                delta = "N/A"
            else:
                pct = ((exp_val - base_val) / base_val) * 100
                delta = f"{pct:+.1f}%"
            lines.append(f"  {label:<18} {delta:>10}  ({base_val:>12} → {exp_val:>12})")

    report = "\n".join(lines)
    output_path.write_text(report)
    print(f"\nReport saved to: {output_path}")
    print(report)


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Run pipeline experiments")
    parser.add_argument("--region", default="US-ME", help="Test region (default: US-ME)")
    parser.add_argument("--baseline-only", action="store_true", help="Only run baseline")
    parser.add_argument("--experiment", help="Comma-separated experiment numbers (e.g., 1,2,3)")
    args = parser.parse_args()

    print(f"Find-A-Lifer Pipeline Experiments")
    print(f"Test region: {args.region}")
    print(f"{'=' * 60}")

    # Determine which experiments to run
    if args.baseline_only:
        exp_keys = ["baseline"]
    elif args.experiment:
        nums = [int(n.strip()) for n in args.experiment.split(",")]
        exp_keys = ["baseline"] + [f"exp{n}_*" for n in nums]
        # Resolve wildcards
        resolved = ["baseline"]
        for key in EXPERIMENTS:
            for num in nums:
                if key.startswith(f"exp{num}"):
                    resolved.append(key)
        exp_keys = resolved
    else:
        exp_keys = list(EXPERIMENTS.keys())

    # Check for raw EBD data
    ebd_files = list(DATA_DIR.glob("**/ebd_*")) + list(DATA_DIR.glob("**/*.gz"))
    me_files = [f for f in ebd_files if args.region.replace("-", "_").lower() in f.name.lower()
                or args.region.replace("-", "").lower() in f.name.lower()]

    if not me_files:
        print(f"\nNo EBD files found for {args.region}.")
        print(f"Searched in: {DATA_DIR}")
        print(f"Available EBD files: {len(ebd_files)}")
        if ebd_files:
            print(f"Sample files: {[f.name for f in ebd_files[:5]]}")
        print(f"\nWaiting for raw data from cold storage...")
        return

    print(f"\nFound {len(me_files)} EBD file(s) for {args.region}:")
    for f in me_files:
        print(f"  {f.name} ({f.stat().st_size / 1e6:.1f} MB)")

    # Run experiments
    all_metrics = []

    for exp_key in exp_keys:
        if exp_key not in EXPERIMENTS:
            print(f"Unknown experiment: {exp_key}")
            continue

        exp = EXPERIMENTS[exp_key]
        print(f"\n{'=' * 60}")
        print(f"Running: {exp['name']}")
        print(f"Flags: {exp['flags']}")
        print(f"{'=' * 60}")

        start = time.time()

        # Import and run the improved EBD processor
        try:
            from improved_ebd import process_region
            cell_week_species, cell_checklists, grid_neighbors = process_region(
                region=args.region,
                ebd_files=me_files,
                flags=exp["flags"],
            )

            metrics = compute_metrics(cell_week_species, cell_checklists, exp["name"])
            metrics["smoothness"] = compute_smoothness(cell_week_species, grid_neighbors)
            metrics["runtime_seconds"] = time.time() - start

            all_metrics.append(metrics)
            print(f"  Done in {metrics['runtime_seconds']:.1f}s")
            print(f"  Checklists: {metrics['total_checklists']:,}")
            print(f"  Cells: {metrics['cells_with_data']}")
            print(f"  Species: {metrics['total_species']}")

        except Exception as e:
            print(f"  FAILED: {e}")
            import traceback
            traceback.print_exc()

    if len(all_metrics) < 2:
        print("\nNeed at least baseline + 1 experiment to compare.")
        return

    # Save raw metrics
    metrics_path = RESULTS_DIR / "comparison.json"
    with open(metrics_path, "w") as f:
        json.dump(all_metrics, f, indent=2)
    print(f"\nRaw metrics saved to: {metrics_path}")

    # Generate report
    generate_report(all_metrics, RESULTS_DIR / "report.txt")


if __name__ == "__main__":
    main()
