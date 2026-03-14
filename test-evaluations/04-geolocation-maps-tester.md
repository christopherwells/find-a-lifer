# Geolocation / Maps Specialist Test Evaluation

**Component:** MapView.tsx, TripPlanTab.tsx, backend grid/region APIs
**Tester Role:** Geolocation / Maps Specialist
**Date:** 2026-03-13

---

## Executive Summary

The map implementation is architecturally sound with good use of MapLibre GL JS feature-state for heatmap rendering, proper cleanup on unmount, and effective caching strategies. However, there are several notable coordinate handling issues, a significant bug in how TripPlanTab extracts cell positions, and region bounding box gaps that could affect users. The antimeridian is handled correctly by virtue of all data being in the Western Hemisphere (negative longitudes only), avoiding the common wrap-around problem.

**Severity Ratings:** CRITICAL / HIGH / MEDIUM / LOW / INFO

---

## 1. Grid Cell Rendering and Data Integrity

### 1.1 GeoJSON Structure and promoteId -- PASS
- **File:** `frontend/src/components/MapView.tsx` (line 532)
- The grid source uses `promoteId: 'cell_id'`, which correctly maps the `cell_id` property from GeoJSON features to the feature ID used by `setFeatureState`/`removeFeatureState`.
- The `grid_27km.geojson` (229,814 features) only has `cell_id` as a property (no `center_lat`/`center_lng`). The original `grid.geojson` has all three properties but is not served by the API (the backend prefers `grid_27km.geojson`).
- All features are `Polygon` type with 5-vertex closed rings (rectangles, not hexagons despite CLAUDE.md stating "hexagonal grid"). This is consistent with the S&T 27km grid.
- Cell IDs range from 171,856 to 1,262,007 with 229,814 unique values. No duplicates detected.

### 1.2 Grid Cell Count Discrepancy -- INFO
- CLAUDE.md states "312 grid cells" but the actual data contains 229,814 features. The 312 number appears outdated or refers to a different aggregation level. The weekly data endpoints serve occurrence records keyed by these 229K+ cell_ids. This is not a bug but the documentation is misleading.

### 1.3 Grid Geometry -- Rectangles Not Hexagons -- INFO
- The grid cells are rectangular polygons (4 unique vertices + closing vertex), not hexagons as stated in CLAUDE.md. This is consistent with the eBird S&T raster grid projected onto WGS84. At high latitudes, these cells appear increasingly distorted due to the Mercator-like rendering, which is expected behavior for a lat/lng grid.

### 1.4 Grid Cell Visibility at Zoom Levels -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 547-567)
- Grid borders use zoom-dependent interpolation for both `line-width` and `line-opacity`:
  - Zoom 4: width=0, opacity=0 (invisible)
  - Zoom 6: width=0.3, opacity=0.15
  - Zoom 8: width=0.5, opacity=0.3
  - Zoom 10: width=0.8
- This progressive reveal is well-designed -- at the default zoom of 3.5, borders are invisible, preventing visual clutter with 229K cells.

---

## 2. Region Bounding Boxes

### 2.1 REGION_BBOX vs REGION_BOUNDS Consistency -- HIGH

Two separate region definitions exist that must stay in sync:

**MapView.tsx REGION_BOUNDS** (line 227-233, center + zoom for flyTo):
| Region | Center | Zoom |
|--------|--------|------|
| us_northeast | [-73.5, 42] | 5.5 |
| us_southeast | [-83.5, 31] | 5.5 |
| us_west | [-114.5, 40.5] | 4.5 |
| alaska | [-150, 64] | 4 |
| hawaii | [-157, 20.5] | 6.5 |

**TripPlanTab.tsx REGION_BBOX** (line 7-13, [west, south, east, north] for filtering):
| Region | West | South | East | North |
|--------|------|-------|------|-------|
| us_northeast | -82 | 37 | -66 | 48 |
| us_southeast | -92 | 24 | -75 | 37 |
| us_west | -125 | 31 | -100 | 49 |
| alaska | -180 | 51 | -130 | 72 |
| hawaii | -161 | 18 | -154 | 23 |

**Issues found:**

