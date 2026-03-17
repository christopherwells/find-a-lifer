#!/usr/bin/env python3
"""
Backfill EXOTIC CODE data from existing EBD files into the species_meta archive.

Scans EBD files in data/downloads/ for the EXOTIC CODE column and stores
per-species, per-region exotic code sets in species_meta.json.

This is a one-time backfill script for archives that predate exotic code tracking.
Future pipeline runs will capture exotic codes automatically.

Usage:
  python pipeline/backfill_exotic_codes.py
"""

import csv
import gzip
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / "data"
DOWNLOADS_DIR = DATA_DIR / "downloads"
ARCHIVE_DIR = DATA_DIR / "archive"
META_FILE = ARCHIVE_DIR / "species_meta.json"

# Pattern to extract region code from filename
# e.g., ebd_BM_smp_relFeb-2026.txt → BM, ebd_CA_relFeb-2026.txt.gz → CA
EBD_PATTERN = re.compile(r"ebd_([A-Z]{2}(?:-[A-Z]{2})?)_(?:smp_)?rel")


def open_maybe_gz(filepath):
    """Open a file, transparently handling .gz compression."""
    if str(filepath).endswith(".gz"):
        return io.TextIOWrapper(gzip.open(filepath, "rb"), encoding="utf-8", errors="replace")
    return open(filepath, "r", encoding="utf-8")


def find_ebd_files():
    """Find all EBD observation files (not sampling files)."""
    files = []
    for pattern_dir in [DATA_DIR, DOWNLOADS_DIR]:
        if not pattern_dir.exists():
            continue
        for f in pattern_dir.iterdir():
            name = f.name
            if "sampling" in name:
                continue
            if not (name.endswith(".txt") or name.endswith(".txt.gz")):
                continue
            match = EBD_PATTERN.match(name)
            if match:
                files.append((f, match.group(1)))
    return files


def main():
    print("Backfilling EXOTIC CODE data from EBD files...\n")

    # Find EBD files
    ebd_files = find_ebd_files()
    if not ebd_files:
        print("No EBD files found in data/ or data/downloads/")
        sys.exit(1)

    print(f"Found {len(ebd_files)} EBD files:")
    for f, region in ebd_files:
        print(f"  {region}: {f.name}")

    # Collect exotic codes per taxon per region
    exotic_codes = defaultdict(lambda: defaultdict(set))
    total_obs = 0

    for filepath, region in ebd_files:
        print(f"\nProcessing {region} ({filepath.name})...")
        sys.stdout.flush()
        file_obs = 0

        with open_maybe_gz(filepath) as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                if row.get("CATEGORY") != "species":
                    continue

                taxon_id = row.get("TAXON CONCEPT ID", "")
                if not taxon_id:
                    continue

                code = row.get("EXOTIC CODE", "").strip()
                exotic_codes[taxon_id][region].add(code)
                file_obs += 1

                if file_obs % 2000000 == 0:
                    print(f"  {file_obs:,} observations...")
                    sys.stdout.flush()

        total_obs += file_obs
        print(f"  {file_obs:,} species observations")

    print(f"\nTotal: {total_obs:,} observations across {len(ebd_files)} files")
    print(f"Species with exotic data: {len(exotic_codes)}")

    # Summarize exotic code distribution
    code_counts = defaultdict(int)
    for taxon_data in exotic_codes.values():
        for region_codes in taxon_data.values():
            for code in region_codes:
                code_counts[code or "(empty/native)"] += 1
    print(f"\nExotic code distribution (species×region entries):")
    for code, count in sorted(code_counts.items()):
        print(f"  {code}: {count}")

    # Load existing archive
    if not META_FILE.exists():
        print(f"\nError: {META_FILE} not found. Run the pipeline first.")
        sys.exit(1)

    print(f"\nLoading archive from {META_FILE}...")
    with open(META_FILE) as f:
        meta = json.load(f)

    # Merge exotic codes into archive
    # Convert sets to sorted lists for JSON serialization
    serialized = {}
    for taxon_id, regions in exotic_codes.items():
        serialized[taxon_id] = {}
        for region, codes in regions.items():
            serialized[taxon_id][region] = sorted(codes)

    meta["exotic_codes"] = serialized

    # Save updated archive
    with open(META_FILE, "w") as f:
        json.dump(meta, f, separators=(",", ":"))

    print(f"Updated {META_FILE}")
    print(f"  Added exotic_codes for {len(serialized)} species")
    print(f"  Archive size: {META_FILE.stat().st_size / (1024*1024):.1f} MB")


if __name__ == "__main__":
    main()
