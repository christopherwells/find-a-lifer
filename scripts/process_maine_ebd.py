#!/usr/bin/env python3
"""
Process eBird Basic Dataset files into static JSON files for Find-A-Lifer.

Reads EBD and sampling event files for multiple states, applies effort filters,
assigns H3 cells at multiple resolutions (3, 4, 5), and computes reporting
frequency per species/cell/week.

Output goes directly to frontend/public/data/ for the PWA, with separate
subdirectories per resolution (r3/, r4/, r5/).
"""

import csv
import json
import math
import sys
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

# EBD has very large comment fields
csv.field_size_limit(10 * 1024 * 1024)  # 10 MB

# Try to import h3; if not available, use a simple lat/lon grid
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
TAXONOMY_FILE = DATA_DIR / "ebird_taxonomy.json"

# States to process — look for all available EBD files
STATES = ["US-ME", "US-NH", "US-VT", "US-MA", "US-CT", "US-RI", "US-NY"]

# H3 resolutions to process
RESOLUTIONS = [3, 4, 5]

# Effort filters (eBird best practices)
MAX_DURATION = 360  # minutes
MAX_DISTANCE = 10   # km
PROTOCOLS = {"Stationary", "Traveling"}
MIN_CHECKLISTS = 3  # minimum checklists per cell/week for a frequency estimate
YEAR_MIN = 2006
YEAR_MAX = 2025


def get_week(date_str):
    """Convert YYYY-MM-DD to week number (1-52)."""
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        week = min(52, max(1, math.ceil(d.timetuple().tm_yday / 7)))
        return week
    except:
        return None


def get_cell_ids(lat, lon, resolutions):
    """Get H3 cell IDs at multiple resolutions."""
    if HAS_H3:
        return {res: h3.latlng_to_cell(lat, lon, res) for res in resolutions}
    else:
        # Simple grid fallback at different scales
        scales = {3: 2, 4: 4, 5: 8}
        result = {}
        for res in resolutions:
            s = scales.get(res, 4)
            lat_bin = round(lat * s) / s
            lon_bin = round(lon * s) / s
            result[res] = f"{lat_bin:.3f}_{lon_bin:.3f}_r{res}"
        return result


def find_ebd_files():
    """Find all available EBD file pairs (observations + sampling)."""
    pairs = []
    for state in STATES:
        pattern = f"ebd_{state}_smp_relJan-2026"
        ebd_file = DATA_DIR / f"{pattern}.txt"
        sed_file = DATA_DIR / f"{pattern}_sampling.txt"
        if ebd_file.exists() and sed_file.exists():
            pairs.append((state, ebd_file, sed_file))
        elif ebd_file.exists():
            print(f"  WARNING: Found {ebd_file.name} but missing sampling file")
        for f in DATA_DIR.glob(f"ebd_{state}_smp_rel*.txt"):
            if "_sampling" not in f.name and f != ebd_file:
                sf = f.parent / f.name.replace(".txt", "_sampling.txt")
                if sf.exists() and (state, f, sf) not in pairs:
                    pairs.append((state, f, sf))
    return pairs


