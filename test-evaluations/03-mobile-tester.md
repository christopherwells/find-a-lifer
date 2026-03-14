# Mobile Platform Tester Evaluation

**App:** Find-A-Lifer (birding web app)
**Tester Role:** Mobile Platform Tester
**Date:** 2026-03-13
**Build:** React 19.2 + TypeScript + Vite 7.2 + Tailwind CSS 4.1 + MapLibre GL JS 5.17

---

## 1. Executive Summary

Find-A-Lifer is a responsive web application with a functional mobile layout achieved through Tailwind's `md:` breakpoint (768px). The core responsive pattern -- a bottom-sheet side panel on mobile and a side panel on desktop -- works correctly. However, several issues affect the mobile experience: the absence of PWA support, large data payloads without offline resilience, touch target sizing below recommended minimums in multiple components, and no explicit handling of virtual keyboard interactions or safe-area insets for notched devices. MapLibre GL JS provides solid touch gesture support natively (pinch-zoom, pan, rotate), but the app's custom click-to-inspect popups may conflict with map gestures on small screens.

**Overall Mobile Readiness: 6/10** -- Functional but with notable gaps that will affect real-world mobile usage.

---

## 2. Device / Browser Test Matrix

### 2.1 Target Devices

| Device Category | Representative Devices | Screen Size | Key Concerns |
|----------------|----------------------|-------------|-------------|
| Small phone | iPhone SE (3rd gen), Galaxy A14 | 375x667 - 360x780 | Panel occupies 45vh = ~300px, leaving ~350px for map; tab labels may clip |
| Standard phone | iPhone 14/15, Pixel 7 | 390x844 - 412x915 | Primary target; bottom sheet layout functional |
| Large phone | iPhone 15 Pro Max, Galaxy S24 Ultra | 430x932 - 412x915 | Good experience expected |
| Small tablet | iPad Mini (6th gen) | 768x1024 | Hits `md:` breakpoint -- switches to desktop side panel layout |
| Standard tablet | iPad Air/Pro 11" | 820x1180 | Desktop layout; side panel at 320px leaves ~500px for map |
| Foldable | Galaxy Z Fold 5 (inner) | 882x786 (unfolded) | Desktop layout when unfolded; phone layout when folded (344px) |

### 2.2 Browser Compatibility Matrix

| Browser | Version Range | Critical Tests | Known Risks |
|---------|--------------|----------------|-------------|
| Safari iOS | 16+ | IndexedDB, CSS backdrop-filter, MapLibre WebGL | Safari's aggressive IDB eviction, rubber-band scrolling conflicts with map |
| Chrome Android | 120+ | WebGL performance, touch events, back gesture | Generally good; 300ms tap delay eliminated by viewport meta |
| Firefox Android | 120+ | MapLibre rendering, IndexedDB | Smaller market share but worth validating |
| Samsung Internet | 23+ | WebGL, touch interactions | Uses Chromium; likely compatible |
| Safari iPadOS | 16+ | Pointer events, hover states | Desktop-class browser but touch input |
| Chrome iPadOS | 120+ | WebKitView limitations | Uses WKWebView, not Blink |

---

## 3. Responsive Layout Analysis

### 3.1 Layout Architecture

The app uses a `flex-col-reverse md:flex-row` layout (App.tsx line 92):

- **Mobile (<768px):** Side panel renders below the map in the DOM but appears at the bottom of the screen due to `flex-col-reverse`. The panel height toggles between `h-10` (collapsed) and `h-[45vh]` (expanded).
- **Desktop (>=768px):** Side panel renders to the left as a column (`md:flex-row`), with width toggling between `md:w-12` (collapsed) and `md:w-80` (expanded, 320px).

**Findings:**

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| R-1 | Fixed 45vh panel height on mobile | Medium | `h-[45vh]` does not account for the address bar on mobile browsers. On Safari iOS, `vh` includes the address bar area, meaning the actual visible panel is less than 45% of viewport. Should use `dvh` (dynamic viewport height) instead: `h-[45dvh]`. |
| R-2 | No safe-area-inset handling | Medium | No `env(safe-area-inset-bottom)` or `env(safe-area-inset-top)` usage anywhere. On iPhone models with home indicator bar, the bottom of the side panel content will be obscured. The TopBar may also be hidden behind the notch/Dynamic Island in landscape. |
| R-3 | Viewport meta tag is minimal | Low | `index.html` sets `width=device-width, initial-scale=1.0` but does not include `viewport-fit=cover` needed for safe-area-inset CSS environment variables, nor `maximum-scale=1` to prevent unwanted zoom on input focus (though the latter is controversial for accessibility). |
| R-4 | No landscape-specific handling | Medium | In landscape orientation on a phone (e.g., 844x390), `h-[45vh]` = ~175px for the panel, leaving ~175px for the map after the 44px TopBar. This is barely usable. The panel should auto-collapse in landscape or use a different layout strategy. |

