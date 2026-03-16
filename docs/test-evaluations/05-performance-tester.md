# Performance & Reliability Test Evaluation

**Application:** Find-A-Lifer
**Evaluator Role:** Performance & Reliability Tester
**Date:** 2026-03-13
**Codebase Commit:** `36176d1` (master)

---

## 1. Executive Summary

The application has several serious performance bottlenecks centered around data transfer volumes. The grid GeoJSON is 38MB (3.3MB gzipped) with 229,814 features -- far larger than the 312 cells described in project context. Summary files are 3-5MB raw (not 80KB as noted), and full week files range from 31-54MB each. The TripPlanTab's "Window of Opportunity" feature fetches all 52 full week files sequentially (~2.1GB total), which is a critical performance issue. The IndexedDB grid cache and module-level species cache are effective mitigations for repeat visits, but many optimization opportunities remain.

**Severity Classification:**
- CRITICAL: 2 issues (TripPlanTab data volumes, no AbortController on most fetches)
- HIGH: 4 issues (summary size mismatch, duplicate data fetching, no bundle splitting, grid in-memory retention)
- MEDIUM: 6 issues (no HTTP caching, no debounce on sliders, no service worker, redundant species fetches across components)
- LOW: 3 issues (console.log in production, no error boundaries around map, legend re-renders)

---

## 2. Data Volume Baseline Measurements

### Actual File Sizes (measured from `backend/data/`)

| Asset | Raw Size | Gzipped Size | Features/Records |
|-------|----------|-------------|-----------------|
| `grid_27km.geojson` | 38.0 MB | 3.35 MB | 229,814 features |
| `species.json` | 1.1 MB | 86 KB | 2,490 entries |
| `week_01.json` (smallest full) | 31.3 MB | ~6 MB (est.) | 449K cell-species pairs |
| `week_24.json` (largest full) | 54.4 MB | ~10 MB (est.) | ~600K+ cell-species pairs |
| `week_01_summary.json` (smallest) | 3.0 MB | ~600 KB (est.) | compact [id, count, prob] |
| `week_26_summary.json` (largest) | 5.2 MB | 1.28 MB | 449,858 entries |
| `grid_centers.json` | 5.9 MB | -- | supplemental |
| `regions.geojson` | 3.8 KB | -- | small |
| Total weeks directory | 2.3 GB | -- | 104 files (52 full + 52 summary) |
| JS bundle (`index-*.js`) | 1.4 MB | -- | single chunk |
| CSS bundle (`index-*.css`) | 116 KB | -- | single chunk |

### Key Discrepancy

The project context states "312 grid cells" and "~80KB gzipped" summary files. In reality:
- Grid has **229,814 features** (possibly individual hex sub-cells, not the 312 conceptual cells)
- Summary files are **1.28 MB gzipped** for the largest week, not 80KB
- This 16x discrepancy affects all performance assumptions

---

## 3. Critical Performance Issues

### 3.1 CRITICAL: TripPlanTab Fetches Entire Full Week Files

**Location:** `frontend/src/components/TripPlanTab.tsx`, lines 142, 213, 299, 420

The TripPlanTab fetches the **full** `/api/weeks/{N}` endpoint (31-54MB each, returning all cell-species pairs expanded to flat records) in four different use cases:

1. **Hotspots mode** (line 142): Fetches 1 full week file (~40MB) to count lifers per cell
2. **Window of Opportunity** (lines 211-219): Fetches **all 52 full week files sequentially** to find when a species appears -- approximately **2.1 GB of JSON** parsed client-side
3. **Compare mode** (line 299): Fetches 1-3 full week files per comparison
4. **Location mode** (line 420): Fetches 1-3 full week files

The Window of Opportunity feature is the worst case: a sequential loop `for (let week = 1; week <= 52; week++)` that fetches, parses, and filters each ~40MB file one at a time. On a typical broadband connection (~50 Mbps), this would take approximately:
- Network transfer: ~2.1 GB / 6.25 MB/s = **336 seconds** minimum
- JSON parsing: ~52 x 200ms = **10+ seconds** of main thread blocking
- Total: **5-6 minutes** per Window of Opportunity query

