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

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data"
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = DATA_DIR / "archive"
TAXONOMY_FILE = SCRIPT_DIR / "reference" / "ebird_taxonomy.json"

RESOLUTIONS = [3, 4, 5]
MAX_DURATION = 360
MAX_DISTANCE = 10
PROTOCOLS = {"Stationary", "Traveling"}
MIN_CHECKLISTS = 3
YEAR_MIN = 2006
YEAR_MAX = 2025


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


# ---- Archive save/load ----

def save_archive(cell_week_checklists_by_res, detections_by_res,
                 species_names, species_scinames, species_taxon_order,
                 species_family, processed_regions):
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
    meta_file = ARCHIVE_DIR / "species_meta.json"
    if meta_file.exists():
        meta = json.load(open(meta_file))
        species_names = meta.get("names", {})
        species_scinames = meta.get("scinames", {})
        species_taxon_order = {k: float(v) for k, v in meta.get("taxon_order", {}).items()}
        species_family = meta.get("family", {})
        print(f"  Loaded species metadata: {len(species_names)} species")

    return (cell_week_checklists_by_res, detections_by_res,
            species_names, species_scinames, species_taxon_order,
            species_family, processed_regions)


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
    """Process a single sampling event file, computing cells at all resolutions."""
    total_events = 0
    filtered_out = 0
    state_valid = 0

    with open_maybe_gz(sed_file) as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            total_events += 1

            obs_date = row.get("OBSERVATION DATE", "")
            if not obs_date:
                filtered_out += 1
                continue
            year = int(obs_date[:4])
            if year < YEAR_MIN or year > YEAR_MAX:
                filtered_out += 1
                continue

            protocol = row.get("PROTOCOL NAME", "")
            if protocol not in PROTOCOLS:
                filtered_out += 1
                continue

            all_species = row.get("ALL SPECIES REPORTED", "0")
            if all_species != "1":
                filtered_out += 1
                continue

            duration = row.get("DURATION MINUTES", "")
            if duration:
                try:
                    if float(duration) > MAX_DURATION:
                        filtered_out += 1
                        continue
                except ValueError:
                    pass

            distance = row.get("EFFORT DISTANCE KM", "")
            if distance:
                try:
                    if float(distance) > MAX_DISTANCE:
                        filtered_out += 1
                        continue
                except ValueError:
                    pass

            try:
                lat = float(row["LATITUDE"])
                lon = float(row["LONGITUDE"])
            except (KeyError, ValueError):
                filtered_out += 1
                continue

            week = get_week(obs_date)
            if not week:
                filtered_out += 1
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

    print(f"    {state}: {total_events:,} total, {filtered_out:,} filtered, {state_valid:,} valid")
    sys.stdout.flush()
    return total_events, filtered_out


def process_ebd_file(ebd_file, state, valid_checklists, cell_week_checklists_by_res,
                     detections_by_res, species_names, species_scinames,
                     species_taxon_order, species_family):
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

            if total_obs % 2000000 == 0:
                print(f"    {state}: {total_obs:,} obs, {matched_obs:,} matched, {len(species_names):,} species...")
                sys.stdout.flush()

    print(f"    {state}: {total_obs:,} total obs, {matched_obs:,} matched")
    sys.stdout.flush()
    return total_obs, matched_obs


# ---- Output generation ----

