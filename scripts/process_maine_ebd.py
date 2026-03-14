#!/usr/bin/env python3
"""
Process Maine eBird Basic Dataset into static JSON files for Find-A-Lifer.

Reads the EBD and sampling event files, applies effort filters,
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


def main():
    t0 = time.time()
    print("=" * 60)
    print("Process Maine EBD for Find-A-Lifer")
    print("=" * 60)
    sys.stdout.flush()

    ebd_file = DATA_DIR / "ebd_US-ME_smp_relJan-2026.txt"
    sed_file = DATA_DIR / "ebd_US-ME_smp_relJan-2026_sampling.txt"

    if not ebd_file.exists():
        print(f"ERROR: EBD file not found: {ebd_file}")
        sys.exit(1)
    if not sed_file.exists():
        print(f"ERROR: Sampling file not found: {sed_file}")
        sys.exit(1)

    # --- Step 1: Read sampling events, apply effort filters ---
    print("\n[1/5] Reading sampling events...")
    sys.stdout.flush()

    valid_checklists = {}  # sampling_event_id -> (lat, lon, week, cell_id)
    total_events = 0
    filtered_out = 0

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

            if total_events % 500000 == 0:
                print(f"    {total_events:,} events scanned, {len(valid_checklists):,} valid...")
                sys.stdout.flush()

    print(f"  Total events: {total_events:,}")
    print(f"  Filtered out: {filtered_out:,}")
    print(f"  Valid checklists: {len(valid_checklists):,}")
    sys.stdout.flush()

    # --- Step 2: Count checklists per cell/week ---
    print("\n[2/5] Counting checklists per cell/week...")
    sys.stdout.flush()

    cell_week_checklists = defaultdict(lambda: defaultdict(int))
    for sei, (lat, lon, week, cell_id) in valid_checklists.items():
        cell_week_checklists[cell_id][week] += 1

    n_cells = len(cell_week_checklists)
    print(f"  Unique cells: {n_cells}")
    sys.stdout.flush()

    # --- Step 3: Read observations, compute detections ---
    print("\n[3/5] Reading observations...")
    sys.stdout.flush()

    # Track: species_code -> cell_id -> week -> n_detected
    detections = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    species_names = {}  # code -> common name
    species_scinames = {}  # code -> scientific name
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
            # Generate species code from common name (e.g., "Black-capped Chickadee" -> "bkcchi")
            # Use taxon concept ID as unique key
            taxon_id = row.get("TAXON CONCEPT ID", common_name)

            _, _, week, cell_id = valid_checklists[sei]

            # Only count if cell/week has enough checklists
            if cell_week_checklists[cell_id][week] < MIN_CHECKLISTS:
                continue

            detections[taxon_id][cell_id][week] += 1
            matched_obs += 1

            # Track names
            if taxon_id not in species_names:
                species_names[taxon_id] = common_name
                species_scinames[taxon_id] = sci_name

            if total_obs % 2000000 == 0:
                print(f"    {total_obs:,} observations, {matched_obs:,} matched, {len(species_names):,} species...")
                sys.stdout.flush()

    print(f"  Total observations: {total_obs:,}")
    print(f"  Matched observations: {matched_obs:,}")
    print(f"  Species found: {len(species_names)}")
    sys.stdout.flush()

    # --- Step 4: Compute reporting frequencies ---
    print("\n[4/5] Computing reporting frequencies...")
    sys.stdout.flush()

    # frequency = n_detected / n_total_checklists for that cell/week
    # Convert to uint8 (0-255 scale)

    # Build: cell_id -> week -> [(species_code, freq_uint8), ...]
    cell_week_species = defaultdict(lambda: defaultdict(list))
    # Also build: species_code -> week -> [(cell_id, freq_uint8), ...]
    species_week_cells = defaultdict(lambda: defaultdict(list))

    # Assign integer cell IDs for the app
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

    # Generate species codes from common name (e.g., "Black-capped Chickadee" -> "bkcchi")
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

    # Assign integer species IDs and generate codes
    taxon_to_code = {}
    taxon_to_id = {}
    used_codes = set()
    sp_id = 1

    for taxon_id in sorted(species_names.keys()):
        name = species_names[taxon_id]
        code = make_species_code(name)
        # Handle duplicates
        orig_code = code
        suffix = 1
        while code in used_codes:
            code = f"{orig_code}{suffix}"
            suffix += 1
        used_codes.add(code)
        taxon_to_code[taxon_id] = code
        taxon_to_id[taxon_id] = sp_id
        sp_id += 1

    # Write species.json
    species_list = []
    for taxon_id in sorted(species_names.keys()):
        species_list.append({
            "species_id": taxon_to_id[taxon_id],
            "speciesCode": taxon_to_code[taxon_id],
            "comName": species_names[taxon_id],
            "sciName": species_scinames.get(taxon_id, ""),
            "taxonOrder": taxon_to_id[taxon_id],
        })
    with open(OUTPUT_DIR / "species.json", "w") as f:
        json.dump(species_list, f, separators=(",", ":"))
    print(f"  species.json: {len(species_list)} species")

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

    # Write grid GeoJSON for Maine cells
    if HAS_H3:
        features = []
        for int_id, h3_cell in int_to_cell.items():
            boundary = h3.cell_to_boundary(h3_cell)
            # h3 returns (lat, lon), GeoJSON needs [lon, lat]
            coords = [[lon, lat] for lat, lon in boundary]
            coords.append(coords[0])  # Close ring
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
        # Simple grid from cell centers
        features = []
        for int_id, grid_key in int_to_cell.items():
            lat, lon = map(float, grid_key.split("_"))
            d = 0.125  # half of 0.25 degree
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
    print(f"\n  Completed in {elapsed:.1f}s")
    print(f"  {len(species_names)} species, {len(all_cells)} cells, 52 weeks")
    print(f"  Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
