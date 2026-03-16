# Test Lead / Test Manager Evaluation

## Find-A-Lifer Birding Web App

**Evaluator:** Test Lead / Test Manager
**Date:** 2026-03-13
**Scope:** Full application test strategy assessment

---

## 1. Executive Summary

Find-A-Lifer has minimal test infrastructure relative to its complexity. The application contains approximately 7,200 lines of frontend component code across 12 files, a Python FastAPI backend with 10 API endpoints, and two IndexedDB-backed persistence layers. Against this, there are only **3 unit test files** (27 test cases total) and **1 e2e test file** (11 test cases). There are **zero backend tests**. The most complex and risk-prone components -- MapView.tsx (1,428 lines), GoalBirdsTab.tsx (2,364 lines), and TripPlanTab.tsx (1,163 lines) -- have **zero test coverage**.

**Overall test maturity: Level 1 (Initial)** -- Testing exists but is ad hoc, covering only the simplest components.

---

## 2. Current Test Inventory

### 2.1 Unit Tests (Vitest + React Testing Library)

| Test File | Component | Test Count | Coverage Assessment |
|-----------|-----------|------------|---------------------|
| `frontend/src/test/ExploreTab.test.tsx` | ExploreTab (453 LOC) | 10 | Moderate -- covers rendering, slider interactions, view mode switching |
| `frontend/src/test/TopBar.test.tsx` | TopBar (100 LOC) | 5 | Good -- covers title, dark mode toggle, server status |
| `frontend/src/test/Skeleton.test.tsx` | Skeleton (92 LOC) | 6 | Good -- covers all skeleton variants |
| **Total** | | **21** | |

### 2.2 End-to-End Tests (Playwright)

| Test File | Test Count | Coverage Assessment |
|-----------|------------|---------------------|
| `frontend/e2e/app.spec.ts` | 11 | Basic -- covers app load, tab switching, dark mode, slider, region selector, animation, panel collapse |

### 2.3 Backend Tests

**None.** Zero test files exist for the FastAPI backend (`backend/main.py`, 378 lines, 10 endpoints).

### 2.4 Test Configuration

- **Vitest config** (`frontend/vite.config.ts`, lines 9-14): jsdom environment, globals enabled, setup file imports jest-dom matchers. E2e tests excluded.
- **Playwright config** (`frontend/playwright.config.ts`): Chromium only, 30s timeout, headless, single project. No Firefox/Safari/WebKit. No screenshot-on-failure. No trace collection.
- **Test setup** (`frontend/src/test/setup.ts`): Minimal -- only imports `@testing-library/jest-dom`. No global mocks for IndexedDB, fetch, or MapLibre.
- **No CI/CD pipeline** -- no `.github/workflows` or equivalent. Tests are run manually only.

---

## 3. Coverage Gap Analysis

### 3.1 Untested Components (Priority Order)

| Component | Lines | Risk Level | Why It Matters |
|-----------|-------|------------|----------------|
| MapView.tsx | 1,428 | **Critical** | Core map rendering, 4 heatmap modes, click handlers with ref-based closure avoidance, IndexedDB grid caching, module-level caches, GeoJSON processing, feature-state management |
| GoalBirdsTab.tsx | 2,364 | **Critical** | Largest component. Goal list CRUD via IndexedDB, species search, 11+ suggestion categories with hardcoded curated data, list picker, filtering, toast notifications |
| TripPlanTab.tsx | 1,163 | **High** | 4 sub-modes (location/hotspots/window/compare), multi-week range fetching, lifer calculations, location comparison logic |
| SpeciesTab.tsx | 698 | **High** | Species checklist rendering, family grouping, search/filter, seen/unseen toggling via LifeListContext |
| ProfileTab.tsx | 277 | **High** | CSV import/export, file parsing, species matching, life list clearing (destructive) |
| ProgressTab.tsx | 240 | **Medium** | Statistics calculations, family breakdown, milestones. Relatively straightforward. |
| SpeciesInfoCard.tsx | 138 | **Medium** | Modal card rendered via createPortal -- z-index/overflow escape hatch |
| SidePanel.tsx | 186 | **Low** | Thin orchestration layer after refactor. Auto-tab-switch on location select. |
| App.tsx | 154 | **Medium** | Root state management, goal list loading, localStorage persistence, effect coordination |

### 3.2 Untested Backend Endpoints

