# Adversarial Testing Evaluation: Find-A-Lifer

**Role:** Devil's Advocate / Adversarial Tester
**Date:** 2026-03-13
**Scope:** Full codebase review with malicious intent -- App.tsx, MapView.tsx, SidePanel.tsx, all tab components, LifeListContext.tsx, goalListsDB.ts, backend main.py, Vite config

---

## Severity Legend

- **CRITICAL** -- Data loss, security breach, or application crash
- **HIGH** -- Significant functional corruption or exploitable flaw
- **MEDIUM** -- Degraded experience, inconsistent state, or abuse potential
- **LOW** -- Minor edge case or cosmetic issue under adversarial conditions

---

## 1. IndexedDB Data Integrity Attacks

### 1.1 Direct IndexedDB Manipulation -- Phantom Species Injection
**Attack:** Open DevTools, access IndexedDB `find-a-lifer-db`, and manually insert life list entries with fabricated species codes (e.g., `speciesCode: "FAKE_BIRD"`, `speciesCode: "'; DROP TABLE"`, `speciesCode: ""`).

**What the code does:** `LifeListContext.tsx` loads all entries from IndexedDB on mount (line 83) and creates a `Set<string>` from `speciesCode` values. There is zero validation that species codes correspond to real species in the backend dataset. The `markSpeciesSeen` function (line 101) accepts any string as a `speciesCode` with no validation.

**Severity:** MEDIUM

