# Test Automation & DevOps Evaluation: Find-A-Lifer

**Role:** Automation / DevOps Test Engineer
**Date:** 2026-03-13
**Scope:** Full test infrastructure audit, CI/CD design, and phased improvement plan

---

## 1. Current State Assessment

### 1.1 What Exists

| Layer | Tool | Tests | Files |
|-------|------|-------|-------|
| Frontend unit | Vitest 4.1 + jsdom + @testing-library/react | 21 tests | 3 test files |
| Frontend E2E | Playwright 1.58 (chromium only) | 11 tests | 1 spec file |
| Backend unit | None | 0 | 0 |
| CI/CD | None | N/A | No `.github/workflows/` |
| Coverage | None configured | N/A | N/A |

### 1.2 Test Configuration Summary

**Vitest (vite.config.ts):**
- Environment: jsdom
- Globals: enabled
- Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom` only)
- E2E directory properly excluded from unit test runs

**Playwright (playwright.config.ts):**
- Single project: chromium only
- 30s timeout, 0 retries
- `webServer` configured to start `npm run dev` on port 5173
- No backend server start -- E2E tests will fail if backend is not running separately
- No screenshot/trace configuration
- `reuseExistingServer: true` -- good for local dev, risky for CI

**package.json scripts:**
- `test` -> `vitest run`
- `test:watch` -> `vitest`
- `test:e2e` -> `playwright test`
- No `test:coverage`, `test:ci`, or `lint:ci` scripts

---

## 2. Test Coverage Assessment

### 2.1 Frontend Unit Tests -- What IS Tested

| Component | Lines | Tests | Coverage Quality |
|-----------|-------|-------|------------------|
| TopBar (100 lines) | 5 | Renders, toggle, status dot | Decent -- tests rendering and callback |
| ExploreTab (453 lines) | 10 | Renders controls, slider callbacks, conditional UI | Good -- tests user interaction and conditional rendering |
| Skeleton (92 lines) | 6 | Renders all variants, custom counts | Adequate for pure presentational |

**Quality verdict:** The 21 existing tests are *meaningful but shallow*. They verify rendering and basic interactions but do not test:
- Async data fetching behavior
- Error states
- State transitions
- Complex user workflows
- Edge cases (empty data, network errors)

### 2.2 Frontend Unit Tests -- What is NOT Tested

| Component | Lines | Risk | Priority |
|-----------|-------|------|----------|
| MapView | 1,428 | HIGH -- core map logic, heatmaps, click handlers | Medium (hard to unit test; better for E2E) |
| GoalBirdsTab | 2,364 | HIGH -- largest component, CRUD operations | **Critical** |
| TripPlanTab | 1,163 | HIGH -- compare locations, trip planning | **Critical** |
| SpeciesTab | 698 | MEDIUM -- species search/filter/checklist | High |
| SidePanel | 186 | LOW -- tab routing container | Low |
| ProfileTab | 277 | MEDIUM -- data import/export | High |
| ProgressTab | 240 | MEDIUM -- statistics calculations | High |
| SpeciesInfoCard | 138 | LOW -- modal display | Medium |
| App.tsx | 153 | MEDIUM -- root state orchestration | Medium |
| LifeListContext | 236 | HIGH -- IndexedDB CRUD, data integrity | **Critical** |
| goalListsDB | 181 | HIGH -- IndexedDB CRUD, data integrity | **Critical** |

**Estimated frontend line coverage: ~8% (645 lines have any test / 7,709 total)**

### 2.3 Backend -- Zero Test Coverage

The FastAPI backend (`backend/main.py`, 378 lines) has 10 API endpoints and 0 tests:
- `GET /api/health`
- `GET /api/species`
- `GET /api/weeks/{week_number}/summary`
- `GET /api/weeks/{week_number}`
- `GET /api/weeks/{week_number}/species/{species_code}`
- `GET /api/weeks/{week_number}/species-batch`
- `GET /api/weeks/{week_number}/cells/{cell_id}`
- `POST /api/weeks/{week_number}/lifer-summary`
- `GET /api/grid`
- `GET /api/regions`

Plus internal helper functions: `_load_species_meta()`, `_load_week_data()`, `get_available_data_endpoints()`.

### 2.4 E2E Test Assessment

The 11 Playwright tests cover:
1. App loads with title
2. Side panel with tabs visible
3. Default Explore tab with Richness mode
4. View mode switching
5. Tab switching (Species, Stats, Profile)
6. Dark mode toggle
7. Week slider value change
8. Region selector options
9. Animation play/pause
10. Side panel collapse/expand

**Strengths:**
- Good coverage of basic navigation and UI state toggling
- Uses proper Playwright selectors (getByRole, getByTestId, getByText)
- Tests are independent (each starts from fresh page load)

**Weaknesses:**
- No data-dependent tests (species loading, map rendering, grid overlay)
- No life list or goal list workflow tests
- No error scenario tests (backend down, 404s, malformed data)
- Backend server not started by Playwright config (only frontend dev server)
- No screenshot comparison for visual regressions
- No trace or video on failure
- No cross-browser coverage (chromium only)
- 0 retries means CI flakes will fail builds

---

## 3. CI/CD Pipeline Design

### 3.1 Recommended GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, master]
  pull_request:
    branches: [main, master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'
  PYTHON_VERSION: '3.11'

jobs:
  # ── Stage 1: Fast checks (< 2 min) ─────────────────────────
  lint-and-typecheck:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci --prefix frontend

      - name: TypeScript type check
        run: npx --prefix frontend tsc -b --noEmit

      - name: ESLint
        run: npm run lint --prefix frontend

  # ── Stage 2: Unit tests with coverage (< 3 min) ────────────
  frontend-unit-tests:
    name: Frontend Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci --prefix frontend

      - name: Run Vitest with coverage
        run: npx --prefix frontend vitest run --coverage --reporter=verbose
        env:
          CI: true

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: frontend-coverage
          path: frontend/coverage/

  backend-unit-tests:
    name: Backend Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - name: Install dependencies
        run: |
          pip install -r backend/requirements.txt
          pip install pytest pytest-asyncio httpx coverage

      - name: Run pytest with coverage
        run: |
          cd backend
          python -m coverage run -m pytest tests/ -v
          python -m coverage report --fail-under=80
          python -m coverage xml -o coverage.xml

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-coverage
          path: backend/coverage.xml

  # ── Stage 3: E2E tests (< 10 min) ──────────────────────────
  e2e-tests:
    name: E2E Tests
    needs: [lint-and-typecheck, frontend-unit-tests, backend-unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}
          cache: 'pip'

      - run: npm ci --prefix frontend

      - name: Install Playwright browsers
        run: npx --prefix frontend playwright install --with-deps chromium

      - name: Install backend dependencies
        run: pip install -r backend/requirements.txt

      - name: Start backend server
        run: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 &
        env:
          PYTHONPATH: .

      - name: Wait for backend
        run: |
          for i in $(seq 1 30); do
            curl -sf http://localhost:8001/api/health && break
            sleep 1
          done

      - name: Run Playwright tests
        run: npx --prefix frontend playwright test --reporter=html
        env:
          CI: true

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: frontend/playwright-report/

      - name: Upload test traces
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: frontend/test-results/

  # ── Stage 4: Build verification ────────────────────────────
  build:
    name: Production Build
    needs: [e2e-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci --prefix frontend

      - name: Build frontend
        run: npm run build --prefix frontend

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: frontend/dist/
```

