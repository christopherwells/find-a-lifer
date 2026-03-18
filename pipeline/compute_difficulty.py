#!/usr/bin/env python3
"""
Compute difficulty scores for each species based on:
1. Spatial constraint: fraction of cells where species occurs (inverted)
2. Average reporting frequency: mean freq across cells where present (inverted)
3. Seasonality: how narrow the peak season window is

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

def load_json(path):
    with open(path, "r") as f:
        return json.load(f)


def compute_difficulty_scores():
    print("Loading archive data...")
    detections = load_json(ARCHIVE_DIR / "detections_r4.json")
    checklists = load_json(ARCHIVE_DIR / "checklists_r4.json")
    species_meta = load_json(ARCHIVE_DIR / "species_meta.json")

    total_cells = len(checklists)
    print(f"  {len(detections)} species, {total_cells} cells")

    # Build per-species metrics
    results = {}
    for species_id, cell_data in detections.items():
        name = species_meta["names"].get(species_id, species_id)

        # 1. Spatial constraint: fraction of total cells where species occurs
        num_cells = len(cell_data)
        spatial_breadth = num_cells / total_cells  # 0-1, higher = more widespread

        # 2. Average reporting frequency across all cell-weeks
        total_freq = 0.0
        total_cell_weeks = 0
        weekly_detections = defaultdict(int)  # week → total detections

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

        # 3. Seasonality: how concentrated detections are across weeks
        # Shannon entropy of weekly detection distribution (lower = more seasonal)
        total_det = sum(weekly_detections.values())
        if total_det > 0 and len(weekly_detections) > 1:
            entropy = 0.0
            for count in weekly_detections.values():
                p = count / total_det
                if p > 0:
                    entropy -= p * math.log2(p)
            # Max entropy for 52 weeks ≈ 5.7
            max_entropy = math.log2(52)
            seasonality = 1 - (entropy / max_entropy)  # 0 = uniform, 1 = all in one week
        else:
            seasonality = 1.0  # Only one week of data = very seasonal

        # Store raw metrics for rank-based scoring (done in second pass)
        results[species_id] = {
            "difficultyScore": 0,  # placeholder, computed below
            "difficultyLabel": "",
            "metrics": {
                "spatialBreadth": round(spatial_breadth, 4),
                "avgFreq": round(avg_freq, 4),
                "seasonality": round(seasonality, 4),
                "numCells": num_cells,
            }
        }

    # Second pass: rank-based percentile scoring
    # Each metric is ranked across all species, then converted to 0-1 percentile
    species_ids = list(results.keys())
    n = len(species_ids)

    def rank_percentiles(values):
        """Convert raw values to 0-1 percentiles (higher value = higher percentile)."""
        indexed = sorted(enumerate(values), key=lambda x: x[1])
        percentiles = [0.0] * len(values)
        for rank, (idx, _) in enumerate(indexed):
            percentiles[idx] = rank / max(n - 1, 1)
        return percentiles

    # Spatial: more cells = easier → invert so rare = high percentile
    spatial_vals = [results[sid]["metrics"]["spatialBreadth"] for sid in species_ids]
    spatial_pct = rank_percentiles(spatial_vals)
    spatial_pct = [1 - p for p in spatial_pct]  # invert: rare = hard

    # Frequency: higher freq = easier → invert
    freq_vals = [results[sid]["metrics"]["avgFreq"] for sid in species_ids]
    freq_pct = rank_percentiles(freq_vals)
    freq_pct = [1 - p for p in freq_pct]  # invert: low freq = hard

    # Seasonality: higher = more seasonal = harder (no invert)
    season_vals = [results[sid]["metrics"]["seasonality"] for sid in species_ids]
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

    for sid, raw_score in combined:
        # Find which decile this score falls into (1-10)
        score_1_10 = 10
        for d in range(10):
            if raw_score < decile_thresholds[d + 1]:
                score_1_10 = d + 1
                break

        # Store 0-100 for granularity
        score_0_100 = round(raw_score * 100, 1)

        # Label from 1-10 scale
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
        results[sid]["difficultyRating"] = score_1_10  # 1-10 evenly distributed
        results[sid]["difficultyLabel"] = label

    # Distribution on 1-10 scale
    scale_dist = defaultdict(int)
    for r in results.values():
        s = max(1, min(10, round(r["difficultyScore"] / 10)))
        scale_dist[s] += 1
    print(f"\n1-10 scale distribution:")
    for i in range(1, 11):
        bar = "#" * (scale_dist.get(i, 0) // 5)
        print(f"  {i:2d}: {scale_dist.get(i, 0):4d} {bar}")

    # Distribution check
    dist = defaultdict(int)
    for r in results.values():
        dist[r["difficultyLabel"]] += 1
    print(f"\nDifficulty distribution:")
    for label in ["Easy", "Moderate", "Hard", "Very Hard", "Extremely Hard"]:
        print(f"  {label}: {dist.get(label, 0)}")

    # Save results
    output_path = REFERENCE_DIR / "difficulty_scores.json"
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved {len(results)} difficulty scores to {output_path}")

    return results


if __name__ == "__main__":
    compute_difficulty_scores()