def process_sampling_file(sed_file, state, valid_checklists, cell_week_checklists_by_res):
    """Process a single sampling event file, computing cells at all resolutions."""
    total_events = 0
    filtered_out = 0
    state_valid = 0

    with open(sed_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            total_events += 1

            # Year filter
            obs_date = row.get("OBSERVATION DATE", "")
            if not obs_date:
                filtered_out += 1
                continue
            year = int(obs_date[:4])
            if year < YEAR_MIN or year > YEAR_MAX:
                filtered_out += 1
                continue

            # Protocol filter
            protocol = row.get("PROTOCOL NAME", "")
            if protocol not in PROTOCOLS:
                filtered_out += 1
                continue

            # Complete checklist filter
            all_species = row.get("ALL SPECIES REPORTED", "0")
            if all_species != "1":
                filtered_out += 1
                continue

            # Duration filter
            duration = row.get("DURATION MINUTES", "")
            if duration:
                try:
                    if float(duration) > MAX_DURATION:
                        filtered_out += 1
                        continue
                except ValueError:
                    pass

            # Distance filter
            distance = row.get("EFFORT DISTANCE KM", "")
            if distance:
                try:
                    if float(distance) > MAX_DISTANCE:
                        filtered_out += 1
                        continue
                except ValueError:
                    pass

            # Get location and week
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

            # Compute H3 cells at all resolutions
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

    with open(ebd_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            total_obs += 1

            # Only count species (not subspecies, hybrids, etc.)
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

            # Record detection at each resolution (if cell/week has enough checklists)
            any_matched = False
            for res, cell_id in cell_ids.items():
                if cell_week_checklists_by_res[res][cell_id][week] >= MIN_CHECKLISTS:
                    detections_by_res[res][taxon_id][cell_id][week] += 1
                    any_matched = True

            if any_matched:
                matched_obs += 1

            # Track names, taxonomic order, and family (resolution-independent)
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


def write_resolution_data(res, detections, cell_week_checklists, species_names,
                          taxon_to_code, taxon_to_id, output_dir):
    """Write grid, weekly, and species-weeks data for one resolution."""
    res_dir = output_dir / f"r{res}"
    res_dir.mkdir(parents=True, exist_ok=True)
    (res_dir / "weeks").mkdir(exist_ok=True)
    (res_dir / "species-weeks").mkdir(exist_ok=True)

    # Clean old species-weeks files
    for old_file in (res_dir / "species-weeks").glob("*.json"):
        old_file.unlink()

    # Compute reporting frequencies
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

    # Write weekly files
    for week in range(1, 53):
        cells_out = []
        summary_out = []

        for int_id in sorted(cell_week_species.keys()):
            sp_list = cell_week_species[int_id].get(week, [])
            if not sp_list:
                continue
            species_ids = [taxon_to_id[tid] for tid, _ in sp_list]
            max_freq = max(freq for _, freq in sp_list)
            h3_cell = int_to_cell[int_id]
            n_checklists = cell_week_checklists[h3_cell][week]
            cells_out.append([int_id, species_ids])
            summary_out.append([int_id, len(species_ids), max_freq, n_checklists])

        with open(res_dir / "weeks" / f"week_{week:02d}_cells.json", "w") as f:
            json.dump(cells_out, f, separators=(",", ":"))
        with open(res_dir / "weeks" / f"week_{week:02d}_summary.json", "w") as f:
            json.dump(summary_out, f, separators=(",", ":"))

    # Count total week records for logging
    total_records = sum(
        sum(len(cell_week_species[int_id].get(w, [])) for int_id in cell_week_species)
        for w in range(1, 53)
    )
    print(f"    Weekly files: 52 weeks, {total_records:,} total species-cell records")

    # Write species-weeks files
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

    # Write grid GeoJSON
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


def main():
    t0 = time.time()
    print("=" * 60)
    print("Process eBird EBD for Find-A-Lifer (Multi-Resolution)")
    print(f"  Resolutions: {RESOLUTIONS}")
    print("=" * 60)
    sys.stdout.flush()

    # Find available state files
    file_pairs = find_ebd_files()
    if not file_pairs:
        print("ERROR: No EBD files found in", DATA_DIR)
        sys.exit(1)

    states_found = [s for s, _, _ in file_pairs]
    print(f"\nFound {len(file_pairs)} states: {', '.join(states_found)}")
    for state, ebd, sed in file_pairs:
        ebd_size = ebd.stat().st_size / (1024**3)
        sed_size = sed.stat().st_size / (1024**3)
        print(f"  {state}: EBD={ebd_size:.1f}GB, sampling={sed_size:.2f}GB")
    sys.stdout.flush()

    # Load eBird taxonomy for family names and species codes
    ebird_taxonomy = {}
    if TAXONOMY_FILE.exists():
        print("\nLoading eBird taxonomy...")
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

    # --- Step 1: Read sampling events from all states ---
    print(f"\n[1/5] Reading sampling events from {len(file_pairs)} states...")
    sys.stdout.flush()

    valid_checklists = {}  # sei -> (lat, lon, week, {res: cell_id})
    cell_week_checklists_by_res = {res: defaultdict(lambda: defaultdict(int)) for res in RESOLUTIONS}
    grand_total_events = 0

    for state, _, sed_file in file_pairs:
        print(f"\n  Processing {state} sampling events...")
        sys.stdout.flush()
        total, _ = process_sampling_file(sed_file, state, valid_checklists, cell_week_checklists_by_res)
        grand_total_events += total

    print(f"\n  TOTAL: {grand_total_events:,} events scanned")
    print(f"  Valid checklists across all states: {len(valid_checklists):,}")
    for res in RESOLUTIONS:
        print(f"  Resolution {res}: {len(cell_week_checklists_by_res[res]):,} cells")
    sys.stdout.flush()

    # --- Step 2: Read observations from all states ---
    print(f"\n[2/5] Reading observations from {len(file_pairs)} states...")
    sys.stdout.flush()

    detections_by_res = {res: defaultdict(lambda: defaultdict(lambda: defaultdict(int))) for res in RESOLUTIONS}
    species_names = {}
    species_scinames = {}
    species_taxon_order = {}
    species_family = {}
    grand_total_obs = 0
    grand_matched_obs = 0

    for state, ebd_file, _ in file_pairs:
        print(f"\n  Processing {state} observations...")
        sys.stdout.flush()
        total, matched = process_ebd_file(
            ebd_file, state, valid_checklists, cell_week_checklists_by_res,
            detections_by_res, species_names, species_scinames,
            species_taxon_order, species_family
        )
        grand_total_obs += total
        grand_matched_obs += matched

    print(f"\n  TOTAL: {grand_total_obs:,} observations, {grand_matched_obs:,} matched")
    print(f"  Species found: {len(species_names)}")
    sys.stdout.flush()

    # --- Step 3: Assign species codes ---
    print("\n[3/5] Assigning species codes...")
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
        name = species_names[taxon_id]

        if sci_name in ebird_taxonomy:
            code = ebird_taxonomy[sci_name]["speciesCode"]
            taxonomy_matches += 1
        else:
            code = make_species_code(name)

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

    # --- Step 4: Write shared species.json ---
    print("\n[4/5] Writing shared species data...")
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
    print("  resolutions.json: zoom thresholds written")

    # Write empty regions file
    with open(OUTPUT_DIR / "regions.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

    # --- Step 5: Write per-resolution data ---
    print("\n[5/5] Writing per-resolution data...")
    sys.stdout.flush()

    for res in RESOLUTIONS:
        write_resolution_data(
            res, detections_by_res[res], cell_week_checklists_by_res[res],
            species_names, taxon_to_code, taxon_to_id, OUTPUT_DIR
        )

    # Also keep backward-compatible copies at root level (res 4 = default)
    # Symlink or copy r4 data to root for backward compat
    import shutil
    r4_dir = OUTPUT_DIR / "r4"
    if r4_dir.exists():
        # Copy grid.geojson
        shutil.copy2(r4_dir / "grid.geojson", OUTPUT_DIR / "grid.geojson")
        # Copy weeks
        root_weeks = OUTPUT_DIR / "weeks"
        root_weeks.mkdir(exist_ok=True)
        for f in (r4_dir / "weeks").glob("*.json"):
            shutil.copy2(f, root_weeks / f.name)
        # Copy species-weeks
        root_sw = OUTPUT_DIR / "species-weeks"
        root_sw.mkdir(exist_ok=True)
        # Clean old
        for old in root_sw.glob("*.json"):
            old.unlink()
        for f in (r4_dir / "species-weeks").glob("*.json"):
            shutil.copy2(f, root_sw / f.name)
        print("\n  Copied r4 data to root level for backward compatibility")

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"  Completed in {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"  States: {', '.join(states_found)}")
    print(f"  {len(species_names)} species, 52 weeks")
    for res in RESOLUTIONS:
        n_cells = len(cell_week_checklists_by_res[res])
        print(f"  Resolution {res}: {n_cells} cells")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