**Additionally**, the `/api/weeks/{N}` endpoint in `backend/main.py` (line 198-218) converts the compact cell-grouped format `[[cell_id, [species_ids]]]` back to flat records `[{cell_id, species_id, probability}]`, inflating the response size by approximately 3-5x.

**Impact:** Application becomes unusable during Window of Opportunity queries. Browser may run out of memory on lower-end devices.

**Recommendation:**
- Use the `/api/weeks/{N}/species/{speciesCode}` endpoint for Window of Opportunity (fetches only the relevant species data -- a few KB per week instead of 40MB)
- Use `/api/weeks/{N}/cells/{cellId}` endpoint for Location and Compare modes
- Use the `/api/weeks/{N}/summary` endpoint or the new `/api/weeks/{N}/lifer-summary` POST endpoint for Hotspots mode instead of full week files
- Add a dedicated backend endpoint: `GET /api/species/{code}/annual-distribution` that returns a compact per-week cell list

### 3.2 CRITICAL: Missing AbortController on Most Fetch Calls

**Location:** All fetches in `TripPlanTab.tsx`, `SpeciesTab.tsx`, `GoalBirdsTab.tsx`, and cell-click handlers in `MapView.tsx`

Only one fetch in the entire codebase uses `AbortController`: the weekly summary fetch in `MapView.tsx` (line 375). All other fetches -- including the multi-gigabyte Window of Opportunity loop -- have no abort mechanism.

**Impact:**
- Rapid week slider changes fire overlapping requests that cannot be cancelled
- Switching tabs during a Window of Opportunity calculation leaves dozens of in-flight requests consuming bandwidth
- State updates from stale responses can overwrite newer data (race conditions)

**Recommendation:** Add AbortController to every useEffect that performs fetches, following the pattern already established in MapView.tsx line 375-406.

---

## 4. High-Severity Issues

### 4.1 HIGH: Duplicate Data Fetching Across Components

**Species metadata** is fetched independently by at least 4 components:
- `MapView.tsx`: via `loadSpeciesMetaCache()` (module-level cache -- good)
- `TripPlanTab.tsx` line 78: `fetch('/api/species')` (no cache, stores in local state)
- `GoalBirdsTab.tsx` line 272: `fetch('/api/species')` (no cache, stores in local state)
- `SpeciesTab.tsx` line 60: `fetch('/api/species')` (no cache, stores in local state)

**Grid data** is fetched independently by 2 components:
- `MapView.tsx`: via `loadGridFromCache()` (IndexedDB cache -- good)
- `TripPlanTab.tsx` line 97: `fetch('/api/grid')` (no cache, 38MB re-fetch, stores in component state)

**Impact:** On initial page load, the species endpoint is hit up to 4 times and the grid endpoint up to 2 times. Each grid re-fetch transfers 3.35MB gzipped and parses 38MB of JSON.

**Recommendation:**
- Extend the module-level `speciesMetaCache` from MapView to a shared module (e.g., `lib/speciesCache.ts`)
- Extend the IndexedDB grid cache to a shared module, or lift grid data to App-level state
- Or: introduce a React context for shared data that loads once and serves all components

### 4.2 HIGH: No Bundle Splitting

**Location:** `frontend/vite.config.ts`

The entire application ships as a single 1.4MB JS bundle. There is no code splitting configuration. Vite defaults do not split vendor chunks unless configured.

**Contents likely include:** React (~45KB gzipped), MapLibre GL JS (~200KB gzipped), all 6 tab components, all utility code.

**Impact:** Users download the full 1.4MB bundle even before seeing any content. MapLibre alone is a significant chunk that could be lazy-loaded.

