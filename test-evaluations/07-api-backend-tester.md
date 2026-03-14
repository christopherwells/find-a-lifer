# API / Backend Test Evaluation

**Tester Role:** API / Backend Tester
**Date:** 2026-03-13
**Backend:** Python FastAPI serving pre-processed static JSON files
**Server Port:** 8001 (frontend proxies /api and /data via Vite dev server on :5173)

---

## 1. Architecture Overview

The backend is a lightweight static data server with no runtime computation beyond the `lifer-summary` POST endpoint. Data is pre-processed into JSON files:

| Data File | Size | Description |
|-----------|------|-------------|
| `species.json` | 1.1 MB | 2,490 species metadata |
| `grid_27km.geojson` | 37.9 MB | 229,814 grid cell polygons |
| `grid.geojson` | 51.6 MB | Same 229,814 cells (older format) |
| `regions.geojson` | 3.8 KB | 5 region polygons with species codes |
| `week_XX.json` (x52) | 31-54 MB each, 2.2 GB total | Cell-grouped occurrence data |
| `week_XX_summary.json` (x52) | 3.1-5.6 MB each, 208 MB total | Species count per cell |

All 52 weekly data files and 52 summary files are present (104 files total).

---

## 2. API Endpoint Inventory

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/health` | GET | Health check + data discovery | PASS |
| `/api/species` | GET | Full species metadata list | PASS |
| `/api/weeks/{week_number}` | GET | Full weekly occurrence data (flat records) | PASS |
| `/api/weeks/{week_number}/summary` | GET | Species count per cell (compact) | PASS |
| `/api/weeks/{week_number}/species/{species_code}` | GET | Single species heatmap | PASS |
| `/api/weeks/{week_number}/species-batch` | GET | Multi-species batch lookup | PASS |
| `/api/weeks/{week_number}/cells/{cell_id}` | GET | All species in a cell | PASS |
| `/api/weeks/{week_number}/lifer-summary` | POST | Per-cell lifer counts minus seen species | PASS |
| `/api/grid` | GET | Grid cell geometry (GeoJSON) | PASS |
| `/api/regions` | GET | Region polygons + species codes | PASS |
| `/data/*` | GET | Static file mount (direct data access) | PASS |

---

## 3. Endpoint Correctness Tests

### 3.1 Health Check

```bash
curl -s http://localhost:8001/api/health | python -m json.tool
```

**Expected response:**
```json
{
    "status": "ok",
    "timestamp": "2026-03-13T...",
    "version": "2.0.0",
    "data_endpoints": ["..."],
    "species_count": 2490
}
```

**Findings:**
- PASS: Returns correct species count (2,490)
- PASS: Lists all available endpoint patterns
- NOTE: Uses `datetime.utcnow()` which is deprecated in Python 3.12+. Should migrate to `datetime.now(datetime.UTC)`.

### 3.2 Species Endpoint

```bash
curl -s http://localhost:8001/api/species | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0].keys())"
```

**Expected:** Array of 2,490 objects with fields: `species_id`, `speciesCode`, `comName`, `sciName`, `familyComName`, `taxonOrder`, `invasionStatus`, `conservStatus`, `difficultyScore`, `difficultyLabel`, `isRestrictedRange`, `ebirdUrl`, `photoUrl`

**Verified:**
- PASS: 2,490 species returned
- PASS: All species_id values are unique (1-2490 contiguous)
- PASS: All speciesCode values are unique
- PASS: No duplicate entries

### 3.3 Weekly Summary

```bash
curl -s http://localhost:8001/api/weeks/1/summary | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0])"
```

**Expected:** Array of `[cell_id, species_count]` tuples.

**Findings:**
- ISSUE (Medium): The API docstring says the format is `[cell_id, species_count, max_prob_uint8]` (3 elements), but the actual summary files contain only `[cell_id, species_count]` (2 elements). The fallback computation in `get_week_summary()` returns 3-element arrays `[cid, len(sids), 200]`. This means pre-computed summary files and computed fallback have different shapes.
- ISSUE (Medium): The frontend type definition `WeeklySummary = [number, number, number][]` expects 3-element tuples, but the actual data has 2 elements. The frontend destructures as `[cellId, speciesCount]` and ignores the third element, so it works by accident, but the type is wrong.
- PASS: Summary data is 100% consistent with main week data (verified: 268,173 cells in week 1, zero mismatches in species counts).

### 3.4 Full Week Data

```bash
curl -s http://localhost:8001/api/weeks/1 | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0])"
```

**Expected:** Array of `{"cell_id": int, "species_id": int, "probability": float}`

**Findings:**
- PASS: Correctly converts cell-grouped format to flat records
- ISSUE (Low): `probability` is hardcoded to `1.0` for all records when source data is cell-grouped format (which it always is). The original record-based format supported real probability values. This is a data fidelity loss, though the frontend doesn't rely on per-species probability from this endpoint.
- CONCERN (High): Response size is 31-54 MB per week. The TripPlanTab "Window of Opportunity" feature fetches ALL 52 weeks sequentially (2.2 GB total). Even with GZip, this is extremely slow and memory-intensive. This should use a dedicated batch endpoint or pre-computed data.

### 3.5 Species-Specific Week Data

```bash
# Valid species code
curl -s http://localhost:8001/api/weeks/26/species/amerob | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0] if d else 'empty')"

# Invalid species code
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/26/species/INVALID
```

**Expected valid:** Array of `{"cell_id": int, "probability": float}`
**Expected invalid:** 404 with detail message

**Findings:**
- PASS: Returns correct cell list for valid species
- PASS: Returns 404 for unknown species code
- ISSUE (Low): `probability` hardcoded to `1.0`

### 3.6 Species Batch Endpoint

```bash
# Valid batch
curl -s "http://localhost:8001/api/weeks/26/species-batch?ids=1,2,3" | python -c "import json,sys; d=json.load(sys.stdin); print(list(d.keys()))"

# Too many IDs
curl -s -w "\n%{http_code}" "http://localhost:8001/api/weeks/26/species-batch?ids=$(python -c 'print(",".join(str(i) for i in range(501)))')"

# Invalid format
curl -s -w "\n%{http_code}" "http://localhost:8001/api/weeks/26/species-batch?ids=abc,def"
```

**Findings:**
- PASS: Returns dict keyed by species_id (as string due to JSON serialization)
- PASS: Enforces 500-ID limit with 400 error
- PASS: Returns 400 on non-numeric IDs
- NOTE: Response keys are string-typed (JSON limitation) but frontend uses numeric access. Verify frontend handles this.
- ISSUE (Low): Species IDs that don't exist in the data return empty arrays silently -- no indication they were invalid. This is acceptable for batch operations.

### 3.7 Cell-Specific Data

```bash
# Valid cell
curl -s http://localhost:8001/api/weeks/1/cells/291064 | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0] if d else 'empty')"

# Non-existent cell
curl -s http://localhost:8001/api/weeks/1/cells/999999999 | python -c "import json,sys; d=json.load(sys.stdin); print(d)"
```

**Expected valid:** Array of `{"species_id", "speciesCode", "comName", "probability"}` sorted by taxonOrder
**Expected non-existent:** Empty array `[]`

**Findings:**
- PASS: Returns enriched species data with metadata joined from species.json
- PASS: Results sorted by taxonomic order
- ISSUE (Minor): Non-existent cell_id returns empty array `[]` with 200 status instead of 404. While this is a valid design choice (empty set), it means the frontend cannot distinguish "cell exists but has no species this week" from "cell doesn't exist at all."
- PASS: `probability` field is included (hardcoded 1.0)

### 3.8 Lifer Summary (POST)

```bash
curl -s -X POST http://localhost:8001/api/weeks/26/lifer-summary \
  -H "Content-Type: application/json" \
  -d '{"seen_species_codes": ["amerob", "houspa"]}' | python -c "import json,sys; d=json.load(sys.stdin); print(len(d), d[0] if d else 'empty')"
```

**Expected:** Array of `[cell_id, lifer_count, max_prob_uint8]` (3-element tuples)

**Findings:**
- PASS: Correctly excludes seen species from counts
- PASS: Only returns cells with lifer_count > 0
- ISSUE (Medium): Returns 3-element arrays `[cid, lifer_count, 200]` with hardcoded `200` for max_prob_uint8. The frontend types this as `[number, number, number][]` and destructures only the first two elements. The third element is meaningless but present.
- ISSUE (Low): No validation on the POST body structure. Sending `{}` works (treats as empty seen list). Sending malformed JSON returns a FastAPI auto-generated 422 error.
- ISSUE (Low): No limit on the size of `seen_species_codes` array. A malicious request could send millions of codes.

### 3.9 Grid Endpoint

```bash
curl -s http://localhost:8001/api/grid | python -c "import json,sys; d=json.load(sys.stdin); print(d['type'], len(d['features']))"
```

**Expected:** GeoJSON FeatureCollection with 229,814 features

**Findings:**
- PASS: Returns valid GeoJSON FeatureCollection
- PASS: Prefers `grid_27km.geojson` over `grid.geojson` (both have same feature count)
- CONCERN (Medium): 37.9 MB uncompressed. With GZip middleware (minimum_size=1000), this compresses well but is still a large initial payload. The frontend fetches this once and caches in memory.
- PASS: Each feature has `cell_id` property

### 3.10 Regions Endpoint

```bash
curl -s http://localhost:8001/api/regions | python -c "import json,sys; d=json.load(sys.stdin); print(d['type'], len(d['features']))"
```

**Findings:**
- PASS: Returns 5 regions with `region_id`, `name`, `species_codes`, and polygon geometry
- PASS: Tiny payload (3.8 KB)

---

## 4. Error Handling Tests

### 4.1 Invalid Week Numbers

```bash
# Below range
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/0/summary
# Expected: 400 "Week number must be between 1 and 52"

# Above range
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/53/summary
# Expected: 400

# Non-integer
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/abc/summary
# Expected: 422 (FastAPI validation)

# Negative
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/-1/summary
# Expected: 400
```

**Findings:**
- PASS: Week 0 and 53 return 400 with clear message
- PASS: Non-integer weeks return 422 via FastAPI path parameter validation
- PASS: Negative weeks return 400
- PASS: Consistent validation across all week-dependent endpoints

### 4.2 Non-Existent Resources

```bash
# Missing species
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/1/species/notabird
# Expected: 404 "Species 'notabird' not found"

# Note: Missing cell_id returns 200 with empty array (see 3.7)
```

**Findings:**
- PASS: Unknown species code returns 404 with descriptive detail
- PASS: Missing week data files would return 404

### 4.3 Path Traversal / Injection

```bash
# Path traversal attempt in species code
curl -s -w "\n%{http_code}" http://localhost:8001/api/weeks/1/species/../../etc/passwd
# Expected: 404 (species lookup fails, no file access)

# Path traversal in week number handled by int validation
curl -s -w "\n%{http_code}" "http://localhost:8001/api/weeks/1/cells/../../etc/passwd"
# Expected: 422 (cell_id must be int)
```

**Findings:**
- PASS: Species code is used only as a dict key lookup, never in file paths. No path traversal risk.
- PASS: Week number is validated as int and range-checked before file path construction.
- PASS: Cell ID is validated as int by FastAPI type annotation.
- PASS: The `f"week_{week_number:02d}.json"` pattern with range-checked int is safe.
- CONCERN (Low): The `/data/*` static mount exposes the entire `backend/data/` directory. An attacker could access `grid_centers.json` or any other file placed there. This is low risk since it's all public data, but could leak unintended files if new data is added.

---

## 5. Data Integrity Analysis

### 5.1 Species Data

| Check | Result |
|-------|--------|
| Total species count | 2,490 -- PASS |
| species_id uniqueness | All unique (1-2490) -- PASS |
| speciesCode uniqueness | All unique -- PASS |
| species_id contiguity | Contiguous 1-2490 -- PASS |
| Required fields present | All 13 fields on every record -- PASS |

### 5.2 Weekly Data Integrity

| Check | Result |
|-------|--------|
| All 52 week files present | PASS |
| All 52 summary files present | PASS |
| Summary-to-week consistency (week 1) | 268,173/268,173 cells match -- PASS |
| Species IDs reference valid species | All IDs in species.json -- PASS |
| No empty species lists per cell | PASS (0 empty cells in week 1) |

### 5.3 Seasonal Variation (expected)

| Week | Cells | Unique Species |
|------|-------|----------------|
| 1 (early Jan) | 268,173 | 1,840 |
| 13 (late Mar) | 294,612 | 1,847 |
| 26 (late Jun) | 449,858 | 1,850 |
| 39 (late Sep) | 333,243 | 1,853 |
| 52 (late Dec) | 271,127 | 1,841 |

This shows expected seasonal patterns: more active cells in summer, species count relatively stable. Approximately 640 species (out of 2,490) never appear in the weekly data, likely because they are extremely rare, extralimital, or not covered by the data grid.

### 5.4 Cell ID Cross-Reference

| Check | Result |
|-------|--------|
| Grid cells | 229,814 |
| Week 1 cells | 268,173 |
| Cells in week but NOT in grid | 84,473 -- ISSUE |
| Cells in grid but NOT in week 1 | 46,114 |
| Overlap | 183,700 |

**ISSUE (High):** 84,473 cells referenced in weekly data do not exist in the grid GeoJSON. This means approximately 31% of occurrence records cannot be displayed on the map. The frontend will silently skip these cells when setting feature states (no matching polygon), resulting in invisible data. This could indicate:
1. The grid GeoJSON was generated from a different resolution or extent than the occurrence data
2. Oceanic or peripheral cells are in the data but not in the grid
3. The data pipeline filtered grid cells differently than occurrence cells

Additionally, 46,114 grid cells have no occurrence data in week 1, which is expected (e.g., ocean-only cells, polar regions in winter).

### 5.5 Probability Values

All probability values returned by the API are hardcoded to `1.0` when using the cell-grouped format (which is the current format for all 52 weeks). The original record-based format supported real probabilities, but this data has been lost in the format conversion. The frontend handles this by treating presence/absence as binary.

---

## 6. Performance Characteristics

### 6.1 Response Sizes (Before GZip)

| Endpoint | Size | GZip Estimate |
|----------|------|---------------|
| `/api/health` | ~300 B | N/A (below 1KB threshold) |
| `/api/species` | 1.1 MB | ~120 KB |
| `/api/grid` | 37.9 MB | ~4-6 MB |
| `/api/regions` | 3.8 KB | ~1.5 KB |
| `/api/weeks/{n}` (full) | 31-54 MB | ~3-6 MB |
| `/api/weeks/{n}/summary` | 3.1-5.6 MB | ~400-700 KB |
| `/api/weeks/{n}/cells/{id}` | Variable (0-50 KB) | Variable |
| `/api/weeks/{n}/species/{code}` | Variable (0-3 MB) | Variable |

### 6.2 Memory Concerns

- **Week cache (`_week_cache`):** Caches parsed week data in memory with no eviction policy. Loading all 52 weeks would consume several GB of server memory. The TripPlanTab "Window of Opportunity" feature triggers loading all 52 weeks.
- **Species data:** Loaded at startup, ~1.1 MB in memory. Three copies: list, by-code dict, by-id dict.
- **Grid/Regions:** Loaded on each request (no caching). The grid file is 38 MB parsed into memory per request.

### 6.3 Critical Performance Issue: Window of Opportunity

The TripPlanTab fetches `/api/weeks/{n}` for ALL 52 weeks sequentially to find a single species across the year. This means:
- 52 HTTP requests
- 2.2 GB total data transfer (before compression)
- Server parses and caches all 52 weeks in memory
- Frontend receives ~52 x ~5 MB compressed = ~260 MB
- Frontend must parse 52 large JSON responses

**Recommendation:** Add a dedicated endpoint like `/api/species/{code}/year-summary` that returns the 52-week occurrence pattern for a single species. This could be pre-computed as a small file (a few KB per species).

---

## 7. CORS Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**ISSUE (Medium):** The combination of `allow_origins=["*"]` and `allow_credentials=True` is a security anti-pattern. Browsers will actually block credentialed requests when the origin is `*` (the CORS spec forbids this combination). In practice this means:
1. Cookies/auth headers won't be sent in cross-origin requests
2. Since this app has no authentication, the practical impact is zero
3. For production, `allow_origins` should be restricted to the frontend's domain
4. `allow_credentials=True` should be removed since no credentials are used

---

## 8. Content-Type and HTTP Status Codes

### 8.1 Content-Type Headers

| Endpoint | Content-Type | Correct? |
|----------|-------------|----------|
| All JSON endpoints | `application/json` | PASS (FastAPI default) |
| `/data/*` static files | Auto-detected by extension | PASS |

### 8.2 HTTP Status Codes

| Scenario | Expected | Actual |
|----------|----------|--------|
| Valid request | 200 | 200 -- PASS |
| Invalid week range | 400 | 400 -- PASS |
| Missing species | 404 | 404 -- PASS |
| Missing week data | 404 | 404 -- PASS |
| Missing grid/regions | 404 | 404 -- PASS |
| Invalid path param type | 422 | 422 -- PASS |
| Malformed JSON POST body | 422 | 422 -- PASS |
| Non-existent cell | 200 (empty) | 200 -- See note in 3.7 |
| Unknown route | 404 | 404 -- PASS |

---

## 9. Frontend-Backend API Contract

### 9.1 Contract Verification

| Frontend Expectation | Backend Delivers | Match? |
|---------------------|------------------|--------|
| `WeeklySummary = [number, number, number][]` | `[cell_id, species_count]` (2 elements) | MISMATCH -- works by accident |
| Lifer summary: `[number, number, number][]` | `[cell_id, lifer_count, 200]` (3 elements) | PASS |
| Species batch keys as numbers | Keys as strings (JSON) | Potential issue |
| Cell data: `{speciesCode, comName, probability, species_id}` | Matches | PASS |
| Full week: `{cell_id, species_id, probability}` | Matches | PASS |
| Single species: `{cell_id, probability}` | Matches | PASS |

### 9.2 Missing Frontend Error Handling

Several frontend fetch calls have minimal error handling:
- `ExploreTab.tsx` line 40: `.then()` chain with no `.catch()`
- Cell popup fetches (MapView.tsx lines 630, 676): `.catch()` only logs to console, no user feedback
- TripPlanTab window of opportunity: silently skips failed weeks

---

## 10. Missing Endpoints / Data Gaps

### 10.1 Endpoints That Would Improve Performance

1. **`GET /api/species/{code}/year-presence`** -- Return which weeks a species occurs in and in how many cells. Would eliminate the need to fetch all 52 week files for window of opportunity.

2. **`GET /api/weeks/{n}/species/{code}` using species_id** -- Currently requires speciesCode but the batch endpoint uses species_id. Inconsistent parameter types.

3. **`GET /api/cells/{cell_id}/year-summary`** -- Return species count per week for a specific cell. Would support "compare locations" without fetching full week data.

### 10.2 Data Freshness

- No `Last-Modified` or `ETag` headers on responses. Browsers cannot efficiently cache responses.
- No versioning mechanism for data files. If species data is updated, clients have no way to detect staleness.
- The health endpoint returns `version: "2.0.0"` but this is the API version, not the data version.
- No indication of when the eBird S&T data was last processed or which S&T version is being served.

### 10.3 eBird Integration Points

The backend has no direct integration with eBird APIs. All data is pre-processed offline:
- `species.json` includes `ebirdUrl` links to ebird.org species pages
- `speciesCode` values match eBird taxonomy codes
- Weekly occurrence data is derived from eBird Status & Trends abundance data
- No mechanism to update data without reprocessing and redeploying

---

## 11. Issues Summary

### Critical

| # | Issue | Impact |
|---|-------|--------|
| C1 | 84,473 cells in week data have no matching grid polygon (31% of cells invisible) | Species presence data for these cells is loaded but never displayed |
| C2 | Window of Opportunity fetches all 52 weeks (2.2 GB) for a single species query | Unusable latency and bandwidth for this feature |

### High

| # | Issue | Impact |
|---|-------|--------|
| H1 | No cache eviction for `_week_cache` -- server memory grows unbounded | Server OOM crash after loading many weeks |
| H2 | Grid endpoint parses 38 MB JSON on every request (no caching) | Slow response times, high memory churn |

### Medium

| # | Issue | Impact |
|---|-------|--------|
| M1 | Summary format mismatch: files have 2 elements, fallback computes 3, frontend types 3 | Type confusion, potential runtime errors if fallback is ever used |
| M2 | CORS allows all origins with credentials -- security anti-pattern | No practical impact currently but should be fixed for production |
| M3 | No cache headers (ETag, Last-Modified, Cache-Control) on any response | Clients re-download large static data on every page load |
| M4 | No POST body size limit on lifer-summary endpoint | Potential memory exhaustion from large payloads |

### Low

| # | Issue | Impact |
|---|-------|--------|
| L1 | All probability values hardcoded to 1.0 | Loss of data granularity (presence-only vs. abundance) |
| L2 | Non-existent cell returns 200 empty array instead of 404 | Cannot distinguish "no data" from "invalid cell" |
| L3 | `datetime.utcnow()` deprecated in Python 3.12+ | Future compatibility warning |
| L4 | `/data/*` static mount exposes all files in data directory | Low risk but could leak unintended files |
| L5 | No data version or freshness metadata | Clients cannot detect stale data |
| L6 | Species-batch response keys are strings, not ints | Potential type mismatch in frontend (JSON limitation) |

---

## 12. Recommended Test Suite

### Automated Smoke Tests

```bash
#!/bin/bash
BASE="http://localhost:8001"

echo "=== Health ==="
curl -sf "$BASE/api/health" | python -c "import json,sys; d=json.load(sys.stdin); assert d['status']=='ok'; assert d['species_count']==2490; print('PASS')"

echo "=== Species ==="
curl -sf "$BASE/api/species" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)==2490; print('PASS')"

echo "=== Summary (valid) ==="
curl -sf "$BASE/api/weeks/1/summary" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)>0; print(f'PASS ({len(d)} cells)')"

echo "=== Summary (invalid week) ==="
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/weeks/0/summary")
[ "$STATUS" = "400" ] && echo "PASS" || echo "FAIL (got $STATUS)"

echo "=== Species lookup ==="
curl -sf "$BASE/api/weeks/26/species/amerob" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)>0; print(f'PASS ({len(d)} cells)')"

echo "=== Invalid species ==="
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/weeks/1/species/INVALID")
[ "$STATUS" = "404" ] && echo "PASS" || echo "FAIL (got $STATUS)"

echo "=== Cell data ==="
curl -sf "$BASE/api/weeks/1/cells/291064" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)>0; assert 'speciesCode' in d[0]; print(f'PASS ({len(d)} species)')"

echo "=== Empty cell ==="
curl -sf "$BASE/api/weeks/1/cells/999999999" | python -c "import json,sys; d=json.load(sys.stdin); assert d==[]; print('PASS (empty)')"

echo "=== Species batch ==="
curl -sf "$BASE/api/weeks/26/species-batch?ids=1,2,3" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)==3; print('PASS')"

echo "=== Batch limit ==="
IDS=$(python -c "print(','.join(str(i) for i in range(501)))")
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/weeks/1/species-batch?ids=$IDS")
[ "$STATUS" = "400" ] && echo "PASS" || echo "FAIL (got $STATUS)"

echo "=== Lifer summary ==="
curl -sf -X POST "$BASE/api/weeks/26/lifer-summary" \
  -H "Content-Type: application/json" \
  -d '{"seen_species_codes":["amerob"]}' | python -c "import json,sys; d=json.load(sys.stdin); assert len(d)>0; print(f'PASS ({len(d)} cells)')"

echo "=== Grid ==="
curl -sf "$BASE/api/grid" | python -c "import json,sys; d=json.load(sys.stdin); assert d['type']=='FeatureCollection'; print(f'PASS ({len(d[\"features\"])} features)')"

echo "=== Regions ==="
curl -sf "$BASE/api/regions" | python -c "import json,sys; d=json.load(sys.stdin); assert len(d['features'])==5; print('PASS')"

echo "=== Non-integer week ==="
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/weeks/abc/summary")
[ "$STATUS" = "422" ] && echo "PASS" || echo "FAIL (got $STATUS)"
```

### Data Integrity Validation Script

```python
"""Validate data integrity across all backend data files."""
import json
import os

DATA_DIR = "backend/data"

# Load species
with open(f"{DATA_DIR}/species.json") as f:
    species = json.load(f)
valid_ids = {s["species_id"] for s in species}
print(f"Species: {len(species)} (IDs {min(valid_ids)}-{max(valid_ids)})")
assert len(valid_ids) == len(species), "Duplicate species IDs"

# Load grid
with open(f"{DATA_DIR}/grid_27km.geojson") as f:
    grid = json.load(f)
grid_cells = {f["properties"]["cell_id"] for f in grid["features"]}
print(f"Grid cells: {len(grid_cells)}")

# Validate each week
for week in range(1, 53):
    with open(f"{DATA_DIR}/weeks/week_{week:02d}.json") as f:
        data = json.load(f)
    with open(f"{DATA_DIR}/weeks/week_{week:02d}_summary.json") as f:
        summary = json.load(f)

    week_cells = {}
    week_sids = set()
    for entry in data:
        cell_id, sids = entry[0], entry[1]
        week_cells[cell_id] = len(sids)
        week_sids.update(sids)

    # Check species IDs are valid
    invalid = week_sids - valid_ids
    assert not invalid, f"Week {week}: invalid species IDs {invalid}"

    # Check summary consistency
    summary_map = {e[0]: e[1] for e in summary}
    assert len(summary_map) == len(week_cells), f"Week {week}: summary/data count mismatch"
    for cid, count in summary_map.items():
        assert week_cells.get(cid) == count, f"Week {week}: cell {cid} mismatch"

    # Report coverage
    in_grid = len(set(week_cells.keys()) & grid_cells)
    not_in_grid = len(set(week_cells.keys()) - grid_cells)
    print(f"Week {week:2d}: {len(week_cells):6d} cells, {len(week_sids):4d} species, "
          f"{in_grid} in grid, {not_in_grid} NOT in grid")

print("All weeks validated successfully.")
```

---

## 13. Recommendations

1. **Fix cell ID coverage gap (C1):** Investigate why 84K+ cells in weekly data don't appear in the grid GeoJSON. Either expand the grid or filter weekly data to only include grid cells.

2. **Add year-summary endpoint (C2):** Create `GET /api/species/{code}/year-presence` returning compact weekly presence data to eliminate the need to fetch all 52 week files.

3. **Add LRU eviction to week cache (H1):** Use `functools.lru_cache` or a max-size dict to prevent unbounded memory growth.

4. **Cache grid response (H2):** Load grid GeoJSON once at startup (like species data) instead of reading the 38 MB file on every request.

5. **Add Cache-Control headers (M3):** Since data is static, add `Cache-Control: public, max-age=86400` to large responses. Add `ETag` based on file modification time.

6. **Fix summary format consistency (M1):** Either update summary files to include the third element, or update the docstring and frontend types to reflect the 2-element format.

7. **Restrict CORS for production (M2):** Set specific allowed origins instead of `*`, remove `allow_credentials=True`.
