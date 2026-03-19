#!/usr/bin/env python3
"""
Compute difficulty scores for each species based on:
1. Spatial constraint: fraction of cells where species occurs (inverted)
2. Average reporting frequency: mean freq across cells where present (inverted)
3. Seasonality: how narrow the peak season window is

Also computes per-sub-region difficulty using the same methodology.

Reads from archive/detections_r4.json and archive/checklists_r4.json.
Outputs pipeline/reference/difficulty_scores.json for merging into species.json.
"""

import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

# Resolve paths relative to this script
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
REFERENCE_DIR = SCRIPT_DIR / "reference"
REFERENCE_DIR.mkdir(exist_ok=True)
FRONTEND_DATA_DIR = SCRIPT_DIR.parent / "frontend" / "public" / "data"

# Sub-region definitions: key -> (display_name, [west, south, east, north])
SUB_REGIONS = {
    'ca-west': ('Western Canada', [-141, 48, -120, 70]),
    'ca-central': ('Central Canada', [-120, 48, -89, 70]),
    'ca-east': ('Eastern Canada', [-89, 42, -50, 63]),
    'mx': ('Mexico', [-118, 14, -86, 33]),
    'ca-north': ('Northern Central America', [-92, 12, -83, 18]),
    'ca-south': ('Southern Central America', [-86, 7, -77, 12]),
    'caribbean-greater': ('Greater Antilles', [-85, 17, -64, 24]),
    'atlantic-west': ('Western Atlantic Islands', [-80, 20, -60, 33]),
    'us-ak': ('Alaska', [-180, 51, -130, 72]),
    'us-hi': ('Hawaii', [-161, 18, -154, 23]),
}


def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def compute_species_metrics(species_id, cell_data, checklists, total_cells):
    """Compute raw difficulty metrics for a species given its cell data.

    Args:
        species_id: Species identifier
        cell_data: dict of cell_id -> {week_str: detection_count}
        checklists: dict of cell_id -> {week_str: checklist_count}
        total_cells: Total number of cells in the region (for spatial breadth)

    Returns:
        dict with spatialBreadth, avgFreq, seasonality, numCells or None if no data
    """
    num_cells = len(cell_data)
    if num_cells == 0 or total_cells == 0:
        return None

    spatial_breadth = num_cells / total_cells

    total_freq = 0.0
    total_cell_weeks = 0
    weekly_detections = defaultdict(int)

    for cell_id, week_counts in cell_data.items():
        cell_checklists = checklists.get(cell_id, {})
        for week_str, det_count in week_counts.items():
            cl_count = cell_checklists.get(week_str, 0)
            if cl_count > 0:
                freq = det_count / cl_count
                total_freq += freq
                total_cell_weeks += 1
            weekly_detections[int(week_str)] += det_count

    avg_freq = total_freq / total_cell_weeks if total_cell_weeks > 0 else 0

    total_det = sum(weekly_detections.values())
    if total_det > 0 and len(weekly_detections) > 1:
        entropy = 0.0
        for count in weekly_detections.values():
            p = count / total_det
            if p > 0:
                entropy -= p * math.log2(p)
        max_entropy = math.log2(52)
        seasonality = 1 - (entropy / max_entropy)
    else:
        seasonality = 1.0

    return {
        "spatialBreadth": round(spatial_breadth, 4),
        "avgFreq": round(avg_freq, 4),
        "seasonality": round(seasonality, 4),
        "numCells": num_cells,
    }