**Recommendation:**
Add to `vite.config.ts`:
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'maplibre': ['maplibre-gl'],
        'react-vendor': ['react', 'react-dom'],
      }
    }
  }
}
```
Consider lazy-loading tab components with `React.lazy()` since only one tab is visible at a time.

### 4.3 HIGH: 229K-Feature Grid Retained in Memory

The grid GeoJSON (38MB parsed) is held in three places simultaneously:
1. `gridGeoJsonCache` module variable (MapView.tsx line 138)
2. MapLibre GL's internal source data (after `addSource`)
3. `gridData` state in TripPlanTab.tsx (line 63) -- a second independent copy

**Impact:** Approximately 100-150MB of heap consumed by grid geometry alone. On mobile devices with 2-4GB RAM, this represents 3-7% of total available memory.

### 4.4 HIGH: Backend Reads and Parses Full Week Files for Every API Call

**Location:** `backend/main.py`, `_load_week_data()` and endpoint handlers

The `_week_cache` (line 65) caches parsed data in memory, but:
- The full week file (`week_24.json` at 54MB) must be loaded into Python's heap
- With 52 weeks cached, the backend would consume ~2.3GB of RAM
- The lifer-summary POST endpoint (line 312) iterates all species in all cells for each request
- The species-batch endpoint (line 247) iterates all cells for each batch query

The caching is effective for repeat requests to the same week, but the first request for each week has a cold-start parsing delay of several seconds.

---

## 5. Medium-Severity Issues

### 5.1 MEDIUM: No HTTP Cache Headers

**Location:** `backend/main.py`

No `Cache-Control`, `ETag`, or `Last-Modified` headers are set on any response. The data is pre-processed and static, so aggressive caching is safe.

**Recommendation:**
```python
@app.get("/api/species")
async def get_species():
    return JSONResponse(
        content=_species_list,
        headers={"Cache-Control": "public, max-age=86400"}  # 24 hours
    )
```

The grid and species endpoints serve truly static data and could use `max-age=604800` (1 week). Summary endpoints could use `max-age=3600` since the data doesn't change between deployments.

### 5.2 MEDIUM: No Debounce or Throttle on Week Slider

**Location:** `ExploreTab.tsx` and `MapView.tsx`

The week slider directly calls `onWeekChange` which sets state, triggering a fetch for every intermediate position. Rapidly dragging from week 1 to week 52 fires up to 51 fetch requests. While the AbortController on the summary fetch helps, only one fetch has it.

**Recommendation:** Debounce the `onWeekChange` callback by 150-300ms, or use a "committed value" pattern where the fetch only fires on `onMouseUp`/`onTouchEnd`.

### 5.3 MEDIUM: No Service Worker or Offline Support

There is no service worker, PWA manifest, or offline caching strategy. Given that the data is static and rarely changes:
- Grid GeoJSON could be cached indefinitely after first load
- Species metadata could be cached indefinitely
- Weekly summaries could be cached with a long TTL

The IndexedDB grid cache in MapView.tsx is a good start but covers only the grid geometry.

### 5.4 MEDIUM: Redundant Species Metadata in IndexedDB

The `lifeList` store includes `comName` alongside `speciesCode` for each entry. While minor, the `importSpeciesList` function (LifeListContext.tsx line 155) performs individual `put` operations in a transaction loop for each species. For a life list import of 500+ species, this could be slow.

The transaction approach is correct (single transaction for all puts), but re-reading all entries after the import (line 176: `db.getAll(STORE_NAME)`) adds an extra read.

### 5.5 MEDIUM: Feature State Updates Are O(n) Per Cell

**Location:** `MapView.tsx`, `applyFeatureStates()` function (line 722)

Every overlay update:
1. Calls `removeFeatureState()` for every previously-set cell (up to 229K calls)
2. Calls `setFeatureState()` for every new cell value (up to 229K calls)

This means each week change can trigger ~450K MapLibre API calls. MapLibre handles this internally but it's still a significant synchronous workload.

**Recommendation:** Consider using `map.getSource('grid').setData(...)` with pre-colored features instead of feature states, or batch feature-state updates. Alternatively, only update cells whose values actually changed.

### 5.6 MEDIUM: TripPlanTab Fetches Grid Independently Without IndexedDB Cache

`TripPlanTab.tsx` line 97 fetches `/api/grid` directly into component state without using the IndexedDB cache that `MapView.tsx` established. This means navigating to the Trip Plan tab always re-fetches 38MB of grid data (3.35MB gzipped transfer).

---

## 6. Low-Severity Issues

### 6.1 LOW: Console Logging in Production

Throughout the codebase, `console.log()` calls output debug information in production builds. Examples:
- "Loaded week X summary: Y cells"
- "MapView: cached 2490 species metadata entries"
- "Goal Birds popup: cell X has Y goal birds"

These are helpful for development but add noise in production and can slow down debugging when users inspect the console.

### 6.2 LOW: Map Re-initialization on Dark Mode Toggle

`MapView.tsx` line 712: The map's `useEffect` has `[darkMode]` as a dependency, meaning toggling dark mode completely destroys and re-creates the MapLibre map instance, re-fetches grid data (from IndexedDB cache at least), and re-applies all feature states.

**Impact:** A 1-3 second visual flash and data re-processing on dark mode toggle.

**Recommendation:** Use MapLibre's `map.setStyle()` to swap the base tile layer without destroying the map instance.

### 6.3 LOW: Legend Gradient Re-renders

The legend component (MapView.tsx line 1133) uses an IIFE inside JSX that runs on every render. While cheap, it could be extracted to a memoized component.

---

## 7. Initial Page Load Waterfall Analysis

### Current Sequence (estimated timings on 50 Mbps connection)

```
T+0ms      HTML document (small, fast)
T+50ms     JS bundle download (1.4MB ~= 400KB gzip, ~65ms)
T+150ms    JS parse + React hydration (~100ms)
T+200ms    LifeListProvider: IndexedDB open + read life list (~50ms)
T+250ms    Parallel fetch start:
           - /api/health (trivial)
           - /api/species (86KB gzip, ~20ms transfer)
           - /api/grid attempt from IndexedDB cache
