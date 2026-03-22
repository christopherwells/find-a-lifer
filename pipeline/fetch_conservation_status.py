#!/usr/bin/env python3
"""
Fetch conservation status and photo metadata for bird species from Wikidata.

Conservation status merges three sources in priority order:
  1. IUCN Red List status (Wikidata P141) — primary
  2. NatureServe conservation status (Wikidata P4319) — fallback
  3. COSEWIC status (Wikidata P6949) — second fallback

Photo metadata:
  - Fetches Wikidata P18 (image) via SPARQL to get Commons filenames
  - Queries Wikimedia Commons API for license, attribution, thumbnail URL
  - Only keeps CC0, CC BY, or CC BY-SA images (rejects CC BY-NC, etc.)

Outputs:
  pipeline/reference/conservation_status.json — sciName → IUCN code
  pipeline/reference/species_photos.json — sciName → {photoUrl, photoAttribution, photoLicense}

Usage:
  python pipeline/fetch_conservation_status.py
  python pipeline/fetch_conservation_status.py --skip-photos   # conservation only
  python pipeline/fetch_conservation_status.py --photos-only   # photos only
"""

import json
import sys
import time
import urllib.request
import urllib.parse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
TAXONOMY_FILE = SCRIPT_DIR / "reference" / "ebird_taxonomy.json"
OUTPUT_FILE = SCRIPT_DIR / "reference" / "conservation_status.json"
PHOTOS_OUTPUT_FILE = SCRIPT_DIR / "reference" / "species_photos.json"
OVERRIDES_FILE = SCRIPT_DIR / "reference" / "conservation_overrides.json"

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"

# Allowed licenses for photo use (CC0, CC BY, CC BY-SA and versioned variants)
ALLOWED_LICENSES = {
    "cc0",
    "cc-zero",
    "cc-by-1.0", "cc-by-2.0", "cc-by-2.5", "cc-by-3.0", "cc-by-4.0",
    "cc-by-sa-1.0", "cc-by-sa-2.0", "cc-by-sa-2.5", "cc-by-sa-3.0", "cc-by-sa-4.0",
}

# Thumbnail width in pixels for species photos
THUMBNAIL_WIDTH = 400

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

# ---- Wikidata P18 image query ----

IMAGE_QUERY = """
SELECT ?sciName ?image WHERE {
  ?taxon wdt:P31 wd:Q16521 ;
         wdt:P105 wd:Q7432 ;
         wdt:P225 ?sciName ;
         wdt:P18 ?image .
  ?taxon wdt:P171* wd:Q5113 .
}
"""


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


def parse_image_results(results, ebird_scinames):
    """Parse Wikidata P18 SPARQL results into {sciName: filename} dict.

    Only keeps filenames for species in our eBird taxonomy.
    The image URI looks like: http://commons.wikimedia.org/wiki/Special:FilePath/Filename.jpg
    """
    image_map = {}
    for row in results:
        sci_name = row.get("sciName", {}).get("value", "")
        image_uri = row.get("image", {}).get("value", "")
        if sci_name and image_uri and sci_name in ebird_scinames:
            # Extract filename from Commons URI
            # URI format: http://commons.wikimedia.org/wiki/Special:FilePath/Filename.jpg
            filename = image_uri.rsplit("/", 1)[-1]
            # URL-decode the filename (spaces may be encoded as %20 or _)
            filename = urllib.parse.unquote(filename)
            # Only keep first image per species (SPARQL may return multiple)
            if sci_name not in image_map:
                image_map[sci_name] = filename
    return image_map