| Endpoint | Method | Risk Level | Complexity |
|----------|--------|------------|------------|
| `/api/health` | GET | Low | Simple status check |
| `/api/species` | GET | Medium | Loads and serves 2,490 species records |
| `/api/weeks/{n}/summary` | GET | **High** | Two code paths: pre-computed file vs. fallback computation |
| `/api/weeks/{n}` | GET | **High** | Dual format detection (cell-grouped vs. record-based), backward-compat conversion |
| `/api/weeks/{n}/species/{code}` | GET | **High** | Cross-references species metadata with weekly occurrence data |
| `/api/weeks/{n}/species-batch` | GET | **High** | Batch processing up to 500 species IDs, input validation |
| `/api/weeks/{n}/cells/{id}` | GET | **High** | Per-cell species lookup with taxonomic sorting |
| `/api/weeks/{n}/lifer-summary` | POST | **Critical** | Server-side lifer computation excluding seen species -- core app logic |
| `/api/grid` | GET | Medium | GeoJSON file serving with fallback |
| `/api/regions` | GET | Medium | GeoJSON file serving |

### 3.3 Untested Cross-Cutting Concerns

| Concern | Risk Level | Current State |
|---------|------------|---------------|
| IndexedDB operations (LifeListContext) | **Critical** | Zero tests. CRUD operations, DB upgrades, transaction handling |
| IndexedDB operations (goalListsDB) | **Critical** | Zero tests. 7 exported functions, connection caching, version upgrade |
| Dual IndexedDB schema management | **Critical** | Both `LifeListContext.tsx` and `goalListsDB.ts` independently define DB_VERSION=2 upgrade logic. No tests verify they stay synchronized |
| Dark mode persistence | Low | LocalStorage read/write/class toggle untested |
| Active goal list persistence | Medium | LocalStorage coordination between App.tsx and goalListsDB untested |
| Error handling paths | **High** | All catch blocks untested across the entire application |
| Network failure resilience | **High** | No tests for fetch failures, timeouts, or degraded backend |

---

## 4. Risk Register

| ID | Risk | Likelihood | Impact | Severity | Mitigation |
|----|------|-----------|--------|----------|------------|
| R1 | IndexedDB schema upgrade breaks existing user data | Medium | **Critical** | **Critical** | Both `LifeListContext.tsx` (line 56) and `goalListsDB.ts` (line 23) open the same DB at version 2 with independent upgrade logic. If either changes version independently, the other will fail with a VersionError. Add integration tests for DB schema migrations. |
| R2 | MapView stale closure bugs | High | High | **Critical** | MapView uses refs (`viewModeRef`, `weeklyDataRef`) to avoid stale closures in map click handlers (documented in CLAUDE.md). No tests verify this pattern works correctly when props change rapidly. |
| R3 | Goal birds data corruption on concurrent operations | Medium | High | **High** | `addSpeciesToList` (goalListsDB.ts, line 131) does read-modify-write without locking. Two rapid additions could lose one. |
| R4 | Large dataset performance regression | High | Medium | **High** | 2,490 species x 312 grid cells x 52 weeks = potential for slow renders. No performance tests or benchmarks. |
| R5 | CSV import silently drops species | Medium | High | **High** | ProfileTab CSV parsing (line 28-48) is brittle -- column matching via `includes()`, no validation of data quality. Edge cases (BOM, different encodings, quoted fields) untested. |
| R6 | Backend week data format detection fails | Low | **Critical** | **High** | `_load_week_data` (main.py, line 89) detects format by checking `isinstance(raw[0], list)`. Empty arrays or malformed JSON would crash. |
| R7 | CORS wildcard in production | Medium | Medium | **Medium** | `allow_origins=["*"]` (main.py, line 42). Acceptable for development, but a security risk if deployed. |
| R8 | No rate limiting on POST endpoint | Low | Medium | **Medium** | `/api/weeks/{n}/lifer-summary` accepts arbitrary-length seen_species_codes arrays with no size limit. |
| R9 | Memory growth from caches | Medium | Medium | **Medium** | Module-level caches in MapView.tsx (`speciesMetaCache`, `gridGeoJsonCache`, `cellDataCache`) and backend (`_week_cache`) are never evicted. |
| R10 | Browser compatibility unknown | Medium | Medium | **Medium** | Playwright config only tests Chromium. IndexedDB behavior, MapLibre WebGL rendering, and CSS features may differ in Firefox/Safari. |
| R11 | Port mismatch between init.sh and vite.config.ts | Low | High | **Medium** | `init.sh` starts backend on port 8000, but `vite.config.ts` proxy targets port 8001. This means the proxy won't work with the init script as written. |

---