### 3.2 Smoke Test Workflow (Post-Deploy)

```yaml
# .github/workflows/smoke.yml
name: Smoke Tests

on:
  deployment_status:
  workflow_dispatch:
    inputs:
      target_url:
        description: 'URL to test against'
        required: true

jobs:
  smoke:
    name: Smoke Tests
    runs-on: ubuntu-latest
    if: github.event.deployment_status.state == 'success' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - run: npm ci --prefix frontend
      - run: npx --prefix frontend playwright install --with-deps chromium

      - name: Run smoke tests
        run: npx --prefix frontend playwright test --grep @smoke
        env:
          BASE_URL: ${{ github.event.inputs.target_url || github.event.deployment_status.target_url }}
```

---

## 4. Recommended Test Directory Structure

```
find-a-lifer/
  .github/
    workflows/
      ci.yml                          # Main CI pipeline
      smoke.yml                       # Post-deployment smoke tests

  backend/
    main.py
    requirements.txt
    requirements-dev.txt              # NEW: pytest, httpx, coverage, etc.
    tests/                            # NEW
      __init__.py
      conftest.py                     # Fixtures: test client, sample data
      test_health.py                  # /api/health endpoint
      test_species.py                 # /api/species endpoint
      test_weeks.py                   # All /api/weeks/* endpoints
      test_grid.py                    # /api/grid endpoint
      test_regions.py                 # /api/regions endpoint
      test_data_loading.py            # _load_week_data, format detection
      fixtures/                       # Minimal test data files
        species_sample.json
        week_sample.json
        week_sample_summary.json
        grid_sample.geojson
        regions_sample.geojson

  frontend/
    package.json
    vite.config.ts
    playwright.config.ts
    src/
      test/
        setup.ts                      # Vitest setup
        helpers/                      # NEW: shared test utilities
          renderWithProviders.tsx      # Wrapper with LifeListContext etc.
          mockData.ts                 # Shared mock species/week data
          mockIndexedDB.ts            # fake-indexeddb setup
        unit/                         # NEW: reorganize by domain
          components/
            TopBar.test.tsx
            ExploreTab.test.tsx
            Skeleton.test.tsx
            GoalBirdsTab.test.tsx      # NEW
            SpeciesTab.test.tsx        # NEW
            TripPlanTab.test.tsx       # NEW
            ProfileTab.test.tsx        # NEW
            ProgressTab.test.tsx       # NEW
            SpeciesInfoCard.test.tsx   # NEW
            SidePanel.test.tsx         # NEW
          contexts/
            LifeListContext.test.tsx   # NEW
          lib/
            goalListsDB.test.ts       # NEW
    e2e/
      app.spec.ts                     # Existing basic navigation
      species.spec.ts                 # NEW: species search/filter flow
      goal-birds.spec.ts              # NEW: goal list CRUD flow
      trip-plan.spec.ts               # NEW: trip planning flow
      life-list.spec.ts               # NEW: life list import/management
      map-interaction.spec.ts         # NEW: map click, popup, heatmap
      visual/                         # NEW: visual regression
        map-rendering.spec.ts         # Screenshot comparison tests
```