def fetch_commons_metadata(filenames):
    """Fetch license, attribution, and thumbnail URL from Wikimedia Commons API.

    Processes filenames in batches of 50 (Commons API limit).
    Returns dict: {filename: {url, attribution, license}} for allowed licenses only.

    Rate-limits to ~1 request per second to be respectful.
    """
    metadata = {}
    batch_size = 50
    filenames_list = list(filenames)
    total_batches = (len(filenames_list) + batch_size - 1) // batch_size

    print(f"\n  Fetching Commons metadata for {len(filenames_list)} images in {total_batches} batches...")

    for batch_idx in range(0, len(filenames_list), batch_size):
        batch = filenames_list[batch_idx:batch_idx + batch_size]
        batch_num = batch_idx // batch_size + 1

        # Build titles parameter: "File:name1|File:name2|..."
        titles = "|".join(f"File:{fn}" for fn in batch)

        params = {
            "action": "query",
            "titles": titles,
            "prop": "imageinfo",
            "iiprop": "extmetadata|url",
            "iiurlwidth": str(THUMBNAIL_WIDTH),
            "format": "json",
        }
        url = COMMONS_API + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "User-Agent": "FindALifer/1.0 (birding PWA; species photo fetch)",
            "Accept": "application/json",
        })

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            pages = data.get("query", {}).get("pages", {})
            batch_accepted = 0
            for page_id, page in pages.items():
                if page_id == "-1" or "imageinfo" not in page:
                    continue

                title = page.get("title", "")
                # Strip "File:" prefix to get original filename
                orig_filename = title[5:] if title.startswith("File:") else title

                info = page["imageinfo"][0]
                extmeta = info.get("extmetadata", {})

                # Extract license
                license_short = extmeta.get("LicenseShortName", {}).get("value", "")
                license_url = extmeta.get("LicenseUrl", {}).get("value", "")
                license_key = license_short.lower().strip()

                # Check if license is allowed
                if not is_license_allowed(license_key):
                    continue

                # Extract attribution
                artist = extmeta.get("Artist", {}).get("value", "")
                # Strip HTML tags from artist field
                artist = strip_html(artist)
                attribution = extmeta.get("Attribution", {}).get("value", "")
                if attribution:
                    attribution = strip_html(attribution)
                else:
                    attribution = artist if artist else "Unknown"

                # Get thumbnail URL
                thumb_url = info.get("thumburl", "")
                if not thumb_url:
                    # Fallback: construct thumb URL manually
                    thumb_url = info.get("url", "")

                if thumb_url:
                    metadata[orig_filename] = {
                        "url": thumb_url,
                        "attribution": attribution,
                        "license": license_short,
                        "licenseUrl": license_url,
                    }
                    batch_accepted += 1

            if batch_num % 10 == 0 or batch_num == total_batches:
                print(f"    Batch {batch_num}/{total_batches}: {batch_accepted} accepted from {len(batch)}")

        except Exception as e:
            print(f"    Batch {batch_num}/{total_batches} error: {e}")

        # Rate limit: ~1 request per second
        if batch_idx + batch_size < len(filenames_list):
            time.sleep(1.0)

    return metadata


def is_license_allowed(license_key):
    """Check if a license key (lowercase) is in the allowed set.

    Handles variations like 'cc-by-sa-4.0', 'CC BY-SA 4.0', 'cc0 1.0', etc.
    """
    # Normalize: replace spaces with dashes, strip version suffixes for matching
    normalized = license_key.replace(" ", "-").replace("_", "-").lower()

    # Direct match
    if normalized in ALLOWED_LICENSES:
        return True

    # Handle "cc0-1.0" or "cc-zero-1.0"
    if normalized.startswith("cc0") or normalized.startswith("cc-zero"):
        return True

    # Handle "public-domain" — also acceptable
    if "public-domain" in normalized or normalized == "pd":
        return True

    # Handle "cc-by-sa" or "cc-by" without version
    if normalized in ("cc-by", "cc-by-sa"):
        return True

    # Check if it starts with an allowed prefix (e.g., "cc-by-4.0" without exact match)
    for allowed in ALLOWED_LICENSES:
        base = allowed.rsplit("-", 1)[0] if any(c.isdigit() for c in allowed.split("-")[-1]) else allowed
        if normalized.startswith(base):
            # Make sure it's not CC BY-NC or CC BY-ND
            if "nc" in normalized or "nd" in normalized:
                return False
            return True

    return False


def strip_html(text):
    """Remove HTML tags from a string."""
    import re
    clean = re.sub(r"<[^>]+>", "", text)
    # Collapse whitespace
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean


def fetch_photos(ebird_scinames):
    """Fetch photo metadata for all eBird species via Wikidata + Commons.

    Returns dict: {sciName: {photoUrl, photoAttribution, photoLicense}}
    """
    print("\n--- Fetching species photos ---\n")

    # Step 1: Get Wikidata P18 image filenames via SPARQL
    image_results = run_sparql(IMAGE_QUERY, "Wikidata images (P18)")
    time.sleep(5)  # Respectful delay after SPARQL

    image_map = parse_image_results(image_results, ebird_scinames)
    print(f"\n  Found Wikidata images for {len(image_map)} / {len(ebird_scinames)} eBird species")

    if not image_map:
        print("  No images found — skipping Commons API queries")
        return {}

    # Step 2: Query Commons API for license + thumbnail metadata
    unique_filenames = set(image_map.values())
    print(f"  Unique filenames to query: {len(unique_filenames)}")

    commons_meta = fetch_commons_metadata(unique_filenames)
    print(f"\n  Commons metadata fetched: {len(commons_meta)} images with allowed licenses")

    # Step 3: Build final photo map keyed by scientific name
    photo_map = {}
    for sci_name, filename in image_map.items():
        if filename in commons_meta:
            meta = commons_meta[filename]
            photo_map[sci_name] = {
                "photoUrl": meta["url"],
                "photoAttribution": meta["attribution"],
                "photoLicense": meta["license"],
            }

    print(f"  Final photo map: {len(photo_map)} species with usable photos")

    # License distribution
    license_counts = {}
    for entry in photo_map.values():
        lic = entry["photoLicense"]
        license_counts[lic] = license_counts.get(lic, 0) + 1
    if license_counts:
        print(f"\n  License distribution:")
        for lic, count in sorted(license_counts.items(), key=lambda x: -x[1]):
            print(f"    {lic}: {count}")

    return photo_map


