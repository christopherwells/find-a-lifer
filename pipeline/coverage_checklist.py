"""
Coverage Checklist — shows which target regions have data in Find-A-Lifer.

Usage:
    python pipeline/coverage_checklist.py
"""

import json
import os
from collections import Counter
from pathlib import Path

# ---------------------------------------------------------------------------
# Target regions for North America + Caribbean + Central America + Atlantic
# ---------------------------------------------------------------------------

TARGET_REGIONS = {
    "United States": {
        "US": "United States (national)",
    },
    "Canada": {
        "CA": "Canada",
    },
    "Mexico": {
        "MX": "Mexico",
    },
    "Central America": {
        "BZ": "Belize",
        "GT": "Guatemala",
        "SV": "El Salvador",
        "HN": "Honduras",
        "NI": "Nicaragua",
        "CR": "Costa Rica",
        "PA": "Panama",
    },
    "Greater Antilles": {
        "CU": "Cuba",
        "JM": "Jamaica",
        "HT": "Haiti",
        "DO": "Dominican Republic",
        "PR": "Puerto Rico",
    },
    "Lesser Antilles": {
        "AG": "Antigua and Barbuda",
        "AI": "Anguilla",
        "BB": "Barbados",
        "BL": "Saint Barthelemy",
        "DM": "Dominica",
        "GD": "Grenada",
        "GP": "Guadeloupe",
        "KN": "Saint Kitts and Nevis",
        "LC": "Saint Lucia",
        "MF": "Saint Martin",
        "MQ": "Martinique",
        "MS": "Montserrat",
        "SX": "Sint Maarten",
        "TT": "Trinidad and Tobago",
        "VC": "Saint Vincent and the Grenadines",
        "VG": "British Virgin Islands",
        "VI": "U.S. Virgin Islands",
    },
    "Other Caribbean / Atlantic": {
        "AW": "Aruba",
        "BM": "Bermuda",
        "BQ": "Bonaire, Sint Eustatius and Saba",
        "BS": "Bahamas",
        "CW": "Curacao",
        "GL": "Greenland",
        "KY": "Cayman Islands",
        "PM": "Saint Pierre and Miquelon",
        "TC": "Turks and Caicos Islands",
    },
}

# ---------------------------------------------------------------------------


def main():
    # Force UTF-8 output on Windows
    import sys, io
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    root = Path(__file__).resolve().parent.parent
    species_path = root / "frontend" / "public" / "data" / "species.json"

    if not species_path.exists():
        print(f"ERROR: species.json not found at {species_path}")
        return

    with open(species_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    region_names = data.get("regionNames", {})

    # Count species per region code
    species_counts: Counter = Counter()
    for sp in data["species"]:
        for r in sp.get("regions", []):
            species_counts[r] += 1

    # Detect US state codes (US-XX) that may be present instead of national "US"
    us_state_codes = sorted(
        code for code in species_counts if code.startswith("US-")
    )

    # ---------------------------------------------------------------------------
    # Print the checklist
    # ---------------------------------------------------------------------------
    total_have = 0
    total_target = 0

    print("=" * 62)
    print("  FIND-A-LIFER  —  Regional Data Coverage Checklist")
    print("=" * 62)
    print()

    for group, regions in TARGET_REGIONS.items():
        print(f"  {group}")
        print(f"  {'─' * 50}")

        for code, name in regions.items():
            total_target += 1

            # Special handling for US: check both national "US" and state codes
            if code == "US" and not species_counts.get("US") and us_state_codes:
                total_have += 1
                n_states = len(us_state_codes)
                total_sp = len(
                    set(
                        sid
                        for sp in data["species"]
                        for r in sp.get("regions", [])
                        if r.startswith("US")
                        for sid in [sp["species_id"]]
                    )
                )
                mark = "YES"
                detail = f"{total_sp:>5} species  ({n_states} state-level regions)"
                print(f"    {mark:>3}  {name:<32} {detail}")
                continue

            count = species_counts.get(code, 0)
            if count > 0:
                total_have += 1
                mark = "YES"
                detail = f"{count:>5} species"
            else:
                mark = " - "
                detail = "no data"
            print(f"    {mark:>3}  {name:<32} {detail}")

        print()

    # Summary
    total_missing = total_target - total_have
    print("=" * 62)
    print(
        f"  Coverage: {total_have}/{total_target} target regions  "
        f"({total_missing} remaining)"
    )
    print("=" * 62)

    # Show any region codes in the data that are NOT in the target list
    all_target_codes = set()
    for regions in TARGET_REGIONS.values():
        all_target_codes.update(regions.keys())

    extra = sorted(
        code
        for code in species_counts
        if code not in all_target_codes and not code.startswith("US-")
    )
    if extra:
        print()
        print("  Extra regions in data (not in target list):")
        for code in extra:
            name = region_names.get(code, "?")
            print(f"    {code:<6} {name:<32} {species_counts[code]:>5} species")

    # Show US state breakdown if present
    if us_state_codes:
        print()
        print(f"  US state-level breakdown ({len(us_state_codes)} regions):")
        for code in us_state_codes:
            print(f"    {code:<8} {species_counts[code]:>5} species")


if __name__ == "__main__":
    main()
