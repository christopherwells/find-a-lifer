#!/usr/bin/env python3
"""Check 30 species for ecological plausibility of ensemble smoothing."""

import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "frontend" / "public" / "data"
ARCHIVE_DIR = PROJECT_DIR / "data" / "archive"

species_list = json.load(open(OUTPUT_DIR / "species.json"))
grid_r3 = json.load(open(OUTPUT_DIR / "r3" / "grid.geojson"))
grid_r4 = json.load(open(OUTPUT_DIR / "r4" / "grid.geojson"))
det_r3 = json.load(open(ARCHIVE_DIR / "detections_r3.json"))
meta = json.load(open(ARCHIVE_DIR / "species_meta.json"))
names = meta["names"]

total_r3 = len(grid_r3["features"])
total_r4 = len(grid_r4["features"])
name_to_taxon = {v: k for k, v in names.items()}

targets = [
    ("amerob", "American Robin",
     "Ubiquitous generalist. Expect 80%+, year-round, slight winter dip in far north."),
    ("bkcchi", "Black-capped Chickadee",
     "Resident woodland across NE+Canada. Expect 60-80%, year-round, minimal seasonal swing."),
    ("norcar", "Northern Cardinal",
     "Southern-biased. Expect 30-50%, year-round, mostly southern cells (MA/CT/NY, not boreal)."),
    ("blujay", "Blue Jay",
     "Widespread woodland. Expect 50-70%, year-round with slight winter dip in north."),
    ("amecro", "American Crow",
     "Ubiquitous. Expect 70%+, year-round, slight winter dip in far north."),
    ("eursta", "European Starling",
     "Urban/suburban. Expect 60-80%, year-round, concentrated near settlement."),
    ("houspa", "House Sparrow",
     "Urban obligate. Expect 40-70%, present where there are towns, not deep wilderness."),
    ("comrav", "Common Raven",
     "Widespread, especially boreal. Expect 80%+ given Canada coverage. Year-round."),
    ("baleag", "Bald Eagle",
     "Near water, widespread raptor. Expect 70-90%, year-round but fewer winter in far north."),
    ("osprey", "Osprey",
     "Migratory, near water. Expect 60-80% summer, under 20% winter (migrates to tropics)."),
    ("snoowl1", "Snowy Owl",
     "Rare irruptive. Expect under 40% overall, mostly winter, mostly open areas."),
    ("comloo", "Common Loon",
     "Northern lake bird. Expect 70-90% summer (breeds on lakes), under 50% winter (coastal)."),
    ("wiltur", "Wild Turkey",
     "Patchy, edge habitat. Expect 25-45%, year-round, not in deep boreal or urban."),
    ("killde", "Killdeer",
     "Open ground, widespread. Expect 50-70%, migratory, strong summer bias."),
    ("herwar", "Hermit Warbler",
     "WESTERN species (OR/WA/CA conifers). Should be 0-2% in this range. Any presence is wrong."),
    ("bawwar", "Black-and-white Warbler",
     "Eastern forest breeder. Expect 50-70% summer, under 20% winter (migrates)."),
    ("comyel", "Common Yellowthroat",
     "Widespread wetland edge. Expect 60-80% summer, under 30% winter."),
    ("amewoo", "American Woodcock",
     "Eastern forest, crepuscular. Expect 30-50%, strong summer bias, declining."),
    ("atlpuf", "Atlantic Puffin",
     "Pelagic/coastal islands only. Expect under 25%, restricted to coastal cells, not inland."),
    ("comeid", "Common Eider",
     "Coastal/marine duck. Expect 30-60%, restricted to cells with coastline, not deep interior."),
    ("sprpip", "Sprague's Pipit",
     "Great Plains grassland. Expect under 10% in this range, mostly western Canada, summer only."),
    ("gbbgul", "Great Black-backed Gull",
     "Coastal. Expect 40-60%, concentrated on coast, year-round but more in winter."),
    ("dowwoo", "Downy Woodpecker",
     "Ubiquitous woodland resident. Expect 60-80%, year-round, minimal seasonal swing."),
    ("rthhum", "Ruby-throated Hummingbird",
     "Eastern, migratory. Expect 40-60% summer, under 5% winter (migrates to C. America)."),
    ("cedwax", "Cedar Waxwing",
     "Widespread nomadic. Expect 60-80%, year-round but patchy (follows fruit)."),
    ("daejun", "Dark-eyed Junco",
     "Widespread, northern breeder. Expect 70-90%, year-round but shifts south in winter."),
    ("mallar3", "Mallard",
     "Ubiquitous waterfowl. Expect 80%+, year-round, near any water."),
    ("horgre", "Horned Grebe",
     "Winter coastal in east, summer prairie. Expect 40-70%, more in winter on coast."),
    ("borchi2", "Boreal Chickadee",
     "Northern boreal specialist. Expect 30-60%, year-round, NOT in southern NE."),
    ("gryjay", "Gray Jay",
     "Northern boreal forest. Expect 50-80%, year-round, NOT in southern NE."),
]

