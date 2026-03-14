# Security & Privacy Evaluation - Find-A-Lifer

**Evaluator Role:** Security & Privacy Tester
**Date:** 2026-03-13
**App Version:** 2.0.0 (backend), 0.0.0 (frontend)

---

## 1. Threat Model

### 1.1 Application Profile

Find-A-Lifer is a client-heavy birding web app with a lightweight backend. Key characteristics:

- **No authentication system** -- all users are anonymous
- **No server-side user data storage** -- user data (life lists, goal lists) stored exclusively in browser IndexedDB
- **Backend is a static data server** -- serves pre-processed JSON files, performs no runtime computation beyond filtering
- **Single POST endpoint** (`/api/weeks/{n}/lifer-summary`) accepts user life list data for server-side filtering
- **Third-party dependencies:** CARTO tile servers for map basemaps, eBird URLs for species links

### 1.2 Threat Actors

| Actor | Motivation | Capability |
|-------|-----------|------------|
| Opportunistic attacker | Exploit open API, scrape data | Low-moderate |
| Malicious user | Abuse API, DoS | Low |
| Network attacker (MitM) | Intercept data in transit | Moderate (if HTTP used) |
| Shared-device user | Access another user's life list in browser | Low |
| Poaching/collecting rings | Locate endangered/restricted species | Moderate |

### 1.3 Assets to Protect

| Asset | Sensitivity | Location |
|-------|------------|----------|
| User life list (species seen) | Low-Medium (personal birding data) | IndexedDB (client) |
| User goal lists | Low | IndexedDB (client) |
| Dark mode / active list preferences | Negligible | localStorage (client) |
| Species distribution data (weekly occurrence) | Medium (eBird S&T derivative) | Backend JSON files |
| Endangered species location data | HIGH | Backend JSON + API responses |
| Grid cell coordinates (species locations) | Medium | Backend GeoJSON + API |

---

## 2. Vulnerability Assessment

### 2.1 CORS Configuration -- CRITICAL

**File:** `backend/main.py`, lines 40-46

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Issue:** The CORS policy is maximally permissive -- `allow_origins=["*"]` combined with `allow_credentials=True`. This allows any website to make credentialed cross-origin requests to the API. While the app has no authentication, this is still problematic:

- Any malicious website a user visits could silently query the entire species distribution dataset through the user's browser.
- If authentication is ever added, this becomes an immediate credential theft vector.
- The combination of `allow_origins=["*"]` with `allow_credentials=True` is actually rejected by most browsers (credentials require a specific origin, not wildcard), but the intent shows a lack of security consideration.

**Severity:** HIGH (for production deployment), MEDIUM (for current dev-only use)

**Recommendation:** Restrict `allow_origins` to the frontend origin (e.g., `["http://localhost:5173"]` for dev, the production domain for deployment). Remove `allow_credentials=True` since no authentication exists.

---

### 2.2 Static File Mount -- Path Traversal Risk

**File:** `backend/main.py`, lines 371-372

```python
if DATA_DIR.exists():
    app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data")
```

**Issue:** The entire `backend/data/` directory is mounted as a static file server at `/data`. FastAPI's `StaticFiles` middleware uses Starlette's implementation which does sanitize path traversal attempts (blocking `../`), so direct path traversal is mitigated by the framework. However:

- ALL files in the data directory are publicly accessible, including any files that may be added later.
- There is no access control or rate limiting on these files.
- The data directory contains species distribution data derived from eBird S&T, which has licensing restrictions.

**Severity:** MEDIUM

**Recommendation:** Either remove the static mount if not needed (all data is served through typed API endpoints already), or explicitly allowlist which file patterns can be served.

---

### 2.3 Sensitive Species Data Exposure -- HIGH

**Files:** `backend/data/species.json`, `frontend/src/components/types.ts`

The species data includes:
- `conservStatus` -- Conservation status (Endangered, Critically Endangered, Vulnerable, etc.)
- `isRestrictedRange` -- Boolean flag indicating restricted-range species
- Weekly occurrence data maps species to specific 27km grid cells

**Issue:** The API serves the complete species dataset including conservation status and restricted-range flags alongside precise location data (grid cell coordinates). For endangered and restricted-range species, this creates a comprehensive map of where sensitive species can be found and when. This data is served with no access controls, no rate limiting, and via a wildcard CORS policy.

The `/api/weeks/{n}/cells/{cellId}` endpoint returns all species present at a specific location, making it trivial to identify cells containing endangered species.

**Severity:** HIGH

