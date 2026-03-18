#!/usr/bin/env python3
"""
Process eBird Basic Dataset files into static JSON files for Find-A-Lifer.

Supports INCREMENTAL processing: processes new regions, saves intermediate
counts to an archive, and regenerates output from the combined data. This
lets you process regions in batches, delete the raw EBD files to free space,
then process more regions later.

Usage:
  python scripts/process_ebd.py                  # Process new EBD files + archived data
  python scripts/process_ebd.py --rebuild        # Rebuild output from archive only (no new files)
  python scripts/process_ebd.py --status         # Show what's archived and what's new

Archive format (data/archive/):
  - checklists_r{3,4,5}.json  — {cell_id: {week: count}} per resolution
  - detections_r{3,4,5}.json  — {taxon_id: {cell_id: {week: count}}} per resolution
  - species_meta.json         — species names, sci names, taxon order, families
  - processed_regions.json    — list of regions already processed
"""

import csv
import gzip
import io
import json
import math
import sys
import time
import argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path

csv.field_size_limit(10 * 1024 * 1024)

try:
    import h3
    HAS_H3 = True
except ImportError:
    HAS_H3 = False
    print("  Note: h3 not installed, using lat/lon grid (pip install h3)")

try:
    from shapely.geometry import Point, shape
    from shapely.ops import unary_union
    from shapely.prepared import prep
    import shapefile as shp
    HAS_SHAPELY = True
except ImportError:
    HAS_SHAPELY = False

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
TAXONOMY_FILE = SCRIPT_DIR / "reference" / "ebird_taxonomy.json"
LAND_SHAPEFILE = SCRIPT_DIR / "reference" / "ne_50m_land" / "ne_50m_land.shp"

RESOLUTIONS = [2, 3, 4]
MIN_DURATION = 30    # Minimum checklist duration (minutes)
MAX_DURATION = 300   # Maximum checklist duration (minutes) — allows hawk watches, Big Sits
MAX_DISTANCE = 8     # Maximum traveling distance (km) — fits within res 4 hex
PROTOCOLS = {"Stationary", "Traveling"}
MIN_CHECKLISTS = 5          # Minimum checklists for direct frequency estimate
MIN_CHECKLISTS_POOLED = 3   # Minimum after temporal pooling (±1 week)
# Per-resolution neighbor smoothing: res 2 = none, res 3 = none, res 4 = 1 ring
NEIGHBOR_SMOOTH_K = {2: 0, 3: 0, 4: 1}
NEIGHBOR_WEIGHTS = {0: 1.0, 1: 0.5}
ENSEMBLE_RUNS = 25          # Number of stixel ensemble passes
# Only res 4 gets ensemble — res 2/3 have enough data from natural H3 aggregation
ENSEMBLE_ENABLED = {2: False, 3: False, 4: True}
ENSEMBLE_BLOCK_K = {4: 1}  # Block radius (k-ring) — only res 4
# No downward fallback — each resolution stands on its own data
FALLBACK_ENABLED = {2: False, 3: False, 4: False}
FALLBACK_DISCOUNT = 0.7     # Kept for reference if fallback re-enabled
MIN_SMOOTHED_FREQ = 0.005   # Drop interpolated species below 0.5% frequency
# Bird families exempt from land-obligate ocean filter (always allowed in ocean cells)
OCEAN_FAMILIES = {
    "Albatrosses", "Auks, Murres, and Puffins", "Boobies and Gannets",
    "Cormorants and Shags", "Ducks, Geese, and Waterfowl", "Frigatebirds",
    "Grebes", "Gulls, Terns, and Skimmers", "Loons", "Northern Storm-Petrels",
    "Oystercatchers", "Pelicans", "Plovers and Lapwings", "Sandpipers and Allies",
    "Shearwaters and Petrels", "Skuas and Jaegers", "Southern Storm-Petrels",
    "Tropicbirds",
}
YEAR_MIN = 1900  # No lower bound — Historical protocol already excluded
YEAR_MAX = 2025

# Friendly names for region codes used in EBD filenames
REGION_NAMES = {
    "BM": "Bermuda", "BS": "Bahamas", "CA": "Canada",
    "CR": "Costa Rica", "CU": "Cuba", "DO": "Dominican Republic",
    "GL": "Greenland", "GT": "Guatemala", "HN": "Honduras",
    "HT": "Haiti", "JM": "Jamaica", "MX": "Mexico",
    "NI": "Nicaragua", "PA": "Panama", "PM": "Saint Pierre and Miquelon",
    "PR": "Puerto Rico", "SV": "El Salvador", "US": "United States",
}


