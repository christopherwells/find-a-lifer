# Find-A-Lifer Roadmap

*Generated from team evaluation session — March 17, 2026*
*Based on feedback from 6 simulated user personas + dev team analysis*

---

## Context & Principles

- **Primary audience:** Power birders who use eBird, plan trips, and track life lists
- **Secondary audience:** Beginner birders who may benefit from a friendlier on-ramp
- **This is a planning & milestone app**, not a field ID tool — it complements Merlin/eBird, doesn't replace them
- **Static PWA architecture** — no backend at runtime; all enhancements must work within pre-computed data + client-side computation
- **eBird data integrity** — gamification must never incentivize false eBird reports; the app's life list is separate from eBird
- **Difficulty filter** is deferred until data reaches critical mass across all of North America

---

## Testing Strategy

### Principles
- **Every feature ships with tests.** No feature is "done" until its acceptance criteria are met and all specified tests pass.
- **Regression is mandatory.** Each phase includes regression tests verifying that existing features still work after new additions.
- **Three testing layers:**
  1. **Playwright E2E** — Full user flows in a real browser. Covers navigation, interactions, visual state, mobile responsiveness.
  2. **Unit / Integration** — Pure logic: algorithms, data transformations, cache behavior, utility functions. Run with Vitest or Jest.
  3. **Pipeline** — Python tests validating data output: species.json schema, covariate computation, photo fetch, conservation status merge.

### Test Infrastructure Setup
- **Playwright**: Install `@playwright/test`, configure for Chromium + mobile viewport. Test against dev server with fixture data.
- **Vitest**: Configure for frontend unit tests. Mock fetch for dataCache tests; use real IndexedDB polyfill for life list / goal list tests.
- **Pipeline (pytest)**: Add `pipeline/tests/` with fixtures (small sample EBD, sample species.json). Validate output schema and computation correctness.
- **CI**: All three layers run on every PR. Playwright tests use a fixture dataset (small, deterministic) not full production data.
- **Fixture data**: Create a minimal test dataset (~20 species, ~10 cells, 4 weeks) for deterministic test runs.

---

## Phase 1 — Onboarding & Polish

*Low effort, high impact. Makes the app welcoming without changing core functionality.*

### 1.1 First-Launch Onboarding Overlay

**Description:** 3-slide dismissible welcome tutorial introducing the app to new users.
- Slide 1: "Find-A-Lifer helps you discover bird species you've never seen — your 'lifers.'"
- Slide 2: "The map shows where new species await, week by week. Brighter colors = more lifers to find."
- Slide 3: Two CTAs — "Browse Species" (→ Species tab) / "Import eBird Life List" (→ Profile tab)
- Store `hasSeenOnboarding` in localStorage; "?" button in TopBar to replay

**Acceptance criteria:**
- Overlay appears on first launch (no `hasSeenOnboarding` in localStorage)
- Does NOT appear on subsequent launches
- "?" button in TopBar re-launches the overlay at any time
- Each slide has a "Next" button; final slide has two CTA buttons that navigate to the correct tabs
- "Skip" button on every slide dismisses the overlay and sets `hasSeenOnboarding`
- Overlay renders correctly on mobile (320px width) and desktop (1440px width)
- Overlay has a semi-transparent backdrop; map is not interactive while overlay is open
- Pressing Escape dismisses the overlay

**Tests:**
- *Playwright*: First launch shows overlay → click through all 3 slides → verify CTAs navigate correctly → reload → verify overlay does not reappear → click "?" → verify overlay reappears
- *Playwright (mobile)*: Same flow at 375px viewport width
- *Regression*: Map loads correctly after overlay dismissal; all tabs still function

### 1.2 Contextual Tooltips

**Description:** Info icons (ⓘ) next to jargon terms throughout the app, expanding on tap/hover with plain-language explanations.

**Terms to cover:**
- View modes: Richness, Frequency, Range, Goals
- Concepts: Reporting frequency, Life list, Lifer, Lifer density
- Conservation status: LC, NT, VU, EN, CR, DD (full name + one-sentence explanation)
- Invasion status: Native, Introduced, Vagrant/Accidental
- Any other domain-specific term visible in the UI

**Acceptance criteria:**
- Every jargon term in the UI has an adjacent ⓘ icon
- Tapping/hovering the icon shows a tooltip with a plain-language explanation (1-2 sentences max)
- Tooltips dismiss on tap-away or mouse-leave
- Tooltips don't overflow viewport on mobile (reposition if near edge)
- Tooltips are consistent in style (same font, padding, background, max-width)
- Conservation status badges throughout the app show full name on hover/tap (e.g., "EN" → "Endangered — very high extinction risk")
- Tooltips work in both light and dark mode

**Tests:**
- *Playwright*: For each tooltip location — hover/tap ⓘ → verify tooltip text appears → tap away → verify tooltip dismisses
- *Playwright (mobile)*: Verify tooltips don't overflow at 375px width
- *Unit*: Tooltip component renders correct text for each term key
- *Regression*: Species tab filters still function; view mode switching still works

### 1.3 Badge Unification & Design System

**Description:** Audit and unify all badge usage across the app into a single consistent component.

**Current state:** Conservation status uses tiny colored dots in species list, abbreviations in filter dropdowns, and full names in info cards — three different formats. Invasion status and restricted range badges are similarly inconsistent.