**Recommendation:**
1. Consider filtering or redacting precise location data for species flagged as Critically Endangered or Endangered.
2. Implement rate limiting on the API to prevent bulk data scraping.
3. Add a robots.txt and appropriate caching headers to discourage automated harvesting.
4. Review eBird S&T data usage terms for restrictions on redistributing location-specific occurrence data.

---

### 2.4 User Life List Sent to Server -- MEDIUM

**File:** `frontend/src/components/MapView.tsx`, line 1034-1037

```typescript
const response = await fetch(`/api/weeks/${currentWeek}/lifer-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seen_species_codes: Array.from(seenSpecies) }),
})
```

**Issue:** The user's complete life list (all species codes they have marked as seen) is sent to the backend on every density map load. This is the only endpoint where user data leaves the browser. While the backend does not log or persist this data, it represents a privacy consideration:

- Server access logs may capture POST request metadata.
- A compromised or malicious server could log the full life list.
- The life list reveals personal birding history and activity patterns.

**Severity:** MEDIUM

**Recommendation:** Consider performing the lifer subtraction client-side instead of server-side, since the client already has both the life list and the species data. This would eliminate the need to transmit personal data to the server entirely.

---

### 2.5 Input Validation Gaps

**File:** `backend/main.py`

**Week number validation (GOOD):** All week endpoints properly validate `1 <= week_number <= 52`. This is consistently applied.

**Species batch endpoint:** The `/api/weeks/{n}/species-batch` endpoint limits to 500 IDs and validates integer parsing. This is adequate.

**Lifer summary endpoint (CONCERN):** The POST body at `/api/weeks/{n}/lifer-summary` accepts `seen_species_codes` without size limits. An attacker could send an extremely large array (millions of entries) to cause memory exhaustion.

```python
body = await request.json()
seen_codes = set(body.get("seen_species_codes", []))
```

**Cell ID validation (MISSING):** The `/api/weeks/{n}/cells/{cell_id}` endpoint accepts any integer for `cell_id` without validation. While this only returns an empty array for invalid IDs (not a crash), it lacks explicit bounds checking.

**Species code validation (GOOD):** Species code lookups use dictionary `.get()` which safely returns None/404.

**Severity:** LOW-MEDIUM

**Recommendation:** Add size limits to the lifer-summary POST body (e.g., max 5,000 species codes). Add cell_id range validation.

---

### 2.6 IndexedDB Security -- Data at Rest

**Files:** `frontend/src/contexts/LifeListContext.tsx`, `frontend/src/lib/goalListsDB.ts`

**Assessment:**
- IndexedDB data is stored unencrypted on disk in the browser profile directory.
- IndexedDB is subject to same-origin policy -- only the app's origin can access it.
- No sensitive financial or identity data is stored -- only species codes, common names, and timestamps.
- Data persists indefinitely unless explicitly cleared by the user.

**Positive:** The `clearAllSpecies()` function exists for data deletion. The `ProfileTab` provides export-before-delete workflow.

**Concerns:**
- On shared computers, another user with access to the same browser profile can view the life list.
- No "export then wipe on logout" workflow since there are no user accounts.
- The `dateAdded` field records when each species was marked as seen, creating a timeline of user activity.

**Severity:** LOW (appropriate for the data sensitivity level)

**Recommendation:** Document in user-facing text that data is stored locally and visible to anyone with access to the browser. Consider adding a "lock" or "clear on exit" option for shared-device scenarios.

---

### 2.7 XSS / Injection Attack Surface

**Assessment:** GOOD

- **No `dangerouslySetInnerHTML`** usage found anywhere in the codebase.
- **No `innerHTML`** assignments found.
- **No `eval()` or `new Function()`** usage found.
- **No `document.write()`** or `window.open()`** usage found.
- React's JSX auto-escapes rendered content, providing strong XSS protection by default.
- Species names and other data from the API are rendered through React's safe rendering pipeline.
- The eBird URL in SpeciesInfoCard uses `rel="noopener noreferrer"` on external links (line 123).

**One minor concern:** The CSV import in ProfileTab.tsx parses user-uploaded files. While the parsed data flows through React's safe rendering, malformed CSVs could cause unexpected behavior. The current parsing uses simple `.split(',')` which doesn't handle quoted fields with commas correctly (partial fix exists for export but not import).

**Severity:** LOW

---

### 2.8 Content Security Policy -- MISSING

**File:** `frontend/index.html`

**Issue:** No Content Security Policy (CSP) headers or meta tags are configured. The index.html is minimal with no security headers.

Without CSP:
- If an XSS vulnerability were found, there would be no defense-in-depth.
- Inline scripts could execute without restriction.
- External resources could be loaded from any domain.

**Severity:** MEDIUM

**Recommendation:** Add a CSP meta tag or configure CSP headers. A suitable policy:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https://*.basemaps.cartocdn.com https://ebird.org data: blob:;
connect-src 'self' https://*.basemaps.cartocdn.com;
font-src 'self';
```

