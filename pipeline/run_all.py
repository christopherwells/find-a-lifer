#!/usr/bin/env python3
"""
Pipeline orchestrator for Find-A-Lifer.

Runs the full data pipeline in order, with exit-code checking between steps,
validation gates on expected output files, and timing for each step.

Steps:
  1. process_ebd.py      — Process eBird data (or --rebuild from archive)
  2. label_cells.py       — Label grid cells with city names
  3. extract_covariates.py — Extract environmental covariates
  4. compute_ocean_fraction.py — Compute ocean fractions for cells
  5. ship_covariates.py    — Ship covariates to frontend
  6. compute_difficulty.py — Compute difficulty scores
  7. compute_species_habitat.py — Compute species habitat labels

Usage:
  python pipeline/run_all.py                    # Full pipeline
  python pipeline/run_all.py --rebuild          # Rebuild from archive
  python pipeline/run_all.py --skip-ebd         # Skip step 1
  python pipeline/run_all.py --no-stixel        # Pass --no-stixel to process_ebd.py
  python pipeline/run_all.py --dry-run          # Show steps without executing
  python pipeline/run_all.py --skip-ebd --dry-run
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
FRONTEND_DATA = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = PROJECT_DIR / "data" / "archive"

RESOLUTIONS = [2, 3, 4]
# Resolutions that have covariates (res 2 is too coarse for covariate extraction)
COVARIATE_RESOLUTIONS = [3, 4]


def build_steps(args):
    """Build the ordered list of pipeline steps based on CLI flags."""
    steps = []

    # Step 1: process_ebd.py
    if not args.skip_ebd:
        ebd_cmd = [sys.executable, str(SCRIPT_DIR / "process_ebd.py")]
        if args.rebuild:
            ebd_cmd.append("--rebuild")
        if args.no_stixel:
            ebd_cmd.append("--no-stixel")
        steps.append({
            "name": "process_ebd.py",
            "cmd": ebd_cmd,
            "description": "Process eBird data" + (" (rebuild from archive)" if args.rebuild else ""),
            "validate": validate_process_ebd,
        })

    # Step 2: label_cells.py
    steps.append({
        "name": "label_cells.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "label_cells.py")],
        "description": "Label grid cells with city names",
        "validate": validate_label_cells,
    })

    # Step 3: extract_covariates.py
    steps.append({
        "name": "extract_covariates.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "extract_covariates.py")],
        "description": "Extract environmental covariates",
        "validate": validate_extract_covariates,
    })

    # Step 4: compute_ocean_fraction.py
    steps.append({
        "name": "compute_ocean_fraction.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "compute_ocean_fraction.py")],
        "description": "Compute ocean fractions",
        "validate": validate_ocean_fraction,
    })

    # Step 5: ship_covariates.py
    steps.append({
        "name": "ship_covariates.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "ship_covariates.py")],
        "description": "Ship covariates to frontend",
        "validate": validate_ship_covariates,
    })

    # Step 6: compute_difficulty.py
    steps.append({
        "name": "compute_difficulty.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "compute_difficulty.py")],
        "description": "Compute difficulty scores",
        "validate": validate_difficulty,
    })

    # Step 7: compute_species_habitat.py
    steps.append({
        "name": "compute_species_habitat.py",
        "cmd": [sys.executable, str(SCRIPT_DIR / "compute_species_habitat.py")],
        "description": "Compute species habitat labels",
        "validate": validate_species_habitat,
    })

    return steps


# --- Validation gates ---

def validate_process_ebd():
    """Check that process_ebd.py produced expected output files."""
    errors = []
    # species.json must exist
    species_path = FRONTEND_DATA / "species.json"
    if not species_path.exists():
        errors.append(f"Missing {species_path}")

    # Grid files for each resolution
    for res in RESOLUTIONS:
        grid_path = FRONTEND_DATA / f"r{res}" / "grid.geojson"
        if not grid_path.exists():
            errors.append(f"Missing {grid_path}")

        weeks_dir = FRONTEND_DATA / f"r{res}" / "weeks"
        if not weeks_dir.exists() or not any(weeks_dir.iterdir()):
            errors.append(f"Missing or empty {weeks_dir}")

    # Archive files
    for res in RESOLUTIONS:
        for prefix in ("checklists", "detections"):
            archive_path = ARCHIVE_DIR / f"{prefix}_r{res}.json"
            if not archive_path.exists():
                errors.append(f"Missing {archive_path}")

    species_meta = ARCHIVE_DIR / "species_meta.json"
    if not species_meta.exists():
        errors.append(f"Missing {species_meta}")

    return errors


def validate_label_cells():
    """Check that grid.geojson files have label properties."""
    import json
    errors = []
    for res in RESOLUTIONS:
        grid_path = FRONTEND_DATA / f"r{res}" / "grid.geojson"
        if not grid_path.exists():
            errors.append(f"Missing {grid_path}")
            continue
        with open(grid_path) as f:
            grid = json.load(f)
        features = grid.get("features", [])
        if not features:
            errors.append(f"r{res}/grid.geojson has no features")
            continue
        # Spot-check first feature for label property
        first = features[0].get("properties", {})
        if "label" not in first:
            errors.append(f"r{res}/grid.geojson features missing 'label' property")
    return errors


def validate_extract_covariates():
    """Check that covariate archive files were created."""
    errors = []
    for res in COVARIATE_RESOLUTIONS:
        cov_path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
        if not cov_path.exists():
            errors.append(f"Missing {cov_path}")
        elif cov_path.stat().st_size < 100:
            errors.append(f"{cov_path} is suspiciously small ({cov_path.stat().st_size} bytes)")
    return errors


def validate_ocean_fraction():
    """Check that covariates.json files have ocean field."""
    import json
    errors = []
    for res in COVARIATE_RESOLUTIONS:
        cov_path = FRONTEND_DATA / f"r{res}" / "covariates.json"
        if not cov_path.exists():
            errors.append(f"Missing {cov_path}")
            continue
        with open(cov_path) as f:
            covariates = json.load(f)
        if not covariates:
            errors.append(f"r{res}/covariates.json is empty")
            continue
        # Spot-check first entry for ocean field
        first_key = next(iter(covariates))
        if "ocean" not in covariates[first_key]:
            errors.append(f"r{res}/covariates.json missing 'ocean' field")
    return errors


def validate_ship_covariates():
    """Check that frontend covariates.json files exist with cell_id keys."""
    import json
    errors = []
    for res in COVARIATE_RESOLUTIONS:
        cov_path = FRONTEND_DATA / f"r{res}" / "covariates.json"
        if not cov_path.exists():
            errors.append(f"Missing {cov_path}")
            continue
        with open(cov_path) as f:
            covariates = json.load(f)
        if not covariates:
            errors.append(f"r{res}/covariates.json is empty after shipping")
    return errors


def validate_difficulty():
    """Check that difficulty_scores.json was produced."""
    errors = []
    scores_path = SCRIPT_DIR / "reference" / "difficulty_scores.json"
    if not scores_path.exists():
        errors.append(f"Missing {scores_path}")
    elif scores_path.stat().st_size < 100:
        errors.append(f"{scores_path} is suspiciously small ({scores_path.stat().st_size} bytes)")
    return errors


def validate_species_habitat():
    """Check that species.json has habitat fields after merge."""
    import json
    errors = []
    species_path = FRONTEND_DATA / "species.json"
    if not species_path.exists():
        errors.append(f"Missing {species_path}")
        return errors

    with open(species_path) as f:
        data = json.load(f)

    species_list = data.get("species", data) if isinstance(data, dict) else data
    if not species_list:
        errors.append("species.json has no species entries")
        return errors

    # Check that at least some species have habitatLabels
    with_habitat = sum(1 for sp in species_list if "habitatLabels" in sp)
    if with_habitat == 0:
        errors.append("No species in species.json have 'habitatLabels' after habitat computation")
    return errors


def format_duration(seconds):
    """Format a duration in seconds to a human-readable string."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    secs = seconds % 60
    if minutes < 60:
        return f"{minutes}m {secs:.0f}s"
    hours = int(minutes // 60)
    mins = minutes % 60
    return f"{hours}h {mins}m {secs:.0f}s"


def main():
    parser = argparse.ArgumentParser(
        description="Run the full Find-A-Lifer data pipeline in order."
    )
    parser.add_argument("--rebuild", action="store_true",
                        help="Pass --rebuild to process_ebd.py (rebuild from archive)")
    parser.add_argument("--skip-ebd", action="store_true",
                        help="Skip step 1 (process_ebd.py)")
    parser.add_argument("--no-stixel", action="store_true",
                        help="Pass --no-stixel to process_ebd.py")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would run without executing")
    args = parser.parse_args()

    steps = build_steps(args)
    total_steps = len(steps)

    print("=" * 64)
    print("  Find-A-Lifer Pipeline Orchestrator")
    print("=" * 64)
    print(f"  Steps to run: {total_steps}")
    if args.skip_ebd:
        print("  Skipping: process_ebd.py (--skip-ebd)")
    if args.rebuild:
        print("  Mode: rebuild from archive (--rebuild)")
    if args.no_stixel:
        print("  Stixel ensemble: disabled (--no-stixel)")
    if args.dry_run:
        print("  DRY RUN -- no commands will be executed")
    print("=" * 64)
    print()

    if args.dry_run:
        for i, step in enumerate(steps, 1):
            cmd_str = " ".join(step["cmd"])
            print(f"  [{i}/{total_steps}] {step['description']}")
            print(f"         $ {cmd_str}")
            print()
        print("Dry run complete. No commands were executed.")
        return

    pipeline_start = time.time()
    completed = []
    skipped_names = []
    if args.skip_ebd:
        skipped_names.append("process_ebd.py")

    for i, step in enumerate(steps, 1):
        step_name = step["name"]
        cmd_str = " ".join(step["cmd"])

        print("-" * 64)
        print(f"  [{i}/{total_steps}] {step['description']}")
        print(f"  Command: {cmd_str}")
        print("-" * 64)
        sys.stdout.flush()

        step_start = time.time()
        result = subprocess.run(step["cmd"], cwd=str(PROJECT_DIR))
        step_elapsed = time.time() - step_start

        if result.returncode != 0:
            print()
            print(f"FAILED: {step_name} exited with code {result.returncode}")
            print(f"  Elapsed: {format_duration(step_elapsed)}")
            print(f"  Aborting pipeline — {total_steps - i} step(s) remaining.")
            print()
            print_summary(completed, skipped_names, total_steps,
                          time.time() - pipeline_start, failed=step_name)
            sys.exit(1)

        # Validation gate
        validation_errors = step["validate"]()
        if validation_errors:
            print()
            print(f"VALIDATION FAILED after {step_name}:")
            for err in validation_errors:
                print(f"  - {err}")
            print(f"  Elapsed: {format_duration(step_elapsed)}")
            print(f"  Aborting pipeline — {total_steps - i} step(s) remaining.")
            print()
            print_summary(completed, skipped_names, total_steps,
                          time.time() - pipeline_start, failed=step_name)
            sys.exit(1)

        completed.append((step_name, step_elapsed))
        print(f"  Completed in {format_duration(step_elapsed)}")
        print()

    total_elapsed = time.time() - pipeline_start
    print_summary(completed, skipped_names, total_steps, total_elapsed)


def print_summary(completed, skipped, total_steps, total_elapsed, failed=None):
    """Print a summary of the pipeline run."""
    print("=" * 64)
    print("  Pipeline Summary")
    print("=" * 64)

    if completed:
        print(f"\n  Completed ({len(completed)}/{total_steps}):")
        for name, elapsed in completed:
            print(f"    {name:<32s} {format_duration(elapsed):>10s}")

    if skipped:
        print(f"\n  Skipped ({len(skipped)}):")
        for name in skipped:
            print(f"    {name}")

    if failed:
        remaining = total_steps - len(completed) - len(skipped)
        print(f"\n  Failed: {failed}")
        if remaining > 0:
            print(f"  Not run: {remaining} step(s)")

    print(f"\n  Total time: {format_duration(total_elapsed)}")

    if not failed:
        print("\n  All steps completed successfully.")

    print("=" * 64)


if __name__ == "__main__":
    main()
