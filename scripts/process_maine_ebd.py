#!/usr/bin/env python3
"""
Process eBird Basic Dataset files into static JSON files for Find-A-Lifer.

Reads EBD and sampling event files for multiple states, applies effort filters,
assigns H3 cells, and computes reporting frequency per species/cell/week.

Output goes directly to frontend/public/data/ for the PWA.
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


def get_cell_id(lat, lon, resolution=4):
    """Get H3 cell ID or fallback grid cell."""
    if HAS_H3:
        return h3.latlng_to_cell(lat, lon, resolution)
    else:
        # Simple 0.25-degree grid as fallback
        lat_bin = round(lat * 4) / 4
        lon_bin = round(lon * 4) / 4
        return f"{lat_bin:.2f}_{lon_bin:.2f}"


def find_ebd_files():
    """Find all available EBD file pairs (observations + sampling)."""
    pairs = []
    for state in STATES:
        # Look for the EBD file pattern
        pattern = f"ebd_{state}_smp_relJan-2026"
        ebd_file = DATA_DIR / f"{pattern}.txt"
        sed_file = DATA_DIR / f"{pattern}_sampling.txt"
        if ebd_file.exists() and sed_file.exists():
            pairs.append((state, ebd_file, sed_file))
        elif ebd_file.exists():
            print(f"  WARNING: Found {ebd_file.name} but missing sampling file")
        # Also try other release patterns
        for f in DATA_DIR.glob(f"ebd_{state}_smp_rel*.txt"):
            if "_sampling" not in f.name and f != ebd_file:
                sf = f.parent / f.name.replace(".txt", "_sampling.txt")
                if sf.exists() and (state, f, sf) not in pairs:
                    pairs.append((state, f, sf))
    return pairs


def process_sampling_file(sed_file, state, valid_checklists, cell_week_checklists):
    """Process a single sampling event file."""
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

            cell_id = get_cell_id(lat, lon)
            sei = row.get("SAMPLING EVENT IDENTIFIER", "")
            if sei:
                valid_checklists[sei] = (lat, lon, week, cell_id)
                cell_week_checklists[cell_id][week] += 1
                state_valid += 1

            if total_events % 500000 == 0:
                print(f"    {state}: {total_events:,} events scanned, {state_valid:,} valid...")
                sys.stdout.flush()

    print(f"    {state}: {total_events:,} total, {filtered_out:,} filtered, {state_valid:,} valid")
    sys.stdout.flush()
    return total_events, filtered_out


def process_ebd_file(ebd_file, state, valid_checklists, cell_week_checklists,
                     detections, species_names, species_scinames,
                     species_taxon_order, species_family):
    """Process a single EBD observations file."""
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

            _, _, week, cell_id = valid_checklists[sei]

            # Only count if cell/week has enough checklists
            if cell_week_checklists[cell_id][week] < MIN_CHECKLISTS:
                continue

            detections[taxon_id][cell_id][week] += 1
            matched_obs += 1

            # Track names, taxonomic order, and family
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


def main():
    t0 = time.time()
    print("=" * 60)
    print("Process eBird EBD for Find-A-Lifer")
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
    ebird_taxonomy = {}  # sciName -> {familyComName, speciesCode, taxonOrder}
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
        print("  WARNING: eBird taxonomy file not found, family names will be missing")
        print(f"  Expected: {TAXONOMY_FILE}")

    # --- Step 1: Read sampling events from all states ---
    print(f"\n[1/5] Reading sampling events from {len(file_pairs)} states...")
    sys.stdout.flush()

    valid_checklists = {}  # sampling_event_id -> (lat, lon, week, cell_id)
    cell_week_checklists = defaultdict(lambda: defaultdict(int))
    grand_total_events = 0

    for state, _, sed_file in file_pairs:
        print(f"\n  Processing {state} sampling events...")
        sys.stdout.flush()
        total, _ = process_sampling_file(sed_file, state, valid_checklists, cell_week_checklists)
        grand_total_events += total

    print(f"\n  TOTAL: {grand_total_events:,} events scanned")
    print(f"  Valid checklists across all states: {len(valid_checklists):,}")
    sys.stdout.flush()

    # --- Step 2: Count cells ---
    print("\n[2/5] Counting cells...")
    sys.stdout.flush()

    n_cells = len(cell_week_checklists)
    print(f"  Unique cells: {n_cells}")
    sys.stdout.flush()

    # --- Step 3: Read observations from all states ---
    print(f"\n[3/5] Reading observations from {len(file_pairs)} states...")
    sys.stdout.flush()

    detections = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
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
            ebd_file, state, valid_checklists, cell_week_checklists,
            detections, species_names, species_scinames,
            species_taxon_order, species_family
        )
        grand_total_obs += total
        grand_matched_obs += matched

    print(f"\n  TOTAL: {grand_total_obs:,} observations, {grand_matched_obs:,} matched")
    print(f"  Species found: {len(species_names)}")
    sys.stdout.flush()

    # --- Step 4: Compute reporting frequencies ---
    print("\n[4/5] Computing reporting frequencies...")
    sys.stdout.flush()

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

    print(f"  Cells with data: {len(cell_week_species)}")
    print(f"  Species with data: {len(species_week_cells)}")

    # Show top species
    top_sp = sorted(species_week_cells.items(),
                    key=lambda x: sum(len(cells) for cells in x[1].values()),
                    reverse=True)[:15]
    print("\n  Top 15 species by occurrence:")
    for tid, week_data in top_sp:
        total_cells = sum(len(cells) for cells in week_data.values())
        n_weeks = len(week_data)
        name = species_names.get(tid, tid)
        print(f"    {name}: {total_cells} cell-weeks, {n_weeks} weeks")
    sys.stdout.flush()

    # --- Step 5: Write output files ---
    print("\n[5/5] Writing output files...")
    sys.stdout.flush()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "weeks").mkdir(exist_ok=True)
    (OUTPUT_DIR / "species-weeks").mkdir(exist_ok=True)

    # Clean old species-weeks files
    for old_file in (OUTPUT_DIR / "species-weeks").glob("*.json"):
        old_file.unlink()
    print("  Cleaned old species-weeks files")

    def make_species_code(common_name):
        """Generate a 6-letter species code from common name (eBird convention)."""
        words = common_name.replace("-", " ").replace("'", "").split()
        if len(words) == 1:
            return words[0][:6].lower()
        elif len(words) == 2:
            return (words[0][:3] + words[1][:3]).lower()
        elif len(words) == 3:
            return (words[0][:2] + words[1][:2] + words[2][:2]).lower()
        else:
            return (words[0][:2] + words[1][:1] + words[2][:1] + words[3][:2]).lower()

    # Assign species codes
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

    # Write species.json
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

    # Count families
    families = set(s.get("familyComName", "") for s in species_list if s.get("familyComName"))
    print(f"  Families: {len(families)}")

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
            cells_out.append([int_id, species_ids])
            summary_out.append([int_id, len(species_ids), max_freq])

        with open(OUTPUT_DIR / "weeks" / f"week_{week:02d}_cells.json", "w") as f:
            json.dump(cells_out, f, separators=(",", ":"))
        with open(OUTPUT_DIR / "weeks" / f"week_{week:02d}_summary.json", "w") as f:
            json.dump(summary_out, f, separators=(",", ":"))

        if cells_out:
            print(f"    Week {week:02d}: {len(cells_out)} cells, {sum(len(e[1]) for e in cells_out)} species records")

    # Write species-weeks files
    for taxon_id, week_data in sorted(species_week_cells.items()):
        code = taxon_to_code[taxon_id]
        out = {}
        for week, cells in week_data.items():
            out[str(week)] = [[cid, freq] for cid, freq in cells]
        with open(OUTPUT_DIR / "species-weeks" / f"{code}.json", "w") as f:
            json.dump(out, f, separators=(",", ":"))

    print(f"  species-weeks/: {len(species_week_cells)} files")

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
        with open(OUTPUT_DIR / "grid.geojson", "w") as f:
            json.dump(grid_geojson, f, separators=(",", ":"))
        print(f"  grid.geojson: {len(features)} H3 cells")
    else:
        features = []
        for int_id, grid_key in int_to_cell.items():
            lat, lon = map(float, grid_key.split("_"))
            d = 0.125
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
        with open(OUTPUT_DIR / "grid.geojson", "w") as f:
            json.dump(grid_geojson, f, separators=(",", ":"))
        print(f"  grid.geojson: {len(features)} grid cells")

    # Write empty regions file
    with open(OUTPUT_DIR / "regions.geojson", "w") as f:
        json.dump({"type": "FeatureCollection", "features": []}, f)

    elapsed = time.time() - t0
    print(f"\n{'=' * 60}")
    print(f"  Completed in {elapsed:.1f}s ({elapsed/60:.1f} min)")
    print(f"  States: {', '.join(states_found)}")
    print(f"  {len(species_names)} species, {len(all_cells)} cells, 52 weeks")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
