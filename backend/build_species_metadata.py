"""
Build comprehensive species metadata for Find-A-Lifer.

Merges eBird taxonomy data with avibase regional/conservation data to produce
a complete species.json file with 2000+ species and all required fields.

Data sources:
- ebird_taxonomy.csv: Downloaded from eBird API (species codes, families, taxon order)
- avibase.csv: Regional presence, invasion status, conservation status

Output:
- backend/data/species.json: Complete species metadata array
"""

import csv
import json
import random
import os
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).parent
PROJECT_DIR = BACKEND_DIR.parent
TAXONOMY_CSV = BACKEND_DIR / "ebird_taxonomy.csv"
AVIBASE_CSV = PROJECT_DIR / "avibase.csv"
OUTPUT_FILE = BACKEND_DIR / "data" / "species.json"


def load_ebird_taxonomy():
    """Load eBird taxonomy CSV and filter to species only."""
    species = []
    with open(TAXONOMY_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Only include actual species (not slashes, spuhs, hybrids, etc.)
            if row["CATEGORY"] == "species":
                # Skip extinct species
                if row.get("EXTINCT", "").strip():
                    continue
                species.append({
                    "sciName": row["SCIENTIFIC_NAME"].strip(),
                    "comName": row["COMMON_NAME"].strip(),
                    "speciesCode": row["SPECIES_CODE"].strip(),
                    "taxonOrder": float(row["TAXON_ORDER"]) if row["TAXON_ORDER"] else 0,
                    "familyComName": row.get("FAMILY_COM_NAME", "").strip(),
                    "familySciName": row.get("FAMILY_SCI_NAME", "").strip(),
                    "order": row.get("ORDER", "").strip(),
                })
    return species


def load_avibase_data():
    """Load avibase CSV with invasion/conservation status and regional presence."""
    avibase = {}
    with open(AVIBASE_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            com_name = row["comName"].strip()
            sci_name = row["sciName"].strip()

            # Build regional presence data
            regions = {}
            for col in reader.fieldnames:
                if col.startswith("reg_"):
                    region_key = col  # e.g., "reg_US_Northeast"
                    status = row[col].strip() if row[col] else "Absent"
                    regions[region_key] = status

            # Normalize conservation status
            conserv = row.get("conservStatus", "").strip()
            if conserv:
                # Capitalize properly
                conserv_map = {
                    "least concern": "Least Concern",
                    "near threatened": "Near Threatened",
                    "vulnerable": "Vulnerable",
                    "endangered": "Endangered",
                    "critically endangered": "Critically Endangered",
                    "data deficient": "Data Deficient",
                    "extinct in the wild": "Extinct in the Wild",
                    "": "Unknown",
                }
                conserv = conserv_map.get(conserv.lower(), conserv.title())
            else:
                conserv = "Unknown"

            # Store by both common name and scientific name for matching
            entry = {
                "invasionStatus": row.get("invasionStatus", "").strip() or "Unknown",
                "conservStatus": conserv,
                "regions": regions,
            }
            avibase[com_name.lower()] = entry
            avibase[sci_name.lower()] = entry

    return avibase


def compute_difficulty(invasion_status, regions, conserv_status):
    """
    Compute difficulty score and label based on species characteristics.

    Difficulty is based on:
    - How many regions the species is present in (fewer = harder)
    - Whether it's rare/accidental (harder)
    - Conservation status (endangered = often harder to find)
    """
    # Count regions where the species is present (not Absent)
    present_regions = 0
    native_regions = 0
    for region_key, status in regions.items():
        if status and status != "Absent":
            present_regions += 1
        if status in ("Native", "Present"):
            native_regions += 1

    total_regions = max(len(regions), 1)

    # Base score: inverse of geographic spread
    spread_score = 1.0 - (present_regions / total_regions)

    # Adjust for invasion status
    if invasion_status == "Rare/Accidental":
        spread_score = max(spread_score, 0.75)  # At least "Hard"
    elif invasion_status == "Introduced":
        spread_score = min(spread_score, 0.60)  # Usually moderate

    # Adjust for conservation status
    conserv_adjustments = {
        "Critically Endangered": 0.15,
        "Endangered": 0.10,
        "Vulnerable": 0.05,
        "Near Threatened": 0.03,
        "Least Concern": -0.05,
    }
    spread_score += conserv_adjustments.get(conserv_status, 0)

    # Clamp to 0-1
    score = max(0.01, min(0.99, spread_score))

    # Convert to difficulty label
    if score < 0.25:
        label = "Easy"
    elif score < 0.50:
        label = "Moderate"
    elif score < 0.75:
        label = "Hard"
    else:
        label = "Very Hard"

    return round(score, 4), label


def is_restricted_range(regions):
    """
    Determine if a species has a restricted range.
    A species is restricted-range if it appears in 2 or fewer regions as Native/Present.
    """
    native_count = 0
    for status in regions.values():
        if status in ("Native", "Present"):
            native_count += 1
    return native_count <= 2 and native_count > 0


def build_species_metadata():
    """Build the comprehensive species metadata JSON."""
    print("Loading eBird taxonomy...")
    ebird_species = load_ebird_taxonomy()
    print(f"  Found {len(ebird_species)} non-extinct species in eBird taxonomy")

    print("Loading avibase data...")
    avibase_data = load_avibase_data()
    print(f"  Found {len(avibase_data) // 2} species in avibase (indexed by name and sci name)")

    # Merge data - only include species that appear in avibase
    # (i.e., species relevant to North America / Central America / Caribbean)
    species_list = []
    matched = 0
    skipped = 0

    for idx, sp in enumerate(ebird_species):
        # Try to match with avibase by common name first, then scientific name
        avibase_entry = (
            avibase_data.get(sp["comName"].lower()) or
            avibase_data.get(sp["sciName"].lower())
        )

        if not avibase_entry:
            # Species not in our regional coverage - skip it
            skipped += 1
            continue

        matched += 1
        invasion_status = avibase_entry["invasionStatus"]
        conserv_status = avibase_entry["conservStatus"]
        regions = avibase_entry["regions"]

        # Compute difficulty
        difficulty_score, difficulty_label = compute_difficulty(
            invasion_status, regions, conserv_status
        )

        # Determine restricted range
        restricted = is_restricted_range(regions)

        # Build eBird URL
        ebird_url = f"https://ebird.org/species/{sp['speciesCode']}"

        # Photo URL - empty for now (would be populated by data pipeline from Macaulay Library)
        photo_url = ""

        species_entry = {
            "species_id": idx + 1,
            "speciesCode": sp["speciesCode"],
            "comName": sp["comName"],
            "sciName": sp["sciName"],
            "familyComName": sp["familyComName"],
            "taxonOrder": sp["taxonOrder"],
            "invasionStatus": invasion_status,
            "conservStatus": conserv_status,
            "difficultyScore": difficulty_score,
            "difficultyLabel": difficulty_label,
            "isRestrictedRange": restricted,
            "ebirdUrl": ebird_url,
            "photoUrl": photo_url,
        }
        species_list.append(species_entry)

    # Sort by taxon order (already should be from eBird taxonomy)
    species_list.sort(key=lambda s: s["taxonOrder"])

    # Reassign species_id based on sorted order
    for idx, sp in enumerate(species_list):
        sp["species_id"] = idx + 1

    print(f"\nResults:")
    print(f"  Total species included: {len(species_list)}")
    print(f"  Matched with avibase: {matched}")
    print(f"  Skipped (not in regional coverage): {skipped}")

    # Stats on enrichment
    invasion_counts = {}
    conserv_counts = {}
    difficulty_counts = {}
    restricted_count = 0

    for sp in species_list:
        invasion_counts[sp["invasionStatus"]] = invasion_counts.get(sp["invasionStatus"], 0) + 1
        conserv_counts[sp["conservStatus"]] = conserv_counts.get(sp["conservStatus"], 0) + 1
        difficulty_counts[sp["difficultyLabel"]] = difficulty_counts.get(sp["difficultyLabel"], 0) + 1
        if sp["isRestrictedRange"]:
            restricted_count += 1

    print(f"\n  Invasion Status breakdown: {json.dumps(invasion_counts, indent=4)}")
    print(f"\n  Conservation Status breakdown: {json.dumps(conserv_counts, indent=4)}")
    print(f"\n  Difficulty breakdown: {json.dumps(difficulty_counts, indent=4)}")
    print(f"  Restricted range species: {restricted_count}")

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(species_list, f, indent=2)

    print(f"\nOutput written to {OUTPUT_FILE}")
    print(f"File size: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")

    return species_list


if __name__ == "__main__":
    build_species_metadata()
