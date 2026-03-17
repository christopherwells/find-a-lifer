#!/usr/bin/env python3
"""
Fetch conservation status for bird species from Wikidata SPARQL.

Merges three sources in priority order:
  1. IUCN Red List status (Wikidata P141) — primary
  2. NatureServe conservation status (Wikidata P4319) — fallback
  3. COSEWIC status (Wikidata P6949) — second fallback

Outputs pipeline/reference/conservation_status.json mapping scientific names
to IUCN-equivalent codes (LC, NT, VU, EN, CR, EW, DD).

Usage:
  python pipeline/fetch_conservation_status.py
"""

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
TAXONOMY_FILE = SCRIPT_DIR / "reference" / "ebird_taxonomy.json"
OUTPUT_FILE = SCRIPT_DIR / "reference" / "conservation_status.json"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

# ---- IUCN status extraction ----

IUCN_QUERY = """
SELECT ?sciName ?statusLabel WHERE {
  ?taxon wdt:P31 wd:Q16521 ;
         wdt:P105 wd:Q7432 ;
         wdt:P225 ?sciName ;
         wdt:P141 ?status .
  ?taxon wdt:P171* wd:Q5113 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
"""

# Wikidata IUCN status labels → standard codes
IUCN_LABEL_TO_CODE = {
    "least concern": "LC",
    "near threatened": "NT",
    "vulnerable": "VU",
    "endangered": "EN",
    "endangered species": "EN",  # Alternate Wikidata label
    "endangered status": "EN",   # Wikidata entity Q11394 label
    "critically endangered": "CR",
    "extinct in the wild": "EW",
    "extinct": "EX",
    "extinct species": "EX",
    "data deficient": "DD",
    "not evaluated": "NE",
    "lower risk/least concern": "LC",
    "lower risk/near threatened": "NT",
    "lower risk/conservation dependent": "NT",
    "conservation dependent": "NT",
    "vulnerable species": "VU",  # Alternative Wikidata label
}

# ---- NatureServe → IUCN mapping ----

NATURESERVE_QUERY = """
SELECT ?sciName ?statusLabel WHERE {
  ?taxon wdt:P31 wd:Q16521 ;
         wdt:P105 wd:Q7432 ;
         wdt:P225 ?sciName ;
         wdt:P4319 ?status .
  ?taxon wdt:P171* wd:Q5113 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
"""

# NatureServe global ranks → IUCN equivalent codes
NATURESERVE_TO_IUCN = {
    "g1": "CR",  # Critically Imperiled
    "g2": "EN",  # Imperiled
    "g3": "VU",  # Vulnerable
    "g4": "LC",  # Apparently Secure
    "g5": "LC",  # Secure
    "gh": "CR",  # Possibly Extinct
    "gx": "EW",  # Presumed Extinct
    "critically imperiled": "CR",
    "imperiled": "EN",
    "vulnerable": "VU",
    "apparently secure": "LC",
    "secure": "LC",
}

# ---- COSEWIC → IUCN mapping ----

COSEWIC_QUERY = """
SELECT ?sciName ?statusLabel WHERE {
  ?taxon wdt:P31 wd:Q16521 ;
         wdt:P105 wd:Q7432 ;
         wdt:P225 ?sciName ;
         wdt:P6949 ?status .
  ?taxon wdt:P171* wd:Q5113 .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
"""

COSEWIC_TO_IUCN = {
    "endangered": "EN",
    "threatened": "VU",
    "special concern": "NT",
    "not at risk": "LC",
    "data deficient": "DD",
    "extirpated": "CR",
    "extinct": "EX",
}