T+300ms    If grid not cached: /api/grid (3.35MB gzip, ~540ms transfer)
           MapLibre map initialization begins
T+350ms    /api/weeks/26/summary (1.28MB gzip, ~205ms transfer)
T+500ms    MapLibre tiles loading (external CDN, variable)
T+800ms    Grid source added to map, feature states begin applying
T+1200ms   First meaningful paint with heatmap overlay
```

### If Grid is Cached in IndexedDB (repeat visit)

```
T+0ms      HTML document
T+50ms     JS bundle (cached by browser)
T+150ms    React hydration
T+200ms    IndexedDB reads: life list + grid (parallel, ~100ms)
T+300ms    /api/species + /api/weeks/26/summary (parallel, ~250ms)
T+500ms    Map ready with overlay
```

**Metrics Targets:**
| Metric | Target | Current (est.) | Status |
|--------|--------|---------------|--------|
| First Contentful Paint | < 1s | ~500ms | PASS |
| Largest Contentful Paint | < 2.5s | ~1.5s (cached), ~3s (cold) | MARGINAL |
| Time to Interactive | < 3s | ~2s (cached), ~4s (cold) | MARGINAL |
| Total JS bundle size (gzip) | < 300KB | ~400KB | FAIL |
| Initial data transfer | < 2MB | ~5MB (cold) | FAIL |

---

## 8. Stress Test Scenarios

### 8.1 Rapid Week Slider Scrubbing

**Scenario:** Drag week slider from 1 to 52 rapidly (complete in ~2 seconds).

**Expected behavior:** Only the final week's data should be rendered. Intermediate requests should be aborted.

**Actual behavior (code analysis):**
- Summary fetch: Has AbortController -- properly aborts. PASS.
- Lifer-summary POST (density mode with life list): Fires inside the overlay useEffect with a `cancelled` flag, but the fetch itself is not aborted -- it completes in the background and the response is silently discarded. PARTIAL.
- Species-batch fetch (goal-birds mode): Same pattern -- `cancelled` flag prevents state update but fetch continues. PARTIAL.
- Cell-click fetches: No abort mechanism. If a user clicks a cell during rapid scrubbing, the response may arrive for the wrong week. FAIL.

**Network impact:** 51 summary fetches at 1.28MB each = ~65MB of wasted bandwidth in the worst case. With the AbortController only on the summary fetch, most are properly cancelled.

### 8.2 Large Goal Species List (200+ species)

**Scenario:** User imports a goal list with 200+ species codes.

**Expected behavior:** Species-batch endpoint handles the batch efficiently.

**Actual behavior (code analysis):**
- The batch endpoint URL `?ids=33,45,102,...` could exceed URL length limits at ~200+ numeric IDs (~800 characters, well within browser limits of ~2000-8000 chars). PASS.
- The backend iterates all cells x all species for the batch (O(cells * batch_size)). With 229K cells and 200 species, this is ~46M comparisons per request. MARGINAL.
- The 500-species limit (main.py line 263) prevents extreme cases. PASS.
- Frontend builds a `Map<number, number>` with up to 229K entries and normalizes. PASS.

### 8.3 Large Life List (1000+ species seen)

**Scenario:** User has seen 1000+ of 2490 species.

**Expected behavior:** Lifer-summary endpoint efficiently subtracts seen species.

**Actual behavior (code analysis):**
- POST body contains `seen_species_codes` array with 1000+ strings. At ~8 chars each, ~8KB payload. PASS.
- Backend converts codes to IDs using dict lookup (O(n)). PASS.
- Backend iterates all cells and species to count lifers (O(cells * species_per_cell)). This is the same complexity regardless of life list size. PASS.
- The `seenSpecies` Set is passed as a prop and recreated on each change, but Set operations are O(1). PASS.

### 8.4 Rapid Tab Switching

**Scenario:** User rapidly switches between all 6 tabs.

**Expected behavior:** Previous tab's fetches should be cancelled, no memory leaks.

**Actual behavior (code analysis):**
- Tab components unmount when switching (conditional rendering in SidePanel.tsx). PASS.
- useEffect cleanup runs on unmount, but most don't have AbortControllers. PARTIAL.
- TripPlanTab: Fetches species + grid on mount every time (not cached). Each mount re-fetches 3.35MB (grid) + 86KB (species). FAIL.
- GoalBirdsTab: Fetches species on mount every time. MARGINAL.
- SpeciesTab: Fetches species + regions on mount every time. MARGINAL.

### 8.5 Offline / Degraded Network

**Scenario:** User loses network connectivity mid-session.

**Expected behavior:** Cached data remains functional, clear error messaging for failed fetches.

**Actual behavior (code analysis):**
- IndexedDB life list and goal lists: Fully functional offline. PASS.
- Grid data: If cached in IndexedDB, the map renders hexagons. PASS (repeat visit).
- Species metadata: If cached in module variable (MapView), available for the session but not persisted across reloads. PARTIAL.
- Weekly data: No offline cache. Fetches fail silently (caught errors logged to console). FAIL.
- Summary data: No offline cache. Map shows no overlay data. FAIL.
- Error messaging: Generic console errors only, no user-facing offline indicator beyond the health check status dot. FAIL.
- Health check: TopBar likely shows a red/gray status indicator. PASS.

### 8.6 Browser Memory Pressure

**Scenario:** Extended session with many week changes and cell clicks.

**Analysis:**
- Grid GeoJSON in memory: ~38MB parsed (module cache + MapLibre internal). Permanent.
- Grid GeoJSON in TripPlanTab state: ~38MB additional if Trip Plan tab is open. Released on tab switch.
- Species metadata cache: ~1MB. Permanent.
- Weekly summary state: ~5MB (replaced each week change). One copy.
- `cellDataCache` Map: Grows unbounded. Each cell-click caches the response indefinitely (MapView.tsx line 188). After clicking 100 cells across 10 weeks, this could be ~50MB.
- `_week_cache` on backend: Grows up to ~2.3GB as weeks are accessed. Never evicted.

**Recommendation:** Add a size limit or LRU eviction to `cellDataCache`. Consider clearing it on week changes. Add eviction to backend `_week_cache` (keep only last N weeks).

---

## 9. Backend Performance Analysis

### 9.1 Endpoint Response Time Estimates (cold cache)

| Endpoint | Data Size | Parse Time | Response Time (est.) |
|----------|-----------|-----------|---------------------|
| `GET /api/health` | ~200B | N/A | < 5ms |
| `GET /api/species` | 1.1MB raw | Pre-loaded | < 10ms |
| `GET /api/grid` | 38MB raw | Pre-loaded on each request | ~500ms (file read + JSON parse + gzip) |
| `GET /api/weeks/{N}/summary` | 3-5MB raw | File read | ~200ms |
| `GET /api/weeks/{N}` | 31-54MB raw | File read + format conversion | ~2-5s |
| `GET /api/weeks/{N}/cells/{cellId}` | ~10KB response | Requires full week load | ~2-5s (cold), ~50ms (cached) |
| `POST /api/weeks/{N}/lifer-summary` | 3-5MB response | Requires full week load + iteration | ~2-5s (cold), ~200ms (cached) |
| `GET /api/weeks/{N}/species-batch` | Variable | Requires full week load + iteration | ~2-5s (cold), ~300ms (cached) |

### 9.2 Backend Memory Concerns

The `_week_cache` dict (main.py line 65) caches parsed week data permanently. Each week's data is a dict of `{cell_id: [species_ids]}` with up to 229K entries. Accessing all 52 weeks would consume approximately 1-2GB of Python process memory.

The grid endpoint (line 346) reads and parses the 38MB file on every request (no caching). This is a significant cold-start penalty.

**Recommendation:**
- Cache grid data at startup (add `@lru_cache` or load into a module variable like species)
- Add LRU eviction to `_week_cache` (keep last 5-10 weeks)
- Consider using `FileResponse` for grid to leverage OS-level file caching and avoid JSON re-serialization

### 9.3 GZip Middleware Configuration

The `GZipMiddleware(minimum_size=1000)` is correctly configured and will compress all large responses. However, for the grid endpoint returning 38MB of JSON, the server spends significant CPU time on gzip compression for each request.

**Recommendation:** Pre-compress the grid file and serve it directly with `Content-Encoding: gzip` headers, or cache the compressed response.

---

## 10. Benchmark Test Plan

### Test 1: Cold Start Load Time
- **Setup:** Clear all browser caches (HTTP cache, IndexedDB, localStorage)
- **Action:** Navigate to the application URL
- **Measure:** Time from navigation start to first heatmap rendering
- **Target:** < 4 seconds on 50 Mbps connection
- **Tools:** Chrome DevTools Performance panel, Lighthouse

### Test 2: Warm Start Load Time
- **Setup:** Visit the app once (to populate IndexedDB grid cache), then reload
- **Action:** Hard reload (Ctrl+Shift+R)
- **Measure:** Time from navigation start to first heatmap rendering
- **Target:** < 2 seconds
- **Tools:** Chrome DevTools Performance panel

### Test 3: Week Slider Rapid Scrub
- **Setup:** App loaded with week 26 displayed
- **Action:** Programmatically change week from 1 to 52 over 2 seconds (one change every ~40ms)
- **Measure:** Total network requests fired, requests completed, final state correctness
- **Target:** < 5 requests completed (rest aborted), correct final state for week 52
- **Script:**
```js
const slider = document.querySelector('[data-testid="week-slider"]');
for (let w = 1; w <= 52; w++) {
  setTimeout(() => {
    slider.value = w;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }, (w - 1) * 40);
}
```

### Test 4: Window of Opportunity Timing
- **Setup:** Navigate to Trip Plan tab, select Window mode
- **Action:** Select a species (e.g., American Robin) and trigger Window of Opportunity calculation
- **Measure:** Total time to completion, total data transferred, peak memory usage
- **Target:** < 30 seconds (currently estimated at 5-6 minutes)
- **Blocked by:** CRITICAL issue 3.1 -- test will fail until endpoint usage is fixed

### Test 5: Memory Accumulation
- **Setup:** App loaded, Chrome DevTools Memory panel
- **Action:** Click 50 different cells across 10 different weeks, switch tabs repeatedly
- **Measure:** Heap snapshot growth over the session
- **Target:** Heap should not exceed 300MB
- **Focus:** `cellDataCache` growth, grid GeoJSON duplication

### Test 6: Goal Species Batch Performance
- **Setup:** Import a goal list with 200 species
- **Action:** Switch to Goal Birds view mode, change weeks 5 times
- **Measure:** Time per species-batch request, rendering time per overlay update
- **Target:** < 2 seconds per overlay update (including fetch + render)

### Test 7: Offline Resilience
- **Setup:** Load app fully (warm cache), then go offline (DevTools Network: Offline)
- **Action:** Change weeks, switch tabs, click cells
- **Measure:** Error handling behavior, data that remains available, user messaging
- **Target:** Grid and species data remain available, clear offline indicator shown, no unhandled errors in console

### Test 8: Concurrent User Simulation (Backend)
- **Setup:** Use `wrk` or `ab` to simulate concurrent requests
- **Action:** 50 concurrent requests to `/api/weeks/26/summary`, `/api/species`, `/api/grid`
- **Measure:** p50/p95/p99 response times, error rate
- **Target:** p95 < 1s for summary, < 500ms for species, < 3s for grid
- **Tool:** `wrk -t4 -c50 -d30s http://localhost:8001/api/weeks/26/summary`