### 3.2 Tab Navigation

The tab bar renders 6 tabs horizontally with `flex-1` distribution (SidePanel.tsx line 119):

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| R-5 | Tab labels at 11px are small touch targets | Medium | Each tab uses `py-2 px-1 text-[11px]` giving approximately 32px height and ~55px width on a 360px-wide phone. Apple HIG recommends 44x44pt minimum; Google Material recommends 48x48dp minimum. The tap targets are below both guidelines. |
| R-6 | Collapse button is very small | High | The collapse/expand button in the tab bar uses `px-1.5` and a 14px (h-3.5 w-3.5) SVG icon. This creates a touch target of roughly 20x32px -- far below accessibility minimums and will be frustrating to hit accurately on mobile. |

### 3.3 Side Panel Content

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| R-7 | Nested scroll within bottom sheet | Medium | The side panel content area (`overflow-y-auto`) creates a scrollable area within the 45vh bottom sheet. On iOS Safari, nested scrolling within a bottom-sheet-like container can cause scroll-chaining where the outer page (map) scrolls instead of the inner panel. CSS `overscroll-behavior: contain` is not applied. |
| R-8 | Fixed-height lists inside constrained panel | Low | Species lists use `max-h-48` (192px) or `max-h-60` (240px) for scrollable areas. Within the mobile panel's ~300px usable height, these lists plus headers can exceed available space, creating scroll-within-scroll-within-scroll scenarios. |

---

## 4. Touch Interaction Analysis

### 4.1 Map Interactions (MapLibre GL JS)

MapLibre GL JS handles these natively and well:

| Gesture | Expected Behavior | Status | Notes |
|---------|-------------------|--------|-------|
| Single-finger pan | Map pans | PASS (native) | MapLibre handles this |
| Pinch zoom | Map zooms in/out | PASS (native) | Two-finger gesture handled by MapLibre |
| Double-tap zoom | Zoom in one level | PASS (native) | Standard MapLibre behavior |
| Two-finger rotate | Map rotates | PASS (native) | If rotation is enabled (default) |

**Map-specific issues:**

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| T-1 | Grid cell tap accuracy | Medium | Grid cells are small hexagons. On phones at typical zoom levels (3.5-5), cells may be 10-20px across, making precise tapping difficult. The click handler (MapView.tsx line 583) does not implement any touch-target enlargement or "snap to nearest cell" logic. |
| T-2 | Popups overlay map controls | Medium | Goal Birds and Lifer popups (MapView.tsx lines 1186-1200 and 1320-1330) are positioned `absolute top-4 right-4` with `w-72` (288px). On a 375px-wide phone, this popup takes up 77% of the screen width and overlaps the MapLibre NavigationControl (also `top-right`). |
| T-3 | Popup close requires precise tap | Low | Popup close buttons use small icons (h-4 w-4, ~16px). Combined with the popup header's small text, closing popups on touch is more difficult than necessary. |
| T-4 | No touch-action CSS on map container | Low | The map container div (MapView.tsx line 1118) does not set `touch-action: none` explicitly. MapLibre handles this internally, but explicit declaration can prevent edge cases with browser gesture recognition. |

### 4.2 Form Controls