def run_sparql(query, label):
    """Execute a SPARQL query against Wikidata and return results."""
    print(f"  Querying Wikidata for {label}...")
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode({
        "query": query,
        "format": "json",
    })
    req = urllib.request.Request(url, headers={
        "User-Agent": "FindALifer/1.0 (birding PWA; conservation status fetch)",
        "Accept": "application/sparql-results+json",
    })

    max_retries = 3
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                results = data.get("results", {}).get("bindings", [])
                print(f"    Got {len(results)} results")
                return results
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 10 * (attempt + 1)
                print(f"    Error: {e}, retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"    Failed after {max_retries} attempts: {e}")
                return []


def parse_iucn_results(results):
    """Parse IUCN SPARQL results into {sciName: code} dict."""
    status_map = {}
    for row in results:
        sci_name = row.get("sciName", {}).get("value", "")
        label = row.get("statusLabel", {}).get("value", "").lower().strip()
        code = IUCN_LABEL_TO_CODE.get(label)
        if sci_name and code:
            status_map[sci_name] = code
    return status_map


def parse_natureserve_results(results):
    """Parse NatureServe SPARQL results into {sciName: iucn_code} dict."""
    status_map = {}
    for row in results:
        sci_name = row.get("sciName", {}).get("value", "")
        label = row.get("statusLabel", {}).get("value", "").lower().strip()
        # Try direct label match, then try extracting G-rank pattern
        code = NATURESERVE_TO_IUCN.get(label)
        if not code:
            # Handle labels like "G3 - Vulnerable" or just "G3"
            for rank, iucn in NATURESERVE_TO_IUCN.items():
                if label.startswith(rank):
                    code = iucn
                    break
        if sci_name and code:
            status_map[sci_name] = code
    return status_map


def parse_cosewic_results(results):
    """Parse COSEWIC SPARQL results into {sciName: iucn_code} dict."""
    status_map = {}
    for row in results:
        sci_name = row.get("sciName", {}).get("value", "")
        label = row.get("statusLabel", {}).get("value", "").lower().strip()
        code = COSEWIC_TO_IUCN.get(label)
        if sci_name and code:
            status_map[sci_name] = code
    return status_map


def main():
    print("Fetching conservation status from Wikidata...\n")

    # Load eBird taxonomy for cross-referencing
    print(f"Loading taxonomy from {TAXONOMY_FILE}...")
    with open(TAXONOMY_FILE) as f:
        taxonomy = json.load(f)
    ebird_scinames = {sp["sciName"] for sp in taxonomy if sp.get("category") == "species"}
    print(f"  {len(ebird_scinames)} eBird species\n")

    # Fetch from all three sources
    iucn_results = run_sparql(IUCN_QUERY, "IUCN Red List (P141)")
    time.sleep(5)  # Be respectful to Wikidata
    natureserve_results = run_sparql(NATURESERVE_QUERY, "NatureServe (P4319)")
    time.sleep(5)
    cosewic_results = run_sparql(COSEWIC_QUERY, "COSEWIC (P6949)")

    # Parse results
    iucn_map = parse_iucn_results(iucn_results)
    natureserve_map = parse_natureserve_results(natureserve_results)
    cosewic_map = parse_cosewic_results(cosewic_results)

    print(f"\nParsed: {len(iucn_map)} IUCN, {len(natureserve_map)} NatureServe, {len(cosewic_map)} COSEWIC")

    # Merge with priority: IUCN > NatureServe > COSEWIC
    merged = {}
    source_counts = {"iucn": 0, "natureserve": 0, "cosewic": 0, "missing": 0}

    for sci_name in ebird_scinames:
        if sci_name in iucn_map:
            merged[sci_name] = iucn_map[sci_name]
            source_counts["iucn"] += 1
        elif sci_name in natureserve_map:
            merged[sci_name] = natureserve_map[sci_name]
            source_counts["natureserve"] += 1
        elif sci_name in cosewic_map:
            merged[sci_name] = cosewic_map[sci_name]
            source_counts["cosewic"] += 1
        else:
            source_counts["missing"] += 1

    print(f"\nMerge results for {len(ebird_scinames)} eBird species:")
    print(f"  IUCN:        {source_counts['iucn']}")
    print(f"  NatureServe: {source_counts['natureserve']}")
    print(f"  COSEWIC:     {source_counts['cosewic']}")
    print(f"  No data:     {source_counts['missing']}")

    # Distribution of statuses
    code_counts = {}
    for code in merged.values():
        code_counts[code] = code_counts.get(code, 0) + 1
    print(f"\nStatus distribution:")
    for code in ["LC", "NT", "VU", "EN", "CR", "EW", "EX", "DD", "NE"]:
        if code in code_counts:
            print(f"  {code}: {code_counts[code]}")

    # Save
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(merged, f, separators=(",", ":"), sort_keys=True)
    print(f"\nSaved {len(merged)} entries to {OUTPUT_FILE}")
    print(f"  File size: {OUTPUT_FILE.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