**Acceptance criteria:**
- A single `<Badge>` component is used everywhere: species list rows, info cards, map popups, goal list entries, progress tab
- Badge format: compact pill shape with consistent color coding
  - Conservation: green (LC), yellow (NT), orange (VU), red (EN/CR), gray (DD)
  - Invasion: amber (Introduced), blue (Vagrant), no badge (Native)
  - Restricted range: blue pill
  - Habitat badges (future, Phase 2.5): earthy tones
- All badges show full label on hover/tap (integrates with 1.2 tooltip system)
- Badge colors meet WCAG AA contrast ratio in both light and dark mode
- No remaining instances of the old dot/abbreviation/full-name formats

**Tests:**
- *Playwright*: Navigate to Species tab → verify badges render on species rows → click species → verify same badge style in info card → click map cell → verify same badge style in popup
- *Unit*: Badge component renders correct color/label for each status value
- *Regression*: Species filtering by conservation status still works; SpeciesTab scroll performance not degraded

### 1.4 About Page

**Description:** New page accessible from Profile tab or TopBar containing app information, responsible birding guidance, and credits.

**Contents:**
- What is Find-A-Lifer? — Brief app description
- How the data works — Plain-language eBird/H3/weekly model explainer
- Responsible birding — Ethics guidance, ABA Code of Birding Ethics link, sensitive species awareness
- Data freshness — Last rebuild date, included regions
- Credits — eBird, IUCN, Wikidata, GeoNames, OSM, Wikimedia Commons photo contributors
- Photo credits — Aggregate attribution for Wikimedia Commons images
- App version + "Check for Updates" link
- Feedback/contact link

**Explore tab integration:**
- Persistent "Bird responsibly" footer/note in Explore tab with link to ABA Code of Birding Ethics
- Footer is subtle but always visible (not scrolled away or hidden behind interactions)
- "Sensitive Species" annotation in map popups for flagged species (if eBird sensitive species data available in future)

**Acceptance criteria:**
- Accessible via a link/button in Profile tab AND a link in TopBar
- All content sections are present and render correctly
- Responsible birding section is prominent and above the fold (not buried at the bottom)
- Explore tab shows a persistent "Bird responsibly" footer with ABA Code of Birding Ethics link
- Footer does not overlap map controls on mobile
- Data freshness date is dynamically read from data (not hardcoded)
- External links open in new tabs
- Page scrolls correctly on mobile; no horizontal overflow
- Works in both light and dark mode

**Tests:**
- *Playwright*: Navigate to About page from Profile tab → verify all sections present → verify external links have `target="_blank"` → navigate from TopBar → verify same page
- *Playwright*: Navigate to About page → verify Responsible Birding section is visible without scrolling
- *Playwright*: Navigate to Explore tab → verify "Bird responsibly" footer visible → verify ABA link opens in new tab
- *Playwright (mobile)*: Verify page scrolls and no content is cut off at 375px; verify footer doesn't overlap map controls at 375px
- *Regression*: Profile tab import/export still works; TopBar dark mode toggle unaffected

### 1.5 Small UX Polish

**Description:** Minor fixes surfaced during evaluation.

#### 1.5a Week Animation Wrap Indicator
- Add visual indicator (brief pause or pulse) at week 52→1 transition

**Acceptance criteria:**
- Animation pauses for 500ms at week 52 before wrapping to week 1
- Slider visually indicates the wrap (brief highlight or pulse on the track)

**Tests:**
- *Playwright*: Start animation at week 50 → wait → verify pause occurs at week 52 → verify animation continues at week 1

#### 1.5b Map Popup Pagination
- Cap species list at 20 items with "Show all N species" expander

**Acceptance criteria:**
- Popups with ≤20 species show all species (no change)
- Popups with >20 species show first 20 + "Show all N species" button
- Clicking the button expands to show full list
- Popup scroll position is maintained after expansion

**Tests:**
- *Playwright*: Click cell with <20 species → verify no "Show all" button → click cell with >20 species → verify button present → click button → verify full list shown
- *Regression*: Cell click still opens popup; species seen toggle in popup still works

#### 1.5c Mobile Species List Layout
- Tighten species row layout on small screens; move goal-add button to overflow menu or swipe action

**Acceptance criteria:**
- Species rows don't overflow or wrap awkwardly at 320px width
- All interactive elements (checkbox, name, badges, goal button) remain accessible
- Goal-add button is accessible via overflow or secondary interaction on mobile

**Tests:**
- *Playwright (mobile)*: Scroll through species list at 375px → verify no horizontal scroll → verify checkbox and goal-add are tappable

#### 1.5d GPS Locate Button
- Add MapLibre's GeolocateControl to the map

**Acceptance criteria:**
- Blue "locate me" button appears on the map (standard MapLibre position)
- Clicking it prompts for geolocation permission (browser native)
- On permission grant: map centers on user's position with a blue dot marker
- On permission deny: button shows disabled state, no error crash
- Works on mobile PWA

**Tests:**
- *Playwright*: Verify GeolocateControl button is present on map → mock geolocation API → click → verify map centers on mocked coordinates
- *Regression*: Map zoom, pan, cell click, resolution switching all still work

