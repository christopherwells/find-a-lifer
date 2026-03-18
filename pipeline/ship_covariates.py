#!/usr/bin/env python3
"""Ship cell covariates from archive to frontend public data.

Transforms h3_index string keys → integer cell_id keys (matching grid.geojson).
Rounds covariate values to 3 decimal places to reduce file size.

Usage:
    python pipeline/ship_covariates.py
"""

import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
ARCHIVE_DIR = PROJECT / "data" / "archive"
OUTPUT_DIR = PROJECT / "frontend" / "public" / "data"
RESOLUTIONS = [3, 4]


def main():
    for res in RESOLUTIONS:
        cov_path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
        grid_path = OUTPUT_DIR / f"r{res}" / "grid.geojson"
        out_path = OUTPUT_DIR / f"r{res}" / "covariates.json"

        if not cov_path.exists():
            print(f"  r{res}: No covariate file at {cov_path}")
            continue
        if not grid_path.exists():
            print(f"  r{res}: No grid.geojson at {grid_path}")
            continue

        # Build h3_index → cell_id mapping from grid.geojson
        with open(grid_path) as f:
            grid = json.load(f)

        h3_to_id = {}
        for feature in grid["features"]:
            props = feature["properties"]
            h3_to_id[props["h3_index"]] = props["cell_id"]

        # Load covariates (keyed by h3_index)
        with open(cov_path) as f:
            covariates = json.load(f)

        # Transform: h3 keys → cell_id keys, round values
        output = {}
        matched = 0
        for h3_hex, cov in covariates.items():
            cell_id = h3_to_id.get(h3_hex)
            if cell_id is None:
                continue  # Cell not in grid (ocean, out of range, etc.)
            matched += 1
            output[cell_id] = {
                k: round(v, 3) if isinstance(v, float) else v
                for k, v in cov.items()
            }

        with open(out_path, "w") as f:
            json.dump(output, f, separators=(",", ":"))

        size_kb = out_path.stat().st_size / 1024
        print(f"  r{res}: {matched}/{len(covariates)} cells matched -> {out_path.name} ({size_kb:.0f} KB)")

    print("\nDone! Covariates shipped to frontend/public/data/r{3,4}/")


if __name__ == "__main__":
    main()