def write_resolution_data(res, detections, cell_week_checklists, species_names,
                          taxon_to_code, taxon_to_id, output_dir):
    """Write grid, weekly, and species-weeks data for one resolution."""
    res_dir = output_dir / f"r{res}"
    res_dir.mkdir(parents=True, exist_ok=True)
    (res_dir / "weeks").mkdir(exist_ok=True)
    (res_dir / "species-weeks").mkdir(exist_ok=True)

    for old_file in (res_dir / "species-weeks").glob("*.json"):
        old_file.unlink()

    cell_week_species = defaultdict(lambda: defaultdict(list))
    species_week_cells = defaultdict(lambda: defaultdict(list))

    all_cells = sorted(set(
        cell_id for sp_data in detections.values()
        for cell_id in sp_data.keys()
    ))
    cell_to_int = {c: i for i, c in enumerate(all_cells)}
    int_to_cell = {i: c for c, i in cell_to_int.items()}

    for taxon_id, cell_data in detections.items():
        for cell_id, week_data in cell_data.items():
            int_id = cell_to_int[cell_id]
            for week, n_detected in week_data.items():
                n_total = cell_week_checklists[cell_id][week]
                if n_total < MIN_CHECKLISTS:
                    continue
                freq = n_detected / n_total
                freq_uint8 = max(1, min(255, round(freq * 255)))
                cell_week_species[int_id][week].append((taxon_id, freq_uint8))
                species_week_cells[taxon_id][week].append((int_id, freq_uint8))

    print(f"\n  Resolution {res}: {len(all_cells)} cells, {len(species_week_cells)} species")

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
            n_checklists = cell_week_checklists[h3_cell][week]
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
            features.append({
                "type": "Feature",
                "properties": {
                    "cell_id": int_id,
                    "h3_index": h3_cell,
                    "center_lat": center[0],
                    "center_lng": center[1],
                },
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

    return len(all_cells), len(species_week_cells)


def generate_output(cell_week_checklists_by_res, detections_by_res,
                    species_names, species_scinames, species_taxon_order,
                    species_family, processed_regions, ebird_taxonomy):
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

    # Write species.json
    print("\nWriting shared species data...")
    sys.stdout.flush()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    species_list = []
    for taxon_id in sorted(species_names.keys()):
        sci_name = species_scinames.get(taxon_id, "")
        entry = {
            "species_id": taxon_to_id[taxon_id],
            "speciesCode": taxon_to_code[taxon_id],
            "comName": species_names[taxon_id],
            "sciName": sci_name,
            "taxonOrder": species_taxon_order.get(taxon_id, 99999),
        }
        if sci_name in ebird_taxonomy:
            entry["familyComName"] = ebird_taxonomy[sci_name]["familyComName"]
            if taxon_id not in species_taxon_order:
                entry["taxonOrder"] = ebird_taxonomy[sci_name]["taxonOrder"]
        elif taxon_id in species_family:
            entry["familyComName"] = species_family[taxon_id]
        species_list.append(entry)
    species_list.sort(key=lambda s: s["taxonOrder"])
    with open(OUTPUT_DIR / "species.json", "w") as f:
        json.dump(species_list, f, separators=(",", ":"))
    print(f"  species.json: {len(species_list)} species")

    families = set(s.get("familyComName", "") for s in species_list if s.get("familyComName"))
    print(f"  Families: {len(families)}")

    # Write resolutions metadata
    res_meta = {
        "resolutions": RESOLUTIONS,
        "default": 4,
        "zoomThresholds": {
            "3": [0, 6.5],
            "4": [6.5, 8.5],
            "5": [8.5, 22]
        }
    }
    with open(OUTPUT_DIR / "resolutions.json", "w") as f:
        json.dump(res_meta, f, separators=(",", ":"))

    with open(OUTPUT_DIR / "regions.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

    # Write per-resolution data
    print("\nWriting per-resolution data...")
    sys.stdout.flush()

    for res in RESOLUTIONS:
        write_resolution_data(
            res, detections_by_res[res], cell_week_checklists_by_res[res],
            species_names, taxon_to_code, taxon_to_id, OUTPUT_DIR
        )

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
            old.unlink()
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
    args = parser.parse_args()

    t0 = time.time()
    print("=" * 60)
    print("Find-A-Lifer EBD Pipeline (Incremental)")
    print(f"  Resolutions: {RESOLUTIONS}")
    print("=" * 60)
    sys.stdout.flush()

    # Load existing archive if present
    archive = load_archive()
    if archive:
        (cell_week_checklists_by_res, detections_by_res,
         species_names, species_scinames, species_taxon_order,
         species_family, processed_regions) = archive
    else:
        print("\nNo archive found — starting fresh")
        cell_week_checklists_by_res = {res: defaultdict(lambda: defaultdict(int)) for res in RESOLUTIONS}
        detections_by_res = {res: defaultdict(lambda: defaultdict(lambda: defaultdict(int))) for res in RESOLUTIONS}
        species_names = {}
        species_scinames = {}
        species_taxon_order = {}
        species_family = {}
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
        print("\nRebuilding output from archive...")
        ebird_taxonomy = load_taxonomy()
        generate_output(cell_week_checklists_by_res, detections_by_res,
                        species_names, species_scinames, species_taxon_order,
                        species_family, processed_regions, ebird_taxonomy)
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

    for region, _, sed_file in new_pairs:
        print(f"\n  Processing {region} sampling events...")
        sys.stdout.flush()
        total, _ = process_sampling_file(sed_file, region, valid_checklists, cell_week_checklists_by_res)
        grand_total_events += total

    print(f"\n  New events: {grand_total_events:,}")
    print(f"  New valid checklists: {len(valid_checklists):,}")
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
            species_taxon_order, species_family
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
                 species_family, processed_regions)

    # Free memory from valid_checklists (large!)
    del valid_checklists

    # --- Generate output ---
    print(f"\n[4/4] Generating output...")
    sys.stdout.flush()
    generate_output(cell_week_checklists_by_res, detections_by_res,
                    species_names, species_scinames, species_taxon_order,
                    species_family, processed_regions, ebird_taxonomy)

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