#### 1.5e Map Popup → Species Info Card
- Make species names in cell click popups tappable → opens the existing SpeciesInfoCard modal
- Provides immediate context (photo, habitat, peak season) for any species encountered on the map
- Serves both new users (want context) and power users (want details)

**Acceptance criteria:**
- Species names in map cell popups are styled as tappable links (underline or color change on hover)
- Tapping a species name opens the SpeciesInfoCard for that species
- Info card opens as a modal/overlay, not replacing the popup
- Popup remains open behind the info card (user can return to it)
- Works on mobile (info card is full-screen or bottom sheet)
- Info card "close" returns to the popup view

**Tests:**
- *Playwright*: Click cell → verify popup opens → click species name → verify info card opens → verify species name matches → close info card → verify popup still visible
- *Playwright (mobile)*: Same flow at 375px → verify info card is usable
- *Regression*: Popup species list still scrollable; seen/unseen toggle in popup still works; popup close still works

### 1.6 Progressive Disclosure / Beginner Mode

**Description:** Reduce UI complexity for first-time users by defaulting to a simplified Explore tab view. Complements onboarding (1.1) which explains concepts — this feature reduces what's shown.

- Default first-launch Explore tab to simpler view: show only "Richness" mode, hide opacity/lifer-range sliders behind "Advanced" accordion
- Full UI available once user opts in or after N sessions
- Store preference in localStorage alongside `hasSeenOnboarding`

**Acceptance criteria:**
- First launch shows simplified Explore tab: only Richness mode visible, no opacity/lifer-range sliders
- "Advanced" accordion/toggle reveals full controls (all view modes, sliders)
- User preference persists in localStorage (`beginnerMode`)
- After N sessions (configurable, default 3) or manual opt-in, full UI becomes default
- All features remain accessible — beginner mode hides, doesn't remove
- Works on both mobile and desktop

**Tests:**
- *Playwright*: First launch → verify only Richness mode shown → verify no opacity/lifer-range sliders → click "Advanced" → verify full controls appear → reload → verify preference persisted
- *Playwright*: Set session count to N → reload → verify full UI is default
- *Playwright (mobile)*: Same flow at 375px viewport
- *Unit*: Session counting logic correctly tracks visits and triggers mode switch
- *Regression*: All view modes still accessible after expanding advanced; map rendering unaffected; existing Explore tab filters still work

### 1.7 Guided Starter Checklist for Non-eBird Users

**Description:** For users without an eBird CSV, provide a quick-start flow to seed their life list. Final onboarding slide or Profile tab section shows top 20–30 common species for user's approximate region (derived from species.json reporting frequencies) with photos (when available from 2.7, fallback silhouettes initially). Users check off what they've seen as a quick seed for their life list.

**Acceptance criteria:**
- Accessible from final onboarding slide CTA ("I don't use eBird") AND from Profile tab ("Quick Start" section)
- Shows 20–30 most common species for the region with highest data coverage (or user-selected region)
- Species are ranked by average reporting frequency across all weeks
- Each species row shows: photo thumbnail (or silhouette fallback), common name, family group
- Checkboxes allow marking species as seen
- "Done" button adds all checked species to life list
- Shows count: "You've identified X species — great start!"
- Does not duplicate species already in life list
- Works on mobile with scrollable list

**Tests:**
- *Playwright*: Launch as new user → proceed through onboarding → click "I don't use eBird" → verify starter checklist appears → verify 20–30 species shown → check 5 species → click Done → verify 5 species added to life list → navigate to Profile tab → verify Quick Start section present
- *Playwright*: Import life list with 10 species → open Quick Start → verify those 10 are pre-checked or excluded
- *Playwright (mobile)*: Verify checklist scrolls smoothly at 375px
- *Unit*: Common species ranking correctly sorts by average reporting frequency; deduplication with existing life list works
- *Regression*: Regular CSV import still works; life list state consistent after using starter checklist

---

### Phase 1 Regression Suite

After all Phase 1 items are complete, run the following regression tests to verify no existing functionality was broken:

- Map loads and renders grid at all 3 resolutions
- Week slider changes heatmap data
- All 4 view modes (Richness, Frequency, Range, Goals) render correctly
- Cell click opens popup with species list
- Species tab: search, filter (region, conservation, invasion, seen/unseen), checkbox toggle all work
- Goal list: create, rename, delete, add/remove species
- Life list: CSV import, CSV export, manual toggle, clear all
- Dark mode toggle applies to all components
- Mobile bottom sheet opens/collapses; tab switching works
- Profile tab: all actions functional
- Beginner mode toggle works; full UI accessible after expanding "Advanced" controls
- Explore tab "Bird responsibly" footer renders and ABA link works
- Starter checklist species match expected common species; life list updated correctly after completion
- Map popup species names open info card; popup remains accessible after card dismissal

---

## Phase 2 — Core Feature Enhancements

*Medium effort. Adds significant new value for power birders.*

### 2.1 Multi-Species Window of Opportunity (Goal List Integration)

**Description:** "I have a goal list with 12 target species. When and where do the most targets overlap at peak frequency?"

**Algorithm:**
1. For each week in selected range, for each cell:
   - Count how many goal-list species are present at >X% frequency
   - Compute combined frequency for goal-list species
