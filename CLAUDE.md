# Find-A-Lifer

Birding PWA that helps users find "life birds" (species they've never seen). Combines eBird data with an interactive map to explore species distributions by week, plan trips, and track progress.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite, MapLibre GL JS, Tailwind CSS, IndexedDB (via `idb`)
- **Data:** Pre-computed static JSON files served from `/data/*` — no backend at runtime
- **PWA:** vite-plugin-pwa with Workbox service worker for offline support
- **Pipeline:** Python 3.11+ scripts to process eBird Basic Dataset into static JSON

## Project Structure

```
find-a-lifer/
├── frontend/               # React PWA (the app)
│   ├── public/data/        # Pre-computed static JSON (multi-resolution: r3/, r4/, r5/)
│   └── src/
├── pipeline/               # Data processing scripts
│   ├── process_ebd.py      # Incremental EBD → static JSON pipeline
│   ├── label_cells.py      # City name labels for grid cells
│   └── reference/          # cities500.txt, ebird_taxonomy.json
├── data/
│   ├── archive/            # Pipeline state (incremental counts, ~50MB)
│   └── downloads/          # Raw eBird EBD zip/gz files (cloud-save these)
└── docs/                   # Specs, progress notes, old R scripts
```

## Development Setup

```bash
# Process new eBird data (incremental — archives intermediate counts)
python pipeline/process_ebd.py

# Label grid cells with city names
python pipeline/label_cells.py

# Rebuild output from archive only (no new EBD files needed)
python pipeline/process_ebd.py --rebuild

# Start frontend dev server
npm run dev --prefix frontend
```

## Architecture

### Multi-Resolution H3 Hexagons
Three resolution levels with adaptive zoom switching:
- **Res 3** (~120km hexes): zoom 0–5.5
- **Res 4** (~45km hexes): zoom 5.5–7.5
- **Res 5** (~15km hexes): zoom 7.5+

### Static Data Model
All data is pre-computed per resolution in `frontend/public/data/r{3,4,5}/`:
- `grid.geojson` — H3 hex cell geometry with city labels
- `weeks/week_XX_summary.json` — per-cell species counts, max frequency, checklist counts
- `weeks/week_XX_cells.json` — full cell→species lists with reporting frequencies
- `species-weeks/{code}.json` — per-species 52-week occurrence data
- `resolutions.json` — resolution metadata and zoom thresholds

Root-level `species.json` and `regions.geojson` are shared across resolutions.

### Data Cache (`dataCache.ts`)
Central hub for all data access. Provides:
- Resolution-aware fetchers: `fetchGrid(res)`, `fetchWeekSummary(week, res)`, `fetchWeekCells(week, res)`, `fetchSpeciesWeeks(code, res)`
- Client-side computation: `computeLiferSummary()`, `computeCombinedProbability()`, `getCellSpecies()`, `getSpeciesCells()`, `getSpeciesBatch()`
- `CellSpeciesData` type: `{ speciesIds: number[], freqs: number[] | null }` — per-species reporting frequencies

### View Modes
- **Richness**: Species count per cell (subtracts life list for "lifer density")
- **Frequency**: Combined probability of seeing at least one lifer: P = 1 - ∏(1 - freq_i)
- **Range**: Single species reporting frequency across cells
- **Goals**: Goal list species density per cell

### Frontend
- `SidePanel.tsx` delegates to 6 tab components: ExploreTab, SpeciesTab, GoalBirdsTab, TripPlanTab, ProgressTab, ProfileTab
- Module-level `speciesMetaCache` + `speciesByIdCache` in MapView.tsx
- Map click handlers use React refs to avoid stale closures
- `goalSpeciesIdSetVersion` counter triggers re-renders after async ID set rebuild
- IndexedDB v2: `find-a-lifer-db` with stores `lifeList` and `goalLists`

### Incremental Pipeline
`pipeline/process_ebd.py` supports batch processing:
1. Place eBird EBD files in `data/downloads/`
2. Run `python pipeline/process_ebd.py` — processes new regions, archives counts
3. Delete raw files to free space, process more regions later
4. Archive JSON files in `data/archive/` preserve all intermediate counts

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Root state management |
| `frontend/src/components/MapView.tsx` | Map, grid overlay, 4 heatmap view modes, popups |
| `frontend/src/components/TripPlanTab.tsx` | Hotspots, Window of Opportunity, Compare, Location modes |
| `frontend/src/lib/dataCache.ts` | Central data cache + client-side computation |
| `frontend/src/contexts/LifeListContext.tsx` | IndexedDB CRUD for life list |
| `pipeline/process_ebd.py` | Incremental EBD → static JSON pipeline |
| `pipeline/label_cells.py` | GeoNames city labels for grid cells |

## References

- Full project specification: `docs/app_spec.txt`
- Implementation progress: `docs/claude-progress.txt`
- Test evaluations: `docs/test-evaluations/`