1. **REGION_BOUNDS center does not always match REGION_BBOX centroid:**
   - `us_northeast` BBOX centroid: [(-82+-66)/2, (37+48)/2] = [-74, 42.5]. REGION_BOUNDS center: [-73.5, 42]. Close but not exact. Acceptable.
   - `us_southeast` BBOX centroid: [-83.5, 30.5]. REGION_BOUNDS center: [-83.5, 31]. Close. Acceptable.

2. **Alaska BBOX western boundary is -180, but all Alaska grid cells have longitudes > -175.** The BBOX is over-broad on the west side. This is not harmful (just includes empty ocean) but the Alaska cells only extend to about -174.17 at the western extreme.

3. **Coverage gap analysis (based on grid cell centers):**
   - us_northeast: 2,493 cells
   - us_southeast: 1,952 cells
   - us_west: 7,870 cells
   - alaska: 15,215 cells
   - hawaii: 34 cells
   - **Outside all regions: 202,250 cells (88% of total)**

   This is expected since the S&T grid covers all of North America including Canada, Mexico, Caribbean, and even extends to parts of Europe/Asia at high latitudes. The regions only cover the US. However, this means the "region filter" in Trip Plan will show cells for all of North America when no region is selected, which is the correct behavior.

### 2.2 Boundary Overlap Between Regions -- MEDIUM
- `us_northeast` eastern boundary (-66) and `us_southeast` eastern boundary (-75) have no overlap at their shared latitude boundary (37 N), which is correct.
- However, `us_northeast` western boundary (-82) and `us_southeast` western boundary (-92) create a gap: cells between -92 and -82 longitude at latitude 37 are only in one region. Appalachian cells in WV/VA near -82 at lat 37 may fall on the boundary.
- `us_west` eastern boundary (-100) and `us_northeast` western boundary (-82) leave a gap from -100 to -82 longitude (covering the Great Plains / Midwest states like MN, IA, MO, AR, KS, NE, SD, ND). **Cells in the Midwest are not included in any region.** This is a significant coverage gap -- users filtering by region cannot see Midwest birding hotspots.

### 2.3 Hawaii Region Bounds -- PASS
- BBOX [-161, 18, -154, 23] covers the main Hawaiian islands well. The center [-157, 20.5] at zoom 6.5 is appropriate.
- 34 grid cells fall within this BBOX, which is reasonable for Hawaii's island landmass.

### 2.4 Alaska Antimeridian Handling -- PASS (with caveat)
- Alaska BBOX uses -180 as the western boundary. All Alaska grid cells have negative longitudes (westernmost found: -174.17). No cells cross the antimeridian (180/-180 line), so no wrap-around rendering issues occur.
- **Caveat:** The Aleutian Islands extend west of 180 degrees in reality (some islands are at ~173 E), but the S&T grid does not appear to include cells past -174 W, so this is not an active issue.

---

## 3. Coordinate Handling and Click Interactions

### 3.1 TripPlanTab Cell Coordinate Extraction -- HIGH (Bug)
- **File:** `frontend/src/components/TripPlanTab.tsx` (lines 163-166)
- **Bug:** Cell coordinates for hotspot locations are extracted using `f.geometry.coordinates[0][0]` -- the **first vertex** of the polygon, not the centroid or center point.
- Measured offset: for sample cells, the first vertex is approximately 0.13 degrees longitude and 0.02 degrees latitude away from the true center. At mid-latitudes (~40 N), 0.13 degrees longitude is approximately 10 km.
- **Impact:** When a user clicks "Zoom to" on a hotspot in TripPlanTab, the map will zoom to a point offset from the actual cell center. The `flyTo` targeting will be slightly off. Also, the region BBOX filtering in TripPlanTab uses these corner coordinates, so cells near region boundaries may be incorrectly included or excluded.
- **Same bug appears in window-of-opportunity mode** (lines 224-228): same `coordinates[0][0]` extraction.
- **Recommendation:** Either use `grid.geojson` (which has `center_lat`/`center_lng` properties) instead of `grid_27km.geojson`, add center properties to `grid_27km.geojson`, or compute centroids from the polygon vertices.
- **Note:** The `grid_27km.geojson` file does NOT have `center_lat`/`center_lng` properties (only `cell_id`), while `grid.geojson` does. The backend API serves `grid_27km.geojson` preferentially. The code in TripPlanTab cannot access `center_lat`/`center_lng` from the served data.

