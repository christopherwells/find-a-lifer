# Find-A-Lifer: Team Test Evaluation Synthesis

**Date:** 2026-03-13
**Participants:** 12 independent testers (Test Lead, Functional Tester, Mobile Tester, Geolocation/Maps Specialist, Performance Tester, Security Tester, API/Backend Tester, UX/Accessibility Tester, Domain Expert Birder, Amateur Birder, Adversarial Tester, Automation/DevOps Tester)

This document synthesizes all 12 independent evaluations into a unified analysis, organized as if the team sat in a room together for a 2-hour discussion.

---

## 1. Unanimous Consensus (Issues ALL or Nearly All Testers Agree On)

These are the highest-confidence findings -- issues that multiple testers independently discovered from completely different angles.

### 1.1 TripPlanTab Fetches Entire Full Week Files (2+ GB for Window of Opportunity)

**Flagged by:** Performance (#5), API/Backend (#7), Mobile (#3), Geolocation (#4), Adversarial (#11), Test Lead (#1), Functional (#2)

This is the single most universally cited issue. The TripPlanTab fetches `/api/weeks/{N}` (the FULL weekly data file, 31-54 MB each) instead of using targeted endpoints. The Window of Opportunity feature fetches all 52 weeks sequentially -- approximately 2.1 GB of JSON parsed client-side.

- **Performance Tester:** "52 sequential HTTP requests... Total transfer: potentially 100+ MB... 5-6 minutes per Window of Opportunity query."
- **API/Backend Tester:** "This should use a dedicated batch endpoint or pre-computed data."
- **Mobile Tester:** "On a mobile device with a 3G connection, this is extremely slow and wastes cellular data."
- **Adversarial Tester:** "The UI shows a loading spinner but provides no progress indication or cancellation. If the user switches away and back, the effect re-runs... and there's no AbortController."

**Recommended action:** Replace full-week fetches with targeted endpoints (`/api/weeks/{N}/species/{code}` for Window of Opportunity, `/api/weeks/{N}/cells/{cellId}` for Location/Compare, `/api/weeks/{N}/lifer-summary` for Hotspots). Add AbortController. Consider a new dedicated endpoint for annual species distribution.

**Estimated effort:** M (endpoint usage changes) + S (AbortController) + M (optional new backend endpoint)

### 1.2 All Probability Data is Hardcoded to 1.0

**Flagged by:** Domain Expert Birder (#9), Geolocation/Maps (#4), API/Backend (#7), Performance (#5), Functional (#2)

Every API endpoint returns `probability: 1.0` for all species occurrences. The data pipeline discards actual S&T abundance values, reducing the entire system to binary presence/absence.

- **Domain Expert Birder:** "This is the most significant birder-facing data issue in the entire application. The app's entire value proposition -- distinguishing itself from static range maps -- depends on showing where and when species are most detectable."
- **Geolocation Specialist:** "Species Range mode shows uniform color... The legend shows '0% to 100%' but all values are 100%."
- **API/Backend Tester:** "This is a data fidelity loss... the frontend doesn't rely on per-species probability from this endpoint."

**Recommended action:** Preserve actual abundance/occurrence probability values from S&T rasters in the data pipeline. Even quantizing to uint8 (256 levels) would be vastly better than binary.

**Estimated effort:** L (requires re-running the data extraction pipeline)

### 1.3 Zero Backend Tests and No CI/CD Pipeline

**Flagged by:** Test Lead (#1), Automation/DevOps (#12), API/Backend (#7), Functional (#2), Performance (#5), Security (#6)

The backend has 378 lines of code across 10 API endpoints with zero test coverage. No CI/CD pipeline exists.

- **Test Lead:** "Zero test files exist for the FastAPI backend. Overall test maturity: Level 1 (Initial)."
- **Automation/DevOps:** "The most critical gaps are: (1) no CI/CD pipeline, (2) no backend tests, (3) no IndexedDB layer tests, and (4) Playwright config that does not start the backend server."
- **API/Backend Tester:** Provided a complete smoke test script and data integrity validation script ready to implement.

**Recommended action:** Create `backend/tests/` with pytest + httpx TestClient. Create `.github/workflows/ci.yml`. Phase 1 alone (estimated 10 hours) would deliver 80%+ backend coverage.

**Estimated effort:** M (backend tests) + S (CI pipeline setup)

### 1.4 CORS Configuration is Overly Permissive

**Flagged by:** Security (#6), API/Backend (#7), Test Lead (#1), Adversarial (#11)

`allow_origins=["*"]` combined with `allow_credentials=True` is a security anti-pattern.

- **Security Tester:** "Any malicious website a user visits could silently query the entire species distribution dataset."
- **API/Backend Tester:** "Browsers will actually block credentialed requests when the origin is `*`... This is a misconfiguration that happens to be harmless because no credentials are used."
- **Adversarial Tester:** "Since the backend serves only static, public data and accepts no authentication, the wildcard CORS is not a security risk per se."

**Recommended action:** Restrict `allow_origins` to the frontend origin. Remove `allow_credentials=True`.

**Estimated effort:** S (trivial fix)

### 1.5 Duplicate Data Fetching Across Components

**Flagged by:** Performance (#5), Mobile (#3), API/Backend (#7), Adversarial (#11)

Species metadata is fetched independently by 4+ components. Grid data is fetched independently by MapView (with IndexedDB cache) and TripPlanTab (without cache, re-downloading 38 MB each time).

- **Performance Tester:** "On initial page load, the species endpoint is hit up to 4 times and the grid endpoint up to 2 times."
- **Mobile Tester:** "TripPlanTab line 97 fetches `/api/grid` directly into component state without using the IndexedDB cache."

**Recommended action:** Centralize species and grid data into shared caches/contexts. Extend the existing module-level `speciesMetaCache` to a shared module.

**Estimated effort:** M

### 1.6 No Onboarding, No Help, Heavy Jargon

**Flagged by:** Amateur Birder (#10), UX/Accessibility (#8), Domain Expert (#9)

- **Amateur Birder:** "There is no onboarding. No welcome screen, no guided tour... The app drops you into a fully functional interface with zero context."
- **UX/Accessibility:** "No onboarding flow, tutorial, or feature discovery."
- **Domain Expert:** Identified specific jargon issues with "lifer," "hotspots" (conflicting with eBird usage), and "Window" mode.

**Recommended action:** Add a first-time welcome overlay (3-4 sentences), a glossary/help panel, and tooltips on key controls. Rename "Window" to "Best Time."

**Estimated effort:** S-M

---

## 2. Strong Consensus (3+ Testers Agree)

### 2.1 Unbounded Caches and Memory Growth

**Flagged by:** Performance (#5), Mobile (#3), Adversarial (#11), Test Lead (#1)

Module-level caches (`cellDataCache`, `speciesMetaCache`, `gridGeoJsonCache`) and backend `_week_cache` grow without eviction. Grid GeoJSON (~38 MB parsed) exists in up to 3 simultaneous copies in memory.

**Recommended action:** Add LRU eviction to client caches (cap at 50-100 entries). Add eviction to backend `_week_cache`. Share grid data between components.

**Estimated effort:** S-M

### 2.2 Touch Targets Below Accessibility Minimums

**Flagged by:** Mobile (#3), UX/Accessibility (#8), Amateur Birder (#10)

Multiple interactive elements fall below the 44x44px minimum: checkboxes (14x14px), collapse button (~20x32px), slider tracks (8px), "+" add-to-goal button (~16x28px), conservation status dots (6x6px).

- **UX/Accessibility:** "Multiple critical interactive elements fall below 24px minimum. The checkbox (14x14px), '+' button, and status dots are particularly problematic for gloved finger operation in the field."
- **Mobile Tester:** "8px slider track is extremely difficult to grab on touch."

**Recommended action:** Increase checkbox size, slider track height, button padding to meet 44px targets. Especially critical for a field-use birding app.

**Estimated effort:** M

### 2.3 Missing AbortController on Most Fetch Calls

**Flagged by:** Performance (#5), Mobile (#3), Adversarial (#11), Test Lead (#1)

Only one fetch in the entire codebase uses `AbortController` (the weekly summary fetch in MapView). All other fetches -- including the multi-gigabyte Window of Opportunity loop -- have no abort mechanism.

**Recommended action:** Add AbortController to every useEffect that performs fetches.

**Estimated effort:** M

### 2.4 IndexedDB Schema Dual-Management Risk

**Flagged by:** Test Lead (#1), Functional (#2), Adversarial (#11)

Both `LifeListContext.tsx` and `goalListsDB.ts` independently open the same IndexedDB database (`find-a-lifer-db`, version 2) with separate upgrade logic. If either changes version independently, the other will fail.

- **Test Lead:** "If either changes version independently, the other will fail with a VersionError."
- **Adversarial Tester:** "It's a time bomb if you ever bump the version."

**Recommended action:** Consolidate into a single DB connection module shared by both.

**Estimated effort:** M

### 2.5 Goal List State Divergence Between Components

**Flagged by:** Functional (#2), Adversarial (#11), Test Lead (#1)

App.tsx, GoalBirdsTab, and SpeciesTab each maintain independent copies of goal list data. Changes in one do not propagate to others until page reload.

- **Functional Tester:** "App.tsx `goalLists` is only loaded once on mount. This means the map's goalSpeciesCodes may become stale."
- **Adversarial Tester:** "Three independent copies of the same data."

**Recommended action:** Lift goal list state into a shared context (like LifeListContext).

**Estimated effort:** M

### 2.6 Dark Mode Toggle Loses Map Position

**Flagged by:** Geolocation (#4), Performance (#5), Adversarial (#11)

Toggling dark mode destroys and recreates the entire MapLibre instance, losing the user's current zoom/pan position.

**Recommended action:** Save center/zoom before destruction and restore after re-initialization.

**Estimated effort:** S

### 2.7 Region Coverage Gaps (Midwest, Canada, Mexico, Caribbean)

**Flagged by:** Geolocation (#4), Domain Expert (#9), Amateur Birder (#10)

Only 5 US-centric regions are defined. Midwest states (MN, IA, MO, AR, KS, NE, SD, ND) are not in any region. Canada, Mexico, and Caribbean are completely excluded despite species data covering those areas.

- **Geolocation Specialist:** "Cells in the Midwest are not included in any region. This is a significant coverage gap."
- **Domain Expert:** "A birder planning a trip to Costa Rica, Belize, or the Caribbean would see these species in the database but have no regional filter."

**Recommended action:** Add a Midwest/Central region. Add Canada, Mexico, Caribbean regions.

**Estimated effort:** S (Midwest fix) + M (international regions)

### 2.8 TripPlanTab Uses Polygon Corner Instead of Centroid

**Flagged by:** Geolocation (#4), API/Backend (#7)

Cell coordinates are extracted using `coordinates[0][0]` (the first vertex of the polygon) instead of the centroid. This produces a ~10km offset at mid-latitudes.

- **Geolocation Specialist:** "When a user clicks 'Zoom to' on a hotspot, the map will zoom to a point offset from the actual cell center."

**Recommended action:** Compute centroids or use the existing `grid_centers.json` data. Alternatively, add center coordinates to `grid_27km.geojson`.

**Estimated effort:** S

### 2.9 No PWA Support or Offline Resilience

**Flagged by:** Mobile (#3), Performance (#5), UX/Accessibility (#8)

No service worker, no web app manifest, no offline caching for weekly data. Birders in the field with spotty connectivity will have a broken experience.

- **Mobile Tester:** "Users on spotty cellular coverage (common in birding locations -- parks, forests, wetlands) will have a degraded or broken experience."

**Recommended action:** Add basic PWA manifest with icons. Add service worker for offline grid/species caching. Cache recently viewed weekly summaries.

**Estimated effort:** M-L

### 2.10 Screen Reader / ARIA Deficiencies

**Flagged by:** UX/Accessibility (#8), Test Lead (#1)

Tab bar lacks `role="tablist"`/`role="tab"`/`role="tabpanel"`. Modal dialogs lack `role="dialog"`, focus trapping, and Escape-to-close. No `aria-live` regions for dynamic content updates. Autocomplete dropdowns lack combobox ARIA pattern.

**Recommended action:** Implement proper ARIA tab pattern, dialog pattern, live regions, and combobox pattern.

**Estimated effort:** M-L

### 2.11 Cell ID Cross-Reference Mismatch (31% of Cells Invisible)

**Flagged by:** API/Backend (#7), Geolocation (#4)

84,473 cells referenced in weekly data do not exist in the grid GeoJSON. Approximately 31% of occurrence records are loaded but never displayed on the map.

- **API/Backend Tester:** "This could indicate the grid GeoJSON was generated from a different resolution or extent than the occurrence data."

**Recommended action:** Investigate the data pipeline discrepancy. Either expand the grid or filter weekly data to match.

**Estimated effort:** M (investigation + pipeline fix)

---

## 3. Unique Insights (Only One Tester Caught This)

### 3.1 Seasonal and Migrant Suggestion Categories Are Non-Functional (Domain Expert #9)

The `seasonalityScore`, `peakWeek`, and `rangeShiftScore` fields are defined in TypeScript types but never populated in the data pipeline. The "Seasonal Specialties" and "Migrants" suggestion categories in GoalBirdsTab will always show empty lists because the filter `(sp.seasonalityScore ?? 0) >= 0.5` always evaluates to false.

**Why this perspective was needed:** Only someone who understood the birding domain would check whether curated suggestion categories actually produce results. A functional tester would verify the UI renders; the domain expert verified whether the results make ornithological sense.

### 3.2 Difficulty Labels Are Useless -- 65% of Species Are "Very Hard" (Domain Expert #9)

The difficulty algorithm produces labels where two-thirds of species share the same label. It conflates geographic rarity with actual birding difficulty and ignores the S&T abundance data entirely. Conservation status inflates difficulty scores inappropriately.

**Why this perspective was needed:** Only a birder would know that a Yellow-rumped Warbler (one of the most common birds in North America) should not receive the same difficulty label as a Gyrfalcon.

### 3.3 Restricted Range Label Applies to 44% of Species (Domain Expert #9)

The restricted range definition (present in 2 or fewer of 5 regions) is far too broad. With only 5 US-centric regions, any species limited to a single region gets flagged -- including widespread species that happen to be regional.

### 3.4 650 Species Have "Unknown" Conservation Status (Domain Expert #9)

26% of species have "Unknown" conservation status, suggesting incomplete data pipeline matching rather than genuinely unassessed species. Two "Extinct in the Wild" species may be appearing on the heatmap.

### 3.5 Select All/None Has No Confirmation (Amateur Birder #10, Adversarial #11)

Clicking "All" in the Species tab marks all 2,490 species as seen with a single click, no confirmation dialog, and no undo. The Adversarial Tester additionally noted this triggers 2,490 individual IndexedDB writes and React state updates.

- **Amateur Birder:** "These should have confirmation dialogs given their scope."
- **Adversarial Tester:** "2,490 individual IndexedDB writes, each followed by a React state update... The UI will freeze or stutter significantly."

### 3.6 `prefers-reduced-motion` Not Respected (UX/Accessibility #8)

No reduced motion media query is implemented anywhere. Skeleton animations, map flyTo, panel transitions, and the migration animation all play regardless of user preference.

### 3.7 SpeciesInfoCard Has No Dark Mode Support (UX/Accessibility #8)

The modal uses hardcoded `bg-white` and `text-[#2C3E50]` -- it will appear glaringly bright when dark mode is active.

### 3.8 Week Slider DOM Query Anti-Pattern (Adversarial #11, Geolocation #4)

Map click handlers read the current week from the DOM via `document.querySelector('[data-testid="week-slider"]')` instead of using a ref. If the panel is collapsed (slider not rendered), it silently falls back to week 26, showing data for the wrong week.

### 3.9 CSV Parsing Uses Naive `split(',')` (Adversarial #11)

The CSV import in ProfileTab uses `line.split(',')` which does not handle quoted fields containing commas, escaped quotes, or multiline values. No file size limit is enforced.

### 3.10 No Goal List Export (Adversarial #11)

Life lists have CSV import/export, but goal lists have no export mechanism. If the user clears browser data, all goal lists are permanently lost.

### 3.11 No `document.visibilitychange` Handler (Mobile #3)

The app does not pause map rendering, abort network requests, or stop the animation timer when the browser tab is backgrounded, wasting battery and data.

### 3.12 Summary Format Mismatch (API/Backend #7)

Pre-computed summary files contain 2-element arrays `[cell_id, species_count]`, but the fallback computation returns 3-element arrays and the frontend TypeScript type expects 3 elements. This works by accident because the frontend destructures only the first two.

### 3.13 Mobile Panel Height Uses `vh` Instead of `dvh` (Mobile #3)

`h-[45vh]` does not account for the mobile browser address bar. On Safari iOS, `vh` includes the address bar area, so the actual visible panel is less than 45% of viewport. Should use `dvh`.

---

## 4. Disagreements and Tensions

### 4.1 Sensitive Species Data: Open Access vs. Conservation Protection

- **Security Tester (#6):** "For endangered and restricted-range species, this creates a comprehensive map of where sensitive species can be found and when. This data is served with no access controls."
- **Domain Expert (#9):** Wants MORE data fidelity -- restoring probability values, adding abundance gradients, and expanding species coverage.

**The tension:** The security tester wants to restrict or redact location data for endangered species. The domain expert wants richer, more detailed data. Both are valid: open species data serves birders, but precise location data for Critically Endangered species could aid poaching.

**Question for project owner:** Should endangered species locations be coarsened (e.g., show presence at region level rather than 27km grid cell level)? This is an ethical decision, not a technical one. Review eBird S&T data use terms for guidance.

### 4.2 Life List Transmission: Server-Side vs. Client-Side Computation

- **Security Tester (#6):** "Consider performing the lifer subtraction client-side instead of server-side. This would eliminate the need to transmit personal data to the server entirely."
- **Performance Tester (#5):** The lifer-summary POST endpoint is the most efficient way to compute density overlays without transferring full weekly data to the client.

**The tension:** Privacy says keep data local; performance says server-side computation avoids sending huge datasets to the client. The current POST endpoint sends the life list (~8KB) to avoid downloading the full week data (~40MB). Moving computation client-side would require downloading full week data.

**Resolution path:** If the TripPlanTab fetch optimization is implemented (using summary/targeted endpoints), the client will already have enough data to compute lifers locally. The POST endpoint could then be eliminated.

### 4.3 Data Volume vs. Mobile Experience

- **Domain Expert (#9):** Wants 52-week probability data, phenology charts, subspecies, and richer occurrence information.
- **Mobile Tester (#3):** "38MB grid data on first load is CRITICAL. On a 3G connection, this takes ~5 minutes."
- **Performance Tester (#5):** "Initial data transfer target: < 2MB. Current: ~5MB cold start."

**The tension:** More data means better birding tools but worse mobile performance. The 38MB grid, 1-5MB weekly summaries, and potential for probability data all push against mobile bandwidth constraints.

**Resolution path:** Progressive loading and caching. Load grid once (already cached in IndexedDB). Cache weekly summaries. Load probability data on demand for specific species/cells. This gives birders depth when they need it without penalizing initial load.

### 4.4 Simplicity vs. Expert Features

- **Amateur Birder (#10):** "The Explore tab with 7+ controls visible simultaneously is overwhelming. The Species Checklist with 2,490 unchecked species feels like homework."
- **Domain Expert (#9):** Wants MORE features -- subspecies, year lists, state lists, eBird hotspot integration, phenology charts, multi-species trip optimizer.

**The tension:** Making the app accessible to beginners requires simplifying the interface. Making it powerful for expert birders requires adding features.

**Resolution path:** Progressive disclosure. Group advanced controls (opacity, lifer range) under an "Advanced" toggle. Keep the default view simple: Region, View Mode, Week, Animate. Add expert features behind opt-in interfaces rather than cluttering the main UI.

### 4.5 Test Coverage Depth vs. Development Velocity

- **Test Lead (#1):** Recommends 135+ tests across all layers before production release.
- **Automation/DevOps (#12):** Proposes a 6-week phased plan with coverage thresholds.

**The tension:** Writing comprehensive tests takes time away from building features. However, the current ~8% frontend coverage and 0% backend coverage means regressions will be caught by users, not by automation.

**Resolution path:** The Test Lead and DevOps Tester largely agree on prioritization. Phase 1 (CI pipeline + backend tests + IndexedDB tests) delivers the highest value per hour invested. Accept that MapView (1,428 lines of WebGL/canvas code) is better tested via E2E than unit tests.

---

## 5. Prioritized Master Issue List

### Critical Severity

| # | Issue | Testers | Recommended Action | Effort |
|---|-------|---------|-------------------|--------|
| C1 | TripPlanTab fetches entire full week files (2.1 GB for Window of Opportunity) | #1, #2, #3, #4, #5, #7, #11 | Replace with targeted API endpoints; add AbortController | M |
| C2 | All probability data hardcoded to 1.0 | #4, #5, #7, #9 | Re-run data pipeline preserving S&T abundance values | L |
| C3 | Zero backend tests, no CI/CD pipeline | #1, #5, #6, #7, #12 | Create pytest suite + GitHub Actions workflow | M |
| C4 | 84,473 cells in weekly data have no matching grid polygon (31% invisible) | #7, #4 | Investigate pipeline; expand grid or filter weekly data | M |

### High Severity

| # | Issue | Testers | Recommended Action | Effort |
|---|-------|---------|-------------------|--------|
| H1 | CORS wildcard with credentials | #1, #6, #7, #11 | Restrict origins, remove `allow_credentials` | S |
| H2 | Duplicate data fetching (species 4x, grid 2x) | #3, #5, #7, #11 | Centralize into shared caches/contexts | M |
| H3 | Unbounded caches (client and server) | #1, #3, #5, #11 | Add LRU eviction; share grid data | S-M |
| H4 | Touch targets below 44px minimums | #3, #8, #10 | Increase sizes for checkboxes, sliders, buttons | M |
| H5 | Missing AbortController on most fetches | #1, #3, #5, #11 | Add AbortController to all useEffect fetches | M |
| H6 | IndexedDB dual-connection schema risk | #1, #2, #11 | Consolidate into single DB module | M |
| H7 | Goal list state divergence between components | #1, #2, #11 | Lift into shared context | M |
| H8 | No onboarding, no help, heavy jargon | #8, #9, #10 | Welcome overlay, glossary, tooltips | S-M |
| H9 | Week slider DOM query anti-pattern | #4, #11 | Replace with ref pattern (already used for other values) | S |
| H10 | Seasonal/Migrant suggestions non-functional | #9 | Populate `seasonalityScore`/`peakWeek` in data pipeline, or remove categories | M |
| H11 | Difficulty labels useless (65% "Very Hard") | #9 | Redesign algorithm using S&T probability data | M |
| H12 | CSV parsing uses naive `split(',')` | #11, #6 | Use Papa Parse library; add file size limit | S |
| H13 | ARIA deficiencies (tabs, dialogs, live regions) | #8 | Implement proper ARIA patterns | M-L |
| H14 | No `prefers-reduced-motion` support | #8 | Add global reduced-motion media query | S |
| H15 | SpeciesInfoCard has no dark mode support | #8 | Add dark mode Tailwind classes | S |
| H16 | Select All/None has no confirmation dialog | #10, #11 | Add `window.confirm()` and use batch operation | S |

### Medium Severity

| # | Issue | Testers | Recommended Action | Effort |
|---|-------|---------|-------------------|--------|
| M1 | Region coverage gaps (Midwest, international) | #4, #9, #10 | Add Midwest region; add Canada/Mexico/Caribbean | S-M |
| M2 | Dark mode toggle loses map position | #4, #5, #11 | Save/restore center and zoom | S |
| M3 | TripPlanTab uses polygon corner, not centroid | #4, #7 | Compute centroids or use grid_centers.json | S |
| M4 | No PWA support or offline resilience | #3, #5, #8 | Add manifest, service worker, weekly data cache | M-L |
| M5 | Mobile panel `h-[45vh]` should be `h-[45dvh]` | #3 | Change to dynamic viewport height units | S |
| M6 | No safe-area-inset handling for notched devices | #3 | Add `viewport-fit=cover` and `env(safe-area-inset-*)` | S |
| M7 | No HTTP cache headers on any response | #5, #7 | Add Cache-Control headers to static data endpoints | S |
| M8 | Backend grid endpoint re-reads 38MB file per request | #5, #7 | Cache at startup like species data | S |
| M9 | No debounce on week slider | #5, #11 | Debounce `onWeekChange` by 150-300ms | S |
| M10 | Restricted range label applies to 44% of species | #9 | Use actual range size from S&T data | M |
| M11 | 650 species "Unknown" conservation status | #9 | Investigate data pipeline; fill in IUCN status | M |
| M12 | No species photos (all photoUrl empty) | #9, #10 | Integrate Macaulay Library photo URLs | M |
| M13 | No date/location tracking for life list entries | #9 | Add date-of-sighting field to IndexedDB schema | M |
| M14 | Summary format mismatch (2-element vs 3-element) | #7 | Standardize to consistent format | S |
| M15 | No goal list export mechanism | #11 | Add CSV export for goal lists | S |
| M16 | No `document.visibilitychange` handler | #3 | Pause animation/rendering when backgrounded | S |
| M17 | No bundle splitting (single 1.4MB chunk) | #5, #12 | Add Vite manual chunks; lazy-load tab components | S-M |
| M18 | Autocomplete dropdowns not keyboard accessible | #8 | Implement combobox ARIA pattern with arrow keys | M |
| M19 | Content Security Policy missing | #6 | Add CSP meta tag or headers | S |
| M20 | Color contrast failures (inactive tabs, placeholders) | #8 | Adjust gray shades to meet 4.5:1 ratio | S |
| M21 | Sensitive species data served without access controls | #6 | Consider coarsening for Critically Endangered species | M |
| M22 | Lifer-summary POST body has no size limit | #6, #7 | Add max 5,000 codes limit | S |
| M23 | Unmatched species not shown during CSV import | #9 | Display list of unmatched species names | S |
| M24 | Focus management missing during tab/modal switches | #8 | Move focus to new content; add focus trapping in modals | M |
| M25 | Multi-tab IndexedDB sync | #11 | Add BroadcastChannel or change listener | M |
| M26 | Playwright config does not start backend server | #12 | Add backend to `webServer` array | S |
| M27 | No cross-browser E2E testing (Chromium only) | #1, #12 | Add Firefox and WebKit to Playwright config | S |

### Low Severity

| # | Issue | Testers | Recommended Action | Effort |
|---|-------|---------|-------------------|--------|
| L1 | No maxBounds on map (users can pan to Africa) | #4 | Add `maxBounds` to constrain to Western Hemisphere | S |
| L2 | No grid cache invalidation | #4, #11 | Add version hash or ETag check | S |
| L3 | `datetime.utcnow()` deprecated in Python 3.12+ | #7 | Migrate to `datetime.now(datetime.UTC)` | S |
| L4 | Non-existent cell returns 200 empty instead of 404 | #7 | Design choice -- document or change | S |
| L5 | Console.log in production builds | #5 | Configure Vite to strip in production | S |
| L6 | No error boundaries around map | #5, #8 | Add React error boundary | S |
| L7 | Landscape orientation handling | #3 | Auto-collapse panel in landscape | S-M |
| L8 | "Hotspots" terminology conflicts with eBird | #9, #10 | Rename to "Top Cells" or "Lifer Hotspots" | S |
| L9 | Goal list name has no max length | #11 | Add 100-character limit | S |
| L10 | `0.0.0.0` bind address in backend | #6 | Change to `127.0.0.1` for development | S |
| L11 | Python dependencies loosely pinned | #6 | Pin more tightly | S |
| L12 | No skip links for keyboard navigation | #8 | Add "Skip to content" link | S |
| L13 | Species lists use `<div>` instead of `<ul>/<li>` | #8 | Use semantic list elements | S |
| L14 | No year list tracking | #9 | Extend IndexedDB schema with date | M |
| L15 | Grid cell labels show only coordinates | #9 | Add human-readable location names | M |

---

## 6. Questions for the Project Owner

### Q1: Should endangered species locations be restricted?

The Security Tester flagged that precise 27km grid cell locations for Critically Endangered and Endangered species are served openly via the API. The Domain Expert wants richer data. eBird S&T data use terms may restrict redistribution of location-specific occurrence data.

**Trade-off:** Restricting data reduces utility for conservation-minded birders but protects sensitive species. Options range from no change (trust users), to coarsening resolution for sensitive species, to requiring user accounts for full data access.

### Q2: Should the lifer-summary computation move client-side?

Currently the user's life list is sent to the server. Moving computation client-side eliminates privacy concerns but requires downloading more data. With the TripPlanTab fetch optimization (C1), the client may already have enough data.

**Trade-off:** Privacy vs. bandwidth. If the optimized endpoints are implemented, client-side computation becomes feasible without additional data transfer.

### Q3: What is the target audience -- beginners or experts?

The Amateur Birder Tester rates beginner-friendliness at 2.5/5. The Domain Expert wants subspecies, year lists, and eBird hotspot integration. The app currently serves neither audience optimally.

**Trade-off:** Adding expert features increases complexity; simplifying for beginners may frustrate power users. Progressive disclosure (simple default UI with advanced options behind toggles) is the recommended compromise.

### Q4: Is the 2,490 species count the right denominator?

The Domain Expert notes this includes non-countable species (Common Ostrich, escapees, exotics) that inflate the total compared to the ~1,050 ABA Checklist. A birder seeing "100 of 2,490" may feel discouraged.

**Options:** Add an ABA-countable filter, allow users to set their own total, or use the S&T species count (~1,850 with actual occurrence data) as the denominator.

### Q5: How much investment should go into test infrastructure vs. features?

The Test Lead and DevOps Tester estimate the current codebase has ~8% frontend coverage and 0% backend coverage. The Phase 1 test plan (10 hours) would deliver CI/CD and 80%+ backend coverage. Full implementation across 6 weeks would reach 65%+ frontend / 95%+ backend.

**Trade-off:** Test investment now prevents bugs later but delays feature development. The consensus recommendation: Phase 1 (CI + backend tests) is non-negotiable before any public deployment. Phase 2+ is recommended but can be interleaved with feature work.

### Q6: Should probability data restoration be prioritized over new features?

The Domain Expert calls binary presence/absence "the most significant birder-facing data issue." Multiple testers agree this undermines the app's core value proposition. However, re-running the data pipeline is a significant effort.

**Trade-off:** Probability data restoration is a data pipeline change (not a UI change) that fundamentally improves every feature in the app. It is arguably the single highest-impact improvement possible.

### Q7: Port mismatch -- 8000 or 8001?

The Test Lead identified that `init.sh` starts the backend on port 8000 but `vite.config.ts` proxies to port 8001. One must change.

**Decision needed:** Pick a canonical port and update both files.

---

## 7. What the App Does Well

The team identified numerous strengths that should be preserved and built upon.

### Architecture and Code Quality

- **Well-structured React component hierarchy** with clear separation of concerns (Test Lead, Automation/DevOps)
- **IndexedDB caching strategy for grid data** is effective -- the largest payload is fetched once and cached across sessions (Mobile, Performance, Geolocation)
- **Module-level species cache with promise deduplication** in MapView handles concurrent requests correctly (Geolocation, Performance)
- **AbortController on weekly summary fetch** prevents stale data during rapid week changes (Performance, Adversarial)
- **Feature-state tracking set** avoids iterating 229K cells for cleanup (Geolocation)
- **`cancelled` flag pattern** properly prevents stale async results in overlay effects (Adversarial)
- **Defensive localStorage reads** -- invalid values fall back to safe defaults (Adversarial)
- **Week number validation** is consistently applied across all backend endpoints (Adversarial, API/Backend)
- **No XSS vectors** -- no `dangerouslySetInnerHTML`, no `eval()`, React JSX auto-escaping throughout (Security, Adversarial)
- **`rel="noopener noreferrer"` on external links** (Security, UX/Accessibility)
- **Comprehensive `data-testid` attributes** throughout the UI (UX/Accessibility, Automation/DevOps)

### Map and Visualization

- **Viridis color gradient** is an excellent colorblind-accessible choice for heatmaps (UX/Accessibility, Amateur Birder, Geolocation)
- **Extended viridis with orange/red** provides wider perceptual range while maintaining accessibility (Geolocation)
- **Amber monochromatic gradient for Goal Birds** works well for all color vision types (UX/Accessibility)
- **Progressive grid border reveal** (invisible at zoom 3.5, visible at zoom 6+) prevents visual clutter with 229K cells (Geolocation)
- **Feature-state management** correctly clears previous states before applying new ones (Geolocation)
- **Region flyTo animations** with appropriate zoom levels and 1.5s duration (Geolocation)
- **Dark mode support** with comprehensive Tailwind `dark:` class usage (UX/Accessibility, Amateur Birder)

### Birding Domain

- **Correct taxonomic ordering** following eBird/Clements taxonomy (Domain Expert)
- **143 correct family groupings** including recent splits like Yellow-breasted Chat in Icteriidae (Domain Expert)
- **Curated goal bird suggestions** demonstrate genuine ornithological knowledge -- Regional Icons, LBJs, Almost Complete Families (Domain Expert, Amateur Birder)
- **Window of Opportunity concept** is innovative and addresses a real birding planning need (Domain Expert)
- **Location comparison** for trip planning is practical and unique (Domain Expert)
- **eBird CSV import with merge semantics** handles the most common import use case (Domain Expert)
- **Migration animation** is visually stunning and could hook curious users (Amateur Birder)

### UX

- **Empty states are well-handled** throughout -- clear, helpful, actionable guidance (Amateur Birder, UX/Accessibility)
- **Goal Birds empty state** with target emoji and "Create Your First List" CTA is warm and inviting (Amateur Birder)
- **Progress tab milestones** are motivating (Amateur Birder)
- **Auto-switch to Trip Plan tab on map cell click** is smart behavior (Amateur Birder, Functional)
- **Skeleton loading states** with shimmer animation provide spatial context (UX/Accessibility)
- **Confirmation dialogs** on destructive actions (clear life list, delete goal list) (Amateur Birder)
- **ARIA labels** on icon-only buttons, toggle state (`aria-pressed`), and form labels (UX/Accessibility)
- **Family header keyboard support** with proper `role="button"` + `tabIndex` + `onKeyDown` (UX/Accessibility)

### Backend

- **Clean, lightweight API design** -- 10 endpoints serving pre-processed static data (API/Backend)
- **Consistent error handling** with appropriate HTTP status codes (400, 404, 422) (API/Backend)
- **Species-batch endpoint** with 500-ID limit and input validation (API/Backend)
- **GZip middleware** correctly configured for large responses (Performance, API/Backend)
- **Data integrity** -- species IDs contiguous 1-2490, all unique, summary data consistent with weekly data (API/Backend)

---

*This synthesis was generated by reviewing all 12 independent evaluation reports and identifying patterns of agreement, disagreement, and unique insights. The prioritized issue list combines all findings with cross-references to the original evaluators. The project owner should use Sections 5 and 6 as the primary actionable outputs.*