## 5. Priority Matrix for Testing Efforts

### P0 -- Must Have Before Any Release

1. **Backend API tests** (pytest + httpx/TestClient)
   - All 10 endpoints with valid/invalid inputs
   - Week data dual-format detection
   - Lifer summary computation correctness
   - Species-batch boundary cases (empty, max 500, over 500)
   - File-not-found error paths

2. **IndexedDB integration tests**
   - LifeListContext: mark/unmark/toggle/import/clear operations
   - goalListsDB: all 7 CRUD functions
   - Schema upgrade from v1 to v2
   - Concurrent access scenarios
   - Both modules opening same DB simultaneously

3. **MapView core rendering tests**
   - Grid loading and display
   - View mode switching (density, species, goal-birds)
   - Feature-state updates when week/data changes
   - Click handler produces correct location selection

### P1 -- Must Have Before Public Beta

4. **GoalBirdsTab functional tests**
   - Create/rename/delete goal lists
   - Add/remove species from lists
   - Search and filtering
   - Suggestion sections rendering with correct species

5. **TripPlanTab functional tests**
   - All 4 sub-modes: location, hotspots, window, compare
   - Week range selection and lifer computation
   - Location comparison (overlap, unique-to-A, unique-to-B)

6. **ProfileTab import/export tests**
   - CSV parsing with various formats
   - Species matching accuracy
   - Import results reporting (new vs. existing counts)
   - Export file generation
   - Edge cases: empty file, no header, BOM, encoding issues

7. **Cross-browser e2e tests**
   - Add Firefox and WebKit to Playwright config
   - Run existing e2e suite across all browsers

### P2 -- Should Have

8. **Error handling and resilience tests**
   - Backend offline / network failure scenarios
   - Fetch timeout handling
   - IndexedDB unavailable (private browsing)
   - Invalid/corrupted data in DB stores

9. **Dark mode visual tests**
   - Screenshot comparison for all tabs in both modes
   - Color contrast accessibility checks

10. **Performance benchmarks**
    - Map render time with full dataset
    - Species list scroll performance with 2,490 items
    - Weekly data load time for all 52 weeks

### P3 -- Nice to Have

11. **Animation tests** (week migration animation)
12. **Responsive layout tests** (mobile vs. desktop panel behavior)
13. **Accessibility audit** (screen reader, keyboard navigation)

---

## 6. Test Environment Requirements

### 6.1 Unit Test Environment (Current -- Needs Enhancement)

- **Runtime:** Vitest + jsdom (configured)
- **Missing:** IndexedDB mock/polyfill (fake-indexeddb recommended)
- **Missing:** MapLibre GL mock (canvas/WebGL not available in jsdom)
- **Missing:** Fetch mock utility (currently ad hoc `vi.spyOn(globalThis, 'fetch')`)
- **Recommendation:** Add `fake-indexeddb` to devDependencies and import in `setup.ts`. Create a shared fetch mock factory. Create a MapLibre mock module.

### 6.2 E2E Test Environment (Current -- Needs Enhancement)

- **Runtime:** Playwright with Chromium only
- **Missing:** Firefox and WebKit browser projects
- **Missing:** Screenshot-on-failure configuration
- **Missing:** Trace collection for debugging
- **Missing:** Test data seeding (tests currently depend on whatever data the backend has)
- **Recommendation:** Add `screenshot: 'only-on-failure'` and `trace: 'retain-on-failure'` to Playwright config. Add Firefox/WebKit projects. Create a test data fixture strategy.

### 6.3 Backend Test Environment (Does Not Exist)

- **Needs:** pytest, httpx (for async TestClient), pytest-asyncio
- **Needs:** Test fixture data (minimal species.json, minimal week files)
- **Needs:** Isolated data directory per test run
- **Recommendation:** Create `backend/tests/` directory with `conftest.py` providing a FastAPI TestClient with isolated test data.

### 6.4 CI/CD Pipeline (Does Not Exist)

- **Needs:** GitHub Actions workflow
- **Stages:** lint -> type-check -> unit tests -> build -> e2e tests
- **Backend:** pip install -> pytest
- **Frontend:** npm ci -> vitest run -> vite build -> playwright test
- **Recommendation:** Create `.github/workflows/ci.yml` with matrix for Node 18/20 and Python 3.11/3.12.

---

## 7. Coordination Plan for 11 Tester Roles