---

### 2.9 HTTPS Enforcement -- NOT CONFIGURED

**Issue:** The development server runs on HTTP (localhost:5173 proxying to localhost:8001). The backend binds to `0.0.0.0:8001` which accepts connections from any network interface.

- No HTTPS configuration exists for production.
- No HSTS headers are set.
- The `0.0.0.0` bind address in `main.py` (line 377) exposes the API to the local network.

**Severity:** HIGH (for any non-localhost deployment)

**Recommendation:**
1. Change the default bind address from `0.0.0.0` to `127.0.0.1` for development.
2. For production, deploy behind a reverse proxy (nginx, Caddy) with TLS termination.
3. Add HSTS headers in production configuration.

---

### 2.10 Third-Party Data Exposure

**File:** `frontend/src/components/MapView.tsx`, lines 431-471

**CARTO Tile Servers:**
- Map tiles are loaded from `basemaps.cartocdn.com` (subdomains a, b, c).
- Every map pan/zoom sends tile requests to CARTO, revealing the user's geographic area of interest.
- CARTO receives the user's IP address, user agent, and the specific map region being viewed.
- This is standard for web mapping and generally acceptable, but users should be aware.

**eBird Links:**
- Species info cards link to `ebird.org/species/{code}` with `target="_blank"` and `rel="noopener noreferrer"`.
- The `noopener noreferrer` attributes correctly prevent reverse tabnapping and referrer leakage.

**Severity:** LOW (standard web mapping behavior)

**Recommendation:** Mention in a privacy notice that map tiles are loaded from CARTO. Consider self-hosting tiles for maximum privacy, though this adds significant infrastructure cost.

---

### 2.11 Denial of Service Vectors

**Issue:** No rate limiting exists on any endpoint. The backend caches week data in memory (`_week_cache`, `lru_cache`) but has no eviction policy, and 52 weeks of data can all be loaded into memory simultaneously.

Specific concerns:
- The `/api/weeks/{n}` endpoint converts cell-grouped data to flat records, potentially generating very large response arrays (2,490 species x 312 cells = up to 776,880 records per week).
- The `/api/grid` endpoint serves the full GeoJSON grid (312 cells with polygon geometries), which can be large.
- The lifer-summary POST endpoint does O(n*m) work where n = cells and m = species per cell.

**Severity:** LOW-MEDIUM (acceptable for a personal/educational app, risky for public deployment)

**Recommendation:** Add rate limiting middleware (e.g., `slowapi` for FastAPI). Consider response size limits.

---

### 2.12 Dependency Vulnerability Assessment

**Backend (Python):**
- `fastapi>=0.100.0` -- Very loose version pin. Current FastAPI is ~0.115+. Should pin more tightly.
- `uvicorn>=0.23.0` -- Similarly loose.
- No known critical CVEs in these packages at these versions, but the loose pinning means untested versions could be installed.

**Frontend (Node):**
- React 19.2.0, Vite 7.2.4, MapLibre GL 5.17.0 -- all recent versions.
- `idb 8.0.3` -- lightweight IndexedDB wrapper, minimal attack surface.
- No known critical vulnerabilities in the listed dependencies at these versions.
- Development dependencies (Playwright, testing-library, eslint) are not shipped to production.

**Severity:** LOW

**Recommendation:** Run `npm audit` regularly. Pin Python dependencies more tightly. Consider using Dependabot or similar for automated vulnerability scanning.

---

### 2.13 Data Import/Export Security

**File:** `frontend/src/components/ProfileTab.tsx`

**CSV Import:**
- Accepts `.csv` files via file input (restricted by `accept=".csv"`).
- File content is read as text and parsed client-side.
- Species matching uses case-insensitive string comparison against known species names.
- No file size limit is enforced -- a very large file could cause the browser tab to hang.
- CSV parsing is naive (`.split(',')`) and does not handle quoted fields, escaped commas, or newlines within fields. This is a data integrity issue, not a security issue.