| Control | Location | Touch Target Size | Assessment |
|---------|----------|-------------------|------------|
| Week slider | ExploreTab line 332-341 | `h-2` (8px track) | FAIL -- 8px is extremely difficult to grab on touch. The thumb is browser-default which is typically 20-28px on mobile. Track should be at least `h-4` for comfortable touch. |
| Opacity slider | ExploreTab line 381-391 | `h-2` (8px track) | FAIL -- same issue as week slider. |
| Lifer range sliders | ExploreTab lines 406-433 | `h-2` (8px track) | FAIL -- two sliders stacked vertically with thin tracks make precise adjustment very difficult. |
| Region dropdown | ExploreTab line 126-139 | `py-1.5` (~30px) | MARGINAL -- close to minimum but functional. |
| View mode buttons | ExploreTab lines 148-181 | `py-1.5` (~30px) each | MARGINAL -- below 44px recommendation but grouped buttons have larger combined area. |
| Species search input | ExploreTab line 250-257 | `py-2` (~36px) | ACCEPTABLE -- reasonable for a text input. |
| Goal birds toggle | ExploreTab lines 216-241 | `py-1.5` (~30px) | MARGINAL -- full-width button so horizontal space compensates for short height. |
| Animation play/pause | ExploreTab lines 346-369 | `py-1.5` (~30px) | MARGINAL -- full-width compensates. |
| Trip Plan mode toggle | TripPlanTab line 571-586 | `py-1.5` (~30px), 4-column grid | FAIL on small phones -- with `grid-cols-4` on a ~300px content width, each button is ~72px wide and ~30px tall. Labels like "Location" and "Compare" are legible but tap targets are small. |

### 4.3 Species List Items

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| T-5 | Species list items are well-sized | Pass | Items like `px-3 py-2` in species lists (ExploreTab line 303) provide ~36px height which is acceptable for list items where the full row is tappable. |
| T-6 | Suggestion dropdown overlap on mobile | Medium | Autocomplete dropdowns (GoalBirdsTab line 770, TripPlanTab line 626) with `absolute z-10` may extend below the visible panel area on mobile, becoming unreachable. No `position: fixed` or portal-based rendering is used for these. |

---

## 5. Performance on Mobile Devices

### 5.1 Data Payload Analysis

| Resource | Size (estimated) | Loading Strategy | Mobile Impact |
|----------|-----------------|------------------|---------------|
| Grid GeoJSON (`/api/grid`) | ~38MB raw | Fetched once, cached in IndexedDB | CRITICAL -- initial load on cellular requires downloading 38MB. Even gzipped (~5-8MB), this is significant on slow connections. |
| Species metadata (`/api/species`) | ~500KB | Module-level cache, re-fetched by multiple tabs | Low -- reasonable size. |
| Weekly summary (`/api/weeks/{n}/summary`) | ~80KB gzipped | Fetched on week change | Low -- acceptable. |
| Weekly full data (`/api/weeks/{n}`) | ~1-5MB per week | Fetched on demand (cell click, hotspots, window mode) | Medium -- Window mode fetches ALL 52 weeks sequentially (~50-250MB total). |
| Batch species data (`/api/weeks/{n}/species-batch`) | Variable | Fetched on view mode change | Medium -- depends on goal list size. |

**Critical Performance Issues:**

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| P-1 | 38MB grid data on first load | Critical | The grid GeoJSON is fetched from `/api/grid` (MapView.tsx lines 501-527) and cached in IndexedDB. On a mobile device with a 3G connection (~1 Mbps), this takes ~5 minutes. On 4G (~10 Mbps), ~30 seconds. No loading progress indicator is shown during this critical first-load phase. The map appears blank with no grid overlay until complete. |
| P-2 | Window of Opportunity fetches 52 weeks | High | TripPlanTab lines 210-218 sequentially fetch ALL 52 weekly data files. This could be 50-250MB of data fetched one-at-a-time, with no abort mechanism if the user navigates away from Window mode. On mobile, this is extremely slow and wastes cellular data. |
| P-3 | No request abort on tab/mode switch | Medium | TripPlanTab's `calc()` functions (hotspots, window, compare) do not use AbortControllers except for the weekly summary in MapView. If a user quickly switches modes, stale fetch requests continue consuming bandwidth. |
| P-4 | Multiple components independently fetch species data | Low | ProfileTab, SpeciesTab, GoalBirdsTab, TripPlanTab, and ExploreTab each independently call `fetch('/api/species')`. While the browser may cache the response, this duplicates parsing ~500KB of JSON in each component. The module-level cache in MapView.tsx is not shared with tab components. |
| P-5 | cellDataCache grows unbounded | Medium | MapView.tsx line 188: `cellDataCache` is a `Map` that stores per-cell data indefinitely with no eviction. On a mobile session where a user clicks many cells across different weeks, this cache grows without limit, increasing memory pressure. |

