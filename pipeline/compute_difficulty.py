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

        # Combine into difficulty score (0-100)
        # Lower spatial breadth, lower avg freq, higher seasonality = harder
        spatial_score = 1 - spatial_breadth  # 0 = everywhere, 1 = one cell
        freq_score = 1 - min(avg_freq, 1.0)  # 0 = always found, 1 = never
        season_score = seasonality  # 0 = year-round, 1 = very narrow window

        # Weighted combination
        raw_score = (
            0.40 * spatial_score +
            0.40 * freq_score +
            0.20 * season_score
        )

        # Scale to 0-100
        difficulty_score = round(raw_score * 100, 1)

        # Map to labels
        if difficulty_score < 20:
            label = "Easy"
        elif difficulty_score < 40:
            label = "Moderate"
        elif difficulty_score < 60:
            label = "Hard"
        elif difficulty_score < 80:
            label = "Very Hard"
        else:
            label = "Extremely Hard"

        results[species_id] = {
            "difficultyScore": difficulty_score,
            "difficultyLabel": label,
            "metrics": {
                "spatialBreadth": round(spatial_breadth, 4),
                "avgFreq": round(avg_freq, 4),
                "seasonality": round(seasonality, 4),
                "numCells": num_cells,
            }
        }

    # Percentile-based labeling for better distribution
    raw_scores = sorted(r["difficultyScore"] for r in results.values())
    n = len(raw_scores)
    p20 = raw_scores[int(n * 0.20)]
    p45 = raw_scores[int(n * 0.45)]
    p70 = raw_scores[int(n * 0.70)]
    p90 = raw_scores[int(n * 0.90)]
    print(f"\nPercentile thresholds: P20={p20}, P45={p45}, P70={p70}, P90={p90}")

    # Re-label using percentile thresholds
    for r in results.values():
        s = r["difficultyScore"]
        if s <= p20:
            r["difficultyLabel"] = "Easy"
        elif s <= p45:
            r["difficultyLabel"] = "Moderate"
        elif s <= p70:
            r["difficultyLabel"] = "Hard"
        elif s <= p90:
            r["difficultyLabel"] = "Very Hard"
        else:
            r["difficultyLabel"] = "Extremely Hard"

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