---

## 5. Backend Test Strategy

### 5.1 Setup

Create `backend/requirements-dev.txt`:
```
-r requirements.txt
pytest>=7.4.0
pytest-asyncio>=0.21.0
httpx>=0.24.0
coverage>=7.3.0
```

### 5.2 Test Fixtures (`backend/tests/conftest.py`)

```python
import json
import pytest
from pathlib import Path
from httpx import AsyncClient, ASGITransport

# Minimal fixture data created in a temp directory
@pytest.fixture
def sample_species():
    return [
        {"species_id": 1, "speciesCode": "amerob", "comName": "American Robin",
         "sciName": "Turdus migratorius", "taxonOrder": 100, "familyComName": "Thrushes"},
        {"species_id": 2, "speciesCode": "houspa", "comName": "House Sparrow",
         "sciName": "Passer domesticus", "taxonOrder": 200, "familyComName": "Old World Sparrows"},
    ]

@pytest.fixture
def sample_week_cell_grouped():
    return [[1, [1, 2]], [2, [1]], [3, [2]]]

@pytest.fixture
def sample_week_record_based():
    return [
        {"cell_id": 1, "species_id": 1, "probability": 0.8},
        {"cell_id": 1, "species_id": 2, "probability": 0.6},
        {"cell_id": 2, "species_id": 1, "probability": 0.5},
    ]

@pytest.fixture
def data_dir(tmp_path, sample_species, sample_week_cell_grouped):
    """Create a temporary data directory with sample data files."""
    data = tmp_path / "data"
    data.mkdir()
    weeks = data / "weeks"
    weeks.mkdir()

    (data / "species.json").write_text(json.dumps(sample_species))
    (weeks / "week_01.json").write_text(json.dumps(sample_week_cell_grouped))

    # Summary file
    summary = [[1, 2, 200], [2, 1, 200], [3, 1, 200]]
    (weeks / "week_01_summary.json").write_text(json.dumps(summary))

    return data

@pytest.fixture
async def client(data_dir, monkeypatch):
    """Create test client with temporary data directory."""
    import backend.main as main_module
    monkeypatch.setattr(main_module, "DATA_DIR", data_dir)

    # Reload species data
    species_list, by_code, by_id = main_module._load_species_meta.__wrapped__() \
        if hasattr(main_module._load_species_meta, '__wrapped__') \
        else main_module._load_species_meta()
    monkeypatch.setattr(main_module, "_species_list", species_list)
    monkeypatch.setattr(main_module, "_species_by_code", by_code)
    monkeypatch.setattr(main_module, "_species_by_id", by_id)
    monkeypatch.setattr(main_module, "_week_cache", {})

    transport = ASGITransport(app=main_module.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

### 5.3 Priority Test Cases

**test_health.py:** Health endpoint returns status, version, species count, available endpoints.

**test_weeks.py (highest priority):**
- Valid week returns data
- Week 0 and 53 return 400
- Nonexistent week returns 404
- Cell-grouped format detected and parsed correctly
- Record-based format detected and parsed correctly
- Summary endpoint returns correct species counts
- Species-specific endpoint filters correctly
- Species-batch endpoint handles comma-separated IDs
- Species-batch rejects >500 IDs
- Cell-specific endpoint returns species with metadata
- Lifer-summary endpoint excludes seen species correctly

**test_species.py:** Returns full list, 404 when no data file.

**test_grid.py:** Prefers 27km grid, falls back to grid.geojson, 404 when missing.

---

## 6. Frontend Unit Test Expansion Plan

### 6.1 Critical: IndexedDB Layer Tests

Both `LifeListContext` and `goalListsDB` use IndexedDB. Install `fake-indexeddb`:
```bash
npm install -D fake-indexeddb
```

Add to test setup:
```typescript
import 'fake-indexeddb/auto';
```

Test cases for LifeListContext:
- Adding a species to life list
- Removing a species from life list
- Checking if species is on life list
- Importing CSV data
- Clearing life list
- Database upgrade from v1 to v2

Test cases for goalListsDB:
- Creating a goal list
- Adding species to goal list
- Removing species from goal list
- Deleting a goal list
- Listing all goal lists
- Active goal list persistence (localStorage)

### 6.2 Critical: GoalBirdsTab Tests

This is the largest component (2,364 lines) with zero tests. Priority test cases:
- Renders empty state when no goal lists exist
- Creates a new goal list
- Adds species to goal list via search
- Removes species from goal list
- Switches between goal lists
- Shows species occurrence data for active goal list
- Handles API errors gracefully

### 6.3 High Priority: Data Fetching and Error Handling

Create a shared `renderWithProviders` helper that wraps components with the LifeListContext provider. Test:
- Loading states while data fetches
- Error boundaries when API returns 500
- Empty state when API returns empty arrays
- Retry behavior on transient failures

### 6.4 Mock Strategy

| Dependency | Mock in Unit Tests? | Mock in E2E? |
|------------|-------------------|--------------|
| `fetch` (API calls) | YES -- `vi.spyOn(globalThis, 'fetch')` | NO -- use real backend |
| IndexedDB | YES -- `fake-indexeddb` | NO -- use real browser IndexedDB |
| MapLibre GL | YES -- mock the module entirely | NO -- use real rendering |
| localStorage | NO -- jsdom provides it | NO -- use real browser |
| `window.matchMedia` | YES -- mock in setup.ts | NO |

---

## 7. E2E Test Improvements

### 7.1 Playwright Config Fixes

The current config has a critical gap: it starts the frontend dev server but NOT the backend. The Vite proxy forwards `/api` to `localhost:8001`, but nothing starts the backend.

Recommended updated `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['html', { open: 'on-failure' }]],

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    // Phase 2: add firefox and webkit
    // { name: 'firefox', use: { browserName: 'firefox' } },
    // { name: 'webkit', use: { browserName: 'webkit' } },
  ],

  webServer: [
    {
      command: 'python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001',
      port: 8001,
      reuseExistingServer: !process.env.CI,
      cwd: '..',  // project root
      timeout: 15000,
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
  ],
})
```

Key changes:
- Adds backend server to `webServer` array
- CI-aware retries (2 retries in CI, 0 locally)
- Screenshots on failure, trace on first retry
- GitHub reporter for CI integration
- `reuseExistingServer` false in CI to ensure clean state

### 7.2 New E2E Test Priorities

**Smoke tests (tag: @smoke)** -- run post-deploy:
- App loads
- API health returns 200
- Map tiles load
- At least one week of data loads

**Data flow tests:**
- Load species list, search, filter by family
- Switch weeks and verify heatmap updates
- Click grid cell and verify popup shows species

**User workflow tests:**
- Import a life list CSV, verify species appear as checked
- Create goal list, add species, switch to Goal Birds view
- Compare two locations in Trip Plan tab

### 7.3 Visual Regression Testing

For a map-heavy app, visual regression is valuable but must be managed carefully:
- Use `toHaveScreenshot()` with reasonable thresholds (0.2% pixel diff)
- Limit to specific viewport states (map loaded, popup open, heatmap visible)
- Store baseline images in the repo under `e2e/visual/screenshots/`
- Run only on chromium (cross-browser screenshots differ too much)
- Use `maxDiffPixelRatio: 0.01` to handle minor anti-aliasing differences

Caveats: map tile loading is nondeterministic (network-dependent tile rendering). Consider mocking the tile server in visual regression tests, or using a local tile source.

---

## 8. Coverage Reporting Setup

### 8.1 Frontend (Vitest + v8/istanbul)

Add to `vite.config.ts`:
```typescript
test: {
  environment: 'jsdom',
  globals: true,
  setupFiles: ['./src/test/setup.ts'],
  exclude: ['e2e/**', 'node_modules/**'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    reportsDirectory: './coverage',
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/test/**',
      'src/vite-env.d.ts',
      'src/main.tsx',
    ],
    thresholds: {
      statements: 30,   // Start low, increase as tests are added
      branches: 25,
      functions: 30,
      lines: 30,
    },
  },
},
```

Install coverage provider:
```bash
npm install -D @vitest/coverage-v8
```

Add script to package.json:
```json
"test:coverage": "vitest run --coverage"
```

### 8.2 Backend (coverage.py)

```bash
pip install coverage
cd backend
coverage run -m pytest tests/ -v
coverage report --fail-under=80
coverage html -d htmlcov
```

### 8.3 Coverage Targets (Phased)

| Phase | Frontend Statements | Backend Statements |
|-------|--------------------|--------------------|
| Current | ~8% (estimated) | 0% |
| Phase 1 (Month 1) | 30% | 80% |
| Phase 2 (Month 2) | 50% | 90% |
| Phase 3 (Month 3) | 65% | 95% |
| Maintenance | 65%+ (enforce in CI) | 90%+ (enforce in CI) |

Note: 100% coverage on the frontend is not a goal. MapView (1,428 lines) and other WebGL/canvas-dependent code is better validated by E2E tests.

---

## 9. Test Data Management

### 9.1 Current State

- Backend has full production data committed (52 weeks x 2 files = 104 JSON files)
- No test fixtures or seed data
- E2E tests depend on production data being present
- Unit tests mock fetch at the response level

### 9.2 Recommendations

**Backend fixtures:** Create minimal JSON files in `backend/tests/fixtures/` with 2-3 species, 3-5 cells, 1 week. These allow tests to run without the full 104-file dataset.

**Frontend fixtures:** Create `src/test/helpers/mockData.ts` with typed mock objects:
```typescript
export const mockSpeciesList: Species[] = [
  { species_id: 1, speciesCode: 'amerob', comName: 'American Robin', ... },
  { species_id: 2, speciesCode: 'houspa', comName: 'House Sparrow', ... },
];

export const mockWeekSummary = [[1, 15, 200], [2, 8, 200]];
export const mockGridGeoJSON = { type: 'FeatureCollection', features: [...] };
```

**E2E seed data:** For E2E tests, use the real backend with real data files. This validates the actual data pipeline. Do NOT mock in E2E.

---

## 10. Performance Regression Testing

### 10.1 Bundle Size Monitoring

Add to CI:
```yaml
- name: Check bundle size
  run: |
    npm run build --prefix frontend
    du -sh frontend/dist/assets/*.js | sort -rh
    TOTAL=$(du -s frontend/dist/ | cut -f1)
    echo "Total bundle size: ${TOTAL}KB"
    if [ "$TOTAL" -gt 2048 ]; then
      echo "::warning::Bundle size exceeds 2MB threshold"
    fi
```

### 10.2 API Response Time Monitoring

Add a performance test to the backend suite:
```python
import time

@pytest.mark.asyncio
async def test_week_summary_response_time(client):
    start = time.perf_counter()
    response = await client.get("/api/weeks/1/summary")
    elapsed = time.perf_counter() - start
    assert response.status_code == 200
    assert elapsed < 1.0, f"Summary endpoint took {elapsed:.2f}s (limit: 1.0s)"
```

### 10.3 Lighthouse CI (Future Phase)

Once deployed, integrate Lighthouse CI for Core Web Vitals monitoring:
- First Contentful Paint < 2s
- Time to Interactive < 5s
- Cumulative Layout Shift < 0.1
- Map render time < 3s

---

## 11. Cross-Browser Testing Strategy

### 11.1 Current: Chromium Only

This is acceptable for early development but insufficient for production.

### 11.2 Recommended Progression

| Phase | Browsers | Rationale |
|-------|----------|-----------|
| Now | Chromium | Fast feedback, matches most users |
| Phase 2 | Chromium + Firefox | Catches Gecko rendering differences |
| Phase 3 | Chromium + Firefox + WebKit | Full coverage for Safari users |

MapLibre GL JS has known differences across browsers. WebKit is particularly important because Safari is a common mobile browser for outdoor/birding users.

### 11.3 Mobile Viewport Testing

Add a mobile project to Playwright:
```typescript
{
  name: 'mobile-chrome',
  use: {
    ...devices['Pixel 5'],
  },
},
```

This is important because birders in the field will use mobile devices.

---

## 12. Test Naming Conventions and Organization

### 12.1 Naming Conventions

**Unit tests:**
- File: `{ComponentName}.test.tsx` or `{module}.test.ts`
- Describe block: component/module name
- Test names: `it('should [expected behavior] when [condition]')`

**E2E tests:**
- File: `{feature-area}.spec.ts`
- Describe block: feature area
- Test names: `test('[user action] [expected result]')`
- Tag smoke tests with `test('...', { tag: '@smoke' }, ...)`

### 12.2 Test Organization Rules

1. One test file per source file (unit tests)
2. E2E tests organized by user workflow, not by component
3. Shared helpers in `test/helpers/` -- never in test files
4. Mock data in `test/helpers/mockData.ts` -- single source of truth
5. No test logic in setup files (setup.ts is for imports and global config only)

---

## 13. Phased Implementation Plan

### Phase 1: Foundation (Week 1-2)

**Goal:** CI pipeline running, backend tested, coverage reporting active.

| Task | Effort | Impact |
|------|--------|--------|
| Create `.github/workflows/ci.yml` | 2h | Prevents broken merges |
| Create `backend/requirements-dev.txt` | 15min | Dev dependency management |
| Create `backend/tests/conftest.py` with fixtures | 2h | Test infrastructure |
| Write backend tests for all 10 endpoints | 4h | 80%+ backend coverage |
| Fix Playwright config to start backend server | 30min | E2E tests actually work in CI |
| Add `@vitest/coverage-v8` and configure thresholds | 1h | Coverage visibility |
| Add `test:coverage` and `test:ci` npm scripts | 15min | Developer convenience |

### Phase 2: Frontend Test Expansion (Week 3-4)

**Goal:** Critical frontend paths tested, E2E tests expanded.

| Task | Effort | Impact |
|------|--------|--------|
| Install `fake-indexeddb`, create test helpers | 1h | Enables IndexedDB testing |
| Write LifeListContext tests | 3h | Data integrity confidence |
| Write goalListsDB tests | 2h | Data integrity confidence |
| Write GoalBirdsTab tests (core flows) | 4h | Largest component covered |
| Write SpeciesTab tests | 2h | Search/filter logic covered |
| Write ProfileTab tests (import/export) | 2h | Data portability covered |
| Add 3-4 E2E data flow tests | 3h | End-to-end confidence |
| Add Playwright retries and traces for CI | 30min | Reduce CI flakes |

### Phase 3: Hardening (Week 5-6)

**Goal:** Visual regression, cross-browser, performance monitoring.

| Task | Effort | Impact |
|------|--------|--------|
| Write ProgressTab and TripPlanTab tests | 4h | Coverage breadth |
| Add Firefox to Playwright projects | 1h | Cross-browser confidence |
| Add mobile viewport E2E project | 1h | Mobile user confidence |
| Set up visual regression for map states | 3h | Catches rendering regressions |
| Add bundle size check to CI | 1h | Prevents bloat |
| Create smoke test workflow | 2h | Post-deploy verification |
| Raise coverage thresholds to 50%/90% | 15min | Enforce test discipline |

### Phase 4: Maintenance Mode (Ongoing)

- Every new component/feature requires tests in the same PR
- Coverage thresholds enforced in CI (build fails if threshold drops)
- Quarterly review of flaky tests and test execution time
- Update Playwright browsers monthly
- Review and update visual regression baselines after intentional UI changes

---

## 14. Quick Wins (Can Do Today)

These are zero-risk improvements that can be made immediately:

1. **Add `@vitest/coverage-v8`** to devDependencies and the coverage config to `vite.config.ts` -- gives immediate visibility into coverage gaps.

2. **Fix the Playwright `webServer` config** to include the backend server. Without this, E2E tests only work if someone manually starts the backend.

3. **Add CI retries to Playwright config** (`retries: process.env.CI ? 2 : 0`) -- zero effort, prevents CI flakes.

4. **Add screenshot-on-failure and trace-on-retry** to Playwright config -- makes debugging CI failures possible instead of guessing.

5. **Create the `.github/workflows/ci.yml`** file -- even with just lint + existing tests, this prevents merging broken code.

---

## 15. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| E2E tests flaky in CI (map tile loading) | High | Medium | Retries, increase timeouts, mock tile server |
| IndexedDB tests complex to set up | Medium | Low | `fake-indexeddb` handles most cases |
| MapView untestable with unit tests | High | Low | Accept this -- rely on E2E for map logic |
| Large GoalBirdsTab hard to test | Medium | Medium | Test public interface, not internals |
| CI slow due to Playwright browser install | Medium | Low | Cache browsers with actions/cache |
| Visual regression baselines break on dependency updates | Medium | Low | Update baselines in a dedicated PR |

---

## Summary

The current test suite provides a starting point but covers approximately 8% of frontend code and 0% of backend code. The most critical gaps are: (1) no CI/CD pipeline, (2) no backend tests, (3) no IndexedDB layer tests, and (4) Playwright config that does not start the backend server.

The phased plan above prioritizes high-impact, low-effort improvements first. Phase 1 alone (estimated 10 hours of work) would deliver a working CI pipeline, 80%+ backend coverage, and functioning E2E tests -- a dramatic improvement over the current state.