---

## 11. Optimization Recommendations (Prioritized)

### Priority 1 -- Critical Fixes

1. **Replace full-week fetches in TripPlanTab** with appropriate targeted endpoints:
   - Hotspots: Use `/api/weeks/{N}/lifer-summary` POST endpoint
   - Window of Opportunity: Use `/api/weeks/{N}/species/{code}` (52 requests of ~10KB each instead of 52 requests of ~40MB each)
   - Compare: Use `/api/weeks/{N}/cells/{cellId}` for each location
   - Location: Use `/api/weeks/{N}/cells/{cellId}`

2. **Add AbortController to all useEffect fetch patterns** -- especially TripPlanTab, GoalBirdsTab, and SpeciesTab

### Priority 2 -- High Impact

3. **Centralize species and grid data** into shared caches/contexts to eliminate duplicate fetches
4. **Add Vite manual chunks** to split MapLibre GL (~200KB gzipped) into a separate chunk
5. **Lazy-load tab components** with `React.lazy()` + `Suspense`
6. **Cache grid response on the backend** at startup instead of reading from disk on each request

### Priority 3 -- Medium Impact

7. **Add HTTP Cache-Control headers** for static data endpoints
8. **Debounce the week slider** (150ms delay before fetch)
9. **Add LRU eviction** to `cellDataCache` (client) and `_week_cache` (server)
10. **Use `map.setStyle()`** instead of full map re-initialization on dark mode toggle
11. **Add a service worker** for offline support of static data
12. **Persist species metadata in IndexedDB** alongside grid data