def rank_and_score(species_metrics):
    """Given a dict of species_id -> metrics, compute 1-10 difficulty ratings.

    Args:
        species_metrics: dict of species_id -> {spatialBreadth, avgFreq, seasonality, numCells}

    Returns:
        dict of species_id -> int (1-10 difficulty rating)
    """
    species_ids = list(species_metrics.keys())
    n = len(species_ids)
    if n == 0:
        return {}

    def rank_percentiles(values):
        """Convert raw values to 0-1 percentiles (higher value = higher percentile)."""
        indexed = sorted(enumerate(values), key=lambda x: x[1])
        percentiles = [0.0] * len(values)
        for rank, (idx, _) in enumerate(indexed):
            percentiles[idx] = rank / max(n - 1, 1)
        return percentiles

    # Spatial: more cells = easier -> invert so rare = high percentile
    spatial_vals = [species_metrics[sid]["spatialBreadth"] for sid in species_ids]
    spatial_pct = rank_percentiles(spatial_vals)
    spatial_pct = [1 - p for p in spatial_pct]

    # Frequency: higher freq = easier -> invert
    freq_vals = [species_metrics[sid]["avgFreq"] for sid in species_ids]
    freq_pct = rank_percentiles(freq_vals)
    freq_pct = [1 - p for p in freq_pct]

    # Seasonality: higher = more seasonal = harder (no invert)
    season_vals = [species_metrics[sid]["seasonality"] for sid in species_ids]
    season_pct = rank_percentiles(season_vals)

    # Compute combined scores
    combined = []
    for i, sid in enumerate(species_ids):
        raw_score = (
            0.40 * spatial_pct[i] +
            0.40 * freq_pct[i] +
            0.20 * season_pct[i]
        )
        combined.append((sid, raw_score))

    # Force even 1-10 distribution using decile thresholds
    sorted_scores = sorted(s for _, s in combined)
    n_total = len(sorted_scores)
    decile_thresholds = [sorted_scores[int(n_total * d / 10)] for d in range(10)] + [1.01]

    ratings = {}
    for sid, raw_score in combined:
        score_1_10 = 10
        for d in range(10):
            if raw_score < decile_thresholds[d + 1]:
                score_1_10 = d + 1
                break
        ratings[sid] = score_1_10

    return ratings


def load_cell_centroids():
    """Load h3_index -> (lng, lat) mapping from r4 grid.geojson."""
    grid_path = FRONTEND_DATA_DIR / "r4" / "grid.geojson"
    if not grid_path.exists():
        print(f"  WARNING: {grid_path} not found, skipping regional difficulty")
        return {}

    grid = load_json(grid_path)
    centroids = {}
    for feat in grid["features"]:
        props = feat["properties"]
        h3_index = props["h3_index"]
        centroids[h3_index] = (props["center_lng"], props["center_lat"])
    return centroids


def cells_in_bbox(centroids, bbox):
    """Return set of h3 indices whose centroids fall within the bounding box.

    Args:
        centroids: dict of h3_index -> (lng, lat)
        bbox: [west, south, east, north]
    """
    west, south, east, north = bbox
    result = set()
    for h3_index, (lng, lat) in centroids.items():
        if west <= lng <= east and south <= lat <= north:
            result.add(h3_index)
    return result


