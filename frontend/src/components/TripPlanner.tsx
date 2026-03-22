import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useMapControls } from '../contexts/MapControlsContext'
import { useLifeList } from '../contexts/LifeListContext'
import type { Species } from './types'
import { computePlannerResults, type PlannerResult } from '../lib/dataCache'
import { getWeekLabel, getCellCoordinates, formatProbability, getProbabilityColor } from './tripPlanUtils'

interface TripPlannerProps {
  speciesData: Species[]
  speciesById: Map<number, Species>
  cellLabels: Map<number, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gridData: any
  seenSpecies: Set<string>
  goalLists: Array<{ id: string; name: string; speciesCodes: string[] }>
}

type ViewMode = 'location' | 'week'

interface GroupedByLocation {
  cellId: number
  cellName: string
  coordinates: [number, number]
  bestWeek: number
  bestProb: number
  bestLiferCount: number
  bestExpected: number
  weeks: PlannerResult[]
}

interface GroupedByWeek {
  week: number
  bestCellId: number
  bestCellName: string
  bestProb: number
  bestLiferCount: number
  bestExpected: number
  cells: PlannerResult[]
}

export default function TripPlanner({
  speciesData,
  speciesById,
  cellLabels,
  gridData,
  seenSpecies,
  goalLists,
}: TripPlannerProps) {
  const {
    state: { currentWeek, viewMode: mapViewMode },
    setCurrentWeek,
    setSelectedLocation,
    setSelectedRegion,
    setViewMode: setMapViewMode,
  } = useMapControls()
  const { tripMemberLists } = useLifeList()

  // Filters
  const [regionId, setRegionIdState] = useState<string>(() => localStorage.getItem('homeRegion') || '')
  const setRegionId = useCallback((id: string) => {
    setRegionIdState(id)
    // Sync to MapControlsContext so the map zooms to the region
    setSelectedRegion(id || null)
  }, [setSelectedRegion])
  const [startWeek, setStartWeek] = useState(() => Math.max(1, currentWeek - 4))
  const [endWeek, setEndWeek] = useState(() => Math.min(52, currentWeek + 4))
  const [goalListId, setGoalListId] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('location')
  const [sortBy, setSortBy] = useState<'expected' | 'chance' | 'count'>('expected')
  const [groupMode, setGroupMode] = useState<'shared' | 'total' | 'balanced'>('shared')

  // Results
  const [results, setResults] = useState<PlannerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Build seenSpeciesIds (number set) from string set
  const seenSpeciesIds = useMemo(() => {
    const ids = new Set<number>()
    for (const sp of speciesData) {
      if (seenSpecies.has(sp.speciesCode)) ids.add(sp.species_id)
    }
    return ids
  }, [speciesData, seenSpecies])

  // Build target species IDs from selected goal list
  const targetSpeciesIds = useMemo(() => {
    if (!goalListId) return null
    const list = goalLists.find(l => l.id === goalListId)
    if (!list) return null
    const ids = new Set<number>()
    for (const sp of speciesData) {
      if (list.speciesCodes.includes(sp.speciesCode)) ids.add(sp.species_id)
    }
    return ids
  }, [goalListId, goalLists, speciesData])

  // Cell coordinates from grid
  const cellCoords = useMemo(() => getCellCoordinates(gridData), [gridData])

  // Compute results when filters change
  const compute = useCallback(async () => {
    if (speciesData.length === 0 || !gridData) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setExpandedId(null)
    try {
      const r = await computePlannerResults(
        seenSpeciesIds,
        speciesById,
        cellLabels,
        cellCoords,
        [startWeek, endWeek],
        regionId || null,
        targetSpeciesIds,
        4,
        ac.signal,
      )
      if (!ac.signal.aborted) {
        setResults(r)
      }
    } catch (err) {
      if (!ac.signal.aborted) console.error('Planner error:', err)
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [seenSpeciesIds, speciesById, cellLabels, cellCoords, startWeek, endWeek, regionId, targetSpeciesIds, speciesData, gridData])

  useEffect(() => {
    compute()
    return () => abortRef.current?.abort()
  }, [compute])

  // Sort comparator based on selected sort
  // Re-score results for group optimization modes
  // 'shared': use existing scores (union of all members' lists — species nobody has seen)
  // 'total': sum expected lifers across all members (a species counts for each member who hasn't seen it)
  // 'balanced': use the minimum member's expected lifers (maximize the worst experience)
  const scoredResults = useMemo(() => {
    if (!tripMemberLists || tripMemberLists.length <= 1 || groupMode === 'shared') return results
    return results.map(r => {
      // For each species in the result, count how many members haven't seen it
      let totalExpected = 0
      let minMemberExpected = Infinity
      const memberExpecteds: number[] = []

      for (const member of tripMemberLists) {
        let memberExp = 0
        for (const sp of r.topSpecies) {
          if (!member.codes.has(sp.speciesCode)) {
            memberExp += sp.freq
          }
        }
        memberExpecteds.push(memberExp)
        totalExpected += memberExp
        if (memberExp < minMemberExpected) minMemberExpected = memberExp
      }

      return {
        ...r,
        expectedLifers: groupMode === 'total' ? totalExpected : minMemberExpected,
        liferCount: groupMode === 'total'
          ? r.topSpecies.reduce((sum, sp) => sum + tripMemberLists.filter(m => !m.codes.has(sp.speciesCode)).length, 0)
          : Math.min(...memberExpecteds.map((_, mi) => r.topSpecies.filter(sp => !tripMemberLists[mi].codes.has(sp.speciesCode)).length)),
      }
    })
  }, [results, tripMemberLists, groupMode])

  const sortFn = useCallback((a: { bestProb: number; bestLiferCount: number; bestExpected: number }, b: { bestProb: number; bestLiferCount: number; bestExpected: number }) => {
    if (sortBy === 'chance') return b.bestProb - a.bestProb
    if (sortBy === 'count') return b.bestLiferCount - a.bestLiferCount
    return b.bestExpected - a.bestExpected // 'expected' — default
  }, [sortBy])

  // Group results by location
  const byLocation = useMemo((): GroupedByLocation[] => {
    const map = new Map<number, GroupedByLocation>()
    for (const r of scoredResults) {
      const existing = map.get(r.cellId)
      if (!existing || r.expectedLifers > existing.bestExpected) {
        map.set(r.cellId, {
          cellId: r.cellId,
          cellName: r.cellName,
          coordinates: r.coordinates,
          bestWeek: r.week,
          bestProb: r.combinedProb,
          bestLiferCount: r.liferCount,
          bestExpected: r.expectedLifers,
          weeks: existing ? [...existing.weeks, r] : [r],
        })
      } else {
        existing.weeks.push(r)
      }
    }
    return Array.from(map.values())
      .sort(sortFn)
      .slice(0, 30)
  }, [scoredResults, sortFn])

  // Group results by week
  const byWeek = useMemo((): GroupedByWeek[] => {
    const map = new Map<number, GroupedByWeek>()
    for (const r of scoredResults) {
      const existing = map.get(r.week)
      if (!existing || r.expectedLifers > existing.bestExpected) {
        map.set(r.week, {
          week: r.week,
          bestCellId: r.cellId,
          bestCellName: r.cellName,
          bestProb: r.combinedProb,
          bestLiferCount: r.liferCount,
          bestExpected: r.expectedLifers,
          cells: existing ? [...existing.cells, r] : [r],
        })
      } else {
        existing.cells.push(r)
      }
    }
    return Array.from(map.values())
      .sort(sortFn)
  }, [scoredResults, sortFn])

  const handleShowOnMap = (cellId: number, coordinates: [number, number], week?: number) => {
    setSelectedLocation({ cellId, coordinates, name: cellLabels.get(cellId) })
    if (week) setCurrentWeek(week)
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pt-2">
      {/* Filters */}
      <div className="space-y-2 px-0.5">
        {/* Region */}
        <div className="flex items-center gap-2">
          <label htmlFor="planner-region" className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Region</label>
          <select
            id="planner-region"
            value={regionId}
            onChange={e => setRegionId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All Regions</option>
            <optgroup label="Northern (Canada & Alaska)">
              <option value="northern">All Northern</option>
              <option value="ca-west">Western Canada &amp; Alaska</option>
              <option value="ca-central">Central Canada</option>
              <option value="ca-east">Eastern Canada &amp; North Atlantic Islands</option>
            </optgroup>
            <optgroup label="Continental US">
              <option value="continental-us">All Continental US</option>
              <option value="us-ne">Northeastern US</option>
              <option value="us-se">Southeastern US</option>
              <option value="us-mw">Midwestern US</option>
              <option value="us-sw">Southwestern US</option>
              <option value="us-west">Western US</option>
              <option value="us-rockies">US Rockies</option>
            </optgroup>
            <optgroup label="Hawaii">
              <option value="hawaii">Hawaii</option>
            </optgroup>
            <optgroup label="Mexico & Central America">
              <option value="mex-central">All Mexico &amp; Central America</option>
              <option value="mx-north">Northern Mexico</option>
              <option value="mx-south">Southern Mexico</option>
              <option value="ca-c-north">Upper Central America</option>
              <option value="ca-c-south">Southern Central America</option>
            </optgroup>
            <optgroup label="Caribbean">
              <option value="caribbean">All Caribbean</option>
              <option value="atlantic-west">Western Atlantic Islands</option>
              <option value="caribbean-greater">Greater Antilles</option>
              <option value="caribbean-lesser">Lesser Antilles</option>
            </optgroup>
          </select>
        </div>

        {/* Week range */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Date Range</label>
            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 tabular-nums">
              {getWeekLabel(startWeek)} – {getWeekLabel(endWeek)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-10">From</span>
            <input
              type="range" min={1} max={52} value={startWeek}
              onChange={e => setStartWeek(Math.min(Number(e.target.value), endWeek))}
              className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              title={`Start: ${getWeekLabel(startWeek)}`}
            />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 w-10">To</span>
            <input
              type="range" min={1} max={52} value={endWeek}
              onChange={e => setEndWeek(Math.max(Number(e.target.value), startWeek))}
              className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              title={`End: ${getWeekLabel(endWeek)}`}
            />
          </div>
        </div>

        {/* Goal list filter */}
        <div className="flex items-center gap-2">
          <label htmlFor="planner-goal" className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Species</label>
          <select
            id="planner-goal"
            value={goalListId}
            onChange={e => {
              const val = e.target.value
              setGoalListId(val)
              // Switch map view: goal list → goal-birds mode, all lifers → density mode
              if (val && mapViewMode !== 'goal-birds') setMapViewMode('goal-birds')
              else if (!val && mapViewMode === 'goal-birds') setMapViewMode('density')
            }}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All Lifers</option>
            {goalLists.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.speciesCodes.length})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Group optimization — only shown when a group trip is active with 2+ members */}
      {tripMemberLists && tripMemberLists.length >= 2 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Optimize for</label>
          <select
            value={groupMode}
            onChange={e => setGroupMode(e.target.value as 'shared' | 'total' | 'balanced')}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="shared">Everyone's New Birds</option>
            <option value="total">Most Birds for the Group</option>
            <option value="balanced">Balanced Experience</option>
          </select>
        </div>
      )}

      {/* Sort + View toggle */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Sort by</label>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'expected' | 'chance' | 'count')}
          className="flex-1 min-w-0 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
        >
          <option value="expected">Expected Lifers</option>
          <option value="chance">Chance of Any Lifer</option>
          <option value="count">Most Possible Lifers</option>
        </select>
      </div>
      <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-1 grid grid-cols-2 gap-1" role="tablist">
        {(['location', 'week'] as const).map(m => (
          <button
            key={m}
            role="tab"
            aria-selected={viewMode === m}
            onClick={() => { setViewMode(m); setExpandedId(null) }}
            className={`py-2 text-xs font-semibold rounded-md text-center transition-all ${
              viewMode === m
                ? 'bg-[#2C3E7B] text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
          >
            {m === 'location' ? 'By Location' : 'By Week'}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-[#2C3E7B] border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              Scanning {endWeek - startWeek + 1} weeks...
            </span>
          </div>
        ) : !seenSpecies || seenSpecies.size === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
            Import your life list to see trip planning results
          </p>
        ) : results.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
            {regionId ? 'No results in this region. Try a broader region or wider date range.' : 'Select a region to see results.'}
          </p>
        ) : viewMode === 'location' ? (
          <div className="space-y-1">
            {byLocation.map((loc, i) => {
              const key = `loc-${loc.cellId}`
              const expanded = expandedId === key
              return (
                <div key={loc.cellId} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : key)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[40px]"
                  >
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                        {loc.cellName || `Cell ${loc.cellId}`}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {loc.bestLiferCount} lifers · Best: {getWeekLabel(loc.bestWeek)}
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getProbabilityColor(loc.bestProb)}`}>
                      {sortBy === 'expected' ? `~${loc.bestExpected.toFixed(1)}`
                        : sortBy === 'count' ? `${loc.bestLiferCount}`
                        : formatProbability(loc.bestProb)}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-2.5 py-2 bg-gray-50/50 dark:bg-gray-800/50 space-y-1.5">
                      <button
                        onClick={() => handleShowOnMap(loc.cellId, loc.coordinates, loc.bestWeek)}
                        className="text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline"
                      >
                        Show on Map
                      </button>
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Top species:</div>
                      {(results.find(r => r.cellId === loc.cellId && r.week === loc.bestWeek)?.topSpecies || [])
                        .slice(0, 10)
                        .map(sp => (
                          <div key={sp.speciesId} className="flex items-center justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{sp.comName}</span>
                            <span className="text-gray-500 dark:text-gray-400 tabular-nums ml-2">{Math.round(sp.freq * 100)}%</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-1">
            {byWeek.map((wk, i) => {
              const key = `wk-${wk.week}`
              const expanded = expandedId === key
              return (
                <div key={wk.week} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : key)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 min-h-[40px]"
                  >
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 dark:text-gray-100">
                        {getWeekLabel(wk.week)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        Best: {wk.bestCellName || `Cell ${wk.bestCellId}`} · {wk.bestLiferCount} lifers
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${getProbabilityColor(wk.bestProb)}`}>
                      {sortBy === 'expected' ? `~${wk.bestExpected.toFixed(1)}`
                        : sortBy === 'count' ? `${wk.bestLiferCount}`
                        : formatProbability(wk.bestProb)}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-2.5 py-2 bg-gray-50/50 dark:bg-gray-800/50 space-y-1.5">
                      <div className="text-xs font-medium text-gray-600 dark:text-gray-400">Top locations:</div>
                      {wk.cells
                        .sort((a, b) => b.combinedProb - a.combinedProb)
                        .slice(0, 5)
                        .map(cell => (
                          <button
                            key={cell.cellId}
                            onClick={() => handleShowOnMap(cell.cellId, cell.coordinates, wk.week)}
                            className="w-full flex items-center justify-between text-xs py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1"
                          >
                            <span className="text-[#2C3E7B] dark:text-blue-400 truncate">
                              {cell.cellName || `Cell ${cell.cellId}`}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400 ml-2 tabular-nums">
                              {cell.liferCount} lifers · {formatProbability(cell.combinedProb)}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