### 3.2 MapView Click Handler Cell Resolution -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 583-694)
- The click handler on `grid-fill` correctly uses `e.features[0].properties.cell_id` for cell identification and `e.lngLat` for the click coordinates. Using `e.lngLat` (the actual click point) rather than a derived cell center is reasonable for the popup -- the popup state stores the click point, not the cell center.
- The `cell_id` resolution relies on MapLibre's spatial query, which is accurate for polygon intersection.

### 3.3 Week Slider DOM Query in Click Handler -- MEDIUM
- **File:** `frontend/src/components/MapView.tsx` (lines 597-598, 642-643)
- The click handler reads the current week from the DOM: `document.querySelector('[data-testid="week-slider"]')`. This is a workaround for stale closures but is fragile:
  - If the slider's `data-testid` changes, the handler silently falls back to week 26.
  - If no slider is rendered (e.g., during loading), it defaults to week 26.
  - This couples the map component to a specific DOM structure in the parent.
- **Recommendation:** Use a ref pattern (like `viewModeRef`) for `currentWeek` instead of DOM queries. A `currentWeekRef` would be cleaner and more reliable.

### 3.4 Map Click Coordinates for Trip Planning -- PASS
- When the user clicks a cell in non-popup modes (density, species), the handler fires `onLocationSelect({ cellId, coordinates: [e.lngLat.lng, e.lngLat.lat] })`. The coordinates represent the click point, not the cell center. This is acceptable for trip planning purposes since the cell ID is the primary identifier.

---

## 4. Heatmap Rendering