2. Rank week-cell combinations by number of co-occurring targets
3. Return top N results

**UI:** New mode in TripPlanTab alongside existing Window of Opportunity.
- Table: Week range | Location | # targets present | Combined frequency | Species list (expandable)
- Option to highlight top cells on map for selected week range

**Data:** Uses existing weekCells data + goal list species IDs; no pipeline changes needed.

**Acceptance criteria:**
- User can select any goal list from dropdown and see ranked results
- Results appear within 3 seconds for a 20-species goal list across 52 weeks
- Each result row shows: week range, location label, # targets present, combined frequency, expandable species list
- Results respect active region filter (if set)
- Empty goal list shows helpful message ("Add species to your goal list to find optimal trip windows")
- Goal list where all species are already seen shows appropriate message
- Single-species goal list falls back gracefully (equivalent to existing single-species Window of Opportunity)
- Results can be visualized on map (highlight top cells for selected week range)
- Works on mobile (table scrolls horizontally if needed, or cards stack vertically)

**Tests:**
- *Playwright*: Create goal list with 5 species → navigate to Trip Plan → select multi-species Window of Opportunity → select goal list → verify results appear with correct columns → expand a species list → verify species shown → click "show on map" → verify cells highlighted
- *Playwright*: Test with empty goal list → verify helpful message
- *Playwright*: Test with goal list where all species are seen → verify appropriate message
- *Playwright (mobile)*: Verify results are usable at 375px
- *Unit*: Algorithm returns correct top-N for fixture data (known species, known cells, known frequencies)
- *Unit*: Algorithm handles edge cases — species with no data for selected weeks, single-species lists, zero-frequency cells
- *Regression*: Existing single-species Window of Opportunity still works unchanged; Hotspots, Compare, and Location modes unaffected

### 2.2 Collaborative Goal Lists & Combined Life Lists

**Description:** Share goal lists and combine life lists for trip planning with a partner.

**Goal list sharing:**
- Export goal list as JSON (download or copy-to-clipboard)
- Import shared goal list from file or pasted JSON

**Combined life list mode:**
- Import partner's eBird life list CSV as a second life list
- Toggle: "Show lifers for: Me / Partner / Both of us"
- "Both" mode filters to species NEITHER person has seen
- Map heatmap and cell popups update accordingly

**Acceptance criteria:**
- Export button on any goal list produces a JSON file containing list name + species codes
- Import accepts that JSON and creates a new goal list (with duplicate name handling)
- Copy-to-clipboard works and shows confirmation toast
- Partner life list import uses same CSV parser as regular import; stored separately
- "Show lifers for" toggle appears when partner list is loaded
- "Me" mode: identical to current behavior
- "Partner" mode: map shows species unseen by partner (ignoring your list)
- "Both" mode: map shows only species unseen by BOTH
- Cell popups in "Both" mode annotate each species: "New for you: ✓/✗ | New for partner: ✓/✗"
- Trip planning tabs respect the active toggle (hotspots show combined lifers in "Both" mode)
- Partner list can be removed/replaced without affecting your own life list
- Partner list persists across sessions (IndexedDB)

**Tests:**
- *Playwright*: Create goal list → export as JSON → delete list → import JSON → verify list recreated with same species
- *Playwright*: Import own life list (50 species) → import partner list (40 species, 20 overlap) → toggle to "Both" → verify map reflects 30 fewer seen species than "Me" mode → click cell → verify annotations
- *Playwright*: Toggle between Me/Partner/Both → verify heatmap changes each time
- *Playwright*: Remove partner list → verify toggle disappears → verify "Me" mode still works
- *Unit*: Combined unseen computation is correct for known fixture data (species A seen by me, species B seen by partner, species C seen by both, species D seen by neither)
- *Unit*: JSON export/import roundtrip preserves all data
- *Regression*: Single-user life list workflow (import, export, toggle, clear) still works; goal list CRUD unaffected

### 2.3 Conservation & Regional Goal List Templates

**Description:** Two types of goal list templates: (1) hand-curated editorial lists that require human judgment, and (2) dynamically computed regional lists generated from species.json data.

**Curated templates (hand-picked, not computable):**
- Colorful Characters, Owls & Nightbirds, and similar editorial lists
- These require human curation and remain static

**Conservation templates (computed from species.json):**
- "Threatened species in [region]" — EN + CR + VU filtered by region
- "Data Deficient species in [region]" — DD species needing research
- "Invasive species in [region]" — Introduced species for awareness

**Regional templates (computed per-region from species.json):**
- "Rarest in Your Area" — lowest average reporting frequency species present in selected region (present in ≥2 cells)
- "Regional Icons" — species with highest concentration in selected region relative to other regions
- Sub-regions: Once US data arrives, break into Northeast, Southeast, Midwest, Southwest, West, Pacific Northwest. Canada splits into East and West. Mexico standalone.

**UI:** New "Conservation Goals" and "Regional Goals" sections in GoalBirdsTab with region selector → preview → one-click "Create Goal List."