### 5.2 WebGL / MapLibre Performance

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| P-6 | 229K+ GeoJSON features in single source | Medium | The grid source has 229K+ features (referenced at line 700). MapLibre handles this via WebGL, but on lower-end mobile GPUs (e.g., Mali-G52 on budget Androids), rendering 229K polygons with feature-state-driven dynamic coloring will cause frame drops during pan/zoom. |
| P-7 | Feature state updates for all cells | Medium | `applyFeatureStates()` (MapView.tsx line 722) iterates over all visible cells to set feature state. With 312 grid cells this is fast, but the clearing step iterates `featureStateCellIds` which could grow large. |

---

## 6. Battery and Resource Consumption

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| B-1 | Continuous WebGL rendering | Medium | MapLibre GL JS maintains a WebGL context that renders on every frame during interaction and keeps a render loop for animations. On mobile, this will drain battery during active use. There is no mechanism to throttle rendering when the app is backgrounded or idle. |
| B-2 | Migration animation at 1-second intervals | Medium | The animation feature (ExploreTab lines 92-100) uses `setInterval` at 1000ms. Each tick changes the week, triggering a fetch for new summary data and a full overlay re-render. Running this for a full cycle (52 seconds) involves 52 network requests and 52 MapLibre re-renders -- significant CPU/GPU/network usage. |
| B-3 | CARTO tile requests on every pan/zoom | Low | The basemap uses CARTO raster tiles at `@2x` resolution (MapView.tsx lines 434-436, 458-460). Retina tiles are 4x the data of standard tiles. On high-DPI mobile screens this is appropriate for quality but increases data usage. |
| B-4 | No visibility API usage | Medium | The app does not use `document.visibilitychange` to pause map rendering, abort network requests, or stop the animation timer when the browser tab is backgrounded. This wastes battery and data when the user switches to another app. |

---

## 7. Offline / Low-Connectivity Behavior

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| O-1 | No service worker or PWA support | High | No `manifest.json`, no service worker registration, no workbox configuration. The app is purely online. Users on spotty cellular coverage (common in birding locations -- parks, forests, wetlands) will have a degraded or broken experience. |
| O-2 | Grid data cached in IndexedDB | Pass | Grid GeoJSON is cached in IndexedDB (MapView.tsx lines 140-185) and persists across sessions. This is good -- the largest payload is cached. |
| O-3 | Weekly data not cached | High | Weekly occurrence data is fetched fresh every time. If the user loses connectivity mid-session, changing the week slider results in a failed load with no fallback. The app continues to show the previous week's overlay, which is misleading. |
| O-4 | No offline error state | Medium | Server health check (TopBar.tsx lines 15-35) retries 3 times then shows a red dot, but no user-facing message explains what is wrong or what features are unavailable. Individual fetch failures in map overlays are logged to console but not surfaced to the user. |
| O-5 | IndexedDB storage limits on Safari iOS | Medium | Safari on iOS limits IndexedDB storage to ~1GB but may evict data from sites not added to home screen. The 38MB grid cache plus life list and goal list data could be evicted after 7 days of non-use, forcing a re-download. |

---

## 8. Screen Orientation Handling

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| SO-1 | No orientation-specific styles | Medium | No `orientation: landscape` media queries or Tailwind variants are used. In landscape on a phone, the layout becomes problematic (see R-4 above). |
| SO-2 | Map resizes correctly | Pass | MapLibre GL JS handles container resize automatically via ResizeObserver. When orientation changes, the map will re-render to fill available space. |
| SO-3 | Panel should auto-collapse in landscape | Medium | In landscape on phones, the 45vh panel leaves almost no space for the map. The panel should automatically collapse or switch to a swipeable drawer pattern. |

---

## 9. Virtual Keyboard Interactions

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| VK-1 | Keyboard pushes layout on iOS | High | When a user taps the species search input (ExploreTab line 250) or any text field in TripPlanTab, the iOS keyboard appears and pushes the viewport up. Since the app uses `h-screen` (which does not account for the keyboard), the layout may shift unpredictably. The `h-[45vh]` panel measurement changes when the keyboard is visible. |
| VK-2 | Search input in bottom panel | Medium | On mobile, the side panel is at the bottom. Text inputs in the panel (species search, goal bird search) are near the bottom of the screen. When the keyboard opens, the input may be pushed behind the keyboard, requiring the user to scroll within the panel to see what they are typing. |
| VK-3 | No `inputmode` attributes | Low | Search inputs do not specify `inputmode="search"` which would show a "Search" button on the mobile keyboard instead of "Return/Enter". This is a minor UX improvement. |
| VK-4 | Autocomplete dropdowns may be clipped | Medium | When typing in species search fields, autocomplete dropdown lists open downward (via `absolute z-10 mt-1`). On mobile with the keyboard open, these dropdowns may extend below the visible area and be unreachable. |