def get_week(date_str):
    """Convert YYYY-MM-DD to week number (1-52)."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return min(52, max(1, math.ceil(d.timetuple().tm_yday / 7)))
    except:
        return None


def get_cell_ids(lat, lon, resolutions):
    """Get H3 cell IDs at multiple resolutions."""
    if HAS_H3:
        return {res: h3.latlng_to_cell(lat, lon, res) for res in resolutions}
    else:
        scales = {3: 2, 4: 4, 5: 8}
        result = {}
        for res in resolutions:
            s = scales.get(res, 4)
            lat_bin = round(lat * s) / s
            lon_bin = round(lon * s) / s
            result[res] = f"{lat_bin:.3f}_{lon_bin:.3f}_r{res}"
        return result


def load_land_polygon():
    """Load Natural Earth land polygon for ocean filtering.
    Returns a shapely PreparedGeometry for fast point-in-polygon tests.
    Applies a ~22km buffer to handle coastline imprecision (hex centers
    near coasts may fall slightly offshore in the low-res shapefile)."""
    if not HAS_SHAPELY:
        print("  WARNING: shapely/pyshp not installed — no land filtering")
        return None
    if not LAND_SHAPEFILE.exists():
        print(f"  WARNING: Land shapefile not found at {LAND_SHAPEFILE}")
        return None
    print("Loading land polygon...")
    sf = shp.Reader(str(LAND_SHAPEFILE))
    polygons = [shape(s.__geo_interface__) for s in sf.shapes()]
    land = unary_union(polygons)
    # Buffer by ~0.1 degrees (~11km) to account for low-res coastline
    # and hex centers that fall slightly offshore
    buffered = land.buffer(0.1)
    prepared = prep(buffered)
    print(f"  Land polygon loaded: {len(polygons)} features, buffered 0.1°")
    return prepared


def is_land(h3_cell, prepared_land):
    """Check if an H3 cell center falls on land."""
    if prepared_land is None:
        return True  # No land data = allow all
    lat, lng = h3.cell_to_latlng(h3_cell)
    return prepared_land.contains(Point(lng, lat))


def load_covariates(res):
    """Load pre-computed environmental covariates for a resolution.
    Returns dict: {h3_index: {trees, shrub, herb, cultivated, urban, water, flooded, elev_mean, elev_std}}"""
    path = ARCHIVE_DIR / f"cell_covariates_r{res}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def covariate_similarity(cov_a, cov_b):
    """Compute Gaussian similarity (0 to 1) between two covariate vectors.
    Higher = more similar habitat. Used to weight spatial pooling.

    Gaussian with k=4 gives steep dropoff for dissimilar habitats:
      same habitat: ~0.99, ocean↔coastal: ~0.35, ocean↔forest: ~0.006
    """
    if not cov_a or not cov_b:
        return 0.5  # neutral if covariates missing
    lc_keys = ["trees", "shrub", "herb", "cultivated", "urban", "water", "flooded"]
    diff_sq = sum((cov_a.get(k, 0) - cov_b.get(k, 0)) ** 2 for k in lc_keys)
    elev_diff = (cov_a.get("elev_mean", 0) - cov_b.get("elev_mean", 0)) / 1000.0
    diff_sq += elev_diff ** 2
    return math.exp(-diff_sq * 4.0)


import random

def run_stixel_ensemble(detections, cell_week_checklists, cell_covariates,
                        res, n_runs=ENSEMBLE_RUNS):
    """Run a simplified stixel ensemble to produce stabilized frequency estimates.

    For each run:
    1. Create random block groupings (random seed cell + k-ring neighbors)
    2. Pool checklists and detections within each block
    3. Compute block-level frequencies, weighted by covariate similarity
    4. Assign block frequencies to all cells in the block

    Final frequency = average across all runs.

    Returns: cell_week_species dict: {cell_id: {week: [(taxon_id, freq), ...]}}
             direct_cells set: cells that had direct detection data (for threshold exemption)
    """
    import random as _random

    block_k = ENSEMBLE_BLOCK_K.get(res, 1)
    all_data_cells = set()
    for sp_data in detections.values():
        all_data_cells.update(sp_data.keys())
    all_data_cells = list(all_data_cells)

    if not all_data_cells or not HAS_H3:
        return defaultdict(lambda: defaultdict(list)), set()

    # Track which cells have ANY direct detection (for threshold exemption)
    direct_detection_cells = set(all_data_cells)

    # Pre-compute neighbor maps for block formation
    # For each cell, find all cells within k-ring
    cell_neighbors = {}
    for cell in all_data_cells:
        try:
            disk = h3.grid_disk(cell, block_k)
            # Only include cells that have checklist data
            cell_neighbors[cell] = [c for c in disk if c in set(all_data_cells)]
        except Exception:
            cell_neighbors[cell] = [cell]

    # Accumulator: {cell_id: {week: {taxon_id: [freq_sum, count]}}}
    accum = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: [0.0, 0])))

    t0 = time.time()
    rng = _random.Random(42)  # deterministic for reproducibility

    for run in range(n_runs):
        # Shuffle cells to create random block assignments
        shuffled = list(all_data_cells)
        rng.shuffle(shuffled)
        assigned = set()

        # Greedily form blocks from unassigned cells
        blocks = []
        for seed in shuffled:
            if seed in assigned:
                continue
            block_cells = [c for c in cell_neighbors.get(seed, [seed]) if c not in assigned]
            if not block_cells:
                continue
            for c in block_cells:
                assigned.add(c)
            blocks.append(block_cells)

        # For each block, pool checklists and detections
        for block_cells in blocks:
            block_set = set(block_cells)

            # Pool checklists across block for each week
            block_checklists = defaultdict(int)
            for cell in block_cells:
                for week, count in cell_week_checklists.get(cell, {}).items():
                    block_checklists[week] += count

            # Pool detections across block for each species/week
            block_detections = defaultdict(lambda: defaultdict(int))
            for taxon_id, cell_data in detections.items():
                for cell in block_cells:
                    if cell in cell_data:
                        for week, count in cell_data[cell].items():
                            block_detections[taxon_id][week] += count

            # Compute block-level frequencies and assign to all cells in block
            for taxon_id, week_dets in block_detections.items():
                for week, det_count in week_dets.items():
                    total_cl = block_checklists.get(week, 0)
                    if total_cl < MIN_CHECKLISTS_POOLED:
                        continue
                    freq = det_count / total_cl

                    # Assign to each cell in block, weighted by covariate similarity
                    # to the cells where the species was actually detected
                    for cell in block_cells:
                        # Weight by covariate similarity if available
                        if cell_covariates:
                            cell_cov = cell_covariates.get(cell)
                            # Find similarity to detection cells in this block
                            det_cells = [c for c in block_cells
                                         if c in detections.get(taxon_id, {})
                                         and week in detections[taxon_id].get(c, {})]
                            if det_cells and cell_cov:
                                sim = max(covariate_similarity(
                                    cell_cov, cell_covariates.get(dc, {}))
                                    for dc in det_cells)
                            else:
                                sim = 1.0
                        else:
                            sim = 1.0

                        weighted_freq = freq * sim
                        acc = accum[cell][week][taxon_id]
                        acc[0] += weighted_freq
                        acc[1] += 1

    # Average across runs
    result = defaultdict(lambda: defaultdict(list))
    for cell_id, week_data in accum.items():
        for week, sp_data in week_data.items():
            for taxon_id, (freq_sum, count) in sp_data.items():
                avg_freq = freq_sum / count
                if avg_freq > 0:
                    result[cell_id][week].append((taxon_id, avg_freq))

    t1 = time.time()
    print(f"    Stixel ensemble: {n_runs} runs, {len(blocks)} blocks/run, "
          f"{len(result)} cells with data, {t1-t0:.1f}s")
    return result, direct_detection_cells


# ---- Archive save/load ----

def save_archive(cell_week_checklists_by_res, detections_by_res,
                 species_names, species_scinames, species_taxon_order,
                 species_family, species_regions, species_exotic_codes,
                 processed_regions):
    """Save intermediate counts to archive directory."""
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

    # Save checklist counts per resolution
    for res in RESOLUTIONS:
        data = {}
        for cell_id, weeks in cell_week_checklists_by_res[res].items():
            data[cell_id] = dict(weeks)
        with open(ARCHIVE_DIR / f"checklists_r{res}.json", "w") as f:
            json.dump(data, f, separators=(",", ":"))

    # Save detection counts per resolution
    for res in RESOLUTIONS:
        data = {}
        for taxon_id, cells in detections_by_res[res].items():
            data[taxon_id] = {}
            for cell_id, weeks in cells.items():
                data[taxon_id][cell_id] = dict(weeks)
        with open(ARCHIVE_DIR / f"detections_r{res}.json", "w") as f:
            json.dump(data, f, separators=(",", ":"))

    # Save species metadata
    meta = {
        "names": species_names,
        "scinames": species_scinames,
        "taxon_order": {k: v for k, v in species_taxon_order.items()},
        "family": species_family,
        "regions": {k: sorted(v) for k, v in species_regions.items()},
        "exotic_codes": {k: {r: sorted(codes) for r, codes in regions.items()}
                         for k, regions in species_exotic_codes.items()},
    }
    with open(ARCHIVE_DIR / f"species_meta.json", "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    # Save processed regions list
    with open(ARCHIVE_DIR / "processed_regions.json", "w") as f:
        json.dump(sorted(processed_regions), f, indent=2)

    total_size = sum(f.stat().st_size for f in ARCHIVE_DIR.glob("*.json"))
    print(f"\n  Archive saved: {len(processed_regions)} regions, {total_size / (1024*1024):.1f} MB")
    print(f"  Location: {ARCHIVE_DIR}")


def load_archive():
    """Load archived intermediate counts. Returns None if no archive exists."""
    regions_file = ARCHIVE_DIR / "processed_regions.json"
    if not regions_file.exists():
        return None

    print("\nLoading archive...")
    sys.stdout.flush()

    processed_regions = set(json.load(open(regions_file)))
    print(f"  Previously processed: {', '.join(sorted(processed_regions))}")

    cell_week_checklists_by_res = {res: defaultdict(lambda: defaultdict(int)) for res in RESOLUTIONS}
    detections_by_res = {res: defaultdict(lambda: defaultdict(lambda: defaultdict(int))) for res in RESOLUTIONS}

    for res in RESOLUTIONS:
        ck_file = ARCHIVE_DIR / f"checklists_r{res}.json"
        if ck_file.exists():
            data = json.load(open(ck_file))
            for cell_id, weeks in data.items():
                for week_str, count in weeks.items():
                    cell_week_checklists_by_res[res][cell_id][int(week_str)] += count
            print(f"  Loaded r{res} checklists: {len(data)} cells")

        det_file = ARCHIVE_DIR / f"detections_r{res}.json"
        if det_file.exists():
            data = json.load(open(det_file))
            for taxon_id, cells in data.items():
                for cell_id, weeks in cells.items():
                    for week_str, count in weeks.items():
                        detections_by_res[res][taxon_id][cell_id][int(week_str)] += count
            print(f"  Loaded r{res} detections: {len(data)} species")

    species_names = {}
    species_scinames = {}
    species_taxon_order = {}
    species_family = {}
    species_regions = defaultdict(set)
    species_exotic_codes = defaultdict(lambda: defaultdict(set))
    meta_file = ARCHIVE_DIR / "species_meta.json"
    if meta_file.exists():
        meta = json.load(open(meta_file))
        species_names = meta.get("names", {})
        species_scinames = meta.get("scinames", {})
        species_taxon_order = {k: float(v) for k, v in meta.get("taxon_order", {}).items()}
        species_family = meta.get("family", {})
        for k, v in meta.get("regions", {}).items():
            species_regions[k] = set(v)
        for k, regions in meta.get("exotic_codes", {}).items():
            for r, codes in regions.items():
                species_exotic_codes[k][r] = set(codes)
        print(f"  Loaded species metadata: {len(species_names)} species")
        if species_exotic_codes:
            print(f"  Loaded exotic codes for {len(species_exotic_codes)} species")

    return (cell_week_checklists_by_res, detections_by_res,
            species_names, species_scinames, species_taxon_order,
            species_family, species_regions, species_exotic_codes,
            processed_regions)


# ---- EBD file discovery ----

def open_maybe_gz(filepath):
    """Open a file, transparently handling .gz compression."""
    if str(filepath).endswith('.gz'):
        return io.TextIOWrapper(gzip.open(filepath, 'rb'), encoding='utf-8', errors='replace')
    return open(filepath, 'r', encoding='utf-8')


DOWNLOADS_DIR = DATA_DIR / "downloads"

def find_ebd_files(skip_regions=None):
    """Find all available EBD file pairs, optionally skipping already-processed regions.
    Supports both patterns:
      - ebd_US-ME_smp_relJan-2026.txt (state subsets with _smp_)
      - ebd_CA_relFeb-2026.txt (country-level without _smp_)
    Also supports .gz compressed files (streamed without full decompression).
    Searches both data/ and data/downloads/ directories.
    """
    skip = skip_regions or set()
    pairs = []
    found_regions = set()

    # Search in both data/ and data/downloads/
    search_dirs = [DATA_DIR, DOWNLOADS_DIR]

    # Pattern 1: ebd_{REGION}_smp_rel*.txt(.gz)
    for ext in ['txt', 'txt.gz']:
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for ebd_file in sorted(search_dir.glob(f"ebd_*_smp_rel*.{ext}")):
                if "_sampling" in ebd_file.name:
                    continue
                parts = ebd_file.name.split("_smp_")
                if len(parts) != 2:
                    continue
                region = parts[0].replace("ebd_", "")
                if region in found_regions:
                    continue

                if region in skip:
                    print(f"  Skipping {region} (already archived)")
                    found_regions.add(region)
                    continue

                # Look for sampling file with same extension
                base = ebd_file.name.replace(f".{ext}", f"_sampling.{ext}")
                sed_file = ebd_file.parent / base
                if not sed_file.exists() and ext == 'txt':
                    # Try .gz sampling file
                    sed_file = ebd_file.parent / f"{base}.gz"
                if sed_file.exists():
                    pairs.append((region, ebd_file, sed_file))
                    found_regions.add(region)
                else:
                    print(f"  WARNING: Found {ebd_file.name} but missing sampling file")

    # Pattern 2: ebd_{REGION}_rel*.txt(.gz) (no _smp_)
    for ext in ['txt', 'txt.gz']:
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            for ebd_file in sorted(search_dir.glob(f"ebd_*_rel*.{ext}")):
                if "_sampling" in ebd_file.name:
                    continue
                if "_smp_" in ebd_file.name:
                    continue  # Already handled by pattern 1

                # Extract region: ebd_CA_relFeb-2026.txt -> CA
                name = ebd_file.name
                if name.endswith('.gz'):
                    name = name[:-3]
                parts = name.replace("ebd_", "", 1).split("_rel")
                if len(parts) != 2:
                    continue
                region = parts[0]
                if region in found_regions:
                    continue

                if region in skip:
                    print(f"  Skipping {region} (already archived)")
                    found_regions.add(region)
                    continue

                # Look for sampling file
                sed_file = ebd_file.parent / ebd_file.name.replace(f".{ext}", f"_sampling.{ext}")
                if not sed_file.exists() and ext == 'txt':
                    sed_file = ebd_file.parent / f"{ebd_file.name}_sampling.gz"
                if sed_file.exists():
                    pairs.append((region, ebd_file, sed_file))
                    found_regions.add(region)
                else:
                    print(f"  WARNING: Found {ebd_file.name} but missing sampling file")

    return pairs


# ---- Processing functions (unchanged from original) ----

def process_sampling_file(sed_file, state, valid_checklists, cell_week_checklists_by_res):
    """Process a single sampling event file, computing cells at all resolutions.
    Returns (total_events, filter_stats) with detailed breakdown."""
    total_events = 0
    state_valid = 0
    filter_stats = {
        "no_date": 0, "year_range": 0, "protocol": 0, "incomplete": 0,
        "duration_short": 0, "duration_long": 0, "duration_missing": 0,
        "distance_long": 0,
        "no_coords": 0, "no_week": 0,
    }

    with open_maybe_gz(sed_file) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            total_events += 1

            obs_date = row.get("OBSERVATION DATE", "")
            if not obs_date:
                filter_stats["no_date"] += 1
                continue
            year = int(obs_date[:4])
            if year < YEAR_MIN or year > YEAR_MAX:
                filter_stats["year_range"] += 1
                continue

            protocol = row.get("PROTOCOL NAME", "")
            if protocol not in PROTOCOLS:
                filter_stats["protocol"] += 1
                continue

            all_species = row.get("ALL SPECIES REPORTED", "0")
            if all_species != "1":
                filter_stats["incomplete"] += 1
                continue

            duration = row.get("DURATION MINUTES", "")
            if duration:
                try:
                    dur_val = float(duration)
                    if dur_val < MIN_DURATION:
                        filter_stats["duration_short"] += 1
                        continue
                    if dur_val > MAX_DURATION:
                        filter_stats["duration_long"] += 1
                        continue
                except ValueError:
                    pass
            else:
                filter_stats["duration_missing"] += 1
                continue

            distance = row.get("EFFORT DISTANCE KM", "")
            if distance:
                try:
                    dist_val = float(distance)
                    if dist_val > MAX_DISTANCE:
                        filter_stats["distance_long"] += 1
                        continue
                except ValueError:
                    pass

            try:
                lat = float(row["LATITUDE"])
                lon = float(row["LONGITUDE"])
            except (KeyError, ValueError):
                filter_stats["no_coords"] += 1
                continue

            week = get_week(obs_date)
            if not week:
                filter_stats["no_week"] += 1
                continue

            cell_ids = get_cell_ids(lat, lon, RESOLUTIONS)

            sei = row.get("SAMPLING EVENT IDENTIFIER", "")
            if sei:
                valid_checklists[sei] = (lat, lon, week, cell_ids)
                for res, cell_id in cell_ids.items():
                    cell_week_checklists_by_res[res][cell_id][week] += 1
                state_valid += 1

            if total_events % 500000 == 0:
                print(f"    {state}: {total_events:,} events scanned, {state_valid:,} valid...")
                sys.stdout.flush()

    filtered_out = total_events - state_valid
    print(f"    {state}: {total_events:,} total, {filtered_out:,} filtered, {state_valid:,} valid")
    print(f"      Filter breakdown: {dict((k, v) for k, v in filter_stats.items() if v > 0)}")
    sys.stdout.flush()
    return total_events, filter_stats


def process_ebd_file(ebd_file, state, valid_checklists, cell_week_checklists_by_res,
                     detections_by_res, species_names, species_scinames,
                     species_taxon_order, species_family, species_regions,
                     species_exotic_codes):
    """Process a single EBD observations file, recording detections at all resolutions."""
    total_obs = 0
    matched_obs = 0

    with open_maybe_gz(ebd_file) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            total_obs += 1

            category = row.get("CATEGORY", "")
            if category != "species":
                continue

            sei = row.get("SAMPLING EVENT IDENTIFIER", "")
            if sei not in valid_checklists:
                continue

            common_name = row.get("COMMON NAME", "")
            if not common_name:
                continue
            sci_name = row.get("SCIENTIFIC NAME", "")
            taxon_id = row.get("TAXON CONCEPT ID", common_name)

            _, _, week, cell_ids = valid_checklists[sei]

            any_matched = False
            for res, cell_id in cell_ids.items():
                if cell_week_checklists_by_res[res][cell_id][week] >= MIN_CHECKLISTS:
                    detections_by_res[res][taxon_id][cell_id][week] += 1
                    any_matched = True

            if any_matched:
                matched_obs += 1

            if taxon_id not in species_names:
                species_names[taxon_id] = common_name
                species_scinames[taxon_id] = sci_name
                raw_order = row.get("TAXONOMIC ORDER", "")
                if raw_order:
                    try:
                        species_taxon_order[taxon_id] = float(raw_order)
                    except ValueError:
                        pass
                family = row.get("FAMILY NAME", "")
                if family:
                    species_family[taxon_id] = family

            # Track which region this species was detected in
            species_regions[taxon_id].add(state)

            # Track exotic/origin code per region
            exotic_code = row.get("EXOTIC CODE", "").strip()
            species_exotic_codes[taxon_id][state].add(exotic_code)

            if total_obs % 2000000 == 0:
                print(f"    {state}: {total_obs:,} obs, {matched_obs:,} matched, {len(species_names):,} species...")
                sys.stdout.flush()

    print(f"    {state}: {total_obs:,} total obs, {matched_obs:,} matched")
    sys.stdout.flush()
    return total_obs, matched_obs


# ---- Output generation ----

def write_resolution_data(res, detections, cell_week_checklists, species_names,
                          taxon_to_code, taxon_to_id, output_dir,
                          prepared_land=None, parent_res_data=None,
                          cell_covariates=None, taxon_to_family=None):
    """Write grid, weekly, and species-weeks data for one resolution.

    Pipeline phases:
    1. Temporal pooling (±1 week) for per-cell frequencies
    1.5. Stixel ensemble (25 runs) for stabilized block-averaged frequencies
    2. Neighbor smoothing (scale-dependent, land-filtered, covariate-weighted)
    2.5. Multi-resolution fallback from parent data
    3. Convert to output format, apply min frequency threshold on interpolated data

    Returns cell_week_species_raw dict for use as parent data by finer resolutions.
    """
    t0 = time.time()
    k = NEIGHBOR_SMOOTH_K.get(res, 0)
    res_dir = output_dir / f"r{res}"
    res_dir.mkdir(parents=True, exist_ok=True)
    (res_dir / "weeks").mkdir(exist_ok=True)
    (res_dir / "species-weeks").mkdir(exist_ok=True)

    for old_file in (res_dir / "species-weeks").glob("*.json"):
        try:
            old_file.unlink()
        except PermissionError:
            pass  # OneDrive may lock files; skip

    # Collect all cells that have ANY detection data (no hard ocean filter —
    # covariate similarity prevents land/ocean bleeding in the ensemble)
    all_cells_raw = set(
        cell_id for sp_data in detections.values()
        for cell_id in sp_data.keys()
    )
    all_cells = sorted(all_cells_raw)
    print(f"  {len(all_cells)} cells with detection data")

    # --- Phase 1: Compute frequencies with temporal pooling ---
    cell_week_species_raw = defaultdict(lambda: defaultdict(list))

    all_cells_set = set(all_cells)  # for O(1) lookup in Phase 1
    for taxon_id, cell_data in detections.items():
        for cell_id, week_detections in cell_data.items():
            if cell_id not in all_cells_set:
                continue
            cell_checklists = cell_week_checklists.get(cell_id, {})
            active_weeks = set(week_detections.keys())
            check_weeks = set()
            for w in active_weeks:
                check_weeks.add(w)
                check_weeks.add(w - 1 if w > 1 else 52)
                check_weeks.add(w + 1 if w < 52 else 1)

            for week in check_weeks:
                if week < 1 or week > 52:
                    continue
                n_det = week_detections.get(week, 0)
                n_total = cell_checklists.get(week, 0)

                if n_total >= MIN_CHECKLISTS:
                    freq = n_det / n_total
                    cell_week_species_raw[cell_id][week].append((taxon_id, freq))
                    continue

                pooled_det = n_det
                pooled_total = n_total
                for offset in [-1, 1]:
                    w2 = week + offset
                    if w2 < 1: w2 = 52
                    elif w2 > 52: w2 = 1
                    pooled_det += week_detections.get(w2, 0)
                    pooled_total += cell_checklists.get(w2, 0)

                if pooled_total >= MIN_CHECKLISTS_POOLED and pooled_det > 0:
                    freq = pooled_det / pooled_total
                    cell_week_species_raw[cell_id][week].append((taxon_id, freq))

    direct_cells = len(cell_week_species_raw)
    # Track which cells have direct detections (exempt from min freq threshold)
    direct_detection_cells = set(cell_week_species_raw.keys())
    t1 = time.time()
    print(f"\n  Resolution {res}: Phase 1 (temporal pooling): {direct_cells} cells, {t1-t0:.1f}s")
    sys.stdout.flush()

    # --- Phase 1.5: Stixel ensemble for stabilized frequencies (res 4 only) ---
    if HAS_H3 and ENSEMBLE_ENABLED.get(res, False) and ENSEMBLE_RUNS > 0:
        # Feed all cells with data into ensemble — covariate similarity
        # (Gaussian k=4) naturally prevents land/ocean bleeding
        ens_detections = {}
        for taxon_id, cell_data in detections.items():
            filtered = {c: w for c, w in cell_data.items() if c in all_cells_set}
            if filtered:
                ens_detections[taxon_id] = filtered
        ens_checklists = {c: w for c, w in cell_week_checklists.items() if c in all_cells_set}

        ensemble_result, _ = run_stixel_ensemble(
            ens_detections, ens_checklists, cell_covariates, res, ENSEMBLE_RUNS)

        # Merge ensemble results with direct estimates
        # 60% direct + 40% ensemble. Key fix: if a species wasn't detected in a cell
        # but the ensemble says it should be there, treat direct as 0.0 (not missing).
        # This prevents ensemble-only species from appearing at full weight.
        #
        # Well-sampled cells (enough checklists in temporal window) skip ensemble
        # entirely — their direct frequencies are already reliable. This prevents
        # land birds bleeding into ocean cells that have real pelagic survey data.
        ENSEMBLE_MIN_CHECKLISTS = 10  # Skip ensemble merge if cell has this many checklists
        merged = defaultdict(lambda: defaultdict(list))
        direct_cells_set = set(cell_week_species_raw.keys())
        skipped_well_sampled = 0

        for cell_id in direct_cells_set:
            direct = cell_week_species_raw.get(cell_id, {})
            ensemble = ensemble_result.get(cell_id, {})

            # Check if cell is well-sampled (total checklists across all weeks)
            cell_total_cl = sum(int(v) for v in cell_week_checklists.get(cell_id, {}).values())
            if cell_total_cl >= ENSEMBLE_MIN_CHECKLISTS:
                # Well-sampled: use direct frequencies only, skip ensemble
                for week, sp_list in direct.items():
                    merged[cell_id][week] = list(sp_list)
                skipped_well_sampled += 1
                continue

            # Only merge ensemble for weeks where the cell has direct data.
            # Don't let ensemble fabricate data for weeks with zero observations.
            for week in direct.keys():
                direct_sp = {tid: freq for tid, freq in direct.get(week, [])}
                ensemble_sp = {tid: freq for tid, freq in ensemble.get(week, [])}
                all_sp = set(direct_sp.keys()) | set(ensemble_sp.keys())

                for tid in all_sp:
                    d_freq = direct_sp.get(tid)
                    e_freq = ensemble_sp.get(tid)
                    if d_freq is not None and e_freq is not None:
                        # Both: weighted average
                        merged[cell_id][week].append((tid, d_freq * 0.6 + e_freq * 0.4))
                    elif d_freq is not None:
                        # Direct only (ensemble didn't produce it)
                        merged[cell_id][week].append((tid, d_freq))
                    else:
                        # Ensemble only: species not detected in cell but present in neighbors.
                        # Direct frequency is 0.0, not missing: merge = 0.0*0.6 + e*0.4
                        merged[cell_id][week].append((tid, e_freq * 0.4))

        print(f"    Ensemble merge: {skipped_well_sampled} well-sampled cells used direct only, "
              f"{len(direct_cells_set) - skipped_well_sampled} merged with ensemble")

        cell_week_species_raw = merged
        t15 = time.time()
        print(f"    Phase 1.5 (ensemble merge): {len(cell_week_species_raw)} cells, {t15-t1:.1f}s")
        sys.stdout.flush()

    # --- Phase 2: Neighbor smoothing (scale-dependent, land-filtered) ---
    smoothed_h3_cells = set()
    if HAS_H3 and k > 0:
        data_h3_cells = set(cell_week_species_raw.keys())
        seen_candidates = set()
        for h3_cell in data_h3_cells:
            try:
                disk = h3.grid_disk(h3_cell, k)
            except Exception:
                continue
            for n in disk:
                if n not in data_h3_cells and n not in seen_candidates:
                    seen_candidates.add(n)

        # Filter: only smooth into land cells that have no checklists
        # Ocean cells with no data should stay empty — don't fabricate data there
        before = len(seen_candidates)
        if prepared_land is not None:
            seen_candidates = {c for c in seen_candidates if is_land(c, prepared_land)}
        # Also exclude cells with high water covariate (catches ocean cells
        # that slip through the buffered land polygon)
        if cell_covariates:
            seen_candidates = {c for c in seen_candidates
                               if cell_covariates.get(c, {}).get('water', 1.0) < 0.9}
        print(f"    Phase 2: {before} candidates, {len(seen_candidates)} eligible for smoothing (k={k})")
        sys.stdout.flush()

        for empty_cell in seen_candidates:
            empty_cov = cell_covariates.get(empty_cell, {}) if cell_covariates else {}
            weighted_neighbors = []
            for k_ring in range(1, k + 1):
                try:
                    ring = h3.grid_ring(empty_cell, k_ring)
                except Exception:
                    continue
                spatial_weight = NEIGHBOR_WEIGHTS[k_ring]
                for n in ring:
                    if n in data_h3_cells:
                        # Combine spatial distance weight with covariate similarity
                        if cell_covariates and empty_cov:
                            cov_sim = covariate_similarity(
                                empty_cov, cell_covariates.get(n, {}))
                            weight = spatial_weight * cov_sim
                        else:
                            weight = spatial_weight
                        weighted_neighbors.append((n, weight))

            if not weighted_neighbors:
                continue

            neighbor_weeks = set()
            for ncell, _ in weighted_neighbors:
                neighbor_weeks.update(cell_week_species_raw[ncell].keys())

            has_any_week = False
            for week in neighbor_weeks:
                species_accum = defaultdict(lambda: [0.0, 0.0])
                for ncell, weight in weighted_neighbors:
                    for taxon_id, freq in cell_week_species_raw[ncell].get(week, []):
                        acc = species_accum[taxon_id]
                        acc[0] += freq * weight
                        acc[1] += weight

                if species_accum:
                    has_any_week = True
                    for taxon_id, (freq_sum, weight_sum) in species_accum.items():
                        cell_week_species_raw[empty_cell][week].append(
                            (taxon_id, freq_sum / weight_sum))

            if has_any_week:
                smoothed_h3_cells.add(empty_cell)

        t2 = time.time()
        print(f"    Phase 2 done: {len(smoothed_h3_cells)} smoothed cells, {t2-t1:.1f}s")
        sys.stdout.flush()
    elif k == 0:
        print(f"    Phase 2: skipped (k=0 for res {res})")
        t2 = time.time()

    # --- Phase 2.5: Multi-resolution fallback from parent (disabled) ---
    fallback_h3_cells = set()
    if parent_res_data and HAS_H3 and FALLBACK_ENABLED.get(res, False):
        parent_res = res - 1
        cells_with_data = set(cell_week_species_raw.keys())
        fallback_count = 0

        for parent_cell, parent_weeks in parent_res_data.items():
            try:
                children = h3.cell_to_children(parent_cell, res)
            except Exception:
                continue
            for child in children:
                if child in cells_with_data:
                    continue
                if prepared_land is not None and not is_land(child, prepared_land):
                    continue
                # Copy parent frequencies with discount
                for week, sp_list in parent_weeks.items():
                    for taxon_id, freq in sp_list:
                        cell_week_species_raw[child][week].append(
                            (taxon_id, freq * FALLBACK_DISCOUNT))
                fallback_h3_cells.add(child)
                fallback_count += 1

        t3 = time.time()
        print(f"    Phase 2.5 (fallback from r{parent_res}): {fallback_count} cells, {t3-t2:.1f}s")
        sys.stdout.flush()

    # Rebuild all_cells to include smoothed + fallback cells
    all_cells = sorted(set(cell_week_species_raw.keys()) | set(all_cells))
    cell_to_int = {c: i for i, c in enumerate(all_cells)}
    int_to_cell = {i: c for c, i in cell_to_int.items()}

    # --- Phase 3: Convert to output format ---
    # Apply minimum frequency threshold to interpolated data only
    # Direct detection cells are exempt — if a bird was seen there, it stays
    cell_week_species = defaultdict(lambda: defaultdict(list))
    species_week_cells = defaultdict(lambda: defaultdict(list))
    dropped_by_threshold = 0

    # Identify land-obligate species by their distribution across cells.
    # If a species occurs almost exclusively in low-water cells, it's a land bird
    # and should be filtered from ocean cells (incidental sightings from boats).
    # Exception: waterbird families (gulls, ducks, loons, etc.) are always ocean-allowed.
    land_species = set()
    if cell_covariates:
        species_water_scores = defaultdict(lambda: [0.0, 0])  # [sum_water, count]
        for cell_id, week_data in cell_week_species_raw.items():
            cell_water = cell_covariates.get(cell_id, {}).get('water', 0)
            species_in_cell = set()
            for week, sp_list in week_data.items():
                for taxon_id, freq in sp_list:
                    species_in_cell.add(taxon_id)
            for tid in species_in_cell:
                species_water_scores[tid][0] += cell_water
                species_water_scores[tid][1] += 1
        family_exempt = 0
        for tid, (water_sum, count) in species_water_scores.items():
            # Check family exemption first
            if taxon_to_family and taxon_to_family.get(tid, "") in OCEAN_FAMILIES:
                family_exempt += 1
                continue  # Waterbird family — always ocean-allowed
            avg_water = water_sum / count
            if avg_water < 0.3:  # Species found mostly in land cells
                land_species.add(tid)
        print(f"    Ocean filter: {len(land_species)} land-obligate species identified "
              f"({family_exempt} family-exempt, {len(species_water_scores)} total)")

    dropped_ocean = 0

    for cell_id, week_data in cell_week_species_raw.items():
        int_id = cell_to_int[cell_id]
        is_direct = cell_id in direct_detection_cells
        cell_water = cell_covariates.get(cell_id, {}).get('water', 0) if cell_covariates else 0
        is_ocean = cell_water >= 0.9
        for week, sp_list in week_data.items():
            for taxon_id, freq in sp_list:
                # Apply threshold only to non-direct cells
                if not is_direct and freq < MIN_SMOOTHED_FREQ:
                    dropped_by_threshold += 1
                    continue
                # Ocean cells: drop land-obligate species
                if is_ocean and taxon_id in land_species:
                    dropped_ocean += 1
                    continue
                freq_uint8 = max(1, min(255, round(freq * 255)))
                cell_week_species[int_id][week].append((taxon_id, freq_uint8))
                species_week_cells[taxon_id][week].append((int_id, freq_uint8))

    if dropped_by_threshold > 0:
        print(f"    Phase 3: dropped {dropped_by_threshold:,} sub-threshold entries from interpolated cells")
    if dropped_ocean > 0:
        print(f"    Phase 3: dropped {dropped_ocean:,} land-obligate species entries from ocean cells (water >= 0.9)")

    n_smoothed = len(smoothed_h3_cells)
    n_fallback = len(fallback_h3_cells)
    print(f"\n  Resolution {res}: {len(all_cells)} cells ({direct_cells} direct, {n_smoothed} smoothed, {n_fallback} fallback), {len(species_week_cells)} species")

    for week in range(1, 53):
        cells_out = []
        summary_out = []

        for int_id in sorted(cell_week_species.keys()):
            sp_list = cell_week_species[int_id].get(week, [])
            if not sp_list:
                continue
            species_ids = [taxon_to_id[tid] for tid, _ in sp_list]
            freqs = [freq for _, freq in sp_list]
            max_freq = max(freqs)
            h3_cell = int_to_cell[int_id]
            n_checklists = cell_week_checklists.get(h3_cell, {}).get(week, 0)
            cells_out.append([int_id, species_ids, freqs])
            summary_out.append([int_id, len(species_ids), max_freq, n_checklists])

        with open(res_dir / "weeks" / f"week_{week:02d}_cells.json", "w") as f:
            json.dump(cells_out, f, separators=(",", ":"))
        with open(res_dir / "weeks" / f"week_{week:02d}_summary.json", "w") as f:
            json.dump(summary_out, f, separators=(",", ":"))

    total_records = sum(
        sum(len(cell_week_species[int_id].get(w, [])) for int_id in cell_week_species)
        for w in range(1, 53)
    )
    print(f"    Weekly files: 52 weeks, {total_records:,} total species-cell records")

    for taxon_id, week_data in sorted(species_week_cells.items()):
        code = taxon_to_code.get(taxon_id)
        if not code:
            continue
        out = {}
        for week, cells in week_data.items():
            out[str(week)] = [[cid, freq] for cid, freq in cells]
        with open(res_dir / "species-weeks" / f"{code}.json", "w") as f:
            json.dump(out, f, separators=(",", ":"))

    print(f"    Species-weeks: {len(species_week_cells)} files")

    if HAS_H3:
        features = []
        for int_id, h3_cell in int_to_cell.items():
            boundary = h3.cell_to_boundary(h3_cell)
            coords = [[lon, lat] for lat, lon in boundary]
            coords.append(coords[0])
            center = h3.cell_to_latlng(h3_cell)
            props = {
                "cell_id": int_id,
                "h3_index": h3_cell,
                "center_lat": center[0],
                "center_lng": center[1],
            }
            if h3_cell in fallback_h3_cells:
                props["smoothed"] = 2
            elif h3_cell in smoothed_h3_cells:
                props["smoothed"] = 1
            features.append({
                "type": "Feature",
                "properties": props,
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
            })
        grid_geojson = {"type": "FeatureCollection", "features": features}
        with open(res_dir / "grid.geojson", "w") as f:
            json.dump(grid_geojson, f, separators=(",", ":"))
        print(f"    Grid: {len(features)} H3 cells")
    else:
        features = []
        for int_id, grid_key in int_to_cell.items():
            parts = grid_key.rsplit("_r", 1)
            lat, lon = map(float, parts[0].split("_"))
            scales = {3: 2, 4: 4, 5: 8}
            d = 0.5 / scales.get(res, 4)
            coords = [
                [lon - d, lat - d], [lon + d, lat - d],
                [lon + d, lat + d], [lon - d, lat + d],
                [lon - d, lat - d],
            ]
            features.append({
                "type": "Feature",
                "properties": {
                    "cell_id": int_id,
                    "center_lat": lat,
                    "center_lng": lon,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [coords],
                },
            })
        grid_geojson = {"type": "FeatureCollection", "features": features}
        with open(res_dir / "grid.geojson", "w") as f:
            json.dump(grid_geojson, f, separators=(",", ":"))
        print(f"    Grid: {len(features)} cells")

    # Return raw data for use as parent by finer resolutions
    return cell_week_species_raw


def generate_output(cell_week_checklists_by_res, detections_by_res,
                    species_names, species_scinames, species_taxon_order,
                    species_family, species_regions, processed_regions,
                    ebird_taxonomy, species_exotic_codes=None):
    """Generate all output files from accumulated data."""

    # Assign species codes
    print("\nAssigning species codes...")
    sys.stdout.flush()

    def make_species_code(common_name):
        words = common_name.replace("-", " ").replace("'", "").split()
        if len(words) == 1:
            return words[0][:6].lower()
        elif len(words) == 2:
            return (words[0][:3] + words[1][:3]).lower()
        elif len(words) == 3:
            return (words[0][:2] + words[1][:2] + words[2][:2]).lower()
        else:
            return (words[0][:2] + words[1][:1] + words[2][:1] + words[3][:2]).lower()

    taxon_to_code = {}
    taxon_to_id = {}
    used_codes = set()
    sp_id = 1
    taxonomy_matches = 0

    for taxon_id in sorted(species_names.keys()):
        sci_name = species_scinames.get(taxon_id, "")
        if sci_name in ebird_taxonomy:
            code = ebird_taxonomy[sci_name]["speciesCode"]
            taxonomy_matches += 1
        else:
            code = make_species_code(species_names[taxon_id])

        orig_code = code
        suffix = 1
        while code in used_codes:
            code = f"{orig_code}{suffix}"
            suffix += 1
        used_codes.add(code)
        taxon_to_code[taxon_id] = code
        taxon_to_id[taxon_id] = sp_id
        sp_id += 1

    print(f"  Species codes: {taxonomy_matches} from eBird taxonomy, {len(species_names) - taxonomy_matches} generated")

    # Load conservation status reference (from Wikidata/IUCN)
    CONSERVATION_FILE = Path(__file__).parent / "reference" / "conservation_status.json"
    conservation_map = {}
    if CONSERVATION_FILE.exists():
        with open(CONSERVATION_FILE) as f:
            conservation_map = json.load(f)
        print(f"\n  Loaded conservation status for {len(conservation_map)} species")
    else:
        print(f"\n  No conservation_status.json found — skipping conservation status")

    # Load species photo metadata (from Wikidata/Commons)
    PHOTOS_FILE = Path(__file__).parent / "reference" / "species_photos.json"
    photos_map = {}
    if PHOTOS_FILE.exists():
        with open(PHOTOS_FILE) as f:
            photos_map = json.load(f)
        print(f"  Loaded photo metadata for {len(photos_map)} species")
    else:
        print(f"  No species_photos.json found — skipping photo metadata")

    IUCN_CODE_TO_LABEL = {
        "LC": "Least Concern", "NT": "Near Threatened", "VU": "Vulnerable",
        "EN": "Endangered", "CR": "Critically Endangered", "EW": "Extinct in Wild",
        "EX": "Extinct", "DD": "Data Deficient",
    }

    # Exotic code → invasion status mapping
    # Priority for mixed codes in a region: N > P > X > ""
    EXOTIC_PRIORITY = {"N": 3, "P": 2, "X": 1, "": 0}
    EXOTIC_TO_STATUS = {"N": "Introduced", "P": "Vagrant/Accidental", "X": "Vagrant/Accidental", "": "Native"}

    if species_exotic_codes is None:
        species_exotic_codes = {}

    # Write species.json
    print("\nWriting shared species data...")
    sys.stdout.flush()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    conserv_matched = 0
    exotic_matched = 0
    photos_matched = 0
    species_list = []
    for taxon_id in sorted(species_names.keys()):
        sci_name = species_scinames.get(taxon_id, "")
        entry = {
            "species_id": taxon_to_id[taxon_id],
            "speciesCode": taxon_to_code[taxon_id],
            "comName": species_names[taxon_id],
            "sciName": sci_name,
            "taxonOrder": species_taxon_order.get(taxon_id, 99999),
            "regions": sorted(species_regions.get(taxon_id, set())),
        }
        if sci_name in ebird_taxonomy:
            entry["familyComName"] = ebird_taxonomy[sci_name]["familyComName"]
            if taxon_id not in species_taxon_order:
                entry["taxonOrder"] = ebird_taxonomy[sci_name]["taxonOrder"]
        elif taxon_id in species_family:
            entry["familyComName"] = species_family[taxon_id]

        # Conservation status
        iucn_code = conservation_map.get(sci_name)
        if iucn_code and iucn_code in IUCN_CODE_TO_LABEL:
            entry["conservStatus"] = IUCN_CODE_TO_LABEL[iucn_code]
            conserv_matched += 1
        else:
            entry["conservStatus"] = "Data Deficient"

        # Per-region invasion status
        if taxon_id in species_exotic_codes:
            invasion = {}
            for region, codes in species_exotic_codes[taxon_id].items():
                # Pick highest-priority exotic code for this region
                best_code = max(codes, key=lambda c: EXOTIC_PRIORITY.get(c, 0))
                invasion[region] = EXOTIC_TO_STATUS.get(best_code, "Native")
            if invasion:
                entry["invasionStatus"] = invasion
                exotic_matched += 1

        # Photo metadata (from Wikidata P18 + Wikimedia Commons)
        if sci_name in photos_map:
            photo = photos_map[sci_name]
            entry["photoUrl"] = photo.get("photoUrl", "")
            if photo.get("photoAttribution"):
                entry["photoAttribution"] = photo["photoAttribution"]
            if photo.get("photoLicense"):
                entry["photoLicense"] = photo["photoLicense"]
            photos_matched += 1

        species_list.append(entry)
    species_list.sort(key=lambda s: s["taxonOrder"])
    # Build region names for regions actually present in the data
    all_regions_in_data = set()
    for entry in species_list:
        all_regions_in_data.update(entry.get("regions", []))
    region_names_used = {r: REGION_NAMES.get(r, r) for r in sorted(all_regions_in_data)}
    species_json = {
        "regionNames": region_names_used,
        "species": species_list,
    }
    with open(OUTPUT_DIR / "species.json", "w") as f:
        json.dump(species_json, f, separators=(",", ":"))
    print(f"  species.json: {len(species_list)} species, {len(region_names_used)} regions")
    print(f"  Conservation status: {conserv_matched}/{len(species_list)} matched")
    print(f"  Invasion status: {exotic_matched}/{len(species_list)} with exotic data")
    print(f"  Photos: {photos_matched}/{len(species_list)} with photo metadata")

    families = set(s.get("familyComName", "") for s in species_list if s.get("familyComName"))
    print(f"  Families: {len(families)}")

    # Build taxon_id → family lookup for ocean filtering
    taxon_to_family = {}
    for taxon_id in species_names.keys():
        sci_name = species_scinames.get(taxon_id, "")
        if sci_name in ebird_taxonomy:
            taxon_to_family[taxon_id] = ebird_taxonomy[sci_name]["familyComName"]
        elif taxon_id in species_family:
            taxon_to_family[taxon_id] = species_family[taxon_id]

    # Write resolutions metadata
    res_meta = {
        "resolutions": RESOLUTIONS,
        "default": 3,
        "zoomThresholds": {
            "2": [0, 3.5],
            "3": [3.5, 5.5],
            "4": [5.5, 22]
        }
    }
    with open(OUTPUT_DIR / "resolutions.json", "w") as f:
        json.dump(res_meta, f, separators=(",", ":"))

    with open(OUTPUT_DIR / "regions.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

    # Load land polygon for ocean filtering
    prepared_land = load_land_polygon()

    # Load environmental covariates (pre-computed by extract_covariates.py)
    covariates_by_res = {}
    for res in RESOLUTIONS:
        cov = load_covariates(res)
        if cov:
            print(f"  Covariates loaded for r{res}: {len(cov)} cells")
        else:
            print(f"  No covariates for r{res} (run extract_covariates.py to enable)")
        covariates_by_res[res] = cov

    # Aggregate finer-resolution data upward to coarser resolutions that have no direct data
    # (e.g., res 2 from res 3 when archive was built without res 2)
    for i, res in enumerate(RESOLUTIONS):
        if len(detections_by_res[res]) > 0:
            continue  # Has direct data
        # Find the next finer resolution with data
        finer_res = None
        for j in range(i + 1, len(RESOLUTIONS)):
            if len(detections_by_res[RESOLUTIONS[j]]) > 0:
                finer_res = RESOLUTIONS[j]
                break
        if finer_res is None:
            continue
        print(f"\n  Aggregating r{finer_res} data upward to r{res}...")
        agg_detections = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
        agg_checklists = defaultdict(lambda: defaultdict(int))
        for taxon_id, cell_data in detections_by_res[finer_res].items():
            for cell_id, week_data in cell_data.items():
                parent_cell = h3.cell_to_parent(cell_id, res)
                for week, count in week_data.items():
                    agg_detections[taxon_id][parent_cell][week] += count
        for cell_id, week_data in cell_week_checklists_by_res[finer_res].items():
            parent_cell = h3.cell_to_parent(cell_id, res)
            for week, count in week_data.items():
                agg_checklists[parent_cell][week] += count
        detections_by_res[res] = agg_detections
        cell_week_checklists_by_res[res] = agg_checklists
        n_cells = len(set(c for sp in agg_detections.values() for c in sp.keys()))
        print(f"    Aggregated {n_cells} r{res} cells from r{finer_res} data")

    # Write per-resolution data (coarsest first for multi-res fallback)
    print("\nWriting per-resolution data...")
    sys.stdout.flush()

    prev_res_data = {}
    for res in RESOLUTIONS:
        parent_data = prev_res_data.get(res - 1)
        result = write_resolution_data(
            res, detections_by_res[res], cell_week_checklists_by_res[res],
            species_names, taxon_to_code, taxon_to_id, OUTPUT_DIR,
            prepared_land, parent_data, covariates_by_res.get(res, {}),
            taxon_to_family
        )
        prev_res_data[res] = result
        # Free memory from previous resolution's raw data
        if res - 1 in prev_res_data and res > RESOLUTIONS[0]:
            del prev_res_data[res - 1]

    # Backward-compatible copies at root level (res 4 = default)
    import shutil
    r4_dir = OUTPUT_DIR / "r4"
    if r4_dir.exists():
        shutil.copy2(r4_dir / "grid.geojson", OUTPUT_DIR / "grid.geojson")
        root_weeks = OUTPUT_DIR / "weeks"
        root_weeks.mkdir(exist_ok=True)
        for f in (r4_dir / "weeks").glob("*.json"):
            shutil.copy2(f, root_weeks / f.name)
        root_sw = OUTPUT_DIR / "species-weeks"
        root_sw.mkdir(exist_ok=True)
        for old in root_sw.glob("*.json"):
            try:
                old.unlink()
            except PermissionError:
                pass
        for f in (r4_dir / "species-weeks").glob("*.json"):
            shutil.copy2(f, root_sw / f.name)
        print("\n  Copied r4 data to root level for backward compatibility")


def load_taxonomy():
    """Load eBird taxonomy for species codes and family names."""
    ebird_taxonomy = {}
    if TAXONOMY_FILE.exists():
        print("Loading eBird taxonomy...")
        with open(TAXONOMY_FILE, "r", encoding="utf-8") as f:
            taxonomy_data = json.load(f)
        for entry in taxonomy_data:
            sci = entry.get("sciName", "")
            if sci and entry.get("category") == "species":
                ebird_taxonomy[sci] = {
                    "familyComName": entry.get("familyComName", ""),
                    "speciesCode": entry.get("speciesCode", ""),
                    "taxonOrder": entry.get("taxonOrder", 99999),
                }
        print(f"  eBird taxonomy loaded: {len(ebird_taxonomy)} species")
    else:
        print("  WARNING: eBird taxonomy file not found")
    return ebird_taxonomy


def main():
    parser = argparse.ArgumentParser(description="Process eBird EBD for Find-A-Lifer")
    parser.add_argument("--rebuild", action="store_true",
                        help="Rebuild output from archive only (no new EBD files)")
    parser.add_argument("--status", action="store_true",
                        help="Show archived regions and available new files")
    parser.add_argument("--clear-archive", action="store_true",
                        help="Delete existing archive before processing (for reprocessing with new filters)")
    parser.add_argument("--bbox", type=str, default=None,
                        help="Bounding box filter: 'lat_min,lon_min,lat_max,lon_max' (e.g. '42.5,-71,46,-66.5' for ME/NH/MA)")
    args = parser.parse_args()

    t0 = time.time()
    print("=" * 60)
    print("Find-A-Lifer EBD Pipeline (Incremental)")
    print(f"  Resolutions: {RESOLUTIONS}")
    print(f"  Effort filters: {MIN_DURATION}-{MAX_DURATION} min, 0-{MAX_DISTANCE} km")
    print("=" * 60)
    sys.stdout.flush()

    # Clear archive if requested
    if args.clear_archive:
        if ARCHIVE_DIR.exists():
            import shutil
            shutil.rmtree(ARCHIVE_DIR)
            print("\n  Archive cleared!")
        else:
            print("\n  No archive to clear.")

    # Load existing archive if present
    archive = load_archive()
    if archive:
        (cell_week_checklists_by_res, detections_by_res,
         species_names, species_scinames, species_taxon_order,
         species_family, species_regions, species_exotic_codes,
         processed_regions) = archive
    else:
        print("\nNo archive found — starting fresh")
        cell_week_checklists_by_res = {res: defaultdict(lambda: defaultdict(int)) for res in RESOLUTIONS}
        detections_by_res = {res: defaultdict(lambda: defaultdict(lambda: defaultdict(int))) for res in RESOLUTIONS}
        species_names = {}
        species_scinames = {}
        species_taxon_order = {}
        species_family = {}
        species_regions = defaultdict(set)
        species_exotic_codes = defaultdict(lambda: defaultdict(set))
        processed_regions = set()

    # Find new EBD files (skip already-processed regions)
    new_pairs = find_ebd_files(skip_regions=processed_regions)

    if args.status:
        print(f"\n{'=' * 60}")
        print(f"  Archived regions: {', '.join(sorted(processed_regions)) or '(none)'}")
        print(f"  New EBD files found: {len(new_pairs)}")
        for region, ebd, sed in new_pairs:
            ebd_size = ebd.stat().st_size / (1024**3)
            print(f"    {region}: {ebd_size:.1f} GB")
        for res in RESOLUTIONS:
            n_cells = len(cell_week_checklists_by_res[res])
            print(f"  Resolution {res}: {n_cells} cells (archived)")
        print(f"  Species: {len(species_names)} (archived)")
        return

    if args.rebuild:
        if not archive:
            print("ERROR: No archive to rebuild from")
            sys.exit(1)

        # Optional bounding box filter
        if args.bbox and HAS_H3:
            parts = [float(x) for x in args.bbox.split(",")]
            lat_min, lon_min, lat_max, lon_max = parts
            print(f"\nFiltering to bbox: lat [{lat_min}, {lat_max}], lon [{lon_min}, {lon_max}]")
            for res in RESOLUTIONS:
                # Filter checklists
                before_cl = len(cell_week_checklists_by_res[res])
                kept_cells = set()
                for cell_id in list(cell_week_checklists_by_res[res].keys()):
                    try:
                        lat, lng = h3.cell_to_latlng(cell_id)
                        if lat_min <= lat <= lat_max and lon_min <= lng <= lon_max:
                            kept_cells.add(cell_id)
                    except Exception:
                        pass
                # Remove cells outside bbox
                for cell_id in list(cell_week_checklists_by_res[res].keys()):
                    if cell_id not in kept_cells:
                        del cell_week_checklists_by_res[res][cell_id]
                # Filter detections
                for taxon_id in list(detections_by_res[res].keys()):
                    for cell_id in list(detections_by_res[res][taxon_id].keys()):
                        if cell_id not in kept_cells:
                            del detections_by_res[res][taxon_id][cell_id]
                    if not detections_by_res[res][taxon_id]:
                        del detections_by_res[res][taxon_id]
                after_cl = len(cell_week_checklists_by_res[res])
                print(f"  Res {res}: {before_cl} -> {after_cl} cells")

        print("\nRebuilding output from archive...")
        ebird_taxonomy = load_taxonomy()
        generate_output(cell_week_checklists_by_res, detections_by_res,
                        species_names, species_scinames, species_taxon_order,
                        species_family, species_regions, processed_regions,
                        ebird_taxonomy, species_exotic_codes)
        elapsed = time.time() - t0
        print(f"\n{'=' * 60}")
        print(f"  Rebuilt in {elapsed:.1f}s")
        print(f"  Regions: {', '.join(sorted(processed_regions))}")
        return

    if not new_pairs and not archive:
        print("ERROR: No EBD files found in", DATA_DIR)
        sys.exit(1)

    if not new_pairs:
        print("\nNo new EBD files to process. Use --rebuild to regenerate output.")
        print(f"  Archived regions: {', '.join(sorted(processed_regions))}")
        return

    # Show what we're processing
    new_regions = [s for s, _, _ in new_pairs]
    print(f"\nProcessing {len(new_pairs)} new regions: {', '.join(new_regions)}")
    for region, ebd, sed in new_pairs:
        ebd_size = ebd.stat().st_size / (1024**3)
        sed_size = sed.stat().st_size / (1024**3)
        print(f"  {region}: EBD={ebd_size:.1f}GB, sampling={sed_size:.2f}GB")
    sys.stdout.flush()

    ebird_taxonomy = load_taxonomy()

    # --- Process sampling events ---
    print(f"\n[1/4] Reading sampling events from {len(new_pairs)} new regions...")
    sys.stdout.flush()

    valid_checklists = {}
    grand_total_events = 0
    grand_filter_stats = defaultdict(int)

    for region, _, sed_file in new_pairs:
        print(f"\n  Processing {region} sampling events...")
        sys.stdout.flush()
        total, fstats = process_sampling_file(sed_file, region, valid_checklists, cell_week_checklists_by_res)
        grand_total_events += total
        for k, v in fstats.items():
            grand_filter_stats[k] += v

    total_filtered = sum(grand_filter_stats.values())
    print(f"\n  New events: {grand_total_events:,}")
    print(f"  New valid checklists: {len(valid_checklists):,}")
    print(f"  Total filtered: {total_filtered:,} ({100*total_filtered/max(1,grand_total_events):.1f}%)")
    print(f"  Filter breakdown:")
    for reason, count in sorted(grand_filter_stats.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"    {reason}: {count:,} ({100*count/max(1,grand_total_events):.1f}%)")
    for res in RESOLUTIONS:
        print(f"  Resolution {res}: {len(cell_week_checklists_by_res[res]):,} total cells")
    sys.stdout.flush()

    # --- Process observations ---
    print(f"\n[2/4] Reading observations from {len(new_pairs)} new regions...")
    sys.stdout.flush()

    grand_total_obs = 0
    grand_matched_obs = 0

    for region, ebd_file, _ in new_pairs:
        print(f"\n  Processing {region} observations...")
        sys.stdout.flush()
        total, matched = process_ebd_file(
            ebd_file, region, valid_checklists, cell_week_checklists_by_res,
            detections_by_res, species_names, species_scinames,
            species_taxon_order, species_family, species_regions,
            species_exotic_codes
        )
        grand_total_obs += total
        grand_matched_obs += matched

    print(f"\n  New observations: {grand_total_obs:,}, matched: {grand_matched_obs:,}")
    print(f"  Total species: {len(species_names)}")
    sys.stdout.flush()

    # Update processed regions
    processed_regions.update(new_regions)

    # --- Save archive ---
    print(f"\n[3/4] Saving archive...")
    sys.stdout.flush()
    save_archive(cell_week_checklists_by_res, detections_by_res,
                 species_names, species_scinames, species_taxon_order,
                 species_family, species_regions, species_exotic_codes,
                 processed_regions)

    # Save cumulative filter stats
    existing_stats = {}
    stats_file = ARCHIVE_DIR / "filter_stats.json"
    if stats_file.exists():
        existing_stats = json.load(open(stats_file))
    cum_stats = existing_stats.get("cumulative", {})
    for k, v in grand_filter_stats.items():
        cum_stats[k] = cum_stats.get(k, 0) + v
    cum_total = existing_stats.get("total_events", 0) + grand_total_events
    cum_valid = existing_stats.get("total_valid", 0) + len(valid_checklists)
    with open(stats_file, "w") as f:
        json.dump({
            "config": {"min_duration": MIN_DURATION, "max_duration": MAX_DURATION,
                       "max_distance": MAX_DISTANCE},
            "cumulative": cum_stats,
            "total_events": cum_total,
            "total_valid": cum_valid,
        }, f, indent=2)
    print(f"  Filter stats saved ({cum_valid:,}/{cum_total:,} valid across all runs)")

    # Free memory from valid_checklists (large!)
    del valid_checklists

    # --- Generate output ---
    print(f"\n[4/4] Generating output...")
    sys.stdout.flush()
    generate_output(cell_week_checklists_by_res, detections_by_res,
                    species_names, species_scinames, species_taxon_order,
                    species_family, species_regions, processed_regions,
                    ebird_taxonomy, species_exotic_codes)

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"  Completed in {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"  Regions: {', '.join(sorted(processed_regions))}")
    print(f"  {len(species_names)} species, 52 weeks")
    for res in RESOLUTIONS:
        n_cells = len(cell_week_checklists_by_res[res])
        print(f"  Resolution {res}: {n_cells} cells")
    print(f"  Output: {OUTPUT_DIR}")
    print(f"  Archive: {ARCHIVE_DIR}")
    print(f"\n  You can now safely delete the raw EBD .txt files to free space!")
    print(f"  The archive preserves all processed data for future incremental runs.")


if __name__ == "__main__":
    main()