**Acceptance criteria:**
- Conservation Goals section appears in GoalBirdsTab below existing curated suggestions
- Regional Goals section appears with region-aware templates
- Region selector dropdown matches existing region filter (same options, same groups)
- Selecting a region + template type shows a preview list of matching species with count
- "Create Goal List" button creates a new goal list with those species (named e.g., "Threatened — Northeast")
- "Rarest in Your Area" dynamically computes rarest 15–20 species for selected region (lowest avg reporting frequency, present in ≥2 cells)
- "Regional Icons" shows species with highest concentration in selected region relative to other regions
- Sub-regions available for US and Canada when data supports it
- Computed lists update automatically when new region data is added to species.json
- Templates update dynamically as species.json data changes
- Empty results (e.g., no DD species in selected region) show "No matching species" message
- Created lists appear in the regular goal list dropdown and work with all existing features (including multi-species Window of Opportunity)

**Tests:**
- *Playwright*: Navigate to Goals tab → scroll to Conservation Goals → select region "US" → select "Threatened" → verify preview shows species with VU/EN/CR status → click Create → verify list appears in dropdown → verify list species are correct
- *Playwright*: Select region with no DD species → select "Data Deficient" → verify "No matching species" message
- *Playwright*: Select "Rarest in Your Area" for a region → verify results show low-frequency species → verify results change when switching regions
- *Unit*: Template generation correctly filters species.json by conservation status + region
- *Unit*: "Rarest in Your Area" computation returns correct species for fixture data (known frequencies, known region memberships)
- *Unit*: Regional Icons concentration metric correctly identifies species disproportionately present in one region
- *Regression*: Existing curated suggestions still work; goal list CRUD unaffected; map goal-birds mode still works with conservation-generated lists

### 2.4 Year-List Support via eBird CSV Import

**Description:** Import a yearly eBird life list separate from the lifetime list, with optional pace tracking.

**Workflow:**
- Profile tab: "Import Year List" button
- Same CSV parser; stored in IndexedDB with year tag
- Progress tab: toggle between "Lifetime" and year list views
- Map heatmap can toggle to year-list lifers

**Acceptance criteria:**
- "Import Year List" button appears in Profile tab below existing life list import
- Import dialog allows user to name the year (default: current year)
- Year list stored separately from lifetime list in IndexedDB
- Progress tab shows a toggle: "Lifetime" / "[Year] Year List"
- Year list view shows same stats (species count, %, milestones, group breakdown) scoped to year list
- Map heatmap respects year list toggle — shows species unseen on the year list (not lifetime list)
- Cell popups respect the toggle
- Multiple year lists can coexist (e.g., 2025 and 2026)
- Year list can be deleted without affecting lifetime list
- Pace tracking (stretch): "X species, Y weeks elapsed, on pace for Z by Dec 31"

**Tests:**
- *Playwright*: Import lifetime list → import year list (subset) → toggle to year list in Progress tab → verify stats reflect year list only → toggle to lifetime → verify stats reflect lifetime
- *Playwright*: Toggle year list on map → verify heatmap changes → click cell → verify popup shows year-list lifers
- *Playwright*: Import second year list → verify both accessible → delete one → verify other still works
- *Unit*: Year list storage and retrieval roundtrip correctly; year list does not contaminate lifetime list
- *Regression*: Lifetime list import/export still works; goal lists unaffected; all map view modes still work

### 2.5 Covariate / Habitat Visualization

**Description:** Display habitat data per cell and per species, derived from existing pipeline covariate data.

**Cell habitat profile:**
- On cell click, show habitat breakdown: Forest %, Shrub %, Herb %, Urban %, Water %, Elevation range
- Data already computed in pipeline (cell_covariates) — needs to be shipped to frontend

**Species habitat badge:**
- For each species, aggregate covariate values of cells where it occurs (weighted by frequency)
- Derive preferred habitat labels: "Forest bird," "Coastal," "Grassland," "Urban-tolerant," "Mid-elevation (200-800m)"
- Display as compact badges on species cards and in species list

**Pipeline work:**
- Ship cell covariates to frontend (new JSON per resolution, or embed in grid.geojson)
- Compute per-species habitat profile during output phase
- Add habitat fields to species.json

**Acceptance criteria:**
- Cell click popup shows habitat breakdown (bar chart or icon row with percentages)
- Habitat data appears for all cells at all resolutions
- Elevation range shown as "Avg Xm (min – max)"
- Species in species.json have habitat fields: `habitatLabels` (string[]), `preferredElevation` (object)
- Species cards (2.6) and species list rows show habitat badges
- Habitat badges use the unified badge component (1.3)
- Habitat data loads within 1 second of cell click (no perceptible delay)
- Cells with no covariate data (edge case) show "Habitat data unavailable"

**Tests:**
- *Playwright*: Click cell → verify habitat breakdown appears with percentages → verify percentages sum to ~100% → verify elevation shown
- *Playwright*: Open species card → verify habitat badges present → verify badge labels make ecological sense (e.g., a heron has "Coastal" or "Wetland", not "Forest")
- *Unit*: Habitat label derivation from covariate vector produces correct labels for known test vectors
- *Pipeline (pytest)*: Validate cell_covariates output schema; validate species habitat computation against fixture data; verify all species have habitat fields in output species.json
- *Regression*: Map heatmap rendering not slowed by additional data; cell popup still shows species list; stixel ensemble still uses covariates correctly

### 2.6 Species Card Redesign — Planning Brief

**Description:** Transform the species card from a mini field guide into a planning brief answering "Should I chase this species, and if so, when/where/how?"