**Impact:** The `seenSpecies` Set will contain garbage codes. The `getTotalSeen()` count will be inflated. Progress percentages will be wrong. The lifer-summary endpoint will silently ignore invalid codes (line 327 in main.py: `_species_by_code.get(code)` returns None, so they're skipped), so the map won't break -- but the user's reported stats will be lies.

**Recommendation:** On load, cross-reference IndexedDB entries against the species API response and silently discard any codes not in the master list. Or at minimum, compute `getTotalSeen()` as the intersection of `seenSpecies` and known species codes.

### 1.2 Goal List Corruption -- Unbounded Species Arrays
**Attack:** Via DevTools, directly edit a goal list in IndexedDB to contain thousands of duplicate species codes, or codes that are empty strings, or codes containing special characters.

**What the code does:** `goalListsDB.ts` `addSpeciesToList` (line 131) checks `list.speciesCodes.includes(speciesCode)` to prevent duplicates, but direct IndexedDB manipulation bypasses this. The `speciesCodes` array has no max-length enforcement, no deduplication on load, and no validation of code format.

**Severity:** MEDIUM

**Impact:** A goal list with 100,000 species codes would cause the species-batch endpoint URL to be enormous (line 848 in MapView.tsx joins all IDs into a query string: `ids=${Array.from(goalSpeciesIdSet).join(',')}`). This could exceed URL length limits (typically 8KB-64KB depending on server/browser). FastAPI would reject it or the browser would truncate it.

**Recommendation:** Enforce a maximum species count per goal list (e.g., 2,490 -- the total species count). Deduplicate on load. Validate species codes against the master list. For the batch endpoint, consider POST instead of GET to avoid URL length limits.

### 1.3 Dual DB Connection Instances -- Silent Conflict
**Attack:** Both `LifeListContext.tsx` and `goalListsDB.ts` independently open the same IndexedDB database (`find-a-lifer-db`, version 2) with their own cached `dbInstance` variables (line 49 in LifeListContext.tsx and line 18 in goalListsDB.ts).

**What the code does:** Each file maintains its own module-level `dbInstance` variable. The `idb` library (used by LifeListContext) and raw IndexedDB API (used by goalListsDB) manage connections independently. Both define `onupgradeneeded` handlers that create the same stores.

**Severity:** LOW (in practice browsers handle this, but it's fragile)

**Impact:** If one connection triggers a version change, the other's `onversionchange` handler (line 33 in goalListsDB.ts) closes and nulls its instance. But LifeListContext's `idb`-based connection has no such handler. In theory, concurrent upgrades or blocked connections could cause transient errors. In practice, since both use version 2 and the app only opens once, this rarely triggers. But it's a time bomb if you ever bump the version.

**Recommendation:** Consolidate into a single DB connection module shared by both life list and goal list code.

---

## 2. API Abuse

### 2.1 Week Number Boundary Bypass
**Attack:** Send requests to `/api/weeks/0`, `/api/weeks/-1`, `/api/weeks/53`, `/api/weeks/999`, `/api/weeks/999999999`.

**What the code does:** Backend validates `week_number < 1 or week_number > 52` on all week endpoints (lines 178, 206, 227, 255, 281, 319). This is correct. FastAPI's type annotation `week_number: int` will reject non-integer values.

**Severity:** NONE -- properly handled.

**Finding:** The backend validation is solid. FastAPI returns 400 for out-of-range and 422 for non-integer. Good.

### 2.2 Cell ID Injection
**Attack:** Request `/api/weeks/1/cells/99999` (non-existent cell), `/api/weeks/1/cells/-1`.

**What the code does:** `get_week_cell` (line 280) uses `cells.get(cell_id, [])` which returns an empty list for any non-existent cell ID. No error, just empty results.

**Severity:** NONE -- gracefully handled with empty results.

### 2.3 Species Code Injection
**Attack:** Request `/api/weeks/1/species/'%3BDROP%20TABLE` or `/api/weeks/1/species/../../etc/passwd`.

**What the code does:** `get_week_species` (line 222) looks up `_species_by_code.get(species_code)` which is a Python dict lookup. No SQL, no filesystem access from the species code. Path traversal is irrelevant since it never touches the filesystem with this value. Returns 404 for unknown codes.

**Severity:** NONE -- no injection vector exists. Static data, no database.

### 2.4 Species-Batch Query String Bomb
**Attack:** Send `/api/weeks/1/species-batch?ids=1,2,3,...` with 501+ IDs, or `ids=not,a,number`, or `ids=` (empty).

**What the code does:** Line 263 limits to 500 IDs. Line 258-260 catches `ValueError` for non-integer parsing. Empty string after split produces an empty set.

**Severity:** NONE -- properly validated with a 500-ID cap and error handling.

### 2.5 Lifer-Summary POST Body Abuse
**Attack:** Send a POST to `/api/weeks/1/lifer-summary` with a body containing 100,000 species codes, or non-string values, or a missing `seen_species_codes` key.

**What the code does:** Line 323 reads `body.get("seen_species_codes", [])` and creates a set. No size limit on the input array. Each code is looked up in `_species_by_code` (line 327), which is O(1) per lookup.

**Severity:** LOW

**Impact:** An attacker could send a massive array (millions of strings) which would consume memory creating the set and iterating. But since the app has no auth, there's no "attacker" per se -- any user can only hurt themselves. In production with concurrent users, this could be a DoS vector.

**Recommendation:** Add a reasonable limit (e.g., 5,000 codes max, well above the 2,490 species).

### 2.6 Static File Mount -- Directory Traversal
**Attack:** The backend mounts `/data` pointing to the data directory (line 372: `app.mount("/data", StaticFiles(...))`). Try accessing `/data/../main.py` or `/data/../../.env`.

**What the code does:** FastAPI's `StaticFiles` middleware handles path normalization and prevents directory traversal by default. Starlette (which FastAPI is built on) resolves paths and rejects traversal attempts.

**Severity:** NONE -- Starlette's StaticFiles is safe against traversal.

### 2.7 CORS Configuration -- Wildcard Origins
**Attack:** Any website can make API requests to the backend.

**What the code does:** Line 42: `allow_origins=["*"]` with `allow_credentials=True`.

**Severity:** LOW (for this app)

**Impact:** Since the backend serves only static, public data and accepts no authentication, the wildcard CORS is not a security risk per se. However, `allow_credentials=True` with `allow_origins=["*"]` is technically an invalid combination per the CORS spec -- browsers will reject credentialed requests with wildcard origins. This is a misconfiguration that happens to be harmless because no credentials are used.

**Recommendation:** Either remove `allow_credentials=True` (since no credentials are used) or restrict origins to the frontend's actual origin.

---

## 3. State Corruption and Race Conditions

### 3.1 Week Slider DOM Query Anti-Pattern
**Attack:** Rapidly change weeks while clicking cells on the map.

**What the code does:** MapView.tsx lines 597-598 and 642-643 query the DOM directly to get the current week: `document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')`. This is used inside map click handlers instead of using the `currentWeek` prop.

**Severity:** HIGH

**Impact:** This is a fragile coupling between the map click handler and the DOM state of the week slider. If the slider's `data-testid` attribute changes, or if the slider is not rendered (panel collapsed), `weekEl` will be null and the fallback `26` will be used -- silently loading data for the wrong week. The user clicks a cell expecting week 15 data but gets week 26 data. This is a correctness bug, not just a theoretical concern.

**Recommendation:** Use a ref (`currentWeekRef`) updated via `useEffect`, exactly as done for `viewModeRef`, `seenSpeciesRef`, etc. The pattern already exists in the codebase (lines 275-288).

### 3.2 Rapid View Mode Switching During Async Loads
**Attack:** Switch between density/species/goal-birds views rapidly while data is loading.

**What the code does:** The main overlay useEffect (line 715) uses a `cancelled` flag (line 716) that is set to `true` in the cleanup function (line 1113). This correctly prevents stale async results from being applied.

**Severity:** NONE -- properly handled with cancellation.

**Finding:** The `cancelled` flag pattern is correctly implemented. AbortController is used for the weekly summary fetch (line 375). Good defensive programming.

### 3.3 Goal Lists State Divergence Between Tabs
**Attack:** Open Goal Birds tab, create a list. Switch to Species tab. Add a species to a goal list from Species tab. Switch back to Goal Birds tab.

**What the code does:** GoalBirdsTab (line 231) loads goal lists from IndexedDB on mount. SpeciesTab (line 91) also loads goal lists independently on mount. Both maintain their own local `goalLists` state. When SpeciesTab adds a species via `goalListsDB.addSpeciesToList`, GoalBirdsTab's state is stale until it re-mounts.

**Severity:** MEDIUM

**Impact:** The Goal Birds tab will show outdated species counts until the user navigates away and back. The data in IndexedDB is correct, but the UI is inconsistent. App.tsx also maintains its own `goalLists` state (line 26), making three independent copies of the same data.

**Recommendation:** Lift goal list state management into a shared context (similar to LifeListContext) or use a reactive IndexedDB wrapper that notifies all consumers of changes.

### 3.4 Multiple Browser Tabs -- IndexedDB Concurrency
**Attack:** Open Find-A-Lifer in two browser tabs. Add species to life list in tab 1. Check life list in tab 2.

**What the code does:** Each tab has its own React state (`seenSpecies` Set in LifeListContext). IndexedDB writes are shared, but React state is not. Tab 2 will not see changes from tab 1 until it refreshes.

**Severity:** MEDIUM

**Impact:** A user with two tabs open could mark a species as seen in one tab and still see it as unseen in the other. If they then interact with the stale tab (e.g., marking it seen again), the `put` operation is idempotent (overwrites with same data), so no data corruption occurs. But the UX is confusing.

**Recommendation:** Add an IndexedDB change listener or use `BroadcastChannel` to sync state across tabs. Or at minimum, document this as a known limitation.

---

## 4. Memory and Performance Attacks

### 4.1 Unbounded Cell Data Cache
**Attack:** Click on every cell on the map in goal-birds or density mode across multiple weeks.

**What the code does:** MapView.tsx line 188 defines `cellDataCache` as a module-level `Map` with keys like `"${week}-${cellId}"`. This cache is never evicted, never cleared, and has no size limit.

**Severity:** MEDIUM

**Impact:** With 312 grid cells x 52 weeks = 16,224 possible cache entries, each containing an array of species records (up to ~2,490 per cell), the cache could theoretically grow to hundreds of MB. In practice, users won't click every cell, but there's no upper bound. Module-level means it persists across React re-renders and even component unmounts.

**Recommendation:** Implement LRU eviction (e.g., keep last 50-100 entries) or clear cache when the week changes.

### 4.2 Grid GeoJSON Cache -- Never Invalidated
**Attack:** The backend updates the grid data, but the user's browser keeps serving the old cached version forever.

**What the code does:** MapView.tsx lines 144-185 cache the grid GeoJSON in a dedicated IndexedDB store (`find-a-lifer-grid-cache`). There is no TTL, no version check, and no cache invalidation mechanism.

**Severity:** LOW

**Impact:** If the grid data ever changes (new cells, updated geometries), users must manually clear their browser's IndexedDB to see the update. The module-level `gridGeoJsonCache` variable (line 138) also means the in-memory cache persists for the session even if IndexedDB is cleared.

**Recommendation:** Add a version/hash to the grid cache key, or check the backend's health endpoint version and invalidate on mismatch.

### 4.3 Window of Opportunity -- 52 Sequential API Calls
**Attack:** Select a species in Window of Opportunity mode.

**What the code does:** TripPlanTab.tsx lines 211-219 fires 52 sequential `fetch` calls (one per week) in a for-loop with `await`. Each fetches the full weekly data file.

**Severity:** HIGH

**Impact:** This is 52 sequential HTTP requests, each potentially returning large JSON payloads. With the full weekly data format (every cell x every species), each response could be several MB. Total transfer: potentially 100+ MB. The UI shows a loading spinner but provides no progress indication or cancellation. If the user switches away and back, the effect re-runs because `selectedSpeciesForWindow` changes, and there's no AbortController.

**Recommendation:** Use the per-species endpoint (`/api/weeks/{week}/species/{speciesCode}`) instead of fetching all species data for all 52 weeks. Add an AbortController. Show progress (e.g., "Loading week 15/52..."). Consider a dedicated backend endpoint that returns all-weeks data for a single species.

### 4.4 "Select All" on 2,490 Species
**Attack:** In the Species tab, click "Select All" with no filters applied.

**What the code does:** SpeciesTab.tsx line 466 calls `markSpeciesSeen` for every filtered species in a `forEach` loop. Each call does an IndexedDB `put` operation and a `setSeenSpecies` state update.

**Severity:** MEDIUM

**Impact:** 2,490 individual IndexedDB writes, each followed by a React state update that creates a new Set. This means 2,490 re-renders triggered in rapid succession. While React batches state updates within event handlers, the `async` nature of `markSpeciesSeen` (it awaits the DB write before setting state) means each update may trigger its own render cycle. The UI will freeze or stutter significantly.

**Recommendation:** Use `importSpeciesList` (which already exists and does a single transaction) instead of calling `markSpeciesSeen` in a loop. Or add a `markMultipleSpeciesSeen` batch function.

---

## 5. Input Validation and Edge Cases

### 5.1 CSV Import -- Weak Parsing
**Attack:** Upload a malformed CSV with: (a) commas inside unquoted fields, (b) newlines inside quoted fields, (c) a file that is 500MB of garbage, (d) a CSV with 1 million rows.

**What the code does:** ProfileTab.tsx line 31 uses `line.split(',')` for CSV parsing. This does not handle quoted fields containing commas, escaped quotes, or multiline values.

**Severity:** HIGH

**Impact:** A species name like `"Hawk, Red-tailed"` in an unquoted CSV field will be split incorrectly, causing the common name to be truncated to `"Hawk"` and misaligning all subsequent columns. The eBird export format likely uses simple CSV without internal commas in species names, but this is still fragile. There is also no file size limit -- a user could upload a multi-GB file and `file.text()` will attempt to read the entire thing into memory.

**Recommendation:** Use a proper CSV parser (e.g., Papa Parse). Add a file size limit (e.g., 5MB). Add a row count limit.

### 5.2 Goal List Name Validation
**Attack:** Create a goal list with name: (a) empty string after trim, (b) 10,000 characters, (c) HTML tags like `<script>alert(1)</script>`, (d) Unicode emojis, (e) just whitespace.

**What the code does:** GoalBirdsTab.tsx line 285 rejects empty/whitespace-only names. Line 291-298 checks for duplicate names (case-insensitive). But there is no maximum length validation. The name is rendered directly in JSX (e.g., line 648 in SpeciesTab.tsx: `{list.name}`).

**Severity:** LOW

**Impact:** React's JSX rendering auto-escapes HTML, so XSS via goal list names is not possible. A 10,000-character name would break the layout but cause no security issue. Unicode names work fine.

**Recommendation:** Add a max-length validation (e.g., 100 characters) for UX sanity.

### 5.3 Species Search -- No Debouncing
**Attack:** Type rapidly in the species search box.

**What the code does:** SpeciesTab.tsx line 190 computes suggestions synchronously on every render by filtering `allSpecies` (2,490 items). ExploreTab line 54 does the same. GoalBirdsTab line 483 does the same.

**Severity:** LOW

**Impact:** Filtering 2,490 items with `toLowerCase().includes()` is fast enough that debouncing isn't strictly needed. Each keystroke triggers a re-render, but the filter operation is O(n) with n=2,490 which completes in sub-millisecond time. No performance issue in practice.

### 5.4 localStorage Poisoning
**Attack:** Set `localStorage.darkMode` to `"not-a-boolean"`, `activeGoalListId` to a non-existent UUID, or inject additional keys.

**What the code does:** App.tsx line 17 checks `localStorage.getItem('darkMode') === 'true'` -- any non-`'true'` value defaults to false. Line 48-49 validates the saved `activeGoalListId` against loaded goal lists.

**Severity:** NONE -- properly handled.

**Finding:** The localStorage reads are defensive. Invalid values fall back to safe defaults. Good.

---

## 6. Network and Data Trust

### 6.1 Frontend Trusts Backend Data Without Validation
**Attack:** MITM proxy that modifies API responses (e.g., inject extra species, change species codes, return malformed JSON).

**What the code does:** Every `fetch` response is parsed with `.json()` and used directly. No schema validation, no type guards at runtime. TypeScript types are compile-time only.

**Severity:** MEDIUM

**Impact:** If the backend returns malformed data (e.g., missing `speciesCode` field, wrong types), the app will fail at runtime with unclear errors. A MITM proxy could inject bogus species data that corrupts the user's life list if they mark injected species as "seen." However, since this is a local-first app typically used on trusted networks, the real risk is low.

**Recommendation:** Add runtime validation for critical API responses (at minimum the species list). Consider using Zod schemas.

### 6.2 No Integrity Check on Cached Data
**Attack:** Manually modify the grid GeoJSON in the IndexedDB cache (`find-a-lifer-grid-cache`) to point grid cells to wrong locations.

**What the code does:** MapView.tsx line 517 validates only that the fetched data has `type === 'FeatureCollection'` and `features` is an array. The cached version (loaded from IndexedDB) skips even this check (line 505-506 just checks for non-null).

**Severity:** LOW

**Impact:** Corrupted cached grid data would make the map display incorrectly. The user would need to clear IndexedDB to fix it.

**Recommendation:** Apply the same GeoJSON validation to cached data as to freshly fetched data.

---

## 7. Logical Absurdities and Design Questions

### 7.1 "What if I add ALL 2,490 species to my life list?"
**Impact:** The app becomes functionally useless for its primary purpose. Lifer density shows 0 everywhere. The progress tab shows 100%. Every cell has 0 lifers. The goal-birds mode still works if goal lists have species. The species range mode still works. The app doesn't crash, but there's no discovery value.

**Verdict:** This is fine -- it's a valid end state for a completionist.

### 7.2 "What if I create 1,000 goal lists?"
**Impact:** GoalBirdsTab loads all lists on mount. The list selector dropdown would have 1,000 entries. Each list switch recomputes `goalSpeciesCodes`. App.tsx loads all lists on mount. No performance cliff, just a bad UX.

**Verdict:** Consider a max list count (e.g., 50), mainly for UX.

### 7.3 "What happens with no backend?"
**Impact:** The health check shows a red dot. Species data never loads (SpeciesTab shows error). Map shows the base tiles but no grid overlay (fetch fails silently). Life list and goal lists still work (IndexedDB is local). The app degrades to a useless map with functional local data management.

**Verdict:** Acceptable graceful degradation. Consider showing a more prominent "server unavailable" message.

### 7.4 "What if the user's browser doesn't support IndexedDB?"
**Impact:** The `openDB` call in LifeListContext.tsx will throw. The `LifeListProvider` catches the error (line 88) but sets `loading` to false with an empty species set. The app renders but with a permanently empty life list and no way to persist data.

**Verdict:** Add a check for IndexedDB support on startup and show a clear message.

---

## 8. XSS and Injection Surface Analysis

### 8.1 Species Photo URL from Backend
**Attack:** If the backend's species.json contains a `photoUrl` like `javascript:alert(1)` or a URL to a tracking pixel.

**What the code does:** SpeciesInfoCard.tsx line 47 renders `<img src={species.photoUrl} />`. React does not execute `javascript:` URIs in `src` attributes, so this is safe from XSS. However, a malicious photo URL could be used to track users or serve inappropriate content.

**Severity:** LOW

**Impact:** Since the photo URLs come from pre-processed static data that you control, this is not exploitable in practice. But if the data pipeline ever ingests user-submitted URLs, this becomes a concern.

### 8.2 eBird URL from Backend
**What the code does:** SpeciesInfoCard renders an `<a href={species.ebirdUrl}>` link. Same analysis as above -- safe if data is trusted, risky if data pipeline is compromised.

**Severity:** LOW

### 8.3 Error Messages Display User Input
**What the code does:** SpeciesTab.tsx line 494: `No species matching "${searchTerm}"`. React JSX auto-escapes this, so HTML injection is not possible.

**Severity:** NONE

---

## 9. Concurrency and Timing

### 9.1 StrictMode Double-Mount in Development
**Attack:** Not an attack, but React 18+ StrictMode double-mounts effects in development.

**What the code does:** Several effects load data on mount (species, grid, goal lists). In StrictMode, these fire twice, causing duplicate API calls. The module-level caches (`speciesMetaCache`, `speciesMetaPromise`) in MapView.tsx correctly handle this by deduplicating concurrent requests.

**Severity:** NONE in production, minor in development.

### 9.2 Animation Interval Leak Potential
**Attack:** Start the week animation, then collapse the side panel.

**What the code does:** ExploreTab.tsx line 95 starts a `setInterval`. The cleanup on line 112 clears it on unmount. But if the user starts animation, then collapses the panel (which unmounts ExploreTab), the interval is cleared, but `isAnimating` state is lost. When the panel re-opens, the animation button shows "Play" even though animation was interrupted.

**Severity:** LOW

**Impact:** Minor UX inconsistency. The animation stops correctly (no leak), but the user might expect it to resume.

---

## 10. The Uncomfortable Questions

### 10.1 "Why is there no data export for goal lists?"
Goal lists live only in IndexedDB. If the user clears browser data, they lose all goal lists. There's CSV import/export for the life list but nothing for goal lists. This is a data loss risk.

### 10.2 "What prevents accidental Clear All?"
ProfileTab.tsx line 165 uses `window.confirm()` -- a single click to wipe the entire life list. No undo, no backup, no two-step confirmation. For a dataset that may represent years of birding, this is concerning.

### 10.3 "What happens when the species dataset changes?"
If eBird updates its taxonomy (splits, lumps, renames), the user's life list and goal lists contain stale species codes. There is no migration path. Old codes will silently stop matching, and the user's seen count will decrease without explanation.

### 10.4 "Why does TripPlan fetch the full weekly data?"
TripPlanTab.tsx line 142 fetches `/api/weeks/${hotspotWeek}` which returns the full record-based format (every species x every cell). For hotspot calculation, this is massive overkill. The summary endpoint would suffice for most cases, or a dedicated endpoint could return only lifer-relevant data.

---

## Summary of Findings by Severity

| Severity | Count | Key Issues |
|----------|-------|------------|
| CRITICAL | 0 | -- |
| HIGH | 3 | Week slider DOM query, CSV parsing, 52-call window of opportunity |
| MEDIUM | 6 | Phantom species injection, unbounded caches, goal list state divergence, Select All performance, multi-tab sync, untrusted backend data |
| LOW | 7 | CORS misconfiguration, grid cache invalidation, goal list name length, animation UX, dual DB connections, no goal list export, photo URL trust |
| NONE | 7 | Week validation, cell ID handling, species code injection, batch limits, localStorage defaults, XSS escaping, StrictMode |

## Top 5 Recommendations (Prioritized)

1. **Replace DOM query for week in map click handlers** with a ref pattern (already used for other values). This is a correctness bug that will silently show wrong data when the panel is collapsed.

2. **Use a proper CSV parser** (Papa Parse) for life list import. The naive `split(',')` will misparse any CSV with commas in fields.

3. **Optimize Window of Opportunity** to use the per-species endpoint instead of fetching all data for all 52 weeks. Add AbortController for cancellation.

4. **Add batch operations** for "Select All" / "Select None" in the Species tab to avoid 2,490 individual IndexedDB writes and state updates.

5. **Consolidate goal list state** into a shared context or reactive store to prevent state divergence between tabs (GoalBirdsTab, SpeciesTab, App.tsx all maintain independent copies).
