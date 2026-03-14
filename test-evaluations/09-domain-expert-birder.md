# Domain Expert / Birder Tester Evaluation

**Evaluator Role:** Experienced birder with decades of field experience
**Date:** 2026-03-13
**App Version:** Find-A-Lifer (master branch, commit 36176d1)
**Scope:** Species data accuracy, taxonomy, birding domain correctness, trip planning logic, life list management, and overall birder UX

---

## Executive Summary

Find-A-Lifer is an ambitious tool that addresses a genuine gap in the birding software landscape: helping listers identify where and when to find species they still need. The concept is sound and the technical execution is competent. However, several domain-specific issues would undermine trust with experienced birders, and some design decisions diverge from birding conventions. Below I evaluate each domain area in detail.

---

## 1. Species Data & Count (2,490 species)

### Assessment: Reasonable but needs context

The 2,490 species count is plausible for a dataset covering North America plus the Caribbean and parts of Central America. The eBird Status & Trends 2023 dataset covers roughly 2,000+ species with abundance models. The additional species come from the Avibase merge, which pulls in rare/accidental visitors and introduced species.

**Concerns:**

- **Common Ostrich, Emu, Greater Rhea** are the first three species in the database. These are not wild North American birds. They appear as "Rare/Accidental" but they are almost exclusively captive escapees. An experienced birder seeing Ostrich as species #1 would immediately question the data quality. Most birders following ABA listing rules would not count these.
- **93 introduced species** are included (Swan Goose, Mute Swan, Egyptian Goose, Mandarin Duck, Lady Amherst's Pheasant, Silver Pheasant, etc.). Many of these have no established wild populations in North America. The ABA Checklist is more selective about which introduced species are "countable."
- **No filtering by countability.** The app treats all 2,490 species equally. Birders following ABA rules would want to distinguish ABA-countable species from exotics and escapees. A birder importing their eBird life list would see their count compared against 2,490 total, which inflates the denominator compared to the ~1,050 species on the ABA Checklist proper (or ~1,200 including Hawaiian and Caribbean species).
- **Species not in S&T may lack occurrence data.** Of 2,490 species in the metadata, the weekly data shows only ~1,840-1,850 unique species appearing in any given week. Some species in the list may have no S&T abundance model at all, meaning they appear in the Species checklist but never show up on the map. This should be made explicit.

**Recommendation:** Add a "countable species" filter or ABA-area toggle. At minimum, let users filter out Rare/Accidental species from their progress denominator. Consider adding a field indicating whether a species has S&T data available.

---

## 2. Taxonomy & Taxonomic Ordering

### Assessment: Correct and well-implemented

The species list follows the eBird/Clements taxonomic order, which is the standard used by most North American birders. The `taxonOrder` field ranges from 2.0 (Common Ostrich) to 35846.0 (Slate-colored Grosbeak), and species are sorted accordingly. The ordering I verified is correct:

- Ratites (Ostriches, Emu, Rheas) first
- Waterfowl (Anatidae) early
- Gamebirds follow
- Through to passerines ending with Tanagers and Allies

The family ordering (143 families) follows the expected Clements/eBird sequence. This is a detail that experienced birders would notice and appreciate -- incorrect taxonomic ordering is a common flaw in amateur birding apps.

**Minor note:** The `taxonOrder` values are non-contiguous floats (2.0, 15.0, 32.0, 38.0, 111.0...) which is correct -- eBird uses spaced values to allow insertions. Good implementation detail.

---

## 3. Family Groupings

### Assessment: Accurate, follows eBird conventions

143 unique families are present, matching the Clements/eBird taxonomy. Some notable families that birders would look for:

- "Yellow-breasted Chat" as its own family: Correct. The Chat was split from New World Warblers in 2017 and placed in Icteriidae. Many birders still think of it as a warbler, so this is a good test of taxonomic currency.
- "Wrenthrush" (Zeledoniidae): Correct for the Wrenthrush of Central America.
- "Chat-Tanagers" and "Greater Antillean Tanagers": Correct for Caribbean families.
- "Cuban Warblers" (Teretistridae): Correct, another recently split family.

The family groupings in the Species tab are displayed with collapsible sections, family-level Select All/None, and counts. This matches how birders think about their lists -- by family.

**Well done:** The "Almost Complete Families" suggestion in Goal Birds is an excellent birder-centric feature. Birders love the satisfaction of completing families.

---

## 4. Conservation Status

### Assessment: Uses IUCN categories, correctly implemented

The conservation statuses map to standard IUCN Red List categories:
- Least Concern (1,526 species)
- Near Threatened (125)
- Vulnerable (89)
- Endangered (56)
- Critically Endangered (30)
- Extinct in the Wild (2)
- Data Deficient (12)
- Unknown (650)

**Concerns:**

- **650 species with "Unknown" conservation status** is a large proportion (26%). This suggests incomplete Avibase matching. Most species in the world have been assessed by IUCN, so "Unknown" likely means the data pipeline failed to match the species rather than the species being truly unassessed. This undermines the conservation filtering feature.
- **"Extinct in the Wild" (2 species)** -- these are presumably species like the Socorro Dove or Spix's Macaw. Having them in the database with occurrence data would be misleading. Are they actually appearing on the map? If they have S&T data showing occurrence, something is wrong.
- The colored dot system in the species checklist (yellow for Near Threatened, orange for Vulnerable, red for Endangered/Critically Endangered) is a good visual shorthand, though tiny 1.5px dots may be hard to see.

**Recommendation:** Investigate the 650 "Unknown" species and attempt to fill in their actual IUCN status. Verify that "Extinct in the Wild" species are not appearing on the heatmap.

---

## 5. Difficulty Labels

### Assessment: Novel concept, but the algorithm is questionable

The difficulty scoring system uses four tiers: Easy (486), Moderate (164), Hard (207), Very Hard (1,633).

**How it works:** Difficulty is computed from:
1. Geographic spread (how many Avibase regions the species is present in)
2. Invasion status adjustments (Rare/Accidental gets minimum 0.75 = "Hard")
3. Conservation status adjustments (endangered species get +0.10 to +0.15)

**Problems:**

- **65% of species are "Very Hard."** This is not useful differentiation. When two-thirds of species have the same label, the label conveys almost no information. A Yellow-rumped Warbler (one of the most common and widespread birds in North America) should not receive the same difficulty label as a Gyrfalcon.
- **The algorithm conflates rarity with difficulty.** A species can be widespread and common but genuinely hard to find (e.g., rails, nightjars, owls). Conversely, a species can be geographically restricted but trivially easy to find within its range (e.g., Florida Scrub-Jay at known sites).
- **No consideration of actual S&T abundance data.** The difficulty score ignores the very data the app is built on. A species with high occurrence probability across many cells should be "Easy" regardless of how many Avibase regions it spans. The S&T abundance data is the perfect source for computing actual detectability.
- **Conservation status should not affect difficulty.** Being endangered does not make a species harder to find in the birding sense. California Condors are Critically Endangered but are reliably seen at known sites. Conversely, many Least Concern species are genuinely difficult to detect (e.g., Bicknell's Thrush, Black Rail).

**Recommendation:** Redesign the difficulty algorithm to incorporate actual S&T probability data. Consider metrics like: maximum weekly occurrence probability, number of cells where species appears, coefficient of variation across weeks (seasonal specialists are harder to find at wrong time).

---

## 6. Restricted Range Species

### Assessment: Concept is meaningful, but definition is too broad

The app defines "restricted range" as species present in 2 or fewer Avibase regions as Native/Present. This flags 1,107 of 2,490 species (44%) as restricted range.

**Problems:**

- **44% is far too many.** The BirdLife International definition of "restricted-range species" uses a breeding range of less than 50,000 km2. Having nearly half the species flagged as restricted range makes the label meaningless.
- **The Avibase region count is a poor proxy for actual range size.** A species present in only "US Southeast" and "US West" might have an enormous range spanning millions of square kilometers. Conversely, there are only 5 regions defined (US Northeast, US Southeast, US West, Alaska, Hawaii), so any species limited to a single region gets flagged -- including widespread species that happen to be regional (e.g., many southeastern woodland birds).
- **Many Caribbean and Central American species are flagged as restricted range** simply because they appear in few of the 5 US-centric regions. A species widespread throughout the Caribbean would be labeled "restricted range" in this system.

**Recommendation:** Either use actual range size from S&T data (count of cells where species has occurrence > 0) or remove the label. The current implementation will mislead birders about which species are genuinely range-restricted endemics versus widespread species outside the US.

---

## 7. Probability Display & Interpretation

### Assessment: A critical data integrity issue

**All probabilities are hardcoded to 1.0.** This is the most significant birder-facing data issue in the entire application.

In `main.py`, every API endpoint returns `"probability": 1.0`:
- `/api/weeks/{week_number}` returns `{"cell_id": ..., "species_id": ..., "probability": 1.0}`
- `/api/weeks/{week_number}/species/{species_code}` returns `{"cell_id": ..., "probability": 1.0}`
- All batch endpoints similarly hardcode probability to 1.0

The weekly data files (`week_XX.json`) store only `[[cell_id, [species_id_1, species_id_2, ...]], ...]` -- presence/absence per cell, with no probability values.

The extraction pipeline (`extract_st_data.py`) reads abundance rasters and uses a threshold (`values > 0`) to determine presence, but discards the actual abundance values.

**Impact on birders:**

- **The heatmap cannot show relative abundance.** The viridis color scale is beautifully implemented but has nothing meaningful to display when all values are binary (present/absent). The Species Range view cannot distinguish between a cell where a species has 80% encounter probability versus 0.1% encounter probability. For trip planning, this distinction is everything.
- **Trip planning cannot rank locations by species detectability.** The hotspot scoring counts species presence but cannot weight by how likely you are to actually see each species. A cell with 50 species all at 1% probability is very different from a cell with 50 species all at 80% probability.
- **The "Window of Opportunity" feature loses its key value.** The feature scans all 52 weeks to find when a species is most findable, but without actual probability values, it can only show whether a species is present at all, not when it peaks in abundance. Migration timing becomes binary (there/not there) instead of showing the crescendo of spring passage or fall staging.
- **Sort by probability in trip planning is meaningless.** The sort option exists but all species sort as equal (probability 1.0).

**Recommendation:** This is the highest-priority fix. Preserve the actual abundance/occurrence probability values from the S&T rasters. Even quantizing to 256 levels (uint8) would be vastly better than binary presence/absence. The entire value proposition of using S&T data over simple range maps depends on having probability information.

---

## 8. Trip Planning Logic

### Assessment: Good concept, hampered by missing probability data

The Trip Plan tab offers four modes: Location, Hotspots, Window of Opportunity, and Compare. Each mode addresses a real birding planning use case.

**Hotspot Scoring:**
- Ranks grid cells by count of unseen species (lifers) present in that cell for a given week
- This is a reasonable heuristic for "where should I go to add the most species to my list"
- With real probability data, this could be weighted to favor cells where lifers are more reliably detectable

**Location Mode:**
- Shows potential lifers at a selected grid cell across a week range
- Supports sorting by probability, name, and family
- The week range slider (start week to end week) is a nice touch for planning multi-day trips

**Window of Opportunity:**
- Scans all 52 weeks to show when a target species is most findable
- Shows top locations for each week
- Excellent concept -- this directly addresses the "when should I go look for Species X" question

**Compare Mode:**
- Compare two locations side-by-side showing overlapping and unique lifers
- Addresses the "should I go to location A or location B" question
- Shows shared species and location-exclusive species

**Concerns:**

- **Region filtering is limited.** Only 5 US-centric regions with extremely coarse bounding boxes. No Canada, Mexico, Caribbean regions despite species data covering those areas. An Alaska birder would find the bounding box `[-180, 51, -130, 72]` includes a lot of empty ocean.
- **Grid cells are not labeled with human-readable locations.** Cells show only coordinates like "42.50 N, 73.20 W" which most birders cannot mentally map to a county or landmark. Integration with reverse geocoding or at least state/province labels would help enormously.
- **No connection to actual eBird hotspot data.** The "hotspots" in this app are grid cells ranked by lifer count. Real eBird hotspots are specific birding locations with names, checklists, and access information. The terminology overlap may confuse eBird users.

**Recommendation:** Rename "Hotspots" to "Top Cells" or "Lifer Hotspots" to avoid confusion with eBird hotspots. Add human-readable location labels. When probability data is added, weight the hotspot scoring by detection probability.

---

## 9. Window of Opportunity Concept

### Assessment: Ornithologically excellent concept

This is perhaps the most innovative feature for experienced birders. The idea of visualizing the best week to target a specific species across the entire year addresses a fundamental birding question: "When is the best time to find this bird?"

For migratory species, this would show the spring passage peak, the breeding season plateau, and the fall movement. For irruptive species, it could reveal winter invasion patterns. For resident species, it confirms year-round presence.

**Current limitations:**

- Without real probability data, the window shows only presence/absence transitions, missing the critical peak timing information
- The feature does not account for the user's location, so it shows the species' global best weeks rather than best weeks near the user
- No ability to combine multiple target species into a single trip window (e.g., "When can I get both Kirtland's Warbler and Connecticut Warbler in Michigan?")

---

## 10. Weekly Resolution

### Assessment: Appropriate for the data source

52-week resolution aligns directly with the eBird Status & Trends data structure, which provides weekly abundance estimates. This temporal granularity is well-suited for tracking migration timing:

- Spring warbler waves typically peak over 2-3 weeks at a given latitude
- Shorebird passages can be captured at weekly resolution
- Breeding season arrival/departure dates are resolvable

**Minor concern:** The week-to-date conversion uses `dayOfYear = week * 7 - 3`, which is approximate. Week 1 maps to January 4, week 52 to December 31. This is close enough for birding purposes but could be confusing at year boundaries.

---

## 11. Life List Management

### Assessment: Functional but limited compared to birder expectations

**What works well:**
- Simple checkbox toggle for marking species as seen/unseen
- Family-level Select All/None for quick bulk operations (useful for birders who have seen all North American warblers, for instance)
- CSV import from eBird with common name and scientific name matching
- CSV export with species code, common name, scientific name, and family
- Import shows merge statistics (new vs. already existing)
- IndexedDB persistence survives browser refreshes

**What experienced birders would miss:**

- **No date tracking.** The `dateAdded` field records when the species was marked in the app, not when the birder actually saw it. Birders care deeply about first-seen dates. Their life list is chronological -- they remember their 100th species, their first pelagic trip, their first owl.
- **No location tracking.** Where you first saw a species matters to birders. Even a simple state/country field would add value.
- **No year lists.** Most active birders maintain a year list alongside their life list. Being able to track 2026 year birds versus all-time birds is fundamental.
- **No county/state/country list support.** Many birders maintain geographic sublists. The app's total count of 2,490 species as the single denominator does not match any standard list authority's count.
- **No heard-only or uncertain sighting distinction.** Some birders distinguish between birds they have seen versus birds they have only heard. The eBird data model supports this.
- **No notes field.** Birders like to record memorable sightings with brief notes.
- **CSV import only matches on exact common name or scientific name.** If a user's eBird export uses a slightly different name (e.g., due to a recent taxonomic split or name change), the match fails silently. The unmatched count is reported but the specific unmatched species names are not shown to the user.

**Recommendation:** At minimum, add date-of-sighting and show unmatched species names during import. Consider adding year list tracking as a high-value addition.

---

## 12. Goal Bird Concept

### Assessment: Excellent match for birding culture

The "Goal Birds" concept maps directly to how birders think. Every birder has a mental (or written) list of target species. The implementation supports:

- Multiple named goal lists (e.g., "Texas Trip Targets", "Winter Finches", "Southeast Specialties")
- Adding species from the checklist or from the Goal Birds tab search
- Curated suggestion categories that demonstrate genuine birding knowledge

**Curated Suggestions -- Domain Accuracy:**

The suggestion categories show impressive birding knowledge:

- **Regional Icons** (Southwest, Southeast, Northeast, etc.) -- Species selections are well-chosen. Greater Roadrunner for Southwest, Florida Scrub-Jay for Southeast, Bicknell's Thrush for Northeast, Henslow's Sparrow for Midwest, White-tailed Ptarmigan for Rockies. These are species that birders genuinely target when visiting these regions.
- **Colorful Characters** -- Painted Bunting, Scarlet Tanager, Roseate Spoonbill, Wood Duck. Excellent selections that any birder would agree are showstoppers.
- **Owls and Nightbirds** -- Comprehensive list of 24 species covering owls, nightjars, and nighthawks. Good inclusion of Elf Owl, Flammulated Owl, and Common Pauraque.
- **Raptors** -- 25 species including the California Condor, Crested Caracara, and all expected hawks, eagles, and falcons. Correctly includes vultures.
- **LBJs (Little Brown Jobs)** -- A term every birder knows. Good selection of sparrows, wrens, and pipits that challenge identification skills.
- **Almost Complete Families** -- Algorithmically identifies families where the user has seen most species. This is deeply satisfying for completionist birders.

**Concerns:**

- **Seasonal Specialties and Migrants suggestions reference `seasonalityScore` and `rangeShiftScore` fields that do not exist in the actual data.** The species.json has no `seasonalityScore`, `peakWeek`, or `rangeShiftScore` fields. The types.ts defines them but the build_species_metadata.py pipeline does not compute them. These suggestion categories will always show empty lists because the filter `(sp.seasonalityScore ?? 0) >= 0.5` always evaluates to `(0) >= 0.5` = false.
- **Goal Birds mode on the map** overlays species from the active goal list on the heatmap, which is a clever integration. But without probability data, it only shows presence/absence.

---

## 13. Species Search & Filtering

### Assessment: Solid implementation

- Search by common name and scientific name with autocomplete (top 10 results)
- Filter by family, conservation status, invasion status, and difficulty
- Region-based filtering limits species to those present in selected region
- Autocomplete highlights and scrolls to the selected species in the checklist
- Clear Filters button with count badge

**Concerns:**

- **No search by species code.** Many eBird-savvy birders know species codes (e.g., "AMRO" for American Robin, though eBird uses "amerob"). The Goal Birds tab does support species code search, but the Species tab does not. This is inconsistent.
- **No search by order.** Some birders think in terms of orders (Passeriformes, Charadriiformes, etc.). This is a minor omission.
- **Region filter only has 5 regions** with very few species per region (9, 8, 5, 3, 1). These appear to be curated "specialty" species rather than comprehensive regional species lists. A birder selecting "US Northeast" and seeing only 9 species would be confused.

---

## 14. Photo Support

### Assessment: Not implemented

All 2,490 species have empty `photoUrl` fields. The SpeciesInfoCard shows a placeholder "No photo available" graphic. Species photos are a critical engagement feature for birders -- seeing a photo helps confirm identification and provides motivation for seeking the species.

**Recommendation:** Integrate Macaulay Library photo URLs (as noted in the code comments). Even thumbnail-quality images would significantly improve the species browsing experience.

---

## 15. Geographic Coverage

### Assessment: Global grid, limited UI regions

The grid data covers latitudes from -56.29 to 80.85 and longitudes from -180.00 to 179.92 -- essentially global coverage. The weekly occurrence data uses 268,000-450,000 cells per week, confirming coverage across the Americas.

However, the UI only defines 5 regions for filtering: US Northeast, US Southeast, US West, Alaska, Hawaii. There are no regions for:
- **Canada** (no provinces/territories)
- **Mexico** (no states)
- **Caribbean** (despite having Caribbean species like Lesser Antillean Saltator, Cuban Warblers)
- **Central America** (despite species like Slate-colored Grosbeak, Wrenthrush)

This is a significant gap. A birder planning a trip to Costa Rica, Belize, or the Caribbean would see these species in the database but have no regional filter to find them. The grid data covers these areas, but the UI does not expose this coverage.

**Recommendation:** Add at minimum Canada, Mexico, and Caribbean as selectable regions. Consider using the S&T data extent to define natural biogeographic regions.

---

## 16. Missing Birding Features

From a seasoned birder's perspective, the following features would add significant value:

| Feature | Birder Value | Difficulty |
|---------|-------------|------------|
| **Subspecies display** | High for advanced birders | Moderate -- eBird taxonomy includes subspecies groups |
| **Year list tracking** | Very high -- most active birders track year lists | Low -- extend IndexedDB schema with date |
| **State/province lists** | High for listing enthusiasts | Moderate -- need geographic intersections |
| **eBird Hotspot integration** | Very high -- link grid cells to actual birding sites | Moderate -- eBird API provides hotspot data |
| **Recent notable sightings** | Very high for chasing rarities | High -- requires eBird API integration |
| **Checklist submission** | Would close the loop between planning and recording | Very high -- deep eBird integration |
| **Bird call/song playback** | Moderate -- helps with identification | Moderate -- Macaulay Library audio |
| **Phenology charts** | High -- show occurrence across weeks for a species | Low -- data already exists |
| **Multi-species trip optimizer** | Very high -- "maximize lifers on a 3-day trip" | High -- combinatorial optimization |

---

## 17. What the App Does Well

Credit where due -- several aspects show genuine birding domain understanding:

1. **Taxonomic ordering** is correct and follows current eBird/Clements taxonomy
2. **Family-based organization** matches how birders think about their lists
3. **Goal bird lists** with curated regional suggestions show birding knowledge
4. **LBJ category** -- knowing this term and selecting appropriate species shows birder credibility
5. **Window of opportunity concept** is innovative and addresses a real planning need
6. **Location comparison** for trip planning is practical
7. **Almost Complete Families** suggestion taps into the completionist psychology of listers
8. **eBird CSV import** with merge semantics handles the most common import use case
9. **Dark mode** for nighttime trip planning sessions
10. **The curated raptor, owl, and colorful bird lists** are ornithologically accurate and show genuine field knowledge

---

## 18. Summary of Issues by Severity

### Critical (breaks core functionality for birders)
1. **All probability data is binary (1.0)** -- the S&T abundance values are discarded in the pipeline, removing the app's key differentiator over simple range maps
2. **Seasonal and Migrant suggestions are non-functional** -- `seasonalityScore`, `peakWeek`, and `rangeShiftScore` fields are defined in TypeScript types but never populated in the data

### High (significantly impacts birder experience)
3. **Difficulty labels are not useful** -- 65% of species are "Very Hard" due to a flawed algorithm
4. **Restricted range label applies to 44% of species** -- too broad to be meaningful
5. **650 species (26%) have "Unknown" conservation status** -- suggests data pipeline gaps
6. **No date or location tracking for life list entries** -- fundamental for birders
7. **Only 5 US-centric regions despite hemispheric coverage** -- Canada, Mexico, Caribbean users underserved
8. **No species photos** -- all 2,490 photoUrl fields are empty

### Medium (notable gaps in birding functionality)
9. **No year list tracking** -- most active birders maintain annual lists
10. **Unmatched species not shown during CSV import** -- user cannot troubleshoot mismatches
11. **Grid cells labeled only by coordinates** -- no human-readable location names
12. **"Hotspots" terminology conflicts with eBird usage** -- may confuse users
13. **Non-countable species (escapees, exotics) inflate the total** -- no ABA countability filter

### Low (polish and enhancement opportunities)
14. **No subspecies support** -- advanced listers track subspecies groups
15. **No species code search in Species tab** (only in Goal Birds tab)
16. **Region filter species counts are very small** (1-9 species per region) -- appears to be specialty species only, not full regional lists
17. **Conservation status dots in checklist are very small** (1.5px) -- may be hard to see
18. **Week-to-date conversion is approximate** -- minor display issue at year boundaries

---

## 19. Final Assessment

Find-A-Lifer has a strong conceptual foundation and gets many birding-specific details right. The taxonomy is current, the family groupings are correct, the curated goal bird suggestions demonstrate genuine ornithological knowledge, and the trip planning modes address real birding needs.

The critical gap is the loss of probability data in the pipeline. The app's entire value proposition -- distinguishing itself from static range maps -- depends on showing where and when species are most detectable. With binary presence/absence, the heatmap, hotspot scoring, and window of opportunity features all lose their analytical edge.

The secondary cluster of issues around difficulty labels, restricted range definitions, and conservation status coverage reflects the challenge of deriving useful birder-facing metrics from coarse regional data. The underlying S&T abundance data contains far richer information than what the metadata pipeline currently extracts.

With probability data restored and the difficulty/restricted-range algorithms reworked, this app would offer birders something genuinely novel: a data-driven trip planning tool built on the best available species distribution models. That is a tool worth building well.