### Priority 4 -- Low Impact

13. **Strip console.log calls** in production builds (Vite `define` or `terserOptions.compress.drop_console`)
14. **Extract legend into a memoized component**
15. **Add error boundaries** around MapView to prevent full-app crashes on map errors

---

## 12. Network Request Patterns Summary

### On Initial Load (cold)
| Request | Size (gzip) | Parallelizable? |
|---------|------------|----------------|
| `/api/health` | ~200B | Yes |
| `/api/species` | 86KB | Yes |
| `/api/grid` | 3.35MB | Yes |
| `/api/weeks/26/summary` | 1.28MB | Yes (after grid) |
| MapLibre tiles | ~500KB | Yes (after map init) |
| **Total** | **~5.2MB** | -- |

### On Tab Switch to Trip Plan
| Request | Size (gzip) | Notes |
|---------|------------|-------|
| `/api/species` | 86KB | Duplicate fetch |
| `/api/grid` | 3.35MB | Duplicate fetch, no IndexedDB cache |
| `/api/weeks/{N}` | 6-10MB | Full week data for hotspots |
| **Total** | **~10-14MB** | Mostly redundant |

### On Window of Opportunity Query
| Request | Size (gzip) | Notes |
|---------|------------|-------|
| `/api/weeks/{1..52}` x52 | 6-10MB each | **312-520MB total transfer** |
| **Total** | **~400MB** | Could be reduced to ~500KB with proper endpoints |

---

## 13. Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Initial Load Performance | 6/10 | Acceptable with warm cache, slow cold start due to 38MB grid |
| Data Fetching Efficiency | 2/10 | TripPlanTab fetches full week files; duplicate fetches across components |
| Caching Strategy | 5/10 | Good IndexedDB grid cache, good module-level species cache; missing HTTP caching, no summary caching |
| Map Rendering Performance | 7/10 | Feature-state approach works but 229K removeFeatureState calls per update is heavy |
| Memory Management | 4/10 | Unbounded cellDataCache, duplicate grid in memory, backend caches unbounded |
| Offline Resilience | 3/10 | Only grid and life list available offline; no service worker |
| Error Handling | 4/10 | Console errors only, no user-facing error states for data fetch failures |
| Week Slider Responsiveness | 6/10 | AbortController on summary is good, but no debounce and no abort on other fetches |
| Backend Scalability | 5/10 | GZip middleware helps, but no HTTP caching, grid re-read per request, unbounded week cache |
| Bundle Optimization | 4/10 | Single 1.4MB chunk, no code splitting, no tree-shaking configuration |
| **Overall** | **4.5/10** | Critical TripPlanTab data volume issue drags down the score significantly |