**CSV Export:**
- Generates CSV client-side using `Blob` and `URL.createObjectURL`.
- Partial comma escaping exists (wraps fields containing commas in quotes) but does not handle fields containing quotes.
- The export filename is hardcoded (`life-list-export.csv`), preventing filename injection.

**Severity:** LOW

---

### 2.14 eBird Data Licensing Compliance

**Issue:** The app uses eBird Status & Trends data, which has specific terms of use. The species distribution data (weekly occurrence by grid cell) is derived from this dataset and served openly via the API. Key concerns:

- eBird S&T data typically requires attribution and may restrict redistribution.
- Serving the processed data via a public API could violate data use agreements.
- The `photoUrl` field in species.json is empty for all checked species, avoiding photo copyright issues.

**Severity:** MEDIUM (legal/compliance, not technical security)

**Recommendation:** Review eBird Status & Trends data use terms. Add appropriate attribution. Consider restricting API access if redistribution is not permitted.

---

### 2.15 Privacy Compliance (GDPR/CCPA)

**Assessment:**

The app collects minimal personal data:
- **No user accounts** -- no email, name, or identity data collected.
- **No server-side user data** -- all personal data (life lists) stays in the browser.
- **No analytics/tracking scripts** -- no Google Analytics, no pixel trackers.
- **No cookies** -- only IndexedDB and localStorage used.
- **Third-party tile requests** leak IP addresses to CARTO.

**GDPR Considerations:**
- The life list constitutes personal data under GDPR (it reveals a natural person's hobbies and locations visited).
- Since data is stored entirely client-side and not transmitted to/from the server (except the lifer-summary POST), the app's GDPR exposure is minimal.
- The lifer-summary POST transmits personal data (species seen) to the server -- this should be documented.
- No cookie consent banner is needed (no cookies used).

**CCPA Considerations:**
- No personal information is "sold" or shared with third parties (beyond CARTO tile requests).
- Minimal compliance burden.

**Severity:** LOW

**Recommendation:** Add a brief privacy notice explaining what data is stored locally, that CARTO receives tile requests, and that the lifer-summary endpoint receives (but does not store) the life list.

---

## 3. Prioritized Remediation Recommendations

### Priority 1 -- Critical (Address Before Any Public Deployment)

| # | Issue | Effort |
|---|-------|--------|
| 1 | Restrict CORS origins from `*` to specific frontend origin | Low |
| 2 | Change backend bind from `0.0.0.0` to `127.0.0.1` for dev | Low |
| 3 | Configure HTTPS for any non-localhost deployment | Medium |

### Priority 2 -- High (Address Before Wider Use)

| # | Issue | Effort |
|---|-------|--------|
| 4 | Implement rate limiting on API endpoints | Low-Medium |
| 5 | Redact or coarsen location data for endangered species | Medium-High |
| 6 | Add Content Security Policy headers | Low |
| 7 | Add size limit to lifer-summary POST body | Low |
| 8 | Move lifer subtraction to client-side to eliminate personal data transmission | Medium |

### Priority 3 -- Medium (Good Practice)

| # | Issue | Effort |
|---|-------|--------|
| 9 | Remove or restrict the `/data` static file mount | Low |
| 10 | Add a privacy notice/policy page | Low |
| 11 | Pin Python dependencies more tightly | Low |
| 12 | Review eBird S&T data licensing compliance | Low (research) |
| 13 | Add file size limit on CSV import | Low |

### Priority 4 -- Low (Nice to Have)

| # | Issue | Effort |
|---|-------|--------|
| 14 | Add cell_id range validation | Low |
| 15 | Improve CSV parsing robustness (handle quoted fields) | Low |
| 16 | Add "clear data on exit" option for shared devices | Medium |
| 17 | Self-host map tiles for maximum privacy | High |

---

## 4. Summary

Find-A-Lifer has a **low overall attack surface** due to its architecture: no authentication, no server-side user data storage, and a read-mostly static data API. The frontend follows React security best practices with no XSS vectors identified.

The primary security concerns are:

1. **Overly permissive CORS** -- trivial to fix, should be addressed immediately.
2. **Sensitive species data exposure** -- endangered species locations are served without access controls, which has ethical implications for wildlife conservation.
3. **Missing security headers** (CSP, HSTS) -- standard hardening that should be applied before any public deployment.
4. **Life list transmission** to the server via the lifer-summary endpoint -- the only point where personal data leaves the browser, and could be eliminated by moving the computation client-side.

For its current scope as a development/personal project, the security posture is acceptable. For public deployment, the Priority 1 and 2 items should be addressed.