def compute_difficulty_scores():
    print("Loading archive data...")
    detections = load_json(ARCHIVE_DIR / "detections_r4.json")
    checklists = load_json(ARCHIVE_DIR / "checklists_r4.json")
    species_meta = load_json(ARCHIVE_DIR / "species_meta.json")

    total_cells = len(checklists)
    print(f"  {len(detections)} species, {total_cells} cells")

    # ── Global difficulty ──────────────────────────────────────────────

    # Build per-species metrics (global)
    results = {}
    global_metrics = {}
    for species_id, cell_data in detections.items():
        metrics = compute_species_metrics(species_id, cell_data, checklists, total_cells)
        if metrics is None:
            continue
        global_metrics[species_id] = metrics
        results[species_id] = {
            "difficultyScore": 0,
            "difficultyLabel": "",
            "metrics": metrics,
        }

    # Rank-based scoring (global)
    species_ids = list(results.keys())
    n = len(species_ids)

    def rank_percentiles(values):
        """Convert raw values to 0-1 percentiles (higher value = higher percentile)."""
        indexed = sorted(enumerate(values), key=lambda x: x[1])
        percentiles = [0.0] * len(values)
        for rank, (idx, _) in enumerate(indexed):
            percentiles[idx] = rank / max(n - 1, 1)
        return percentiles

    spatial_vals = [results[sid]["metrics"]["spatialBreadth"] for sid in species_ids]
    spatial_pct = rank_percentiles(spatial_vals)
    spatial_pct = [1 - p for p in spatial_pct]

    freq_vals = [results[sid]["metrics"]["avgFreq"] for sid in species_ids]
    freq_pct = rank_percentiles(freq_vals)
    freq_pct = [1 - p for p in freq_pct]

    season_vals = [results[sid]["metrics"]["seasonality"] for sid in species_ids]
    season_pct = rank_percentiles(season_vals)

    combined = []
    for i, sid in enumerate(species_ids):
        raw_score = (
            0.40 * spatial_pct[i] +
            0.40 * freq_pct[i] +
            0.20 * season_pct[i]
        )
        combined.append((sid, raw_score))

    sorted_scores = sorted(s for _, s in combined)
    n_total = len(sorted_scores)
    decile_thresholds = [sorted_scores[int(n_total * d / 10)] for d in range(10)] + [1.01]

    for sid, raw_score in combined:
        score_1_10 = 10
        for d in range(10):
            if raw_score < decile_thresholds[d + 1]:
                score_1_10 = d + 1
                break

        score_0_100 = round(raw_score * 100, 1)

        if score_1_10 <= 2:
            label = "Easy"
        elif score_1_10 <= 4:
            label = "Moderate"
        elif score_1_10 <= 6:
            label = "Hard"
        elif score_1_10 <= 8:
            label = "Very Hard"
        else:
            label = "Extremely Hard"

        results[sid]["difficultyScore"] = score_0_100
        results[sid]["difficultyRating"] = score_1_10
        results[sid]["difficultyLabel"] = label

    # Distribution on 1-10 scale
    scale_dist = defaultdict(int)
    for r in results.values():
        s = max(1, min(10, round(r["difficultyScore"] / 10)))
        scale_dist[s] += 1
    print(f"\n1-10 scale distribution (global):")
    for i in range(1, 11):
        bar = "#" * (scale_dist.get(i, 0) // 5)
        print(f"  {i:2d}: {scale_dist.get(i, 0):4d} {bar}")

    dist = defaultdict(int)
    for r in results.values():
        dist[r["difficultyLabel"]] += 1
    print(f"\nDifficulty distribution (global):")
    for label in ["Easy", "Moderate", "Hard", "Very Hard", "Extremely Hard"]:
        print(f"  {label}: {dist.get(label, 0)}")

    # ── Regional difficulty ────────────────────────────────────────────

    print("\nComputing regional difficulty...")
    centroids = load_cell_centroids()

    if centroids:
        # Build region -> set of h3 cells
        region_cells = {}
        for region_key, (region_name, bbox) in SUB_REGIONS.items():
            cells = cells_in_bbox(centroids, bbox)
            region_cells[region_key] = cells
            print(f"  {region_key} ({region_name}): {len(cells)} cells")

        # For each region, compute per-species metrics using only that region's cells
        for region_key, (region_name, bbox) in SUB_REGIONS.items():
            rcells = region_cells[region_key]
            if len(rcells) == 0:
                print(f"  Skipping {region_key}: no cells")
                continue

            # Filter checklists to this region
            region_checklists = {c: v for c, v in checklists.items() if c in rcells}
            region_total_cells = len(region_checklists)
            if region_total_cells == 0:
                continue

            # Compute metrics for each species within this region
            region_metrics = {}
            for species_id, cell_data in detections.items():
                # Filter cell_data to only cells in this region
                filtered_cells = {c: v for c, v in cell_data.items() if c in rcells}
                if not filtered_cells:
                    continue

                metrics = compute_species_metrics(
                    species_id, filtered_cells, region_checklists, region_total_cells
                )
                if metrics is not None:
                    region_metrics[species_id] = metrics

            if len(region_metrics) < 2:
                print(f"  Skipping {region_key}: only {len(region_metrics)} species")
                continue

            # Rank and score within this region
            regional_ratings = rank_and_score(region_metrics)

            # Assign to results
            for sid, rating in regional_ratings.items():
                if sid in results:
                    if "regionalDifficulty" not in results[sid]:
                        results[sid]["regionalDifficulty"] = {}
                    results[sid]["regionalDifficulty"][region_key] = rating

            print(f"  {region_key}: scored {len(regional_ratings)} species")

        # Print summary of regional coverage
        species_with_regional = sum(
            1 for r in results.values() if "regionalDifficulty" in r
        )
        print(f"\n  {species_with_regional}/{len(results)} species have regional difficulty scores")
    else:
        print("  Skipped (no grid data)")

    # Save results
    output_path = REFERENCE_DIR / "difficulty_scores.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {len(results)} difficulty scores to {output_path}")

    return results


if __name__ == "__main__":
    compute_difficulty_scores()
