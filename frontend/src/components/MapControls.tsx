import { useState, useEffect, useMemo } from 'react'
import type { MapViewMode, Species } from './types'
import type { GoalList } from '../lib/goalListsDB'
import { fetchSpecies } from '../lib/dataCache'
import { useWeekAnimation } from '../lib/useWeekAnimation'
import { getWeekLabel } from './tripPlanUtils'
import { getWeeklyHighlightsLite } from '../lib/recommendationEngine'

interface MapControlsProps {
  viewMode: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
  beginnerMode: boolean
  onBeginnerModeChange?: (value: boolean) => void
  currentWeek: number
  onWeekChange?: (week: number) => void
  heatmapOpacity: number
  onHeatmapOpacityChange?: (opacity: number) => void
  goalBirdsOnlyFilter: boolean
  onGoalBirdsOnlyFilterChange?: (value: boolean) => void
  showTotalRichness: boolean
  onShowTotalRichnessChange?: (value: boolean) => void
  goalLists: GoalList[]
  activeGoalListId: string | null
  onActiveGoalListIdChange?: (id: string | null) => void
  goalSpeciesCodes: Set<string>
  selectedSpecies: string | null
  onSelectedSpeciesChange?: (code: string | null) => void
  selectedSpeciesMulti: string[]
  onSelectedSpeciesMultiChange?: (codes: string[]) => void
  liferCountRange: [number, number]
  onLiferCountRangeChange?: (range: [number, number]) => void
  dataRange: [number, number]
  seenSpecies: Set<string>
}

const VIEW_MODES: { mode: MapViewMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: 'density',
    label: 'Richness',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    mode: 'probability',
    label: 'Frequency',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    mode: 'species',
    label: 'Range',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 7h.01" />
        <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
        <path d="m20 7 2 .5-2 .5" />
      </svg>
    ),
  },
  {
    mode: 'goal-birds',
    label: 'Goals',
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm0 2a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z" />
      </svg>
    ),
  },
]

const MULTI_COLORS = ['#4A90D9', '#E74C3C', '#27AE60', '#8E44AD']