**Content (every element earns its place by aiding planning):**
- **Photo** (Wikimedia Commons, see 2.7) — orientation, not identification. Present but not dominant.
- **Name & family** — common name prominent, scientific name small
- **Habitat badge** (from 2.5) — "Forest bird | Mid-elevation"
- **Peak season window** — From existing `peakWeek` + `seasonalityScore`. Display: "Peak: Weeks 18-22 (late Apr – May)". Include a **52-week sparkline** mini chart showing reporting frequency across the year.
- **Best locations** — Top 3-5 cells with highest reporting frequency for current week. "Most reported near: Corpus Christi, TX (45%) | High Island, TX (38%)"
- **Your status** — Seen/unseen. Which goal lists it's on. Quick-add button.
- **Conservation context** — One-liner: "Vulnerable — population declining due to habitat loss"
- **Difficulty** (when available) — badge
- **eBird link** — small footer icon
- **Photo attribution** — small footer text (required by CC BY/BY-SA)

**Acceptance criteria:**
- Species card opens from: species list row click, map popup species name click, goal list species click
- 52-week sparkline renders correctly showing frequency variation across weeks
- Sparkline highlights current week with a marker
- Peak season text matches sparkline peak visually
- "Best locations" section shows top 3-5 cells for current week; updates when week changes
- "Best locations" entries are clickable (center map on that cell)
- Seen/unseen status matches life list and updates in real-time if toggled
- Goal list membership shown; quick-add button opens list picker
- Photo displays with attribution footer; fallback silhouette shown for missing photos
- Card renders correctly on mobile (stacks vertically, scrollable)
- Card opens/closes smoothly (no layout shift)
- All badges use unified badge component (1.3)

**Tests:**
- *Playwright*: Click species in species list → verify card opens → verify photo present (or fallback) → verify sparkline renders 52 data points → verify peak season text present → verify best locations show cell labels → click a location → verify map centers → close card → verify clean dismissal
- *Playwright*: Mark species as seen → reopen card → verify "Seen" status → unmark → verify "Unseen"
- *Playwright*: Open card for species on a goal list → verify goal list membership shown
- *Playwright (mobile)*: Open card at 375px → verify all sections visible via scroll → verify no horizontal overflow
- *Unit*: Sparkline data generation from species-weeks data produces correct 52-element frequency array
- *Unit*: "Best locations" computation returns top-N cells sorted by frequency for given week
- *Regression*: Species tab search/filter still works; map popup species clicks still work; goal list add-from-card still works

### 2.7 Wikimedia Commons Photo Pipeline

**Description:** Fetch freely-licensed bird photos from Wikimedia Commons via Wikidata to populate species cards.

**Pipeline (extend existing `fetch_conservation_status.py`):**
- Add Wikidata property `P18` (image) to existing SPARQL query
- Query Wikimedia Commons API for license metadata per image
- Filter to commercial-safe licenses: CC0, CC BY, CC BY-SA (exclude CC BY-NC)
- Download and cache thumbnails (~400px)
- Store in species.json: `photoUrl`, `photoAttribution`, `photoLicense`

**Acceptance criteria:**
- Pipeline fetches photos for all species with Wikidata entries
- Only CC0, CC BY, and CC BY-SA licensed images are included
- species.json includes `photoUrl`, `photoAttribution` (e.g., "Photo: John Smith / CC BY-SA 4.0"), `photoLicense` for each species
- Species without freely-licensed photos have `photoUrl: null`
- Thumbnail files are reasonable size (<100KB each)
- Total photo data doesn't exceed 100MB (or photos are served from Commons URLs, not bundled)
- Attribution text is accurate (matches Commons metadata)
- About page (1.4) includes aggregate photo credits section