### Role 2: Frontend Unit Tester
- **Priority files:** GoalBirdsTab.tsx, TripPlanTab.tsx, SpeciesTab.tsx, ProfileTab.tsx
- **Key concern:** These components require IndexedDB mocks. GoalBirdsTab has 2,364 lines of untested code with complex state (11+ suggestion category toggles, list picker, search autocomplete).
- **Coordination:** Will need shared mock factories from test setup work.

### Role 3: Backend / API Tester
- **Priority:** All 10 endpoints in `backend/main.py`. Start with the lifer-summary POST endpoint (most complex server-side logic) and the dual-format week data loader.
- **Key concern:** No test infrastructure exists. Must set up pytest + TestClient from scratch.
- **Coordination:** Provide test data fixtures that other roles can also use.

### Role 4: Integration Tester
- **Priority:** Frontend-to-backend data flow. Verify that MapView correctly fetches, processes, and renders weekly summary data. Verify lifer-summary POST with real life list data.
- **Key concern:** Port mismatch (init.sh uses 8000, vite proxy targets 8001) could mask integration issues during development.
- **Coordination:** Establish which port is canonical and fix the mismatch.

### Role 5: E2E / User Flow Tester
- **Priority:** Extend `frontend/e2e/app.spec.ts` with full user journeys: import life list -> explore map -> create goal list -> plan trip -> check progress.
- **Key concern:** Current e2e tests are shallow navigation checks. No tests verify data-dependent behavior.
- **Coordination:** Needs test data seeding strategy from Backend Tester.

### Role 6: Performance Tester
- **Priority:** Map rendering with 312 grid cells and feature-state updates. Weekly data loading (JSON files range from small to large). Species list rendering with 2,490 items.
- **Key concern:** Module-level caches (`speciesMetaCache`, `_week_cache`) help performance but are never evicted. Memory profiling needed.
- **Coordination:** Needs realistic dataset. Current data is real (52 weeks x 2 files = 104 files confirmed).

### Role 7: Accessibility Tester
- **Priority:** ARIA labels on map interactions, keyboard navigation for side panel tabs, screen reader compatibility for species lists and progress bars.
- **Key concern:** MapLibre canvas is inherently inaccessible. Side panel tabs use custom buttons without `role="tab"` / `role="tabpanel"` ARIA patterns.
- **Coordination:** Results feed into frontend work backlog.

### Role 8: Security Tester
- **Priority:** CORS wildcard configuration, POST endpoint input validation, static file mount exposure (`/data` serves raw JSON files), no rate limiting.
- **Key concern:** `allow_origins=["*"]` with `allow_credentials=True` in `main.py` (line 41-46) is a security misconfiguration -- credentials should not be allowed with wildcard origins.
- **Coordination:** Security findings may require backend changes before release.

### Role 9: Data Integrity Tester
- **Priority:** Verify species data consistency (2,490 species across species.json and 52 weekly files). Verify grid cell IDs in GeoJSON match those in weekly data. Verify taxonomic ordering.
- **Key concern:** Dual IndexedDB schema management between `LifeListContext.tsx` and `goalListsDB.ts` is the highest data integrity risk.
- **Coordination:** Work with Backend Tester on data validation scripts.

### Role 10: Mobile / Responsive Tester
- **Priority:** Side panel collapse/expand behavior (h-[45vh] on mobile vs md:w-80 on desktop), map interaction on touch devices, tab navigation usability on small screens.
- **Key concern:** No mobile viewport e2e tests exist. Playwright config has no mobile device emulation.
- **Coordination:** Add mobile device projects to Playwright config.

### Role 11: State Management Tester
- **Priority:** React state coordination in App.tsx (14 state variables), goal list state sync between App.tsx and GoalBirdsTab (both maintain separate goal list state), `goalSpeciesIdSetVersion` counter pattern.
- **Key concern:** GoalBirdsTab loads its own goal lists independently of App.tsx. This dual-source-of-truth pattern could cause stale data.
- **Coordination:** Findings will overlap with Integration Tester work.

### Role 12: Visual / UI Tester
- **Priority:** Dark mode rendering across all tabs, heatmap color gradient accuracy, progress bar rendering, skeleton loading states.
- **Key concern:** No visual regression testing infrastructure. Consider Playwright visual comparison or Chromatic.
- **Coordination:** Establish baseline screenshots before any refactoring.

---

## 8. Release Readiness Criteria

### Gate 1: Alpha (Internal Testing)
- [ ] All P0 tests written and passing
- [ ] Backend API test suite with >80% endpoint coverage
- [ ] IndexedDB CRUD operations tested
- [ ] CI pipeline running on every push
- [ ] Port mismatch between init.sh and vite.config.ts resolved
- [ ] No Critical severity bugs open