---

## 10. Mobile-Specific Component Analysis

### 10.1 SpeciesInfoCard Modal (SpeciesInfoCard.tsx)

The modal uses `createPortal` and `fixed inset-0` positioning with `p-4` padding and `max-w-sm` (384px) width:

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| M-1 | Modal is well-designed for mobile | Pass | The `max-w-sm` constraint with `p-4` padding works well on mobile screens. The overlay dismisses on background tap. Close button at `top-2 right-2` with a 24px tap area (p-1.5 + icon) is slightly small but functional. |
| M-2 | No swipe-to-dismiss | Low | Mobile users expect to swipe down to dismiss modals/sheets. The SpeciesInfoCard only supports tap-to-close via the X button or background overlay. |

### 10.2 TopBar (TopBar.tsx)

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| M-3 | TopBar height is compact | Pass | `h-11` (44px) matches iOS navigation bar height. Good. |
| M-4 | Dark mode toggle is appropriately sized | Pass | `p-2` with `h-5 w-5` icon gives a 36px touch target. Slightly below 44px but surrounded by padding. |
| M-5 | Server status dot is too small to tap | Info | The status dot is 6px (`w-1.5 h-1.5`). This is fine since it is display-only (not interactive), but the title tooltip will not show on touch devices. Consider a more visible status indicator. |

### 10.3 Map Legend (MapView.tsx lines 1162-1183)

| ID | Issue | Severity | Details |
|----|-------|----------|---------|
| M-6 | Legend obscures map on small screens | Medium | The legend bar at `bottom-8 left-4` with `minWidth: 220px` takes up 59% of a 375px screen width. On mobile, it can overlap with the scale control (`bottom-right`) and make the bottom portion of the map difficult to interact with. |

---

## 11. PWA / Installability Assessment

| Aspect | Current State | Recommendation |
|--------|---------------|----------------|
| Web App Manifest | Not present | Add `manifest.json` with name, icons, theme colors, display mode |
| Service Worker | Not present | Add service worker for offline grid/species data caching |
| HTTPS | Required (assumed for deployment) | Verify HTTPS is enforced |
| App Icons | Not present (only `vite.svg` favicon) | Create 192x192 and 512x512 PNG icons |
| Theme Color | Not set in HTML | Add `<meta name="theme-color">` matching `#2C3E7B` |
| Standalone Display | Not configured | `"display": "standalone"` would remove browser chrome |
| Splash Screen | Not configured | Define background_color and icons for install splash |

A PWA would significantly improve the mobile experience for birders who use this app in the field with unreliable connectivity.

---

## 12. Prioritized Recommendations

### Critical (Fix Before Mobile Launch)

1. **Add `dvh` units for panel height** -- Change `h-[45vh]` to `h-[45dvh]` to account for mobile browser chrome. Falls back gracefully on older browsers.
2. **Add loading indicator for grid data** -- The 38MB initial grid load must show progress. Users on cellular will think the app is broken.
3. **Add viewport-fit=cover and safe-area-inset handling** -- Prevent content from being hidden behind notches and home indicators.
4. **Abort Window-of-Opportunity fetches** -- Add AbortController to TripPlanTab's 52-week fetch loop to prevent massive data waste if the user navigates away.

### High Priority

5. **Increase touch target sizes** -- Sliders should use `h-4` tracks minimum. Tab buttons should be at least 44px tall. The collapse button needs to be at least 44x44px.
6. **Reposition map popups on mobile** -- Goal Birds and Lifer popups should render as bottom sheets (not top-right floating panels) on screens < 768px to avoid blocking map controls.
7. **Add `overscroll-behavior: contain`** -- Apply to the side panel's scrollable content area to prevent scroll-chaining with the map.
8. **Handle visibility changes** -- Use `document.visibilitychange` to pause animation and throttle rendering when backgrounded.
9. **Implement basic PWA manifest** -- Enable "Add to Home Screen" with proper icons and theme color.

### Medium Priority