print(f"Grid: r3={total_r3} cells, r4={total_r4} cells")
print()

passes = 0
fails = 0

for code, name, expectation in targets:
    r3_file = OUTPUT_DIR / "r3" / "species-weeks" / f"{code}.json"

    if not r3_file.exists():
        print(f"=== {name} ({code}) ===")
        print(f"  NOT IN DATASET")
        print(f"  Expected: {expectation}")
        taxon = name_to_taxon.get(name)
        if taxon and taxon in det_r3:
            direct = len(det_r3[taxon])
            print(f"  BUT has {direct} direct detection cells in archive! Code mismatch?")
        print()
        continue

    r3_data = json.load(open(r3_file))

    r3_cells = set()
    r3_summer = set()
    r3_winter = set()
    r3_summer_freqs = []
    r3_winter_freqs = []

    for wk_str, entries in r3_data.items():
        wk = int(wk_str)
        for cid, freq in entries:
            r3_cells.add(cid)
            if 20 <= wk <= 30:
                r3_summer.add(cid)
                r3_summer_freqs.append(freq / 255.0)
            if wk <= 8 or wk >= 48:
                r3_winter.add(cid)
                r3_winter_freqs.append(freq / 255.0)

    r3_pct = len(r3_cells) / total_r3 * 100
    summer_pct = len(r3_summer) / total_r3 * 100
    winter_pct = len(r3_winter) / total_r3 * 100
    avg_s_freq = sum(r3_summer_freqs) / len(r3_summer_freqs) if r3_summer_freqs else 0
    avg_w_freq = sum(r3_winter_freqs) / len(r3_winter_freqs) if r3_winter_freqs else 0

    taxon = name_to_taxon.get(name)
    direct_cells = len(det_r3.get(taxon, {})) if taxon else 0
    ensemble_added = len(r3_cells) - direct_cells
    expansion = ensemble_added / max(direct_cells, 1)

    # Automated verdict
    issues = []

    # Check species-specific expectations
    if "under 40%" in expectation and r3_pct > 50:
        issues.append(f"Expected <40%, got {r3_pct:.0f}% - over-smoothed")
    if "under 25%" in expectation and r3_pct > 35:
        issues.append(f"Expected <25%, got {r3_pct:.0f}% - spreading inland?")
    if "under 10%" in expectation and r3_pct > 25:
        issues.append(f"Expected <10%, got {r3_pct:.0f}% - spreading too far")
    if "0-2%" in expectation and r3_pct > 5:
        issues.append(f"Western sp at {r3_pct:.0f}% in eastern range - ensemble bleeding")
    if "80%+" in expectation and r3_pct < 60:
        issues.append(f"Expected 80%+, only {r3_pct:.0f}%")
    if "70%+" in expectation and r3_pct < 50:
        issues.append(f"Expected 70%+, only {r3_pct:.0f}%")

    # Migratory checks
    if "under 20% winter" in expectation and winter_pct > 30:
        issues.append(f"Winter presence {winter_pct:.0f}% too high for migrant")
    if "under 5% winter" in expectation and winter_pct > 15:
        issues.append(f"Winter presence {winter_pct:.0f}% too high for long-distance migrant")
    if "under 30% winter" in expectation and winter_pct > 45:
        issues.append(f"Winter presence {winter_pct:.0f}% too high")

    # Expansion check
    if expansion > 5 and direct_cells < 50:
        issues.append(f"High expansion: {direct_cells} direct -> {len(r3_cells)} total ({expansion:.1f}x)")

    verdict = "PASS" if not issues else "FAIL: " + "; ".join(issues)
    if issues:
        fails += 1
    else:
        passes += 1

    print(f"=== {name} ({code}) ===")
    print(f"  Range: {r3_pct:.1f}% of r3 cells ({len(r3_cells)}/{total_r3})")
    print(f"  Direct: {direct_cells} cells, ensemble added: {ensemble_added} ({expansion:.1f}x)")
    print(f"  Summer (wk20-30): {summer_pct:.1f}% cells, avg freq {avg_s_freq:.3f}")
    print(f"  Winter (wk1-8,48-52): {winter_pct:.1f}% cells, avg freq {avg_w_freq:.3f}")
    print(f"  Expected: {expectation}")
    print(f"  Verdict: {verdict}")
    print()

print(f"{'='*60}")
print(f"RESULTS: {passes} PASS, {fails} FAIL out of {passes+fails} checked")
print(f"{'='*60}")