export default function MapControls({
  viewMode,
  onViewModeChange,
  beginnerMode,
  onBeginnerModeChange,
  currentWeek,
  onWeekChange,
  heatmapOpacity,
  onHeatmapOpacityChange,
  goalBirdsOnlyFilter,
  onGoalBirdsOnlyFilterChange,
  showTotalRichness,
  onShowTotalRichnessChange,
  goalLists,
  activeGoalListId,
  onActiveGoalListIdChange,
  goalSpeciesCodes,
  selectedSpecies,
  onSelectedSpeciesChange,
  selectedSpeciesMulti,
  onSelectedSpeciesMultiChange,
  liferCountRange,
  onLiferCountRangeChange,
  dataRange,
  seenSpecies,
}: MapControlsProps) {
  const [expanded, setExpanded] = useState(false)
  const [speciesExpanded, setSpeciesExpanded] = useState(false)
  const [highlightsExpanded, setHighlightsExpanded] = useState(false)
  const { isAnimating, showWrapIndicator, startAnimation, stopAnimation } = useWeekAnimation(currentWeek, onWeekChange)

  // Species picker state
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [isLoadingSpecies, setIsLoadingSpecies] = useState(false)
  const [compareMode, setCompareMode] = useState(false)

  // Load full species data (used for Range mode picker + weekly highlights)
  useEffect(() => {
    if (allSpecies.length > 0) return
    setIsLoadingSpecies(true)
    fetchSpecies()
      .then((data) => {
        setAllSpecies(data)
        setIsLoadingSpecies(false)
      })
      .catch(() => {
        setIsLoadingSpecies(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredSpecies = useMemo(() => {
    let list = allSpecies
    if (goalBirdsOnlyFilter && goalSpeciesCodes.size > 0) {
      list = list.filter((s) => goalSpeciesCodes.has(s.speciesCode))
    }
    if (speciesSearch.trim()) {
      const q = speciesSearch.toLowerCase()
      list = list.filter(
        (s) => s.comName.toLowerCase().includes(q) || s.sciName.toLowerCase().includes(q)
      )
    }
    return list
  }, [allSpecies, speciesSearch, goalBirdsOnlyFilter, goalSpeciesCodes])

  // Weekly highlights — computed from peakWeek data, no heavy fetches needed
  const weeklyHighlights = useMemo(() => {
    if (allSpecies.length === 0) return []
    return getWeeklyHighlightsLite(allSpecies, currentWeek, seenSpecies, goalSpeciesCodes)
  }, [allSpecies, currentWeek, seenSpecies, goalSpeciesCodes])

  const selectedSpeciesMeta = allSpecies.find((s) => s.speciesCode === selectedSpecies)

  const visibleModes = beginnerMode
    ? VIEW_MODES.filter((m) => m.mode === 'density')
    : VIEW_MODES

  const needsGoalListSelector =
    viewMode === 'goal-birds' ||
    ((viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && goalBirdsOnlyFilter)

  const showGoalBirdsToggle = viewMode === 'density' || viewMode === 'probability' || viewMode === 'species'
  const showTotalRichnessToggle = viewMode === 'density'
  const showLiferRange = !beginnerMode && viewMode === 'density' && !goalBirdsOnlyFilter && dataRange[1] > 0

  return (
    <div
      className="absolute left-3 right-3 z-10 md:hidden"
      style={{ top: '12px' }}
    >
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
        {/* Row 1: View Mode Toggle */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1">
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 flex-1">
            {visibleModes.map(({ mode, label, icon }) => (
              <button
                key={mode}
                onClick={() => onViewModeChange?.(mode)}
                className={`flex-1 flex items-center justify-center gap-1 min-h-[44px] py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === mode
                    ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
                title={label}
                data-testid={`mc-view-mode-${mode}`}
              >
                {icon}
                <span className="hidden min-[400px]:inline">{label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`ml-1 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${
              expanded
                ? 'bg-[#2C3E7B] text-white'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={expanded ? 'Hide controls' : 'More controls'}
            data-testid="mc-more-toggle"
          >
            <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Row 2: Week Slider */}
        <div className="flex items-center gap-2 px-2 pb-2">
          <span className={`text-xs font-bold whitespace-nowrap px-1.5 py-0.5 rounded transition-colors ${
            showWrapIndicator
              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40'
              : 'text-[#2C3E7B] dark:text-blue-400 bg-gray-50 dark:bg-gray-800'
          }`}>
            Wk {currentWeek} · {getWeekLabel(currentWeek)}
          </span>
          <input
            type="range"
            min="1"
            max="52"
            value={currentWeek}
            onChange={(e) => onWeekChange?.(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="mc-week-slider"
          />
          <button
            onClick={isAnimating ? stopAnimation : startAnimation}
            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-all shadow-sm ${
              isAnimating
                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                : 'bg-[#2C3E7B] hover:bg-[#243267] text-white'
            }`}
            data-testid={isAnimating ? 'mc-animation-pause' : 'mc-animation-play'}
            aria-label={isAnimating ? 'Pause animation' : 'Play animation'}
          >
            {isAnimating ? (
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>

        {/* Weekly Highlights */}
        {weeklyHighlights.length > 0 && (
          <div className="px-2 pb-1">
            <button
              onClick={() => setHighlightsExpanded(!highlightsExpanded)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-900/30 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/40 transition-colors"
              data-testid="mc-highlights-toggle"
            >
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.616a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1z" />
                </svg>
                This Week · {weeklyHighlights.length} highlight{weeklyHighlights.length !== 1 ? 's' : ''}
              </span>
              <svg className={`h-3 w-3 transition-transform ${highlightsExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            {highlightsExpanded && (
              <div className="mt-1 space-y-1 animate-sheet-up" data-testid="mc-highlights-list">
                {weeklyHighlights.map((h) => {
                  const catStyles = {
                    'best-chance': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                    'new-arrival': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
                    'peak-season': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                    'rare-visitor': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
                  }
                  const catLabels = {
                    'best-chance': 'Goal',
                    'new-arrival': 'Arriving',
                    'peak-season': 'Peak',
                    'rare-visitor': 'Rare',
                  }
                  return (
                    <div
                      key={h.species.speciesCode}
                      className="flex items-center gap-2 px-2 py-1.5 bg-white/60 dark:bg-gray-800/60 rounded-lg"
                    >
                      <span className={`flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded ${catStyles[h.category]}`}>
                        {catLabels[h.category]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                          {h.species.comName}
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          {h.reason}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Expanded Controls */}
        {expanded && (
          <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2.5 animate-sheet-up">
            {/* Opacity */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap">Opacity</label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(heatmapOpacity * 100)}
                onChange={(e) => onHeatmapOpacityChange?.(parseInt(e.target.value, 10) / 100)}
                className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                data-testid="mc-opacity-slider"
              />
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-7 text-right">
                {Math.round(heatmapOpacity * 100)}%
              </span>
            </div>

            {/* Goal Birds Only Toggle */}
            {showGoalBirdsToggle && (
              <button
                onClick={() => onGoalBirdsOnlyFilterChange?.(!goalBirdsOnlyFilter)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                  goalBirdsOnlyFilter
                    ? 'bg-[#2C3E7B] border-[#2C3E7B] text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
                aria-pressed={goalBirdsOnlyFilter}
              >
                Goal Birds Only
                <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  goalBirdsOnlyFilter ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
                }`}>
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                    goalBirdsOnlyFilter ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </span>
              </button>
            )}

            {/* Show All Species Toggle */}
            {showTotalRichnessToggle && (
              <button
                onClick={() => onShowTotalRichnessChange?.(!showTotalRichness)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                  showTotalRichness
                    ? 'bg-[#2C3E7B] border-[#2C3E7B] text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                }`}
                aria-pressed={showTotalRichness}
              >
                Show All Species
                <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                  showTotalRichness ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
                }`}>
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                    showTotalRichness ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </span>
              </button>
            )}

            {/* Goal List Selector */}
            {needsGoalListSelector && (
              <div>
                {goalLists.length === 0 ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-lg px-2.5 py-2">
                    No goal lists yet. Create one in the Goals tab.
                  </div>
                ) : (
                  <select
                    value={activeGoalListId || ''}
                    onChange={(e) => onActiveGoalListIdChange?.(e.target.value || null)}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 focus:outline-none"
                    data-testid="mc-goal-list-selector"
                  >
                    {goalLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.speciesCodes.length})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Lifer Range */}
            {showLiferRange && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Lifer Range</label>
                  <span className="text-xs font-semibold text-[#2C3E7B] dark:text-blue-400 tabular-nums">
                    {liferCountRange[0]}–{Math.min(liferCountRange[1], dataRange[1])}
                  </span>
                </div>
                <input
                  type="range"
                  min={dataRange[0]}
                  max={dataRange[1]}
                  value={liferCountRange[0]}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    onLiferCountRangeChange?.([Math.min(val, liferCountRange[1]), liferCountRange[1]])
                  }}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                />
                <input
                  type="range"
                  min={dataRange[0]}
                  max={dataRange[1]}
                  value={Math.min(liferCountRange[1], dataRange[1])}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    onLiferCountRangeChange?.([liferCountRange[0], Math.max(val, liferCountRange[0])])
                  }}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                />
                {(liferCountRange[0] > dataRange[0] || liferCountRange[1] < dataRange[1]) && (
                  <button
                    onClick={() => onLiferCountRangeChange?.([dataRange[0], dataRange[1]])}
                    className="text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline font-medium"
                  >
                    Reset range
                  </button>
                )}
              </div>
            )}

            {/* Beginner mode exit */}
            {beginnerMode && (
              <button
                onClick={() => onBeginnerModeChange?.(false)}
                className="w-full text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline font-medium text-center py-1"
              >
                Show all controls permanently
              </button>
            )}
          </div>
        )}

        {/* Species Picker — Range mode */}
        {viewMode === 'species' && (
          <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
            {/* Selected species or prompt */}
            {!compareMode && selectedSpecies && selectedSpeciesMeta ? (
              <div className="flex items-center gap-2 bg-[#2C3E7B] text-white px-2.5 py-2 rounded-lg text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{selectedSpeciesMeta.comName}</div>
                  <div className="text-xs text-blue-200 italic truncate">{selectedSpeciesMeta.sciName}</div>
                </div>
                <button
                  onClick={() => onSelectedSpeciesChange?.(null)}
                  className="text-blue-200 hover:text-white p-0.5 flex-shrink-0"
                  aria-label="Clear species"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : null}

            {/* Compare chips */}
            {compareMode && selectedSpeciesMulti.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedSpeciesMulti.map((code, idx) => {
                  const meta = allSpecies.find((s) => s.speciesCode === code)
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: MULTI_COLORS[idx] || '#666' }}
                    >
                      <span className="truncate max-w-[100px]">{meta?.comName || code}</span>
                      <button
                        onClick={() => {
                          const next = selectedSpeciesMulti.filter((c) => c !== code)
                          onSelectedSpeciesMultiChange?.(next)
                          if (next.length <= 1) {
                            onSelectedSpeciesChange?.(next[0] || null)
                            if (next.length === 0) setCompareMode(false)
                          } else {
                            onSelectedSpeciesChange?.(next[0])
                          }
                        }}
                        className="hover:bg-white/30 rounded p-0.5"
                      >
                        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {/* Compare / Clear buttons */}
            {selectedSpecies && !compareMode && (
              <button
                onClick={() => {
                  setCompareMode(true)
                  if (selectedSpecies && !selectedSpeciesMulti.includes(selectedSpecies)) {
                    onSelectedSpeciesMultiChange?.([selectedSpecies])
                  }
                }}
                className="w-full mt-1.5 px-2 py-1.5 text-xs font-medium text-[#2C3E7B] dark:text-blue-400 border border-dashed border-[#2C3E7B]/30 dark:border-blue-400/30 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              >
                + Compare species
              </button>
            )}
            {compareMode && selectedSpeciesMulti.length >= 2 && (
              <button
                onClick={() => {
                  setCompareMode(false)
                  onSelectedSpeciesMultiChange?.([])
                }}
                className="w-full text-xs text-gray-500 hover:text-red-500 font-medium mt-1"
              >
                Clear comparison
              </button>
            )}

            {/* Species search + list toggle */}
            <button
              onClick={() => setSpeciesExpanded(!speciesExpanded)}
              className="w-full mt-1.5 flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-1"
            >
              <span>{selectedSpecies ? 'Change species' : 'Select a species'}</span>
              <svg className={`h-3.5 w-3.5 transition-transform ${speciesExpanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {speciesExpanded && (
              <div className="mt-1">
                <input
                  type="text"
                  placeholder="Search species..."
                  value={speciesSearch}
                  onChange={(e) => setSpeciesSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#2C3E7B]/30"
                  data-testid="mc-species-search"
                />
                {isLoadingSpecies ? (
                  <div className="text-xs text-gray-400 text-center py-3">Loading species...</div>
                ) : (
                  <div className="max-h-36 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg mt-1 divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredSpecies.length === 0 ? (
                      <div className="px-2 py-3 text-xs text-gray-400 text-center">No species found.</div>
                    ) : (
                      filteredSpecies.slice(0, 50).map((s) => (
                        <button
                          key={s.speciesCode}
                          onClick={() => {
                            if (compareMode) {
                              if (selectedSpeciesMulti.includes(s.speciesCode)) return
                              if (selectedSpeciesMulti.length >= 4) return
                              const next = [...selectedSpeciesMulti, s.speciesCode]
                              onSelectedSpeciesMultiChange?.(next)
                              onSelectedSpeciesChange?.(next[0])
                            } else {
                              onSelectedSpeciesChange?.(s.speciesCode)
                            }
                            setSpeciesSearch('')
                            if (!compareMode) setSpeciesExpanded(false)
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-xs transition-colors hover:bg-blue-50 dark:hover:bg-gray-700 ${
                            selectedSpecies === s.speciesCode || selectedSpeciesMulti.includes(s.speciesCode) ? 'bg-blue-50 dark:bg-gray-700 font-medium' : ''
                          } ${compareMode && selectedSpeciesMulti.length >= 4 && !selectedSpeciesMulti.includes(s.speciesCode) ? 'opacity-40' : ''}`}
                          disabled={compareMode && selectedSpeciesMulti.length >= 4 && !selectedSpeciesMulti.includes(s.speciesCode)}
                        >
                          <div className="font-medium text-gray-800 dark:text-gray-200 truncate">{s.comName}</div>
                          <div className="text-[11px] text-gray-400 italic truncate">{s.sciName}</div>
                        </button>
                      ))
                    )}
                    {filteredSpecies.length > 50 && (
                      <div className="px-2 py-1.5 text-[11px] text-gray-400 text-center">
                        {filteredSpecies.length - 50} more — type to search
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
