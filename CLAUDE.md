# Find-A-Lifer

Birding web app that helps users find "life birds" (species they've never seen). Combines eBird Status & Trends data with an interactive map to explore species distributions by week, plan trips, and track progress.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite, MapLibre GL JS, Tailwind CSS, IndexedDB (via `idb`)
- **Backend:** Python 3.11+ FastAPI — lightweight static data server, no runtime computation
- **Data:** Pre-processed JSON files (2,490 species, 312 grid cells, 52 weekly occurrence files)

## Development Setup

```bash
# Start both servers (backend :8000, frontend :5173)
./init.sh

# Or manually:
python -m uvicorn backend.main:app --port 8000 --reload &
npm run dev --prefix frontend
```

## Key Architecture

- `SidePanel.tsx` contains all 6 tab components inline (~5,280 lines) — refactor planned
- Module-level `speciesMetaCache` in MapView.tsx avoids re-fetching species data
- Map click handlers use React refs (`viewModeRef`, `weeklyDataRef`, etc.) to avoid stale closures
- `goalSpeciesIdSetVersion` counter (not boolean) triggers re-renders after async ID set rebuild
- `createPortal` for SpeciesInfoCard modals to escape z-index/overflow issues
- IndexedDB v2: `find-a-lifer-db` with stores `lifeList` (keyPath: `speciesCode`) and `goalLists` (keyPath: `id`)
- Active goal list ID persisted in localStorage key `activeGoalListId`

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Root state management (week, viewMode, darkMode, goals, etc.) |
| `frontend/src/components/SidePanel.tsx` | All 6 tabs: Explore, Species, Goal Birds, Trip Plan, Progress, Profile |
| `frontend/src/components/MapView.tsx` | MapLibre map, grid overlay, 4 heatmap view modes, popups |
| `frontend/src/components/TopBar.tsx` | Header, server status indicator, dark mode toggle |
| `frontend/src/contexts/LifeListContext.tsx` | IndexedDB CRUD for life list |
| `frontend/src/lib/goalListsDB.ts` | IndexedDB CRUD for goal lists |
| `backend/main.py` | FastAPI: /api/health, /api/species, /api/weeks/{1-52}, /api/grid, /api/regions |

## References

- Full project specification: `app_spec.txt`
- Implementation progress & breadcrumbs: `claude-progress.txt`
- Implementation plan: `.claude/plans/golden-moseying-beacon.md`