### Gate 2: Beta (Limited External Users)
- [ ] All P1 tests written and passing
- [ ] Cross-browser e2e passing (Chromium + Firefox + WebKit)
- [ ] CSV import edge cases handled
- [ ] Error states tested and graceful
- [ ] CORS configuration hardened for production
- [ ] No Critical or High severity bugs open

### Gate 3: Production Release
- [ ] All P2 tests written and passing
- [ ] Performance benchmarks established with acceptable thresholds
- [ ] Accessibility audit completed (WCAG 2.1 AA minimum)
- [ ] Security review completed
- [ ] Visual regression baselines captured
- [ ] No Critical, High, or Medium severity bugs open
- [ ] Test documentation complete

---

## 9. Immediate Action Items

1. **Fix port mismatch** (30 min): `init.sh` line 58 starts backend on port 8000, but `frontend/vite.config.ts` line 19 proxies to port 8001. One must change.

2. **Add `fake-indexeddb` to test setup** (1 hour): Install package, import in `frontend/src/test/setup.ts`. This unblocks testing of LifeListContext, goalListsDB, and any component that uses them.

3. **Create backend test infrastructure** (2 hours): Add `pytest`, `httpx`, `pytest-asyncio` to requirements. Create `backend/tests/conftest.py` with TestClient and minimal test data fixtures. Write first test for `/api/health`.

4. **Enhance Playwright config** (30 min): Add Firefox/WebKit projects, screenshot-on-failure, trace-on-failure. These are low-effort, high-value improvements.

5. **Create CI pipeline** (2 hours): GitHub Actions workflow for lint, type-check, unit tests, build, e2e tests. Without CI, test discipline will erode.

---

## 10. Metrics and Reporting

### Current Baseline Metrics
- **Unit test count:** 21
- **E2E test count:** 11
- **Backend test count:** 0
- **Total test count:** 32
- **Estimated line coverage:** <5% (only ExploreTab, TopBar, and Skeleton are tested)
- **Component coverage:** 3 of 12 components tested (25%)
- **API endpoint coverage:** 0 of 10 endpoints tested (0%)

### Target Metrics (Post-P0)
- **Unit test count:** 80+
- **E2E test count:** 25+
- **Backend test count:** 30+
- **Total test count:** 135+
- **Estimated line coverage:** >40%
- **Component coverage:** 12 of 12 components tested (100%)
- **API endpoint coverage:** 10 of 10 endpoints tested (100%)

### Reporting Cadence
- Weekly test status report to stakeholders
- Test count and coverage tracked per sprint
- Bug escape rate tracked after each release
- Flaky test rate monitored (target: <2%)

---

## 11. Key File References

| File | Absolute Path |
|------|---------------|
| App.tsx | `frontend/src/App.tsx` |
| MapView.tsx | `frontend/src/components/MapView.tsx` |
| GoalBirdsTab.tsx | `frontend/src/components/GoalBirdsTab.tsx` |
| TripPlanTab.tsx | `frontend/src/components/TripPlanTab.tsx` |
| SpeciesTab.tsx | `frontend/src/components/SpeciesTab.tsx` |
| ProfileTab.tsx | `frontend/src/components/ProfileTab.tsx` |
| ProgressTab.tsx | `frontend/src/components/ProgressTab.tsx` |
| SidePanel.tsx | `frontend/src/components/SidePanel.tsx` |
| SpeciesInfoCard.tsx | `frontend/src/components/SpeciesInfoCard.tsx` |
| TopBar.tsx | `frontend/src/components/TopBar.tsx` |
| Skeleton.tsx | `frontend/src/components/Skeleton.tsx` |
| LifeListContext.tsx | `frontend/src/contexts/LifeListContext.tsx` |
| goalListsDB.ts | `frontend/src/lib/goalListsDB.ts` |
| types.ts | `frontend/src/components/types.ts` |
| Backend main.py | `backend/main.py` |
| Vitest config | `frontend/vite.config.ts` |
| Playwright config | `frontend/playwright.config.ts` |
| Test setup | `frontend/src/test/setup.ts` |
| ExploreTab tests | `frontend/src/test/ExploreTab.test.tsx` |
| TopBar tests | `frontend/src/test/TopBar.test.tsx` |
| Skeleton tests | `frontend/src/test/Skeleton.test.tsx` |
| E2E tests | `frontend/e2e/app.spec.ts` |
| Package config | `frontend/package.json` |
| Init script | `init.sh` |
