import { useState, useEffect, useRef } from 'react'
import type { ExploreTabProps, SpeciesMeta } from './types'
import { fetchSpecies } from '../lib/dataCache'

export default function ExploreTab({
  currentWeek = 26,
  onWeekChange,
  viewMode = 'density',
  onViewModeChange,
  goalBirdsOnlyFilter = false,
  onGoalBirdsOnlyFilterChange,
  selectedSpecies = null,
  onSelectedSpeciesChange,
  goalSpeciesCodes = new Set(),
  goalLists = [],
  activeGoalListId = null,
  onActiveGoalListIdChange,
  selectedRegion: _selectedRegion = null,
  onSelectedRegionChange: _onSelectedRegionChange,
  heatmapOpacity = 0.8,
  onHeatmapOpacityChange,
  liferCountRange = [0, 9999],
  onLiferCountRangeChange,
  dataRange = [0, 0]
}: ExploreTabProps) {
  // Species picker state for Species Range view
  const [allSpecies, setAllSpecies] = useState<SpeciesMeta[]>([])
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [isLoadingSpecies, setIsLoadingSpecies] = useState(false)

  // Animation state
  const [isAnimating, setIsAnimating] = useState(false)
  const animationIntervalRef = useRef<number | null>(null)
  const currentWeekRef = useRef(currentWeek)

  // Load species metadata when switching to species view
  useEffect(() => {
    if (viewMode !== 'species') return
    if (allSpecies.length > 0) return // already loaded
    setIsLoadingSpecies(true)
    fetchSpecies()
      .then((data: SpeciesMeta[]) => {
        setAllSpecies(data)
        setIsLoadingSpecies(false)
      })
      .catch((err) => {
        console.error('ExploreTab: failed to load species', err)
        setIsLoadingSpecies(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // Build filtered species list for picker
  const filteredSpecies = (() => {
    let list = allSpecies
    // When Goal Birds Only is active, filter to goal list species
    if (goalBirdsOnlyFilter && goalSpeciesCodes.size > 0) {
      list = list.filter((s) => goalSpeciesCodes.has(s.speciesCode))
    }
    // Apply text search
    if (speciesSearch.trim()) {
      const q = speciesSearch.toLowerCase()
      list = list.filter(
        (s) =>
          s.comName.toLowerCase().includes(q) ||
          s.sciName.toLowerCase().includes(q)
      )
    }
    return list
  })()

  // Selected species display name
  const selectedSpeciesMeta = allSpecies.find((s) => s.speciesCode === selectedSpecies)

  // Convert week number to approximate date label
  const getWeekLabel = (week: number): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayOfYear = week * 7 - 3
    const date = new Date(2024, 0, dayOfYear)
    const monthIndex = date.getMonth()
    const day = date.getDate()
    return `${monthNames[monthIndex]} ${day}`
  }

  // Keep ref in sync with currentWeek prop
  useEffect(() => {
    currentWeekRef.current = currentWeek
  }, [currentWeek])

  // Animation controls
  const startAnimation = () => {
    if (animationIntervalRef.current !== null) return
    setIsAnimating(true)
    animationIntervalRef.current = window.setInterval(() => {
      const nextWeek = currentWeekRef.current >= 52 ? 1 : currentWeekRef.current + 1
      onWeekChange?.(nextWeek)
    }, 1000)
  }

  const stopAnimation = () => {
    if (animationIntervalRef.current !== null) {
      clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
    }
    setIsAnimating(false)
  }

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (animationIntervalRef.current !== null) {
        clearInterval(animationIntervalRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-5">
      {/* View Mode Toggle */}
      <div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex gap-1">
          {[
            { mode: 'density' as const, label: 'Richness' },
            { mode: 'probability' as const, label: 'Frequency' },
            { mode: 'species' as const, label: 'Range' },
            { mode: 'goal-birds' as const, label: 'Goals' },
          ].map(({ mode, label }) => (
            <button
              key={mode}
              data-testid={`view-mode-${mode}`}
              onClick={() => onViewModeChange?.(mode)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg text-center transition-all ${
                viewMode === mode
                  ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:bg-gray-200 dark:active:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Active Goal List Selector */}
      {(viewMode === 'goal-birds' || ((viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && goalBirdsOnlyFilter)) && (
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Active Goal List
          </label>
          {goalLists.length === 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No goal lists yet. Create one in the Goals tab.
              </p>
            </div>
          ) : (
            <select
              value={activeGoalListId || ''}
              onChange={(e) => onActiveGoalListIdChange?.(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B]/30 focus:border-[#2C3E7B] bg-white dark:bg-gray-800 dark:text-gray-200"
              data-testid="active-goal-list-selector"
              aria-label="Select active goal list for map"
            >
              {goalLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.speciesCodes.length} birds)
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Goal Birds Only Filter */}
      {(viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && (
        <button
          data-testid="goal-birds-only-toggle"
          onClick={() => onGoalBirdsOnlyFilterChange?.(!goalBirdsOnlyFilter)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-sm font-medium ${
            goalBirdsOnlyFilter
              ? 'bg-[#2C3E7B] border-[#2C3E7B] text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
          aria-pressed={goalBirdsOnlyFilter}
        >
          <span>Goal Birds Only</span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              goalBirdsOnlyFilter ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                goalBirdsOnlyFilter ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
      )}

      {/* Species Picker — shown in Species Range view */}
      {viewMode === 'species' && (
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Select Species
          </label>
          {/* Search input */}
          <input
            type="text"
            placeholder="Search species..."
            value={speciesSearch}
            onChange={(e) => setSpeciesSearch(e.target.value)}
            data-testid="species-range-search"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2C3E7B]/30 focus:border-[#2C3E7B] bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
          />
          {/* Selected species display */}
          {selectedSpecies && selectedSpeciesMeta && (
            <div className="flex items-center justify-between bg-[#2C3E7B] text-white px-3 py-2.5 rounded-xl text-sm mt-2 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{selectedSpeciesMeta.comName}</div>
                <div className="text-xs text-blue-200 italic truncate">{selectedSpeciesMeta.sciName}</div>
              </div>
              <button
                onClick={() => onSelectedSpeciesChange?.(null)}
                className="ml-2 text-blue-200 hover:text-white transition-colors flex-shrink-0 p-1"
                aria-label="Clear selected species"
                data-testid="clear-selected-species"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          {/* Species list */}
          {isLoadingSpecies ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              <div className="animate-spin inline-block rounded-full h-5 w-5 border-2 border-[#2C3E7B] border-t-transparent mr-2"></div>
              Loading species...
            </div>
          ) : (
            <div
              data-testid="species-range-list"
              className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl mt-2 divide-y divide-gray-100 dark:divide-gray-700"
            >
              {filteredSpecies.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  {goalBirdsOnlyFilter && goalSpeciesCodes.size === 0
                    ? 'No goal birds in your list. Add some in the Goals tab.'
                    : 'No species found.'}
                </div>
              ) : (
                filteredSpecies.slice(0, 100).map((s) => (
                  <button
                    key={s.speciesCode}
                    data-testid={`species-range-item-${s.speciesCode}`}
                    onClick={() => {
                      onSelectedSpeciesChange?.(s.speciesCode)
                      setSpeciesSearch('')
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-gray-700 ${
                      selectedSpecies === s.speciesCode ? 'bg-blue-50 dark:bg-gray-700 font-medium' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-800 dark:text-gray-200">{s.comName}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 italic">{s.sciName}</div>
                  </button>
                ))
              )}
              {filteredSpecies.length > 100 && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 text-center">
                  Showing first 100 of {filteredSpecies.length} — type to search
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Week Slider */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="week-slider" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Week
          </label>
          <span className="text-xs font-bold text-[#2C3E7B] dark:text-blue-400 bg-white dark:bg-gray-700 px-2.5 py-1 rounded-lg shadow-sm">
            Wk {currentWeek} · {getWeekLabel(currentWeek)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="week-slider"
            type="range"
            min="1"
            max="52"
            value={currentWeek}
            onChange={(e) => onWeekChange?.(parseInt(e.target.value, 10))}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="week-slider"
          />
          <button
            onClick={isAnimating ? stopAnimation : startAnimation}
            data-testid={isAnimating ? 'animation-pause-button' : 'animation-play-button'}
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${
              isAnimating
                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                : 'bg-[#2C3E7B] hover:bg-[#243267] text-white'
            }`}
            aria-label={isAnimating ? 'Pause migration animation' : 'Play migration animation'}
          >
            {isAnimating ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Opacity Slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="opacity-slider" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Opacity
          </label>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {Math.round(heatmapOpacity * 100)}%
          </span>
        </div>
        <input
          id="opacity-slider"
          type="range"
          min="0"
          max="100"
          value={Math.round(heatmapOpacity * 100)}
          onChange={(e) => onHeatmapOpacityChange?.(parseInt(e.target.value, 10) / 100)}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
          data-testid="opacity-slider"
          aria-label="Adjust heatmap opacity"
        />
      </div>

      {/* Lifer Count Range Filter */}
      {viewMode === 'density' && !goalBirdsOnlyFilter && dataRange[1] > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Lifer Range
            </label>
            <span className="text-xs font-semibold text-[#2C3E7B] dark:text-blue-400 tabular-nums">
              {liferCountRange[0]}–{Math.min(liferCountRange[1], dataRange[1])}
            </span>
          </div>
          <div className="space-y-1">
            <input
              type="range"
              min={dataRange[0]}
              max={dataRange[1]}
              value={liferCountRange[0]}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                onLiferCountRangeChange?.([Math.min(val, liferCountRange[1]), liferCountRange[1]])
              }}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              data-testid="lifer-range-min-slider"
              aria-label="Minimum lifer count"
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
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              data-testid="lifer-range-max-slider"
              aria-label="Maximum lifer count"
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
            <span>{dataRange[0]}</span>
            <span>min ↑ max ↓</span>
            <span>{dataRange[1]}</span>
          </div>
          {(liferCountRange[0] > dataRange[0] || liferCountRange[1] < dataRange[1]) && (
            <button
              onClick={() => onLiferCountRangeChange?.([dataRange[0], dataRange[1]])}
              className="w-full text-[11px] text-[#2C3E7B] dark:text-blue-400 hover:underline font-medium"
              data-testid="reset-lifer-range"
            >
              Reset range
            </button>
          )}
        </div>
      )}
    </div>
  )
}