10. **Auto-collapse panel in landscape** -- Detect landscape orientation on phones and auto-collapse the panel.
11. **Cache weekly data in IndexedDB** -- Cache the most recently viewed 5-10 weeks of summary data for offline resilience.
12. **Share species metadata cache** -- Create a shared cache (context or module-level) to avoid 5+ independent fetches of `/api/species`.
13. **Add swipe-to-dismiss on modals** -- SpeciesInfoCard and map popups should support swipe-down dismissal.
14. **Add `inputmode="search"`** -- On all species/bird search inputs for better mobile keyboard UX.

### Low Priority

15. **Add LRU eviction to cellDataCache** -- Cap at 50-100 entries to prevent unbounded memory growth.
16. **Throttle animation to reduce battery drain** -- Consider 1.5-2 second intervals instead of 1 second.
17. **Add theme-color meta tag** -- `<meta name="theme-color" content="#2C3E7B">` for mobile browser chrome coloring.
18. **Consider reduced-motion media query** -- Respect `prefers-reduced-motion` for animation features.

---

## 13. Test Case Checklist

### First Load Experience (Mobile)

- [ ] App loads on 3G connection within 30 seconds (excluding grid data)
- [ ] Grid data download shows progress indicator
- [ ] Grid data persists across sessions (IndexedDB cache)
- [ ] App is usable while grid data loads (map visible, tabs accessible)

### Layout and Navigation

- [ ] Panel collapses/expands correctly on portrait phone
- [ ] Panel collapses/expands correctly on landscape phone
- [ ] All 6 tabs are tappable without mis-taps on 360px-wide screen
- [ ] Tab content scrolls within panel without scrolling the map
- [ ] TopBar is not obscured by notch/Dynamic Island in any orientation
- [ ] Bottom of panel content is not obscured by home indicator bar

### Map Interactions

- [ ] Pinch-to-zoom works smoothly (no jank)
- [ ] Single-finger pan works without triggering cell selection
- [ ] Grid cell tap selects the correct cell (not adjacent)
- [ ] Goal Birds popup is fully visible and scrollable on phone
- [ ] Lifer popup is fully visible and scrollable on phone
- [ ] Popup close button is easy to tap
- [ ] Legend does not block critical map interaction

### Form Controls

- [ ] Week slider can be adjusted with one finger without overshooting
- [ ] Opacity slider can be adjusted with one finger
- [ ] Lifer range dual sliders can be adjusted independently
- [ ] Region dropdown opens native picker on iOS/Android
- [ ] View mode buttons are tappable without mis-selecting
- [ ] Species search keyboard appears correctly and input is visible

### Data and Performance

- [ ] Weekly data loads within 3 seconds on 4G
- [ ] Animation plays at consistent 1-second intervals
- [ ] No visible jank during map pan/zoom with overlay active
- [ ] Memory usage stays under 500MB during extended session
- [ ] App does not crash on low-end Android devices (4GB RAM)

### Offline Behavior

- [ ] App shows meaningful error when server is unreachable
- [ ] Previously loaded grid data renders even after connectivity loss
- [ ] Life list and goal lists persist across sessions
- [ ] App recovers gracefully when connectivity returns

---

## 14. Files Reviewed

| File | Relevance |
|------|-----------|
| `frontend/src/App.tsx` | Root layout, responsive flex structure |
| `frontend/src/components/SidePanel.tsx` | Mobile bottom-sheet pattern, tab navigation |
| `frontend/src/components/MapView.tsx` | Map initialization, touch handlers, popups, grid caching |
| `frontend/src/components/TopBar.tsx` | Header bar, server status indicator |
| `frontend/src/components/ExploreTab.tsx` | Sliders, search, view mode controls |
| `frontend/src/components/TripPlanTab.tsx` | Mode toggle, species search, week sliders |
| `frontend/src/components/GoalBirdsTab.tsx` | Species search, autocomplete dropdown |
| `frontend/src/components/SpeciesTab.tsx` | Species list, search, autocomplete |
| `frontend/src/components/ProfileTab.tsx` | File import, export functionality |
| `frontend/src/components/SpeciesInfoCard.tsx` | Modal popup pattern, createPortal usage |
| `frontend/src/components/ProgressTab.tsx` | Stats display, grid layout |
| `frontend/index.html` | Viewport meta tag |
| `frontend/src/index.css` | Global styles, overflow handling |
| `frontend/src/App.css` | MapLibre sizing |
| `frontend/vite.config.ts` | Build config, proxy setup |
| `frontend/package.json` | Dependencies and versions |