**Tests:**
- *Pipeline (pytest)*: Run fetch on 10 known species → verify photos downloaded → verify license filtering (inject a CC BY-NC image, verify it's excluded) → verify attribution text matches Commons metadata
- *Pipeline (pytest)*: Species with no Wikidata image → verify `photoUrl: null` in output
- *Pipeline (pytest)*: Validate species.json schema includes photo fields for all species
- *Playwright*: Open species card → verify photo loads (or fallback silhouette) → verify attribution text shown below photo
- *Regression*: Conservation status fetch still works (same pipeline script extended, not broken)

---

### Phase 2 Regression Suite

After all Phase 2 items are complete, run the full regression suite:

- All Phase 1 tests still pass
- Map: all 4 view modes render, cell click popups work, resolution switching works
- Species tab: all filters (region, conservation, invasion, seen/unseen, family) work
- Goal lists: CRUD, curated suggestions, goal-birds map mode all work
- Life list: import, export, toggle, clear all work
- Trip planning: all 4 existing modes (Hotspots, Location, Window, Compare) work
- Progress tab: stats, milestones, group/region breakdowns all work
- Dark mode: all new components respect dark mode
- Mobile: all new features work at 375px viewport
- Performance: initial load time not degraded by >500ms; map interaction not degraded

---

## Phase 3 — Gamification & Engagement

*Medium effort. Makes the app more rewarding without compromising eBird data integrity.*

*Important constraint: The app's life list is separate from eBird. Gamification incentivizes engagement with this app, NOT eBird submissions. No feature should create pressure to report false sightings.*

### 3.1 Lifer Celebration Moments

**Description:** Visual feedback when marking species as seen and hitting milestones.

**Acceptance criteria:**
- Toggling a species to "seen" shows a styled toast: "[Species name] added to your life list! (#N)" where N is total count
- Toast appears for 3 seconds, then auto-dismisses; does not block interaction
- Toast is dismissible by tap/click
- Toggling a species to "unseen" shows a muted toast: "[Species name] removed from your life list"
- At milestones 5, 10, 25: small toast with encouraging message
- At milestones 50, 100, 250: medium celebration — brief confetti animation + milestone badge overlay (auto-dismisses after 3 seconds)
- At milestones 500, 750, 1000+: larger celebration with stat summary (species count, groups started, top group)
- Confetti animation does not degrade map performance (uses CSS animation, not canvas)
- Celebrations can be disabled in a settings toggle (for users who find them annoying)
- Bulk import (CSV) does NOT trigger individual toasts — shows a single summary instead

**Tests:**
- *Playwright*: Mark a species as seen → verify toast appears with correct name and count → wait 3 seconds → verify toast dismissed
- *Playwright*: Mark species to reach milestone 10 → verify celebration appears → verify it auto-dismisses
- *Playwright*: Import CSV with 50 species → verify NO individual toasts → verify single summary shown
- *Playwright*: Toggle celebration setting off → mark species → verify no toast
- *Unit*: Milestone detection logic correctly identifies all threshold values
- *Regression*: Species toggle still updates life list correctly; map heatmap still updates; CSV import still works

### 3.2 Group Completion Badges

**Description:** Awards when a user sees all species in a family group.

**Acceptance criteria:**
- When user marks the last unseen species in a family group: special toast "All [N] [Group Name] seen!" with a trophy/badge icon
- Badge appears in Progress tab under a "Completed Groups" or "Trophy Case" section
- "Almost there" nudge in Progress tab: groups with ≤3 species remaining show "[Group]: X of Y — just Z to go!"
- Completed group badges persist across sessions
- Badge count shown in Progress tab quick stats alongside existing "Groups Completed" counter
- Unchecking a species in a completed group removes the badge (no false completions)

**Tests:**
- *Playwright*: Mark all species in a small group (e.g., Flamingos, 1-2 species) → verify completion toast → navigate to Progress tab → verify badge shown → uncheck one species → verify badge removed
- *Playwright*: Navigate to Progress tab with some groups at N-2 → verify "almost there" nudge shown
- *Unit*: Completion detection correctly identifies full groups from life list + species data
- *Regression*: Progress tab stats still accurate; species toggle still works

### 3.3 Streak & Activity Tracking

**Description:** Track consecutive days with new lifers and weekly summaries.

**Acceptance criteria:**
- "Active birder" streak shown in Progress tab: "You've added lifers on X consecutive days"
- Streak is based on days where ≥1 new species was marked as seen (via checkbox, NOT import)
- Streak resets if a day is missed
- Weekly summary available in Progress tab: "This week: +N lifers, M new families started"
- Streak data persisted in localStorage or IndexedDB
- Streak does not count bulk CSV imports (to avoid incentivizing data gaming)

**Tests:**
- *Playwright*: Mark species today → verify streak shows "1 day" → (mock date advance) → mark species "tomorrow" → verify "2 days"
- *Unit*: Streak calculation handles timezone edge cases; correctly excludes bulk imports
- *Regression*: Life list operations still work; Progress tab stats unaffected

### 3.4 Shareable Milestones

**Description:** Generate shareable milestone cards at major thresholds.

**Acceptance criteria:**
- "Share" button appears at milestones ≥50
- Button generates a card image: species count, milestone badge, progress bar
- Share uses Web Share API on mobile (native share sheet) or fallback download-as-image on desktop
- Card does not expose any eBird data, life list details, or location information — only aggregate count and milestone
- Generated image is visually branded (app colors, logo)

**Tests:**
- *Playwright*: Trigger milestone → verify share button appears → click share → verify Web Share API called (mock) or image downloaded
- *Unit*: Card image generation produces valid PNG/SVG with correct milestone text
- *Regression*: Milestone detection still works; Progress tab unaffected

---

### Phase 3 Regression Suite

After all Phase 3 items:

- All Phase 1 + Phase 2 tests still pass
- Species toggle (mark seen/unseen) still correctly updates: life list, map heatmap, species tab state, goal list counts, progress stats
- CSV import still works and correctly updates all dependent views
- Toasts don't interfere with other UI interactions (modals, popups, tooltips)
- No performance degradation from celebration animations
- Dark mode applies to all new components

---

## Phase 4 — Stretch Goals

*Higher effort or dependent on external data. Build when core is solid.*

### 4.1 eBird Hotspot Names per Cell

*Note: Rated the #1 functional gap by all 6 evaluators (Tier 1-C universal agreement). Implement when pipeline capacity allows — no dependency blockers.*

**Description:** Pre-compute top eBird hotspots per H3 cell during pipeline; display in cell popups.

**Acceptance criteria:**
- Grid.geojson features include `hotspots` property: array of {name, checklistCount} objects (top 3-5 per cell)
- Cell click popup shows "Notable birding areas:" section with hotspot names
- Hotspot names are clickable (open eBird hotspot page in new tab)
- Cells with no hotspots show no section (not "No hotspots found")
- Works at all resolutions; more hotspots visible at finer resolutions

**Tests:**
- *Playwright*: Click cell with hotspots → verify hotspot names shown → click name → verify eBird link opens
- *Playwright*: Click cell without hotspots → verify no empty section shown
- *Pipeline (pytest)*: Validate hotspot assignment to H3 cells; verify top-N selection by checklist count
- *Regression*: Cell popup species list still works; habitat breakdown (2.5) still works

### 4.2 Multi-Species Range Overlay

**Description:** Select 2-4 species in Range view and see where they co-occur.

**Acceptance criteria:**
- Range view species picker allows selecting up to 4 species
- Map shows each species range in a different color
- Cells where ALL selected species overlap get a distinct highlight (e.g., gold border)
- Legend shows which color = which species + overlap indicator
- Selecting >4 species shows a message ("Select up to 4 species")

**Tests:**
- *Playwright*: Select 2 species → verify 2 colors on map → verify overlap cells highlighted → select 3rd → verify 3 colors → deselect one → verify map updates
- *Unit*: Overlap computation correctly identifies cells containing all selected species
- *Regression*: Single-species Range view still works; view mode switching still works

### 4.3 Social Features

**Description:** Shared leaderboards, birding buddy system, trip reports.

**Architecture consideration:** Would likely require a lightweight backend or peer-to-peer via shared files. Evaluate whether static PWA model can support this.

**Acceptance criteria (TBD):** Requires design spike to determine architecture. Define acceptance criteria after technical approach is chosen.

**Tests:** TBD after design spike.

### 4.4 Difficulty Filter (Data-Dependent)

**Description:** Compute difficulty scores in the pipeline once North American data reaches critical mass.

**Scoring formula (planned):**
- Spatial constraint: species in fewer cells = harder
- Average reporting frequency: lower freq = harder
- Seasonality: narrow peak window = harder
- Possible habitat specificity weighting

**Acceptance criteria:**
- All species in species.json have `difficultyLabel` (Easy / Moderate / Hard / Very Hard) and `difficultyScore` (0-100)
- Species tab difficulty filter returns correct results for each category
- Difficulty badge appears on species cards (2.6) using unified badge component
- Distribution across categories is reasonable (not 90% "Easy")
- Scores validated against birder intuition for 20+ well-known species (e.g., Northern Cardinal = Easy, Saltmarsh Sparrow = Hard)

**Tests:**
- *Pipeline (pytest)*: Validate scoring formula against fixture data; verify all species have non-empty labels; verify distribution across categories
- *Playwright*: Select "Hard" in difficulty filter → verify results are non-empty → verify all shown species have "Hard" badge
- *Unit*: Scoring function produces correct labels for known edge cases (very common species, very rare species, highly seasonal species)
- *Regression*: All other species filters still work; species card still renders; map filter intersection still works

---

## Deferred / Out of Scope

These were raised during evaluation but are intentionally excluded:

| Item | Reason |
|------|--------|
| Audio/bird calls | App is a planner, not a field guide. Merlin does this better. |
| Protected area map overlays | Hex size (45km) makes boundaries meaningless. Habitat covariates serve the same purpose better. |
| Real-time rare bird alerts | Requires live backend, breaks static PWA model. eBird alerts exist for this. |
| Weather data overlay | Planning-stage tool, not real-time. Users check weather separately. |
| County/state list tracking | Niche competitive feature; goal lists can approximate this. |
| Photo carousel per species | Single Wikimedia photo + eBird link sufficient for planning app. |
| Kids mode / family features | Core audience is power birders. Onboarding + tooltips serve casual users adequately. |
| Saltwater vs. freshwater distinction | EarthEnv land cover only has "water" (inland). Need a separate ocean/coastline dataset (e.g., Natural Earth) to distinguish salt/fresh for coastal cells. Would improve habitat labels for shorebirds, seabirds, and wading birds. |

---

## Summary: Priority Order

```
PHASE 1 (Do First — Polish & Onboarding)
  1.1  Onboarding overlay
  1.2  Contextual tooltips
  1.3  Badge unification
  1.4  About page + responsible birding guidance
  1.5  UX polish (animation, popup pagination, mobile layout, GPS button, popup → info card)
  1.6  Progressive disclosure / beginner mode
  1.7  Guided starter checklist for non-eBird users

PHASE 2 (Core New Features)
  2.1  Multi-species Window of Opportunity + goal list integration
  2.2  Collaborative goal lists + combined life list mode
  2.3  Conservation & regional goal list templates
  2.4  Year-list support via eBird CSV
  2.5  Covariate / habitat visualization (cell + species level)
  2.6  Species card redesign — planning brief with sparkline
  2.7  Wikimedia Commons photo pipeline

PHASE 3 (Engagement)
  3.1  Lifer celebration moments
  3.2  Group completion badges
  3.3  Streak & activity tracking
  3.4  Shareable milestones

PHASE 4 (Stretch)
  4.1  eBird hotspot names per cell
  4.2  Multi-species range overlay
  4.3  Social features
  4.4  Difficulty filter (when data is ready)
```

---

*This roadmap is a planning document. No code changes have been made.*