def fetch_conservation(ebird_scinames):
    """Fetch and merge conservation status from IUCN, NatureServe, COSEWIC.

    Priority merge logic:
      1. IUCN Red List — but only if the status is an actual assessment
         (LC/NT/VU/EN/CR/EW/EX). DD and NE are kept only if no better
         source provides a real assessment.
      2. NatureServe — same DD/NE deferral rule.
      3. COSEWIC — last resort from automated sources.
      4. Manual overrides from conservation_overrides.json — applied last,
         unconditionally replacing whatever the automated merge produced.
    """
    print("--- Fetching conservation status ---\n")

    # Statuses that represent a real assessment (not placeholder)
    ASSESSED_CODES = {"LC", "NT", "VU", "EN", "CR", "EW", "EX"}

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
    # DD/NE from a higher-priority source defers to a real assessment
    # from a lower-priority source.
    merged = {}
    source_counts = {"iucn": 0, "natureserve": 0, "cosewic": 0, "missing": 0}

    for sci_name in ebird_scinames:
        # Collect candidates in priority order: (code, source_label)
        candidates = []
        if sci_name in iucn_map:
            candidates.append((iucn_map[sci_name], "iucn"))
        if sci_name in natureserve_map:
            candidates.append((natureserve_map[sci_name], "natureserve"))
        if sci_name in cosewic_map:
            candidates.append((cosewic_map[sci_name], "cosewic"))

        if not candidates:
            source_counts["missing"] += 1
            continue

        # First pass: pick the highest-priority source that has a real
        # assessment (not DD/NE).
        chosen_code = None
        chosen_source = None
        for code, source in candidates:
            if code in ASSESSED_CODES:
                chosen_code = code
                chosen_source = source
                break

        # Second pass: if no source has a real assessment, take the
        # highest-priority placeholder (DD > NE, but priority order
        # already handles this — just take the first).
        if chosen_code is None:
            chosen_code = candidates[0][0]
            chosen_source = candidates[0][1]

        merged[sci_name] = chosen_code
        source_counts[chosen_source] += 1

    print(f"\nMerge results for {len(ebird_scinames)} eBird species:")
    print(f"  IUCN:        {source_counts['iucn']}")
    print(f"  NatureServe: {source_counts['natureserve']}")
    print(f"  COSEWIC:     {source_counts['cosewic']}")
    print(f"  No data:     {source_counts['missing']}")

    # Apply manual overrides
    overrides_applied = 0
    if OVERRIDES_FILE.exists():
        with open(OVERRIDES_FILE) as f:
            overrides = json.load(f)
        if overrides:
            valid_codes = ASSESSED_CODES | {"DD", "NE"}
            for sci_name, code in overrides.items():
                if code not in valid_codes:
                    print(f"  WARNING: override for '{sci_name}' has invalid code '{code}', skipping")
                    continue
                merged[sci_name] = code
                overrides_applied += 1
            print(f"\n  Applied {overrides_applied} manual overrides from {OVERRIDES_FILE.name}")
    else:
        print(f"\n  No overrides file found at {OVERRIDES_FILE.name} — skipping")

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

    return merged


def main():
    # Parse CLI flags
    skip_photos = "--skip-photos" in sys.argv
    photos_only = "--photos-only" in sys.argv

    if skip_photos and photos_only:
        print("Error: --skip-photos and --photos-only are mutually exclusive")
        sys.exit(1)

    print("Fetching species metadata from Wikidata...\n")

    # Load eBird taxonomy for cross-referencing
    print(f"Loading taxonomy from {TAXONOMY_FILE}...")
    with open(TAXONOMY_FILE) as f:
        taxonomy = json.load(f)
    ebird_scinames = {sp["sciName"] for sp in taxonomy if sp.get("category") == "species"}
    print(f"  {len(ebird_scinames)} eBird species\n")

    # Fetch conservation status (unless --photos-only)
    if not photos_only:
        fetch_conservation(ebird_scinames)

    # Fetch photos (unless --skip-photos)
    if not skip_photos:
        if not photos_only:
            time.sleep(5)  # Delay between conservation and photo queries
        photo_map = fetch_photos(ebird_scinames)

        # Save photo metadata
        PHOTOS_OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(PHOTOS_OUTPUT_FILE, "w") as f:
            json.dump(photo_map, f, separators=(",", ":"), sort_keys=True)
        print(f"\nSaved {len(photo_map)} photo entries to {PHOTOS_OUTPUT_FILE}")
        if PHOTOS_OUTPUT_FILE.exists():
            print(f"  File size: {PHOTOS_OUTPUT_FILE.stat().st_size / 1024:.1f} KB")

    print("\nDone!")


if __name__ == "__main__":
    main()
