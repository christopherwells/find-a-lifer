import { useState, useEffect, useMemo } from 'react'
import type { Species, SelectedLocation, WeekOpportunity, GoalWindowResult } from './types'
import type { GoalList } from '../lib/goalListsDB'
import { ListSkeleton } from './Skeleton'
import {
  formatCoords,
  getWeekLabel,
  formatProbability,
  getProbabilityColor,
  getCellCoordinates,
  REGION_BBOX,
  isInRegionBbox,
} from './tripPlanUtils'
import { computeGoalWindowOpportunities, getCellLabels } from '../lib/dataCache'
import SpeciesInfoCard from './SpeciesInfoCard'

interface WindowModeProps {
  currentWeek: number
  speciesData: Species[]
  speciesLoaded: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature collection
  gridData: any
  seenSpecies: Set<string>
  selectedRegion: string | null
  cellLabels: Map<number, string>
  speciesById: Map<number, Species>
  onWeekChange?: (week: number) => void
  onLocationSelect?: (location: SelectedLocation | null) => void
  goalLists: GoalList[]
  activeGoalListId: string | null
}

export default function WindowMode({
  speciesData,
  speciesLoaded,
  gridData,
  seenSpecies,
  selectedRegion,
  cellLabels,
  speciesById,
  onWeekChange,
  onLocationSelect,
  goalLists,
  activeGoalListId,
}: WindowModeProps) {
  // Sub-mode
  const [windowSubMode, setWindowSubMode] = useState<'single' | 'goal-list'>('single')

  // Single species sub-mode
  const [selectedSpeciesForWindow, setSelectedSpeciesForWindow] = useState<Species | null>(null)
  const [weekOpportunities, setWeekOpportunities] = useState<WeekOpportunity[]>([])
  const [windowLoading, setWindowLoading] = useState(false)
  const [speciesSearchTerm, setSpeciesSearchTerm] = useState('')
  const [showSpeciesSuggestions, setShowSpeciesSuggestions] = useState(false)

  // Goal-list sub-mode
  const [goalWindowResults, setGoalWindowResults] = useState<GoalWindowResult[]>([])
  const [goalWindowLoading, setGoalWindowLoading] = useState(false)
  const [goalWindowListId, setGoalWindowListId] = useState<string | null>(activeGoalListId)
  const [infoCardSpecies, setInfoCardSpecies] = useState<Species | null>(null)
  const [goalWindowStartWeek, setGoalWindowStartWeek] = useState(1)
  const [goalWindowEndWeek, setGoalWindowEndWeek] = useState(52)
  const [goalWindowThreshold, setGoalWindowThreshold] = useState(5)
  const [goalWindowExpandedIdx, setGoalWindowExpandedIdx] = useState<number | null>(null)

  // Filtered species suggestions
  const filteredSuggestions = useMemo(() => {
    if (!speciesSearchTerm || speciesSearchTerm.length === 0) return []
    const term = speciesSearchTerm.toLowerCase()
    return speciesData
      .filter(sp =>
        sp.comName.toLowerCase().includes(term) ||
        sp.sciName.toLowerCase().includes(term)
      )
      .slice(0, 10)
  }, [speciesData, speciesSearchTerm])

  // Calculate window of opportunity (single species)
  useEffect(() => {
    if (windowSubMode !== 'single' || !selectedSpeciesForWindow || !speciesLoaded || !gridData) {
      setWeekOpportunities([])
      return
    }

    const controller = new AbortController()

    const calc = async () => {
      setWindowLoading(true)
      try {
        const speciesCode = selectedSpeciesForWindow.speciesCode
        const { fetchSpeciesWeeks } = await import('../lib/dataCache')
        const speciesWeekData = await fetchSpeciesWeeks(speciesCode)
        if (controller.signal.aborted) return

        const weeklyResults = Array.from({ length: 52 }, (_, i) => i + 1).map(week => {
          const weekEntries = speciesWeekData[String(week)] || []
          const records = weekEntries.map(([cellId]) => ({ cell_id: cellId, probability: 1.0 }))
          return { week, records }
        })

        const cellCoords = getCellCoordinates(gridData)
        const regionBbox = selectedRegion ? REGION_BBOX[selectedRegion] : null

        const opps: WeekOpportunity[] = []
        for (const { week, records } of weeklyResults) {
          const filtered = regionBbox
            ? records.filter(r => {
                const coords = cellCoords.get(r.cell_id)
                return coords ? isInRegionBbox(coords, regionBbox) : false
              })
            : records
          if (filtered.length === 0) continue
          const avgProb = filtered.reduce((sum, r) => sum + r.probability, 0) / filtered.length
          const topLocs = filtered
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5)
            .map(r => ({
              cellId: r.cell_id,
              coordinates: cellCoords.get(r.cell_id) || [0, 0] as [number, number],
              probability: r.probability
            }))
          opps.push({ week, avgProbability: avgProb, topLocations: topLocs })
        }

        opps.sort((a, b) => b.avgProbability - a.avgProbability)
        setWeekOpportunities(opps.slice(0, 10))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Window: error', error)
          setWeekOpportunities([])
        }
      } finally {
        setWindowLoading(false)
      }
    }
    calc()

    return () => controller.abort()
  }, [windowSubMode, selectedSpeciesForWindow, speciesLoaded, gridData, selectedRegion])

  // Calculate goal-list window of opportunity
  useEffect(() => {
    if (windowSubMode !== 'goal-list' || !speciesLoaded || !gridData) {
      setGoalWindowResults([])
      return
    }

    const selectedList = goalLists.find(l => l.id === goalWindowListId)
    if (!selectedList || selectedList.speciesCodes.length === 0) {
      setGoalWindowResults([])
      return
    }

    const controller = new AbortController()

    const calc = async () => {
      setGoalWindowLoading(true)
      setGoalWindowExpandedIdx(null)
      try {
        const goalSpeciesIdSet = new Set<number>()
        for (const code of selectedList.speciesCodes) {
          const sp = speciesData.find(s => s.speciesCode === code)
          if (sp) goalSpeciesIdSet.add(sp.species_id)
        }
        if (goalSpeciesIdSet.size === 0) {
          setGoalWindowResults([])
          return
        }

        const seenIdSet = new Set<number>()
        for (const code of seenSpecies) {
          const sp = speciesData.find(s => s.speciesCode === code)
          if (sp) seenIdSet.add(sp.species_id)
        }

        const cellCoordsMap = getCellCoordinates(gridData)
        const labelsMap = await getCellLabels()
        if (controller.signal.aborted) return

        const regionBbox = selectedRegion ? REGION_BBOX[selectedRegion] : null

        const results = await computeGoalWindowOpportunities(
          goalSpeciesIdSet,
          seenIdSet,
          speciesById,
          cellCoordsMap,
          labelsMap,
          [goalWindowStartWeek, goalWindowEndWeek],
          goalWindowThreshold / 100,
          4,
          regionBbox,
          controller.signal
        )
        if (controller.signal.aborted) return

        setGoalWindowResults(results)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Goal Window: error', error)
          setGoalWindowResults([])
        }
      } finally {
        setGoalWindowLoading(false)
      }
    }
    calc()

    return () => controller.abort()
  }, [windowSubMode, goalWindowListId, goalWindowStartWeek, goalWindowEndWeek, goalWindowThreshold, speciesLoaded, speciesData, speciesById, gridData, seenSpecies, selectedRegion, goalLists])

  const formatLocation = (coordinates: [number, number], cellId?: number): string => {
    if (cellId != null) {
      const label = cellLabels.get(cellId)
      if (label) return label
    }
    return formatCoords(coordinates)
  }

  return (
    <>
      {/* Sub-mode toggle + controls */}
      <div className="mt-3 space-y-3">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 grid grid-cols-2">
          <button
            onClick={() => setWindowSubMode('single')}
            className={`py-1.5 text-xs font-medium rounded-md text-center transition-all ${
              windowSubMode === 'single'
                ? 'bg-white dark:bg-gray-800 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            data-testid="window-single-btn"
          >
            Single Species
          </button>
          <button
            onClick={() => setWindowSubMode('goal-list')}
            className={`py-1.5 text-xs font-medium rounded-md text-center transition-all ${
              windowSubMode === 'goal-list'
                ? 'bg-white dark:bg-gray-800 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            data-testid="window-goal-list-btn"
          >
            Goal List
          </button>
        </div>

        {/* Single Species sub-mode controls */}
        {windowSubMode === 'single' && (
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Select Target Species</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search for a species..."
                value={speciesSearchTerm}
                onChange={(e) => {
                  setSpeciesSearchTerm(e.target.value)
                  setShowSpeciesSuggestions(true)
                }}
                onFocus={() => setShowSpeciesSuggestions(true)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                data-testid="species-search-input"
              />
              {showSpeciesSuggestions && filteredSuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredSuggestions.map(sp => (
                    <button
                      key={sp.speciesCode}
                      onClick={() => {
                        setSelectedSpeciesForWindow(sp)
                        setSpeciesSearchTerm(sp.comName)
                        setShowSpeciesSuggestions(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200">{sp.comName}</div>
                      <div className="text-xs italic text-gray-500 dark:text-gray-400">{sp.sciName}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedSpeciesForWindow && (
              <div
                className="mt-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                onClick={() => setInfoCardSpecies(selectedSpeciesForWindow)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setInfoCardSpecies(selectedSpeciesForWindow) } }}
                title="View species details"
              >
                <div className="text-sm font-medium text-blue-800 dark:text-blue-300">{selectedSpeciesForWindow.comName}</div>
                <div className="text-xs italic text-blue-600 dark:text-blue-400">{selectedSpeciesForWindow.sciName}</div>
              </div>
            )}
          </div>
        )}

        {/* Goal List sub-mode controls */}
        {windowSubMode === 'goal-list' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Goal List</label>
              {goalLists.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Create a goal list in the Goals tab first.
                </p>
              ) : (
                <select
                  value={goalWindowListId || ''}
                  onChange={(e) => setGoalWindowListId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  data-testid="goal-window-list-select"
                >
                  <option value="">Select a goal list...</option>
                  {goalLists.map(list => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.speciesCodes.length} species)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200">Week Range</label>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Start Week</label>
                <input
                  type="range" min="1" max="52" value={goalWindowStartWeek}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setGoalWindowStartWeek(val)
                    if (val > goalWindowEndWeek) setGoalWindowEndWeek(val)
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                  data-testid="goal-window-start-week"
                />
                <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                  Week {goalWindowStartWeek} (~{getWeekLabel(goalWindowStartWeek)})
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">End Week</label>
                <input
                  type="range" min="1" max="52" value={goalWindowEndWeek}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setGoalWindowEndWeek(val)
                    if (val < goalWindowStartWeek) setGoalWindowStartWeek(val)
                  }}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                  data-testid="goal-window-end-week"
                />
                <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                  Week {goalWindowEndWeek} (~{getWeekLabel(goalWindowEndWeek)})
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
                Min Reporting Frequency: {goalWindowThreshold}%
              </label>
              <input
                type="range" min="1" max="50" value={goalWindowThreshold}
                onChange={(e) => setGoalWindowThreshold(parseInt(e.target.value, 10))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                data-testid="goal-window-threshold"
              />
              <p className="text-xs lg:text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Only count species reported on ≥{goalWindowThreshold}% of checklists
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {windowSubMode === 'single' ? (
          !selectedSpeciesForWindow ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-medium">Search for a species</span> above to see its window of opportunity.
              </p>
            </div>
          ) : windowLoading ? (
            <ListSkeleton count={4} />
          ) : weekOpportunities.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium">No data found</span> for {selectedSpeciesForWindow.comName}. This species may not be recorded in this region.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100 mb-1">Window of Opportunity</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Best weeks to find <span className="font-medium text-[#2C3E7B] dark:text-blue-400">{selectedSpeciesForWindow.comName}</span>
                </p>
              </div>
              <div className="space-y-2" data-testid="window-opportunity-list">
                {weekOpportunities.map((opp, index) => (
                  <div
                    key={opp.week}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-[#2C3E7B] dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right font-mono">#{index + 1}</div>
                        <div>
                          <div className="text-sm font-semibold text-[#2C3E50] dark:text-gray-200">Week {opp.week}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">~{getWeekLabel(opp.week)}</div>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${getProbabilityColor(opp.avgProbability)}`}>
                        {formatProbability(opp.avgProbability)} avg
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Best locations:</div>
                      {opp.topLocations.slice(0, 3).map((loc, locIndex) => (
                        <button
                          key={loc.cellId}
                          onClick={() => {
                            onLocationSelect?.({
                              cellId: loc.cellId,
                              coordinates: loc.coordinates,
                              name: cellLabels.get(loc.cellId)
                            })
                          }}
                          className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-left transition-colors"
                          data-testid={`window-location-${opp.week}-${locIndex}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {formatLocation(loc.coordinates, loc.cellId)}
                            </div>
                          </div>
                          <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${getProbabilityColor(loc.probability)}`}>
                            {formatProbability(loc.probability)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          // Goal list window results
          !goalWindowListId ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-medium">Select a goal list</span> above to find the best times and places to see multiple targets.
              </p>
            </div>
          ) : goalWindowLoading ? (
            <div className="space-y-2">
              <ListSkeleton count={4} />
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center animate-pulse">
                Scanning {goalWindowEndWeek - goalWindowStartWeek + 1} weeks...
              </p>
            </div>
          ) : goalWindowResults.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              {(() => {
                const selectedList = goalLists.find(l => l.id === goalWindowListId)
                const allSeen = selectedList?.speciesCodes.every(c => seenSpecies.has(c))
                if (allSeen) return <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-300 dark:text-green-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                return <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              })()}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {(() => {
                  const selectedList = goalLists.find(l => l.id === goalWindowListId)
                  const allSeen = selectedList?.speciesCodes.every(c => seenSpecies.has(c))
                  if (allSeen) return <><span className="font-medium">All species seen!</span> You've already seen every species in this goal list.</>
                  return <><span className="font-medium">No results found.</span> Try lowering the frequency threshold or widening the week range.</>
                })()}
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100 mb-1">Best Opportunities</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Where the most unseen target species overlap at peak frequency
                </p>
              </div>
              <div className="space-y-2" data-testid="goal-window-results">
                {goalWindowResults.map((result, index) => (
                  <div
                    key={`${result.week}-${result.cellId}`}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-[#2C3E7B] dark:hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right font-mono">#{index + 1}</div>
                        <div>
                          <div className="text-sm font-semibold text-[#2C3E50] dark:text-gray-200">
                            Week {result.week} <span className="font-normal text-gray-400">·</span> {result.cellName || formatCoords(result.coordinates)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">~{getWeekLabel(result.week)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#2C3E7B] dark:text-blue-400">
                          {result.targetCount}/{result.totalGoalSpecies}
                        </div>
                        <div className={`px-1.5 py-0.5 rounded text-xs lg:text-xs font-medium ${getProbabilityColor(result.combinedFreq)}`}>
                          {formatProbability(result.combinedFreq)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          if (onWeekChange) onWeekChange(result.week)
                          onLocationSelect?.({
                            cellId: result.cellId,
                            coordinates: result.coordinates,
                            name: result.cellName || undefined,
                          })
                        }}
                        className="flex-1 text-xs text-[#2C3E7B] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded px-2 py-1 transition-colors font-medium"
                        data-testid={`goal-window-show-map-${index}`}
                      >
                        Show on Map
                      </button>
                      <button
                        onClick={() => setGoalWindowExpandedIdx(goalWindowExpandedIdx === index ? null : index)}
                        className="flex-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-2 py-1 transition-colors"
                        data-testid={`goal-window-expand-${index}`}
                      >
                        {goalWindowExpandedIdx === index ? 'Hide Species' : `Show ${result.speciesPresent.length} Species`}
                      </button>
                    </div>
                    {goalWindowExpandedIdx === index && (
                      <div className="mt-2 border-t border-gray-100 dark:border-gray-700 pt-2 space-y-1">
                        {result.speciesPresent.map((sp) => (
                          <div
                            key={sp.speciesId}
                            className="flex items-center justify-between px-2 py-1 text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition-colors"
                            onClick={() => {
                              const full = speciesById.get(sp.speciesId)
                              if (full) setInfoCardSpecies(full)
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                const full = speciesById.get(sp.speciesId)
                                if (full) setInfoCardSpecies(full)
                              }
                            }}
                          >
                            <span className="text-gray-700 dark:text-gray-300 truncate">{sp.comName}</span>
                            <span className={`px-1.5 py-0.5 rounded font-medium ${getProbabilityColor(sp.freq)}`}>
                              {formatProbability(sp.freq)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      {infoCardSpecies && (
        <SpeciesInfoCard
          species={infoCardSpecies}
          onClose={() => setInfoCardSpecies(null)}
        />
      )}
    </>
  )
}
