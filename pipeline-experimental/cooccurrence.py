#!/usr/bin/env python3
"""
Species Co-occurrence Analysis for Find-A-Lifer

Computes pairwise co-occurrence rates from checklist data to correct
the combined lifer probability formula for non-independence.

Current formula (assumes independence):
    P(at least one lifer) = 1 - prod(1 - freq_i)

This overestimates because species co-occur. If finding GBBG implies
finding AMHG, they shouldn't be counted as independent opportunities.

Approach:
    1. Build pairwise co-occurrence matrix from checklist data
    2. Identify species clusters (groups that always appear together)
    3. Compute corrected P(lifer) using group-level probabilities
    4. Compare corrected vs. independent estimates

Usage:
    python pipeline-experimental/cooccurrence.py --region US-ME
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(PROJECT_DIR / "pipeline"))


def build_cooccurrence_matrix(checklists_by_cell_week, species_list):
    """Build pairwise co-occurrence matrix from checklist-level data.

    Args:
        checklists_by_cell_week: {(cell_id, week): set of species_codes}
        species_list: list of all species codes to include

    Returns:
        cooccurrence: (N, N) matrix where [i,j] = P(j present | i present)
        species_index: {species_code: index}
    """
    species_index = {sp: i for i, sp in enumerate(species_list)}
    N = len(species_list)

    # Count co-occurrences
    pair_count = np.zeros((N, N), dtype=np.int32)
    solo_count = np.zeros(N, dtype=np.int32)

    for key, species_set in checklists_by_cell_week.items():
        indices = [species_index[sp] for sp in species_set if sp in species_index]
        for i in indices:
            solo_count[i] += 1
            for j in indices:
                if i != j:
                    pair_count[i][j] += 1

    # Conditional probability: P(j | i) = count(i AND j) / count(i)
    cooccurrence = np.zeros((N, N), dtype=np.float32)
    for i in range(N):
        if solo_count[i] > 0:
            for j in range(N):
                cooccurrence[i][j] = pair_count[i][j] / solo_count[i]

    return cooccurrence, species_index


def find_species_clusters(cooccurrence, species_list, threshold=0.8):
    """Find clusters of species that almost always co-occur.

    Args:
        cooccurrence: (N, N) conditional probability matrix
        species_list: list of species codes
        threshold: minimum P(j|i) AND P(i|j) to be considered a cluster

    Returns:
        clusters: list of sets of species codes
        cluster_map: {species_code: cluster_index}
    """
    N = len(species_list)
    visited = set()
    clusters = []

    for i in range(N):
        if i in visited:
            continue

        # Find all species that co-occur with i above threshold (bidirectional)
        cluster = {i}
        queue = [i]

        while queue:
            current = queue.pop(0)
            for j in range(N):
                if j in visited or j in cluster:
                    continue
                # Both directions must exceed threshold
                if cooccurrence[current][j] >= threshold and cooccurrence[j][current] >= threshold:
                    cluster.add(j)
                    queue.append(j)

        visited.update(cluster)

        if len(cluster) > 1:
            clusters.append({species_list[idx] for idx in cluster})

    # Build reverse map
    cluster_map = {}
    for ci, cluster in enumerate(clusters):
        for sp in cluster:
            cluster_map[sp] = ci

    return clusters, cluster_map


def corrected_lifer_probability(species_freqs, clusters, cluster_map):
    """Compute P(at least one lifer) correcting for co-occurrence.

    Instead of treating each species independently, we treat each
    co-occurrence cluster as a single unit. The probability of seeing
    "at least one from cluster k" replaces the independent per-species
    probabilities.

    Args:
        species_freqs: {species_code: frequency}
        clusters: list of sets of species codes
        cluster_map: {species_code: cluster_index}

    Returns:
        p_independent: P(lifer) assuming independence
        p_corrected: P(lifer) accounting for co-occurrence
        effective_species: number of effective independent units
    """
    # Independent calculation
    p_miss_all_independent = 1.0
    for sp, freq in species_freqs.items():
        p_miss_all_independent *= (1 - freq)
    p_independent = 1 - p_miss_all_independent

    # Corrected calculation: group clustered species
    processed_clusters = set()
    p_miss_all_corrected = 1.0
    effective_count = 0

    for sp, freq in species_freqs.items():
        if sp in cluster_map:
            ci = cluster_map[sp]
            if ci in processed_clusters:
                continue
            processed_clusters.add(ci)

            # P(miss entire cluster) = P(miss all species in cluster)
            # But since they co-occur, we use the MAX frequency in the cluster
            # (seeing the most common one likely means seeing the others)
            cluster_species = clusters[ci]
            cluster_freqs = [species_freqs.get(s, 0) for s in cluster_species
                           if s in species_freqs]
            if cluster_freqs:
                # Use max freq as the "group detection probability"
                # This is conservative: the group is at least as detectable
                # as its most common member
                p_detect_group = max(cluster_freqs)
                p_miss_all_corrected *= (1 - p_detect_group)
                effective_count += 1
        else:
            # Not in any cluster — treat independently
            p_miss_all_corrected *= (1 - freq)
            effective_count += 1

    p_corrected = 1 - p_miss_all_corrected

    return p_independent, p_corrected, effective_count


def run_cooccurrence_analysis(region="US-ME"):
    """Run co-occurrence analysis using archive data.

    Args:
        region: region code to analyze
    """
    from common import ARCHIVE_DIR, load_json

    print(f"\nSpecies Co-occurrence Analysis — {region}")
    print("=" * 60)

    # Load archive data
    det_path = ARCHIVE_DIR / "detections_r4.json"
    cl_path = ARCHIVE_DIR / "checklists_r4.json"
    states_path = ARCHIVE_DIR / "cell_states_r4.json"
    meta_path = ARCHIVE_DIR / "species_meta.json"

    print("Loading archive data...")
    checklists = load_json(cl_path)
    cell_states = load_json(states_path)
    species_meta = load_json(meta_path)
    detections = load_json(det_path)

    # Map species IDs to codes
    id_to_code = {}
    for sp in species_meta:
        if isinstance(sp, dict):
            id_to_code[str(sp.get("species_id", ""))] = sp.get("speciesCode", "")

    # Find cells in region
    region_cells = set(c for c, s in cell_states.items() if s == region)
    print(f"Region {region}: {len(region_cells)} cells")

    # Build checklist-level species sets
    # Archive format: detections = {taxon_id: {cell_id: {week: count}}}
    # We need: {(cell_id, week): set of species_codes}
    cell_week_species = defaultdict(set)

    for taxon_id, cells_data in detections.items():
        sp_code = id_to_code.get(taxon_id, taxon_id)
        for cell_id, weeks_data in cells_data.items():
            if cell_id not in region_cells:
                continue
            for week, count in weeks_data.items():
                if count > 0:
                    cell_week_species[(cell_id, week)].add(sp_code)

    print(f"Cell-week combinations with data: {len(cell_week_species):,}")

    # Get species list (only those present in region)
    all_species = set()
    for species_set in cell_week_species.values():
        all_species.update(species_set)
    species_list = sorted(all_species)
    print(f"Species in region: {len(species_list)}")

    # Build co-occurrence matrix
    print("Computing co-occurrence matrix...")
    cooccurrence, species_index = build_cooccurrence_matrix(cell_week_species, species_list)

    # Find clusters
    print("Finding species clusters (threshold=0.8)...")
    clusters, cluster_map = find_species_clusters(cooccurrence, species_list, threshold=0.8)

    print(f"\nClusters found: {len(clusters)}")
    for i, cluster in enumerate(clusters[:20]):
        print(f"  Cluster {i+1} ({len(cluster)} species): {', '.join(sorted(cluster)[:5])}"
              + (f"... +{len(cluster)-5} more" if len(cluster) > 5 else ""))

    # Compute corrected probabilities for sample cells
    print(f"\nComparing independent vs corrected P(lifer) for sample cells:")
    print(f"{'Cell':<10} {'Species':<8} {'Effective':<10} {'P(indep)':<10} {'P(corrected)':<12} {'Overestimate'}")
    print("-" * 70)

    overestimates = []

    for (cell_id, week), species_set in sorted(cell_week_species.items())[:100]:
        if len(species_set) < 10:
            continue

        # Simulate frequencies (use detection rate within region as proxy)
        species_freqs = {}
        for sp in species_set:
            # Count how many cell-weeks this species appears in
            sp_idx = species_index.get(sp)
            if sp_idx is not None:
                # Simple frequency: fraction of cell-weeks where detected
                sp_count = sum(1 for ss in cell_week_species.values() if sp in ss)
                species_freqs[sp] = sp_count / len(cell_week_species)

        if len(species_freqs) < 5:
            continue

        p_indep, p_corrected, effective = corrected_lifer_probability(
            species_freqs, clusters, cluster_map
        )

        overestimate = p_indep - p_corrected
        overestimates.append(overestimate)

        print(f"{cell_id[:8]:<10} {len(species_freqs):<8} {effective:<10} "
              f"{p_indep:<10.4f} {p_corrected:<12.4f} {overestimate:+.4f}")

    if overestimates:
        print(f"\nMean overestimate (independence assumption): {np.mean(overestimates):+.4f}")
        print(f"Max overestimate: {max(overestimates):+.4f}")
        print(f"Species in clusters: {len(cluster_map)} / {len(species_list)}")
        print(f"Effective species ratio: {1 - len(cluster_map)/len(species_list):.1%} are independent")

    # Save results
    output_path = SCRIPT_DIR / "results" / "cooccurrence_results.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    results = {
        "region": region,
        "total_species": len(species_list),
        "species_in_clusters": len(cluster_map),
        "num_clusters": len(clusters),
        "clusters": [sorted(list(c)) for c in clusters],
        "mean_overestimate": float(np.mean(overestimates)) if overestimates else 0,
        "max_overestimate": float(max(overestimates)) if overestimates else 0,
    }

    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to: {output_path}")

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default="US-ME")
    args = parser.parse_args()
    run_cooccurrence_analysis(args.region)
