# Find-A-Lifer

Birding PWA that helps users find "life birds" (species they've never seen). Combines eBird data with an interactive map to explore species distributions by week, plan trips, and track progress.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite, MapLibre GL JS, Tailwind CSS, IndexedDB (via `idb`)
- **Data:** Pre-computed static JSON files served from `/data/*` — no backend at runtime
- **PWA:** vite-plugin-pwa with Workbox service worker for offline support
- **Backend (dev only):** Python 3.11+ FastAPI — used for data generation, not served at runtime
- **Data Pipeline:** R scripts using `auk` package to process eBird Basic Dataset

## Development Setup

```bash
# Generate static data files (one-time, from backend data)
python scripts/precompute_static.py

# Start frontend dev server (serves static files from public/data/)
npm run dev --prefix frontend
```

## Architecture

### Static Data Model
All data is pre-computed and served as static JSON from `frontend/public/data/`:
- `species.json` — species metadata (2,490 species)
- `grid.geojson` — grid cell geometry
- `regions.geojson` — region polygons
- `weeks/week_XX_summary.json` — per-cell species counts (52 files)
- `weeks/week_XX_cells.json` — full cell→species lists (52 files)
- `species-weeks/{code}.json` — per-species 52-week occurrence data

### Data Cache (`dataCache.ts`)
Central hub for all data access. Provides:
- Cached fetchers: `fetchSpecies()`, `fetchGrid()`, `fetchRegions()`, `fetchWeekSummary()`, `fetchWeekCells()`, `fetchSpeciesWeeks()`
- Client-side computation: `computeLiferSummary()`, `getCellSpecies()`, `getSpeciesCells()`, `getSpeciesBatch()`

### Frontend
- `SidePanel.tsx` contains all 6 tab components inline (~5,280 lines)
- Module-level `speciesMetaCache` + `speciesByIdCache` in MapView.tsx
- Map click handlers use React refs to avoid stale closures
- `goalSpeciesIdSetVersion` counter triggers re-renders after async ID set rebuild
- `createPortal` for SpeciesInfoCard modals
- IndexedDB v2: `find-a-lifer-db` with stores `lifeList` and `goalLists`

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Root state management |
| `frontend/src/components/MapView.tsx` | Map, grid overlay, 4 heatmap view modes, popups |
| `frontend/src/components/TripPlanTab.tsx` | Hotspots, Window of Opportunity, Compare, Location modes |
| `frontend/src/lib/dataCache.ts` | Central data cache + client-side computation |
| `frontend/src/contexts/LifeListContext.tsx` | IndexedDB CRUD for life list |
| `scripts/precompute_static.py` | Generates static data from backend data |
| `data-pipeline/` | R scripts for eBird EBD → static data pipeline |

## References

- Full project specification: `app_spec.txt`
- Implementation progress: `claude-progress.txt`
- Test evaluations: `test-evaluations/`