### 4.1 Viridis Gradient Implementation -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 93-113)
- The gradient uses 11 color stops from deep purple (#440154) at 0.001 to red (#E23028) at 1.0.
- The `['coalesce', ['feature-state', 'value'], -1]` expression correctly defaults to -1 for cells without feature state, mapping to fully transparent `rgba(0,0,0,0)`.
- The gradient extends beyond classic viridis into warm tones (orange at 0.9, red at 1.0), which provides a wider perceptual range. The color progression is reasonable for data visualization.
- The jump from transparent (value <= 0) to deep purple (value = 0.001) creates a clear binary distinction between "no data" and "any data present," which is intentional and helpful.

### 4.2 Amber Gradient for Goal Birds -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 116-125)
- The amber expression uses a simpler 3-stop gradient from low-opacity amber to high-opacity amber. The default state (-1) shows a subtle gray `rgba(200, 200, 200, 0.1)`.
- This provides a reasonable monochromatic intensity scale for goal bird density.

### 4.3 Feature-State Management -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 722-732)
- The `applyFeatureStates` function correctly:
  1. Clears all previous feature states using `removeFeatureState` for each tracked cell ID.
  2. Resets the tracking set.
  3. Applies new values and tracks them.
- This prevents stale cell colors from persisting when switching weeks or view modes.
- The tracking set (`featureStateCellIds`) is efficient -- avoids calling `removeFeatureState` for all 229K cells when only a subset had state.

### 4.4 Normalization Logic -- MEDIUM
- **Density mode** normalizes by dividing by `filteredMax`, which means the highest-count cell always shows as value=1.0 (red). This is min-max normalization anchored at 0. If a user filters to a narrow range (e.g., 50-55 lifers), the visual contrast may be misleading since a 50-lifer cell appears deep purple while a 55-lifer cell appears red.
- **Goal Birds mode** uses `count / maxCount` normalization, same approach.
- **Species mode** uses raw probability values (0-1) directly as feature-state values, which correctly maps to the viridis gradient.
- **Suggestion:** Consider using `(value - min) / (max - min)` normalization for density mode to use the full color range within the filtered subset.

### 4.5 Opacity Control -- PASS
- The `heatmapOpacity` prop is applied via `setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)` in all view modes. The default is 0.8, which provides good visibility while allowing basemap features to show through.

---

## 5. Map Initialization and Lifecycle

### 5.1 Basemap Tile Configuration -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 426-476)
- Uses CARTO basemaps with @2x retina tiles (256px tileSize).
- Three tile servers (a, b, c) for load distribution.
- Separate styles for light (Voyager) and dark mode.
- Map recreates on `darkMode` change (the entire `useEffect` depends on `darkMode`). This is correct since MapLibre does not support runtime style swaps cleanly.

### 5.2 Map Cleanup on Unmount -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 707-712)
- The cleanup function calls `map.current?.remove()` and sets `map.current = null`, which properly disposes of the MapLibre instance, freeing WebGL context, tile caches, and event listeners.
- `setGridReady(false)` is also reset, preventing stale state.

### 5.3 Map Re-initialization on Dark Mode Toggle -- MEDIUM
- The map re-initializes completely when `darkMode` changes (the main `useEffect` has `[darkMode]` dependency). This destroys and recreates the entire map, grid source, all layers, and event handlers. The user loses their current zoom/pan position.
- **Recommendation:** Consider saving the current center/zoom before destruction and restoring it after re-initialization, or use MapLibre's `setStyle` method (though this requires re-adding sources/layers).

### 5.4 Initial Map Position -- PASS
- Center: [-98.5, 39.8] (geographic center of contiguous US, near Lebanon, Kansas).
- Zoom: 3.5, which shows the entire CONUS with some surrounding context.
- Min zoom: 2, Max zoom: 15. Reasonable bounds.

### 5.5 Scale Bar -- PASS
- Added via `ScaleControl` with `maxWidth: 200` in the bottom-right corner. MapLibre's scale control auto-adjusts based on latitude and zoom level, providing accurate distance measurements.

### 5.6 Navigation Controls -- PASS
- Standard zoom in/out and compass controls in the top-right corner via `NavigationControl`.

---

## 6. flyTo Animations

### 6.1 Region flyTo -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 312-332)
- When `selectedRegion` changes, the map flies to the corresponding REGION_BOUNDS entry with a 1.5-second animation.
- When region is deselected (null), it returns to the continental US view [-98.5, 39.8] at zoom 3.5.
- The animation duration (1500ms) is appropriate -- not too fast to be jarring, not too slow to frustrate.

### 6.2 Location flyTo -- PASS
- **File:** `frontend/src/components/MapView.tsx` (lines 408-419)
- When `selectedLocation` changes (e.g., from Trip Plan hotspot click), the map flies to the location coordinates at zoom 7 with 1.5s animation.
- Zoom 7 is appropriate for viewing a single grid cell in context.

---

## 7. GeoJSON Caching Strategy

### 7.1 IndexedDB Grid Cache -- PASS (with minor concern)
- **File:** `frontend/src/components/MapView.tsx` (lines 140-185)
- Grid GeoJSON (~38MB) is cached in a dedicated IndexedDB database (`find-a-lifer-grid-cache`).
- The caching hierarchy is: module-level variable > IndexedDB > API fetch.
- **Concern:** There is no cache invalidation mechanism. If the grid data changes on the server, users will see stale data until they manually clear IndexedDB. Consider adding a version hash or ETag check.

### 7.2 Cell Data Cache -- PASS
- **File:** `frontend/src/components/MapView.tsx` (line 188)
- A session-level `Map<string, ...>` caches per-cell click data keyed by `"week-cellId"`. This prevents redundant API calls when clicking the same cell multiple times in one session.
- The cache is never cleared during the session, which is acceptable since the data is static.

### 7.3 Species Metadata Cache -- PASS
- Module-level cache with promise deduplication (`speciesMetaPromise`). Handles concurrent requests correctly and allows retry on failure.

---

## 8. Memory Management

### 8.1 Large Feature Collection -- MEDIUM
- 229,814 GeoJSON features are loaded into a single MapLibre source. MapLibre handles this via internal tiling, but:
  - The GeoJSON is stored in IndexedDB (serialized ~38MB).
  - A module-level reference (`gridGeoJsonCache`) keeps the parsed object in memory for the app lifetime.
  - The `setGridReady(true)` is called immediately after adding the source, rather than waiting for idle (documented as a workaround for the idle event never firing with 229K features). This is pragmatic.
- **Memory profile:** Approximately 38MB for grid GeoJSON + MapLibre's internal tile index. For most devices this is acceptable.

### 8.2 Feature-State Tracking Set -- PASS
- The `featureStateCellIds` ref tracks which cells have active feature state. This avoids iterating over all 229K cells to clear state, keeping operations proportional to the number of visible/active cells.

### 8.3 Weekly Data Cleanup -- PASS
- The abort controller pattern (line 375) ensures that when the user rapidly changes weeks, previous in-flight requests are cancelled. This prevents race conditions and wasted bandwidth.

---

## 9. Edge Cases and Potential Issues

### 9.1 Grid Data Served Without Center Coordinates -- HIGH
- The API serves `grid_27km.geojson` (preferred), which has only `cell_id` in properties. The `grid.geojson` (fallback) has `cell_id`, `center_lat`, and `center_lng`.
- TripPlanTab loads grid data from the API and uses it for both coordinate extraction and region filtering. Since it receives `grid_27km.geojson`, it cannot access `center_lat`/`center_lng` and must use `coordinates[0][0]` (first polygon vertex) as a proxy. This is consistently wrong by ~10km at mid-latitudes (see issue 3.1).

### 9.2 No Validation on cell_id Type in Click Handler -- LOW
- **File:** `frontend/src/components/MapView.tsx` (line 587)
- `const cellId = feature.properties?.cell_id` -- the cell_id from GeoJSON properties arrives as a value from MapLibre's feature query. If `promoteId` fails for any reason, this would be undefined and the early return catches it. However, cell_id could theoretically be a string (GeoJSON properties are untyped). The code passes it to API endpoints as a URL parameter, so string coercion works, but comparison with numeric cell_ids in Maps would fail silently.

### 9.3 All Probabilities Hardcoded to 1.0 in Backend -- MEDIUM
- **File:** `backend/main.py` (lines 217, 243, 275, 304)
- The backend returns `"probability": 1.0` for ALL species occurrences. The weekly data format (cell-grouped) stores only species IDs per cell, not probabilities. This means:
  - Species Range mode shows uniform color (all cells with the species have probability=1.0).
  - The viridis gradient effectively becomes binary: present (deep purple) vs absent (transparent). There is no gradation.
  - The legend shows "0% to 100%" but all values are 100%.
  - The `max_prob_uint8` in summary data is hardcoded to 200 (line 194, 341), mapping to probability 1.0.
- This is a data pipeline limitation, not a map rendering bug, but it significantly reduces the utility of the species range and probability views.

### 9.4 Continental US Default View Excludes Alaska/Hawaii -- INFO
- Default map center [-98.5, 39.8] at zoom 3.5 shows only CONUS. Alaska and Hawaii are not visible at initial load. This is standard practice for US-focused maps. The region selector provides access to these areas.

### 9.5 No maxBounds Set -- LOW
- The map has no `maxBounds` constraint. Users can pan to Africa, Europe, or Antarctica where no grid data exists. While not harmful (cells are transparent with no data), it could confuse users. Consider adding `maxBounds` to constrain to the Western Hemisphere.

---

## 10. Test Scenarios

### 10.1 Manual Test Cases

| # | Test Case | Steps | Expected | Priority |
|---|-----------|-------|----------|----------|
| M1 | Grid renders at initial zoom | Load app, observe map at zoom 3.5 | Cells visible with heatmap colors, no border lines (borders fade in at zoom 6+) | HIGH |
| M2 | Grid borders appear on zoom in | Zoom to level 6+ | Subtle white cell borders become visible | MEDIUM |
| M3 | Region flyTo - Northeast | Select "US Northeast" region | Map animates to center [-73.5, 42] at zoom 5.5 | HIGH |
| M4 | Region flyTo - Alaska | Select "Alaska" region | Map animates to center [-150, 64] at zoom 4 | HIGH |
| M5 | Region flyTo - Hawaii | Select "Hawaii" region | Map animates to center [-157, 20.5] at zoom 6.5, showing islands | HIGH |
| M6 | Region deselect returns to CONUS | Select a region, then deselect | Map returns to [-98.5, 39.8] at zoom 3.5 | MEDIUM |
| M7 | Cell click in density mode | Click a colored cell in density mode | Lifers popup appears in top-right with species list | HIGH |
| M8 | Cell click in goal-birds mode | Add goal birds, click a colored cell | Goal Birds popup shows relevant species | HIGH |
| M9 | Dark mode basemap swap | Toggle dark mode | Map recreates with CARTO dark tiles, grid data persists | MEDIUM |
| M10 | Week change updates heatmap | Move week slider from 1 to 52 | Heatmap colors update, loading indicator shown during fetch | HIGH |
| M11 | Alaska westernmost cells visible | Zoom to western Aleutians | Cells near -174 longitude render correctly, no antimeridian artifacts | MEDIUM |
| M12 | Hawaii cells visible | Zoom to Hawaii | ~34 grid cells visible covering main islands | MEDIUM |
| M13 | Hotspot coordinates accuracy | In Trip Plan, click "Zoom to" on a hotspot | Map should center near the cell, verify not offset to corner | HIGH |
| M14 | Midwest region gap | Search for cells in Iowa/Kansas area | These cells are not included in any region filter | MEDIUM |
| M15 | Scale bar accuracy | Zoom to known distance (e.g., NYC to Philadelphia) | Scale bar should show approximately correct distance | LOW |
| M16 | Max zoom grid detail | Zoom to level 15 | Individual cells should be large and clearly delineated | LOW |
| M17 | Rapid week changes | Quickly scrub week slider back and forth | No stale data displayed, abort controller cancels old requests | HIGH |
| M18 | Legend values for density | Load density mode with life list | Legend should show actual lifer count range (min to max) | MEDIUM |
| M19 | Species range - all 1.0 | Select a species in Species Range mode | All cells show same color (since probability=1.0 everywhere) | INFO |
| M20 | Empty goal list overlay | Switch to Goal Birds mode with empty goal list | Map shows neutral gray, hint message in legend | MEDIUM |

### 10.2 Automated Test Suggestions

1. **Grid GeoJSON validation:** Assert all features have `cell_id` property, are `Polygon` type, and have valid closed rings.
2. **Region BBOX completeness:** Assert that all US state capitals fall within at least one REGION_BBOX (this will fail for Midwest states -- documents the gap).
3. **Coordinate extraction consistency:** Assert that `coordinates[0][0]` is within 0.5 degrees of the polygon centroid for all features (documents the offset).
4. **Feature-state round-trip:** Set feature state on a cell, read it back, verify value matches.
5. **Cache invalidation:** Load grid, modify mock API response, reload -- verify stale cache is served (documents the no-invalidation behavior).

---

## 11. Summary of Findings by Severity

### CRITICAL
(None found)

### HIGH
1. **TripPlanTab uses polygon corner instead of centroid for cell coordinates** (Section 3.1) -- causes ~10km offset in hotspot positioning and may cause incorrect region filtering at boundaries.
2. **Grid API serves file without center coordinates** (Section 9.1) -- root cause of issue #1. The `grid_27km.geojson` lacks `center_lat`/`center_lng` that `grid.geojson` has.
3. **Region bounding boxes exclude the Midwest** (Section 2.2) -- cells in MN, IA, MO, AR, KS, NE, SD, ND, OK, and parts of TX are not in any defined region.

### MEDIUM
4. **Dark mode toggle loses map position** (Section 5.3) -- map re-initializes at default center/zoom.
5. **Week slider read via DOM query** (Section 3.3) -- fragile coupling to DOM structure.
6. **All probabilities hardcoded to 1.0** (Section 9.3) -- reduces utility of species range visualization.
7. **Density normalization always anchored at 0** (Section 4.4) -- filtered ranges may show misleading contrast.

### LOW
8. **No maxBounds on map** (Section 9.5) -- users can pan to irrelevant areas.
9. **No cell_id type validation** (Section 9.2) -- theoretical edge case.
10. **No grid cache invalidation** (Section 7.1) -- stale data after server updates.

---

## 12. Recommended Priority Fixes

1. **Add center coordinates to grid_27km.geojson** or compute centroids in TripPlanTab rather than using `coordinates[0][0]`. Alternatively, change the backend to serve `grid.geojson` (which already has centers) or add a `/api/grid-centers` endpoint using the existing `grid_centers.json` file.

2. **Add a Midwest/Central region** (e.g., `us_central: [-100, 31, -82, 49]`) to close the coverage gap, or adjust existing regions: extend `us_northeast` west to -100, or `us_west` east to -82.

3. **Preserve map position across dark mode toggle** by saving `map.getCenter()` and `map.getZoom()` before destruction and passing them to the new instance.

4. **Replace DOM query for week** with a `currentWeekRef` pattern matching the existing `viewModeRef` approach.
