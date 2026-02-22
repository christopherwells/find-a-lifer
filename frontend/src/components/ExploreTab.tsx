import { useState, useEffect, useRef } from 'react'
import type { ExploreTabProps, SpeciesMeta } from './types'

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
  selectedRegion = null,
  onSelectedRegionChange,
  heatmapOpacity = 0.8,
  onHeatmapOpacityChange
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
    fetch('/api/species')
      .then((r) => r.json())
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
    // Approximate: week 1 = early January, week 52 = late December
    const dayOfYear = week * 7 - 3 // Approximate day of year
    const date = new Date(2024, 0, dayOfYear) // Use 2024 as a reference year (leap year)
    const monthIndex = date.getMonth()
    const day = date.getDate()
    return `Week ${week} (~${monthNames[monthIndex]} ${day})`
  }

  // Keep ref in sync with currentWeek prop
  useEffect(() => {
    currentWeekRef.current = currentWeek
  }, [currentWeek])

  // Animation controls
  const startAnimation = () => {
    if (animationIntervalRef.current !== null) return // Already running
    setIsAnimating(true)
    animationIntervalRef.current = window.setInterval(() => {
      // Auto-advance to next week, loop back to 1 after 52
      const nextWeek = currentWeekRef.current >= 52 ? 1 : currentWeekRef.current + 1
      onWeekChange?.(nextWeek)
    }, 1000) // Advance every 1 second for smooth animation
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
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Explore Map</h3>
      <p className="text-sm text-gray-600">
        Use the map controls to explore where bird species can be found. Adjust the week slider to see seasonal changes.
      </p>

      {/* Region Selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#2C3E50]">
          Region
        </label>
        <select
          value={selectedRegion || ''}
          onChange={(e) => onSelectedRegionChange?.(e.target.value || null)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent bg-white"
          data-testid="region-selector"
          aria-label="Select geographic region"
        >
          <option value="">All Regions</option>
          <option value="us_northeast">US Northeast</option>
          <option value="us_southeast">US Southeast</option>
          <option value="us_west">US West</option>
          <option value="alaska">Alaska</option>
          <option value="hawaii">Hawaii</option>
        </select>
        <p className="text-xs text-gray-500">
          {selectedRegion ? 'Map zoomed to selected region' : 'Select a region to zoom the map'}
        </p>
      </div>

      {/* View Mode Toggle */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#2C3E50]">
          View Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            data-testid="view-mode-density"
            onClick={() => onViewModeChange?.('density')}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'density'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Density
          </button>
          <button
            data-testid="view-mode-probability"
            onClick={() => onViewModeChange?.('probability')}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'probability'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Probability
          </button>
          <button
            data-testid="view-mode-species"
            onClick={() => onViewModeChange?.('species')}
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'species'
                ? 'bg-[#2C3E7B] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Species
          </button>
          <button
            onClick={() => onViewModeChange?.('goal-birds')}
            data-testid="view-mode-goal-birds"
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              viewMode === 'goal-birds'
                ? 'bg-[#D4A017] text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            🎯 Goal Birds
          </button>
        </div>
        <p className="text-xs text-gray-500">
          {viewMode === 'density' && !goalBirdsOnlyFilter && 'Show number of unseen species per area'}
          {viewMode === 'density' && goalBirdsOnlyFilter && 'Showing only unseen goal birds in density'}
          {viewMode === 'probability' && !goalBirdsOnlyFilter && 'Show occurrence probability intensity across all species'}
          {viewMode === 'probability' && goalBirdsOnlyFilter && 'Showing occurrence probability for goal birds only'}
          {viewMode === 'species' && !goalBirdsOnlyFilter && 'Select a species to spotlight its range on the map'}
          {viewMode === 'species' && goalBirdsOnlyFilter && 'Showing only your goal birds in the species picker'}
          {viewMode === 'goal-birds' && 'Show unseen goal birds per area'}
        </p>
      </div>

      {/* Active Goal List Selector — shown when in Goal Birds view OR when Goal Birds Only filter is active */}
      {(viewMode === 'goal-birds' || ((viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && goalBirdsOnlyFilter)) && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#2C3E50]">
            Active Goal List
          </label>
          {goalLists.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">
                No goal lists yet. Create one in the 🎯 Goal Birds tab.
              </p>
            </div>
          ) : (
            <select
              value={activeGoalListId || ''}
              onChange={(e) => onActiveGoalListIdChange?.(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A017] focus:border-transparent bg-white"
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
          <p className="text-xs text-gray-500">
            Map shows goal birds from the selected list
          </p>
        </div>
      )}

      {/* Goal Birds Only Filter — shown in Lifer Density, Probability, and Species Range views */}
      {(viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#2C3E50]">
            Filter
          </label>
          <button
            data-testid="goal-birds-only-toggle"
            onClick={() => onGoalBirdsOnlyFilterChange?.(!goalBirdsOnlyFilter)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border transition-colors text-sm font-medium ${
              goalBirdsOnlyFilter
                ? 'bg-[#D4A017] border-[#D4A017] text-white'
                : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
            }`}
            aria-pressed={goalBirdsOnlyFilter}
          >
            <span className="flex items-center gap-2">
              <span>🎯</span>
              <span>Goal Birds Only</span>
            </span>
            <span
              className={`inline-flex items-center justify-center w-8 h-4 rounded-full transition-colors ${
                goalBirdsOnlyFilter ? 'bg-white bg-opacity-30' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block w-3 h-3 rounded-full transition-transform ${
                  goalBirdsOnlyFilter
                    ? 'bg-white translate-x-2'
                    : 'bg-white -translate-x-2'
                }`}
              />
            </span>
          </button>
          <p className="text-xs text-gray-500">
            {viewMode === 'density' && (goalBirdsOnlyFilter
              ? 'Heatmap counts only your unseen goal birds'
              : 'Toggle to filter density to goal birds only')}
            {viewMode === 'probability' && (goalBirdsOnlyFilter
              ? 'Probability heatmap shows only your goal birds'
              : 'Toggle to filter probability to goal birds only')}
            {viewMode === 'species' && (goalBirdsOnlyFilter
              ? 'Species picker shows only your goal birds'
              : 'Toggle to filter species picker to goal birds only')}
          </p>
        </div>
      )}

      {/* Species Picker — shown in Species Range view */}
      {viewMode === 'species' && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#2C3E50]">
            Select Species
          </label>
          {/* Search input */}
          <input
            type="text"
            placeholder="Search species..."
            value={speciesSearch}
            onChange={(e) => setSpeciesSearch(e.target.value)}
            data-testid="species-range-search"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
          />
          {/* Selected species display */}
          {selectedSpecies && selectedSpeciesMeta && (
            <div className="flex items-center justify-between bg-[#2C3E7B] text-white px-3 py-2 rounded-lg text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{selectedSpeciesMeta.comName}</div>
                <div className="text-xs text-blue-200 italic truncate">{selectedSpeciesMeta.sciName}</div>
              </div>
              <button
                onClick={() => onSelectedSpeciesChange?.(null)}
                className="ml-2 text-blue-200 hover:text-white transition-colors flex-shrink-0"
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
            <div className="text-sm text-gray-500 text-center py-4">
              <div className="animate-spin inline-block rounded-full h-4 w-4 border-2 border-[#2C3E7B] border-t-transparent mr-2"></div>
              Loading species...
            </div>
          ) : (
            <div
              data-testid="species-range-list"
              className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100"
            >
              {filteredSpecies.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500 text-center">
                  {goalBirdsOnlyFilter && goalSpeciesCodes.size === 0
                    ? 'No goal birds in your list. Add some in the Goal Birds tab.'
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
                    className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-blue-50 ${
                      selectedSpecies === s.speciesCode ? 'bg-blue-100 font-medium' : ''
                    }`}
                  >
                    <div className="font-medium text-gray-800">{s.comName}</div>
                    <div className="text-xs text-gray-500 italic">{s.sciName}</div>
                  </button>
                ))
              )}
              {filteredSpecies.length > 100 && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  Showing first 100 of {filteredSpecies.length} — type to search
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Week Slider */}
      <div className="space-y-2">
        <label htmlFor="week-slider" className="block text-sm font-medium text-[#2C3E50]">
          Select Week
        </label>
        <div className="space-y-1">
          <input
            id="week-slider"
            type="range"
            min="1"
            max="52"
            value={currentWeek}
            onChange={(e) => onWeekChange?.(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="week-slider"
          />
          <div className="text-sm text-center font-medium text-[#2C3E7B]">
            {getWeekLabel(currentWeek)}
          </div>
        </div>
      </div>

      {/* Migration Animation Controls */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[#2C3E50]">
          Migration Animation
        </label>
        <div className="flex items-center gap-2">
          {!isAnimating ? (
            <button
              onClick={startAnimation}
              data-testid="animation-play-button"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#E87722] hover:bg-[#d46b1e] text-white rounded-lg transition-colors font-medium"
              aria-label="Play migration animation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
              Play
            </button>
          ) : (
            <button
              onClick={stopAnimation}
              data-testid="animation-pause-button"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
              aria-label="Pause migration animation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Pause
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {isAnimating
            ? 'Animation playing — map updates automatically each second'
            : 'Click Play to watch species movement through the year'}
        </p>
      </div>

      {/* Heatmap Opacity Slider */}
      <div className="space-y-2">
        <label htmlFor="opacity-slider" className="block text-sm font-medium text-[#2C3E50]">
          Heatmap Opacity
        </label>
        <div className="space-y-1">
          <input
            id="opacity-slider"
            type="range"
            min="0"
            max="100"
            value={Math.round(heatmapOpacity * 100)}
            onChange={(e) => onHeatmapOpacityChange?.(parseInt(e.target.value, 10) / 100)}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="opacity-slider"
            aria-label="Adjust heatmap opacity"
          />
          <div className="text-sm text-center font-medium text-[#2C3E7B]">
            {Math.round(heatmapOpacity * 100)}%
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Adjust the transparency of the heatmap overlay
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-700">
          <span className="font-medium">Tip:</span> Click on the map to see available lifers in that area.
        </p>
      </div>
    </div>
  )
}
