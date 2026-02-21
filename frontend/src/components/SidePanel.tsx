import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLifeList } from '../contexts/LifeListContext'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'

export type MapViewMode = 'density' | 'probability' | 'species' | 'goal-birds'

export interface SelectedLocation {
  cellId: number
  coordinates: [number, number] // [lng, lat]
  name?: string
}

type TabId = 'explore' | 'species' | 'goals' | 'trip' | 'progress' | 'profile'

interface SidePanelProps {
  collapsed: boolean
  onToggle: () => void
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
  goalBirdsOnlyFilter?: boolean
  onGoalBirdsOnlyFilterChange?: (value: boolean) => void
  selectedLocation?: SelectedLocation | null
  onSelectedLocationChange?: (location: SelectedLocation | null) => void
  selectedSpecies?: string | null
  onSelectedSpeciesChange?: (speciesCode: string | null) => void
  goalSpeciesCodes?: Set<string>
  goalLists?: GoalList[]
  activeGoalListId?: string | null
  onActiveGoalListIdChange?: (id: string | null) => void
  selectedRegion?: string | null
  onSelectedRegionChange?: (regionId: string | null) => void
  heatmapOpacity?: number
  onHeatmapOpacityChange?: (opacity: number) => void
}

interface Tab {
  id: TabId
  label: string
  icon: string
}

const tabs: Tab[] = [
  { id: 'explore', label: 'Explore', icon: '\u{1F5FA}' },   // world map emoji
  { id: 'species', label: 'Species', icon: '\u{1F426}' },    // bird emoji
  { id: 'goals', label: 'Goal Birds', icon: '\u{1F3AF}' },   // target emoji
  { id: 'trip', label: 'Trip Plan', icon: '\u{2708}' },      // airplane emoji
  { id: 'progress', label: 'Progress', icon: '\u{1F4CA}' },  // chart emoji
  { id: 'profile', label: 'Profile', icon: '\u{1F464}' },    // person emoji
]

export default function SidePanel({
  collapsed,
  onToggle,
  currentWeek = 26,
  onWeekChange,
  viewMode = 'density',
  onViewModeChange,
  goalBirdsOnlyFilter = false,
  onGoalBirdsOnlyFilterChange,
  selectedLocation,
  onSelectedLocationChange,
  selectedSpecies,
  onSelectedSpeciesChange,
  goalSpeciesCodes,
  goalLists = [],
  activeGoalListId = null,
  onActiveGoalListIdChange,
  selectedRegion = null,
  onSelectedRegionChange,
  heatmapOpacity = 0.8,
  onHeatmapOpacityChange
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

  // Auto-switch to Trip Plan tab when a location is selected on the map
  useEffect(() => {
    if (selectedLocation) {
      setActiveTab('trip')
    }
  }, [selectedLocation])

  return (
    <div
      data-testid="side-panel"
      className={`h-full bg-white shadow-lg flex flex-col transition-all duration-300 ${
        collapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Tab Navigation */}
      <nav
        data-testid="tab-navigation"
        className="flex border-b border-gray-200 bg-gray-50"
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-12 h-12 flex items-center justify-center text-[#2C3E7B] hover:bg-gray-100"
            title="Expand panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-1 text-xs font-medium text-center transition-colors ${
                  activeTab === tab.id
                    ? 'text-[#2C3E7B] border-b-2 border-[#2C3E7B] bg-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={tab.label}
              >
                <span className="block text-base mb-0.5">{tab.icon}</span>
                <span className="block truncate">{tab.label}</span>
              </button>
            ))}
            <button
              onClick={onToggle}
              className="px-2 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Collapse panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
      </nav>

      {/* Tab Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'explore' && (
            <ExploreTab
              currentWeek={currentWeek}
              onWeekChange={onWeekChange}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              goalBirdsOnlyFilter={goalBirdsOnlyFilter}
              onGoalBirdsOnlyFilterChange={onGoalBirdsOnlyFilterChange}
              selectedSpecies={selectedSpecies}
              onSelectedSpeciesChange={onSelectedSpeciesChange}
              goalSpeciesCodes={goalSpeciesCodes}
              goalLists={goalLists}
              activeGoalListId={activeGoalListId}
              onActiveGoalListIdChange={onActiveGoalListIdChange}
              selectedRegion={selectedRegion}
              onSelectedRegionChange={onSelectedRegionChange}
              heatmapOpacity={heatmapOpacity}
              onHeatmapOpacityChange={onHeatmapOpacityChange}
            />
          )}
          {activeTab === 'species' && <SpeciesTab selectedRegion={selectedRegion} />}
          {activeTab === 'goals' && <GoalBirdsTab />}
          {activeTab === 'trip' && (
            <TripPlanTab
              selectedLocation={selectedLocation}
              currentWeek={currentWeek}
              onWeekChange={onWeekChange}
              onLocationSelect={onSelectedLocationChange}
            />
          )}
          {activeTab === 'progress' && <ProgressTab />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>
      )}
    </div>
  )
}

interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
}

interface ExploreTabProps {
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
  goalBirdsOnlyFilter?: boolean
  onGoalBirdsOnlyFilterChange?: (value: boolean) => void
  selectedSpecies?: string | null
  onSelectedSpeciesChange?: (speciesCode: string | null) => void
  goalSpeciesCodes?: Set<string>
  goalLists?: GoalList[]
  activeGoalListId?: string | null
  onActiveGoalListIdChange?: (id: string | null) => void
  selectedRegion?: string | null
  onSelectedRegionChange?: (regionId: string | null) => void
  heatmapOpacity?: number
  onHeatmapOpacityChange?: (opacity: number) => void
}

function ExploreTab({
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
  }, [viewMode, allSpecies.length])

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

interface Species {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  taxonOrder: number
  invasionStatus: string
  conservStatus: string
  difficultyScore: number
  difficultyLabel: string
  isRestrictedRange: boolean
  ebirdUrl: string
  photoUrl: string
  seasonalityScore: number
  peakWeek: number
  rangeShiftScore: number
}

interface SpeciesByFamily {
  [familyName: string]: Species[]
}

interface SpeciesTabProps {
  selectedRegion?: string | null
}

function SpeciesTab({ selectedRegion = null }: SpeciesTabProps) {
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [speciesByFamily, setSpeciesByFamily] = useState<SpeciesByFamily>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFamily, setSelectedFamily] = useState<string>('') // '' means "All Families"
  const [selectedConservStatus, setSelectedConservStatus] = useState<string>('') // '' means "All"
  const [selectedInvasionStatus, setSelectedInvasionStatus] = useState<string>('') // '' means "All"
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('') // '' means "All Difficulties"
  const { isSpeciesSeen, toggleSpecies, getTotalSeen } = useLifeList()

  // Region filtering state
  const [regionSpeciesCodes, setRegionSpeciesCodes] = useState<Set<string> | null>(null)
  const [regionName, setRegionName] = useState<string | null>(null)

  // Goal list management for adding species to goal lists
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [addingSpecies, setAddingSpecies] = useState<{ code: string; name: string } | null>(null)
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null)

  // Species info card
  const [selectedSpeciesCard, setSelectedSpeciesCard] = useState<Species | null>(null)

  // Autocomplete state
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightedSpecies, setHighlightedSpecies] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const speciesRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Fetch species data from API
  useEffect(() => {
    const fetchSpecies = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/species')
        if (!response.ok) {
          throw new Error(`Failed to fetch species: ${response.status}`)
        }
        const data: Species[] = await response.json()

        // Sort by taxonomic order
        const sorted = data.sort((a, b) => a.taxonOrder - b.taxonOrder)
        setAllSpecies(sorted)

        // Group by family
        const byFamily: SpeciesByFamily = {}
        sorted.forEach((species) => {
          const family = species.familyComName
          if (!byFamily[family]) {
            byFamily[family] = []
          }
          byFamily[family].push(species)
        })
        setSpeciesByFamily(byFamily)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setLoading(false)
      }
    }

    fetchSpecies()
  }, [])

  // Load goal lists on mount
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)
      } catch (error) {
        console.error('Failed to load goal lists:', error)
      }
    }

    loadGoalLists()
  }, [])

  // Load region data when selectedRegion changes
  useEffect(() => {
    const loadRegionData = async () => {
      if (!selectedRegion) {
        // No region selected, clear filter
        setRegionSpeciesCodes(null)
        setRegionName(null)
        return
      }

      try {
        const response = await fetch('/api/regions')
        if (!response.ok) {
          throw new Error(`Failed to fetch regions: ${response.status}`)
        }
        const data = await response.json()

        // Find the selected region
        const region = data.features?.find(
          (f: any) => f.properties.region_id === selectedRegion
        )

        if (region && region.properties) {
          const codes = new Set<string>(region.properties.species_codes || [])
          setRegionSpeciesCodes(codes)
          setRegionName(region.properties.name || selectedRegion)
          console.log(`SpeciesTab: filtered to region "${region.properties.name}" with ${codes.size} species`)
        } else {
          // Region not found, clear filter
          setRegionSpeciesCodes(null)
          setRegionName(null)
        }
      } catch (error) {
        console.error('Failed to load region data:', error)
        setRegionSpeciesCodes(null)
        setRegionName(null)
      }
    }

    loadRegionData()
  }, [selectedRegion])

  const toggleFamily = (familyName: string) => {
    setCollapsedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(familyName)) {
        next.delete(familyName)
      } else {
        next.add(familyName)
      }
      return next
    })
  }

  const handleStartAddToGoalList = (speciesCode: string, comName: string) => {
    setAddingSpecies({ code: speciesCode, name: comName })
  }

  const handleCancelAddToGoalList = () => {
    setAddingSpecies(null)
  }

  const handleAddToGoalList = async (listId: string) => {
    if (!addingSpecies) return

    try {
      await goalListsDB.addSpeciesToList(listId, addingSpecies.code)
      const list = goalLists.find((l) => l.id === listId)
      console.log(`Added ${addingSpecies.name} (${addingSpecies.code}) to goal list: ${list?.name}`)

      // Show success message
      setShowSuccessMessage(`Added ${addingSpecies.name} to ${list?.name}`)
      setTimeout(() => setShowSuccessMessage(null), 3000)

      // Close dialog
      setAddingSpecies(null)

      // Refresh goal lists to show updated counts
      const lists = await goalListsDB.getAllLists()
      setGoalLists(lists)
    } catch (error) {
      console.error('Failed to add species to goal list:', error)
      alert('Failed to add species to goal list. Please try again.')
    }
  }

  // Generate autocomplete suggestions from search term
  const suggestions = searchTerm.trim().length > 0
    ? allSpecies
        .filter((species) => {
          const search = searchTerm.toLowerCase()
          return (
            species.comName.toLowerCase().includes(search) ||
            species.sciName.toLowerCase().includes(search)
          )
        })
        .slice(0, 10) // Limit to 10 suggestions
    : []

  // Handle selecting a species from autocomplete
  const handleSelectSuggestion = (species: Species) => {
    setSearchTerm('') // Clear search
    setShowSuggestions(false)
    setHighlightedSpecies(species.speciesCode)

    // Expand the family if it's collapsed
    if (collapsedFamilies.has(species.familyComName)) {
      setCollapsedFamilies((prev) => {
        const next = new Set(prev)
        next.delete(species.familyComName)
        return next
      })
    }

    // Scroll to the species after a brief delay to ensure it's rendered
    setTimeout(() => {
      const speciesElement = speciesRefs.current[species.speciesCode]
      if (speciesElement) {
        speciesElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 100)

    // Remove highlight after 3 seconds
    setTimeout(() => {
      setHighlightedSpecies(null)
    }, 3000)
  }

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    setShowSuggestions(value.trim().length > 0)
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter species by search term, selected family, conservation status, invasion status, and region
  const filteredFamilies = Object.keys(speciesByFamily).reduce((acc, familyName) => {
    // If a family is selected, only include that family
    if (selectedFamily && familyName !== selectedFamily) {
      return acc
    }

    const familySpecies = speciesByFamily[familyName]
    const filtered = familySpecies.filter((species) => {
      const search = searchTerm.toLowerCase()
      const matchesSearch =
        species.comName.toLowerCase().includes(search) ||
        species.sciName.toLowerCase().includes(search) ||
        familyName.toLowerCase().includes(search)

      const matchesConserv =
        !selectedConservStatus || species.conservStatus === selectedConservStatus

      const matchesInvasion =
        !selectedInvasionStatus || species.invasionStatus === selectedInvasionStatus

      const matchesDifficulty =
        !selectedDifficulty || species.difficultyLabel === selectedDifficulty

      const matchesRegion =
        !regionSpeciesCodes || regionSpeciesCodes.has(species.speciesCode)

      return matchesSearch && matchesConserv && matchesInvasion && matchesDifficulty && matchesRegion
    })
    if (filtered.length > 0) {
      acc[familyName] = filtered
    }
    return acc
  }, {} as SpeciesByFamily)

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-700">
            <span className="font-medium">Error:</span> {error}
          </p>
        </div>
      </div>
    )
  }

  const totalSpecies = allSpecies.length
  const seenSpecies = getTotalSeen()

  // Calculate filtered counts
  const filteredSpeciesCount = Object.values(filteredFamilies).reduce(
    (sum, familySpecies) => sum + familySpecies.length,
    0
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Species Checklist</h3>

        {/* Species count */}
        <div className="text-sm text-gray-600">
          <span className="font-medium text-[#2C3E7B]">{seenSpecies}</span> of{' '}
          <span className="font-medium">{totalSpecies}</span> species seen
          {(selectedFamily || selectedConservStatus || selectedInvasionStatus || selectedDifficulty || regionSpeciesCodes) && (
            <span className="text-xs text-gray-500 ml-2">
              (showing {filteredSpeciesCount})
            </span>
          )}
        </div>

        {/* Region filter indicator */}
        {regionName && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2" data-testid="region-filter-indicator">
            <p className="text-xs text-blue-700">
              <span className="font-medium">📍 Region Filter:</span> Showing only species found in {regionName}
            </p>
          </div>
        )}

        {/* Family filter dropdown */}
        <div>
          <label htmlFor="family-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Filter by Family
          </label>
          <select
            id="family-filter"
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="family-filter"
          >
            <option value="">All Families</option>
            {Object.keys(speciesByFamily).sort().map((familyName) => (
              <option key={familyName} value={familyName}>
                {familyName} ({speciesByFamily[familyName].length})
              </option>
            ))}
          </select>
        </div>

        {/* Conservation status filter */}
        <div>
          <label htmlFor="conservation-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Conservation Status
          </label>
          <select
            id="conservation-filter"
            value={selectedConservStatus}
            onChange={(e) => setSelectedConservStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="conservation-filter"
          >
            <option value="">All Conservation Statuses</option>
            <option value="Least Concern">🟢 Least Concern</option>
            <option value="Near Threatened">🟡 Near Threatened</option>
            <option value="Vulnerable">🟠 Vulnerable</option>
            <option value="Endangered">🔴 Endangered</option>
            <option value="Critically Endangered">🔴 Critically Endangered</option>
            <option value="Extinct in the Wild">⚫ Extinct in the Wild</option>
            <option value="Data Deficient">❓ Data Deficient</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>

        {/* Invasion status filter */}
        <div>
          <label htmlFor="invasion-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Origin Status
          </label>
          <select
            id="invasion-filter"
            value={selectedInvasionStatus}
            onChange={(e) => setSelectedInvasionStatus(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="invasion-filter"
          >
            <option value="">All Origins</option>
            <option value="Native">🐦 Native</option>
            <option value="Introduced">⚠️ Introduced</option>
            <option value="Rare/Accidental">🔍 Rare/Accidental</option>
          </select>
        </div>

        {/* Difficulty filter */}
        <div>
          <label htmlFor="difficulty-filter" className="block text-xs font-medium text-gray-700 mb-1">
            Difficulty Level
          </label>
          <select
            id="difficulty-filter"
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="difficulty-filter"
          >
            <option value="">All Difficulty Levels</option>
            <option value="Easy">🟢 Easy</option>
            <option value="Moderate">🟡 Moderate</option>
            <option value="Hard">🟠 Hard</option>
            <option value="Very Hard">🔴 Very Hard</option>
          </select>
        </div>

        {/* Search box with autocomplete */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search species or family..."
            value={searchTerm}
            onChange={handleSearchChange}
            onFocus={() => searchTerm.trim().length > 0 && setShowSuggestions(true)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
            data-testid="species-search-input"
          />

          {/* Autocomplete suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto"
              data-testid="autocomplete-suggestions"
            >
              {suggestions.map((species) => (
                <button
                  key={species.speciesCode}
                  onClick={() => handleSelectSuggestion(species)}
                  className="w-full text-left px-3 py-2 hover:bg-[#2C3E7B] hover:bg-opacity-10 border-b border-gray-100 last:border-b-0 transition-colors"
                  data-testid={`suggestion-${species.speciesCode}`}
                >
                  <div className="text-sm font-medium text-[#2C3E50]">{species.comName}</div>
                  <div className="text-xs text-gray-500 italic">{species.sciName}</div>
                  <div className="text-xs text-gray-400">{species.familyComName}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Species list by family */}
      <div className="flex-1 overflow-y-auto mt-3 space-y-1">
        {Object.keys(filteredFamilies).length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">
            {searchTerm
              ? `No species found matching "${searchTerm}"`
              : selectedConservStatus || selectedInvasionStatus || selectedDifficulty
              ? 'No species match the active filters'
              : 'No species found'}
          </div>
        ) : (
          Object.keys(filteredFamilies).map((familyName) => {
            const familySpecies = filteredFamilies[familyName]
            const isCollapsed = collapsedFamilies.has(familyName)

            return (
              <div key={familyName} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Family header */}
                <button
                  onClick={() => toggleFamily(familyName)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-gray-500 transition-transform ${
                        isCollapsed ? '' : 'rotate-90'
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-sm font-semibold text-[#2C3E50]">{familyName}</span>
                  </div>
                  <span className="text-xs text-gray-500">{familySpecies.length}</span>
                </button>

                {/* Species in family */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-100">
                    {familySpecies.map((species) => (
                      <div
                        key={species.species_id}
                        ref={(el) => {
                          speciesRefs.current[species.speciesCode] = el
                        }}
                        className={`px-3 py-2 transition-colors ${
                          highlightedSpecies === species.speciesCode
                            ? 'bg-yellow-100 ring-2 ring-yellow-400'
                            : 'hover:bg-blue-50'
                        }`}
                        data-testid={`species-item-${species.speciesCode}`}
                      >
                        <div className="flex items-start gap-2">
                          {/* Functional checkbox with IndexedDB persistence */}
                          <input
                            type="checkbox"
                            checked={isSpeciesSeen(species.speciesCode)}
                            onChange={() => toggleSpecies(species.speciesCode, species.comName)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#2C3E7B] focus:ring-[#2C3E7B] cursor-pointer"
                          />
                          {/* Clickable species name area opens info card */}
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => setSelectedSpeciesCard(species)}
                            title={`View ${species.comName} info`}
                            data-testid={`species-info-btn-${species.speciesCode}`}
                          >
                            {/* Common name */}
                            <div className="text-sm font-medium text-[#2C3E50] hover:text-[#2C3E7B] truncate">
                              {species.comName}
                            </div>
                            {/* Scientific name */}
                            <div className="text-xs italic text-gray-600 truncate">
                              {species.sciName}
                            </div>
                            {/* Badges */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {species.conservStatus && species.conservStatus !== 'Unknown' && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${species.conservStatus === 'Least Concern' ? 'bg-green-100 text-green-800' : species.conservStatus === 'Near Threatened' ? 'bg-yellow-100 text-yellow-800' : species.conservStatus === 'Vulnerable' ? 'bg-orange-100 text-orange-800' : species.conservStatus === 'Endangered' ? 'bg-red-100 text-red-800' : species.conservStatus === 'Critically Endangered' ? 'bg-red-200 text-red-900' : 'bg-gray-100 text-gray-600'}`} data-testid={`checklist-conservation-badge-${species.speciesCode}`}>🌿</span>
                              )}
                              {species.difficultyLabel && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${species.difficultyLabel === 'Easy' ? 'bg-green-100 text-green-800' : species.difficultyLabel === 'Moderate' ? 'bg-yellow-100 text-yellow-800' : species.difficultyLabel === 'Hard' ? 'bg-orange-100 text-orange-800' : species.difficultyLabel === 'Very Hard' ? 'bg-red-100 text-red-800' : species.difficultyLabel === 'Extremely Hard' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-600'}`} data-testid={`checklist-difficulty-badge-${species.speciesCode}`}>🔭</span>
                              )}
                              {species.isRestrictedRange && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800" data-testid={`checklist-restricted-badge-${species.speciesCode}`}>📍</span>
                              )}
                            </div>
                          </button>
                          {/* Add to goal list button */}
                          <button
                            onClick={() => handleStartAddToGoalList(species.speciesCode, species.comName)}
                            className="flex-shrink-0 p-1 text-[#2C3E7B] hover:bg-[#2C3E7B] hover:text-white rounded transition-colors"
                            title="Add to goal list"
                            data-testid={`add-to-goal-${species.speciesCode}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add to Goal List Dialog */}
      {addingSpecies && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={handleCancelAddToGoalList}
        >
          <div
            className="bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[#2C3E50] mb-2">
              Add to Goal List
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select a goal list to add <span className="font-medium">{addingSpecies.name}</span>:
            </p>

            {goalLists.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-yellow-700">
                  You don't have any goal lists yet. Create one in the Goal Birds tab first.
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-4">
                {goalLists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAddToGoalList(list.id)}
                    className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:border-[#2C3E7B] hover:bg-blue-50 transition-colors"
                  >
                    <div className="font-medium text-[#2C3E50]">{list.name}</div>
                    <div className="text-xs text-gray-500">
                      {list.speciesCodes.length} bird{list.speciesCodes.length !== 1 ? 's' : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleCancelAddToGoalList}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Toast */}
      {showSuccessMessage && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">{showSuccessMessage}</span>
          </div>
        </div>
      )}

      {/* Species Info Card Modal */}
      {selectedSpeciesCard && (
        <SpeciesInfoCard
          species={selectedSpeciesCard}
          onClose={() => setSelectedSpeciesCard(null)}
        />
      )}
    </div>
  )
}

// SpeciesInfoCard - popup modal showing species details (photo, badges, eBird link)
function SpeciesInfoCard({
  species,
  onClose,
}: {
  species: Species
  onClose: () => void
}) {
  const conservationColors: Record<string, { bg: string; text: string; label: string }> = {
    'Least Concern': { bg: 'bg-green-100', text: 'text-green-800', label: 'Least Concern' },
    'Near Threatened': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Near Threatened' },
    'Vulnerable': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Vulnerable' },
    'Endangered': { bg: 'bg-red-100', text: 'text-red-800', label: 'Endangered' },
    'Critically Endangered': { bg: 'bg-red-200', text: 'text-red-900', label: 'Critically Endangered' },
    'Unknown': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Unknown' },
  }
  const difficultyColors: Record<string, { bg: string; text: string }> = {
    'Easy': { bg: 'bg-green-100', text: 'text-green-800' },
    'Moderate': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'Hard': { bg: 'bg-orange-100', text: 'text-orange-800' },
    'Very Hard': { bg: 'bg-red-100', text: 'text-red-800' },
    'Extremely Hard': { bg: 'bg-purple-100', text: 'text-purple-800' },
  }
  const conservStyle = conservationColors[species.conservStatus] ?? conservationColors['Unknown']
  const diffStyle = difficultyColors[species.difficultyLabel] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="species-info-card-overlay"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="species-info-card"
      >
        {/* Photo area */}
        <div className="relative bg-gray-100 h-36 flex items-center justify-center overflow-hidden">
          {species.photoUrl ? (
            <img
              src={species.photoUrl}
              alt={species.comName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">No photo available</span>
            </div>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-full p-1.5 text-gray-600 hover:text-gray-900 shadow transition-colors"
            data-testid="species-info-card-close"
            aria-label="Close species info"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Info body */}
        <div className="p-4 space-y-3">
          {/* Names */}
          <div>
            <h3 className="text-lg font-bold text-[#2C3E50] leading-tight" data-testid="species-info-common-name">
              {species.comName}
            </h3>
            <p className="text-sm italic text-gray-500" data-testid="species-info-sci-name">
              {species.sciName}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{species.familyComName}</p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2" data-testid="species-info-badges">
            {/* Conservation status badge */}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${conservStyle.bg} ${conservStyle.text}`}
              data-testid="species-info-conservation-badge"
            >
              🌿 {conservStyle.label}
            </span>
            {/* Difficulty badge */}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${diffStyle.bg} ${diffStyle.text}`}
              data-testid="species-info-difficulty-badge"
            >
              🔭 {species.difficultyLabel}
            </span>
            {/* Restricted range badge */}
            {species.isRestrictedRange && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                data-testid="species-info-restricted-badge"
              >
                📍 Restricted Range
              </span>
            )}
            {/* Invasion status badge if not empty/native */}
            {species.invasionStatus && species.invasionStatus !== '' && species.invasionStatus !== 'Native' && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                data-testid="species-info-invasion-badge"
              >
                ⚠️ {species.invasionStatus}
              </span>
            )}
          </div>

          {/* eBird link */}
          <a
            href={species.ebirdUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-[#2C3E7B] hover:bg-[#1f2d5a] text-white text-sm font-medium rounded-lg transition-colors w-full justify-center"
            data-testid="species-info-ebird-link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
            View on eBird
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}

function GoalBirdsTab() {
  const { isSpeciesSeen } = useLifeList()
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [loading, setLoading] = useState(true)
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingListId, setDeletingListId] = useState<string | null>(null)

  // Species search/add state
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState('')
  const [showDuplicateToast, setShowDuplicateToast] = useState('')

  // List picker for one-tap add with multiple goal lists
  const [listPickerSpecies, setListPickerSpecies] = useState<Species | null>(null)

  // Filter within current list
  const [listFilterTerm, setListFilterTerm] = useState('')

  // Suggestions section state
  const [showRarestSuggestions, setShowRarestSuggestions] = useState(true)
  const [showHardestSuggestions, setShowHardestSuggestions] = useState(true)
  const [showEasyWinsSuggestions, setShowEasyWinsSuggestions] = useState(true)
  const [showMigrantSuggestions, setShowMigrantSuggestions] = useState(true)
  const [showRegionalIconsSuggestions, setShowRegionalIconsSuggestions] = useState(true)
  const [showSeasonalSpecialtiesSuggestions, setShowSeasonalSpecialtiesSuggestions] = useState(true)
  const [showColorfulCharactersSuggestions, setShowColorfulCharactersSuggestions] = useState(true)
  const [showOwlsNightbirdsSuggestions, setShowOwlsNightbirdsSuggestions] = useState(true)
  const [showRaptorsSuggestions, setShowRaptorsSuggestions] = useState(true)
  const [showLBJsSuggestions, setShowLBJsSuggestions] = useState(true)

  // Curated Regional Icons — signature/must-see birds for each North American region
  // Derived from pipeline config curated data
  const REGIONAL_ICONS: Array<{ region: string; regionKey: string; emoji: string; speciesCodes: string[] }> = [
    {
      region: 'Southwest',
      regionKey: 'southwest',
      emoji: '🌵',
      speciesCodes: ['greroa', 'gamqua', 'phaino', 'paired', 'gilfli'],
    },
    {
      region: 'Southeast',
      regionKey: 'southeast',
      emoji: '🌿',
      speciesCodes: ['swtkit', 'flsjay', 'prowar', 'recwoo', 'bnhnut'],
    },
    {
      region: 'Northeast',
      regionKey: 'northeast',
      emoji: '🍂',
      speciesCodes: ['bicthr', 'atlpuf', 'comeid', 'amewoo'],
    },
    {
      region: 'Midwest',
      regionKey: 'midwest',
      emoji: '🌾',
      speciesCodes: ['henspa', 'dickci', 'belvir', 'grpchi', 'sancra'],
    },
    {
      region: 'Rockies',
      regionKey: 'rockies',
      emoji: '⛰️',
      speciesCodes: ['whtpta1', 'bkrfin', 'clanut', 'amedip', 'stejay'],
    },
    {
      region: 'West Coast',
      regionKey: 'westcoast',
      emoji: '🌊',
      speciesCodes: ['tufpuf', 'spoowl', 'marmur', 'blkoys'],
    },
    {
      region: 'Alaska',
      regionKey: 'alaska',
      emoji: '❄️',
      speciesCodes: ['speeid', 'gyrfal', 'brtcur', 'snoowl1', 'yebloo'],
    },
    {
      region: 'Hawaii',
      regionKey: 'hawaii',
      emoji: '🌺',
      speciesCodes: ['hawgoo', 'apapan', 'iiwi'],
    },
  ]

  // Curated Colorful Characters — show-stopper birds known for striking, vivid plumage
  // Derived from curated species tags in pipeline config
  const COLORFUL_CHARACTERS: string[] = [
    'paibun',   // Painted Bunting — arguably North America's most colorful bird
    'scatan',   // Scarlet Tanager — brilliant red with jet-black wings
    'verfly',   // Vermilion Flycatcher — electric red male
    'rosspo1',  // Roseate Spoonbill — hot pink wading bird
    'wooduc',   // Wood Duck — intricate iridescent plumage
    'purgal2',  // Purple Gallinule — vivid purple, blue, and green
    'westan',   // Western Tanager — yellow, orange, and black
    'lazbun',   // Lazuli Bunting — turquoise and cinnamon
    'indbun',   // Indigo Bunting — deep blue male
    'norcar',   // Northern Cardinal — brilliant red
    'bkhgro',   // Black-headed Grosbeak — rich orange and black
    'amegfi',   // American Goldfinch — canary yellow
    'harduc',   // Harlequin Duck — bold harlequin pattern
    'grefla2',  // American Flamingo — vivid pink
    'varthr',   // Varied Thrush — striking orange and slate
    'bkbwar',   // Blackburnian Warbler — brilliant orange throat
    'amered',   // American Redstart — bright orange patches
    'bulori',   // Bullock's Oriole — vivid orange and black
    'vigswa',   // Violet-green Swallow — iridescent green and violet
    'cedwax',   // Cedar Waxwing — sleek with red/yellow wax-tips
  ]

  // Curated Owls & Nightbirds — nocturnal species requiring special effort to find
  // Owls, nightjars, nighthawks, poorwills, and other nightbirds of North America
  const OWLS_NIGHTBIRDS: string[] = [
    'grhowl',    // Great Horned Owl — iconic large owl, widespread
    'snoowl1',   // Snowy Owl — spectacular Arctic visitor, beloved irruptive species
    'brdowl',    // Barred Owl — distinctive hooting owl of eastern forests
    'grgowl',    // Great Gray Owl — massive boreal owl, highly sought after
    'brnowl',    // American Barn Owl — ghostly pale barn owl
    'easowl1',   // Eastern Screech-Owl — small cryptic owl of eastern woodlands
    'wesowl1',   // Western Screech-Owl — western counterpart of Eastern Screech
    'nohowl',    // Northern Hawk Owl — diurnal boreal owl, hunts like a hawk
    'sheowl',    // Short-eared Owl — open-country owl, crepuscular hunter
    'loeowl',    // Long-eared Owl — secretive roosting owl, rare to find
    'borowl',    // Boreal Owl — elusive northern forest specialist
    'nswowl',    // Northern Saw-whet Owl — tiny and endearing, migrates in large numbers
    'burowl',    // Burrowing Owl — unique ground-nesting owl, often diurnal
    'nopowl',    // Northern Pygmy-Owl — tiny but fierce predator of western forests
    'elfowl',    // Elf Owl — world's smallest owl, nests in cacti
    'flaowl',    // Flammulated Owl — tiny insectivorous mountain owl
    'fepowl',    // Ferruginous Pygmy-Owl — small owl of southern borderlands
    'spoowl',    // Spotted Owl — old-growth forest specialist, conservation icon
    'easwpw1',   // Eastern Whip-poor-will — haunting song of eastern summer nights
    'souwpw1',   // Mexican Whip-poor-will — western whip-poor-will of pine forests
    'chwwid',    // Chuck-will's-widow — largest North American nightjar
    'compoo',    // Common Poorwill — smallest North American nightjar, hibernates!
    'comnig',    // Common Nighthawk — aerial insectivore of open skies
    'lesnig',    // Lesser Nighthawk — southwestern nighthawk
    'compau',    // Common Pauraque — tropical nightjar of southern Texas
  ]

  // Curated Raptors — hawks, eagles, falcons, ospreys, kites, harriers, and vultures
  const RAPTORS: string[] = [
    'osprey',    // Osprey — fish-hunting raptor, dramatic dives
    'baleag',    // Bald Eagle — national symbol, unmistakable adult plumage
    'goleag',    // Golden Eagle — majestic mountain and cliff hunter
    'swahaw',    // Swainson's Hawk — long-distance migrant, spectacular kettles
    'rethaw',    // Red-tailed Hawk — quintessential North American hawk
    'coohaw',    // Cooper's Hawk — agile accipiter of woodland edges
    'shshaw',    // Sharp-shinned Hawk — smallest North American accipiter
    'norhar2',   // Northern Harrier — low-coursing marsh hawk, buoyant flight
    'miskit',    // Mississippi Kite — graceful kite of southern river bottoms
    'swtkit',    // Swallow-tailed Kite — spectacular fork-tailed kite of SE US
    'whtkit',    // White-tailed Kite — pale hovering kite of western grasslands
    'snakit',    // Snail Kite — specialist on apple snails, Florida wetlands
    'brwhaw',    // Broad-winged Hawk — spring/fall migration kettle spectacle
    'reshaw',    // Red-shouldered Hawk — riparian forest hawk of eastern US
    'ferhaw',    // Ferruginous Hawk — largest North American buteo, prairie specialist
    'rolhaw',    // Rough-legged Hawk — Arctic breeder, winter visitor to grasslands
    'prafal',    // Prairie Falcon — pale falcon of open western landscapes
    'merlin',    // Merlin — compact, fast falcon of boreal forests and coasts
    'amekes',    // American Kestrel — colorful smallest falcon, hovers in place
    'perfal',    // Peregrine Falcon — fastest animal on Earth, stoops at prey
    'gyrfal',    // Gyrfalcon — massive Arctic falcon, rare and thrilling winter visitor
    'turvul',    // Turkey Vulture — widespread soaring scavenger, wobbling flight
    'blkvul',    // Black Vulture — short-tailed vulture, flapping flight style
    'calcon',    // California Condor — largest North American land bird, conservation story
    'y00678',    // Crested Caracara — unusual raptor with carrion and insect diet
  ]

  // Curated LBJs — Little Brown Jobs: the notoriously tricky small brown birds
  // Sparrows, wrens, pipits, juncos, and related species that challenge even experienced birders
  const LBJS: string[] = [
    'sonspa',    // Song Sparrow — quintessential LBJ, streaked brown, ubiquitous
    'swaspa',    // Swamp Sparrow — rusty-winged marsh sparrow
    'savspa',    // Savannah Sparrow — grassland sparrow, fine breast streaking
    'whtspa',    // White-throated Sparrow — bold white throat, tan or white morph
    'whcspa',    // White-crowned Sparrow — crisp black-and-white head stripes
    'chispa',    // Chipping Sparrow — red cap, black eye line, tidy suburban sparrow
    'fiespa',    // Field Sparrow — plain face, pink bill, bouncing-ball song
    'foxspa',    // Fox Sparrow — largest sparrow, thick-billed, rich rufous
    'larspa',    // Lark Sparrow — harlequin face pattern, central breast spot
    'daejun',    // Dark-eyed Junco — the "snowbird", slate-gray with white outer tail
    'amtspa',    // American Tree Sparrow — bicolored bill, rusty cap, winter visitor
    'graspa',    // Grasshopper Sparrow — flat-headed, flat-backed, flat-sounding
    'henspa',    // Henslow's Sparrow — olive-headed, secretive grass dweller
    'lecspa',    // LeConte's Sparrow — buffy-orange, extremely secretive marsh sparrow
    'linspa',    // Lincoln's Sparrow — buffy-washed breast, fine streaking
    'amepip',    // American Pipit — long-tailed ground bird, bobs tail incessantly
    'carwre',    // Carolina Wren — loud voice for small body, rufous with white supercilium
    'bewwre',    // Bewick's Wren — long tail, bold white eyebrow, western counterpart
    'houwre',    // Northern House Wren — plain brown, chattering song, cavity nester
    'marwre',    // Marsh Wren — bold white eyebrow, woven nest over water
    'rocwre',    // Rock Wren — pale gray-brown, bobbing behavior on rocky slopes
    'cacwre',    // Cactus Wren — largest North American wren, spotted chest
    'spotow',    // Spotted Towhee — rufous sides, bold spotting on wings
    'eastow',    // Eastern Towhee — classic "drink-your-teeeea" eastern counterpart
    'laplon',    // Lapland Longspur — Arctic breeder, abundant winter grassland bird
  ]

  // Species info card state
  const [selectedSpeciesCard, setSelectedSpeciesCard] = useState<Species | null>(null)

  // Load goal lists from IndexedDB on mount
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        setLoading(true)
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)

        // Restore previously active list from localStorage, or use first list
        const savedActiveListId = localStorage.getItem('activeGoalListId')
        if (lists.length > 0) {
          // If saved ID exists and is in the list, use it; otherwise use first list
          const validSavedId = savedActiveListId && lists.some((list) => list.id === savedActiveListId)
          setActiveListId(validSavedId ? savedActiveListId : lists[0].id)
          console.log(`Restored active goal list: ${validSavedId ? savedActiveListId : lists[0].id}`)
        }
        setLoading(false)
      } catch (error) {
        console.error('Failed to load goal lists:', error)
        setLoading(false)
      }
    }

    loadGoalLists()
  }, [])

  // Save active list ID to localStorage whenever it changes, and reset list filter
  useEffect(() => {
    if (activeListId) {
      localStorage.setItem('activeGoalListId', activeListId)
      console.log(`Saved active goal list ID to localStorage: ${activeListId}`)
    } else {
      localStorage.removeItem('activeGoalListId')
    }
    // Reset the within-list filter when switching lists
    setListFilterTerm('')
  }, [activeListId])

  // Load species metadata for search/add functionality
  useEffect(() => {
    const loadSpecies = async () => {
      try {
        const response = await fetch('/api/species')
        if (!response.ok) return
        const data: Species[] = await response.json()
        setAllSpecies(data)
        console.log('Goal Birds: Loaded species metadata', data.length)
      } catch (error) {
        console.error('Failed to load species for Goal Birds:', error)
      }
    }
    loadSpecies()
  }, [])

  const handleCreateList = async () => {
    if (!newListName.trim()) {
      return
    }

    try {
      const newList: GoalList = {
        id: crypto.randomUUID(),
        name: newListName.trim(),
        speciesCodes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await goalListsDB.saveList(newList)

      // Update state
      setGoalLists((prev) => [...prev, newList])
      setActiveListId(newList.id)

      // Reset form
      setShowCreateDialog(false)
      setNewListName('')
    } catch (error) {
      console.error('Failed to create goal list:', error)
    }
  }

  const handleStartRename = (list: GoalList) => {
    setRenamingListId(list.id)
    setRenameValue(list.name)
  }

  const handleConfirmRename = async () => {
    if (!renamingListId || !renameValue.trim()) {
      return
    }

    try {
      const updatedList = await goalListsDB.renameList(renamingListId, renameValue.trim())
      console.log(`Renamed goal list to "${updatedList.name}"`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === renamingListId
            ? { ...list, name: updatedList.name, updatedAt: updatedList.updatedAt }
            : list
        )
      )

      // Reset rename state
      setRenamingListId(null)
      setRenameValue('')
    } catch (error) {
      console.error('Failed to rename goal list:', error)
    }
  }

  const handleCancelRename = () => {
    setRenamingListId(null)
    setRenameValue('')
  }

  const handleStartDelete = (list: GoalList) => {
    setDeletingListId(list.id)
    setShowDeleteDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!deletingListId) {
      return
    }

    try {
      await goalListsDB.deleteList(deletingListId)
      console.log(`Deleted goal list: ${deletingListId}`)

      // Update state: remove the deleted list
      const remainingLists = goalLists.filter((list) => list.id !== deletingListId)
      setGoalLists(remainingLists)

      // Set new active list (first remaining list, or null if none)
      if (remainingLists.length > 0) {
        setActiveListId(remainingLists[0].id)
      } else {
        setActiveListId(null)
      }

      // Reset delete state
      setShowDeleteDialog(false)
      setDeletingListId(null)
    } catch (error) {
      console.error('Failed to delete goal list:', error)
    }
  }

  const handleCancelDelete = () => {
    setShowDeleteDialog(false)
    setDeletingListId(null)
  }

  // Handle species search and add — shows list picker if multiple lists exist
  const handleAddSpecies = (species: Species) => {
    if (!activeListId) return

    if (goalLists.length > 1) {
      // Multiple lists: show quick list selector (no confirmation dialog)
      setListPickerSpecies(species)
    } else {
      // Single list: add directly, no picker needed
      void handleAddSpeciesToList(species, activeListId)
    }
  }

  // Performs the actual add to a specific list (called from list picker or directly)
  const handleAddSpeciesToList = async (species: Species, listId: string) => {
    // Close picker immediately (instant UX)
    setListPickerSpecies(null)

    try {
      const targetList = goalLists.find((list) => list.id === listId)
      if (!targetList) return

      // Check for duplicates
      if (targetList.speciesCodes.includes(species.speciesCode)) {
        setShowDuplicateToast(`${species.comName} is already in ${targetList.name}`)
        setTimeout(() => setShowDuplicateToast(''), 3000)
        setSearchQuery('')
        setShowSuggestions(false)
        return
      }

      // Add species to the list
      await goalListsDB.addSpeciesToList(listId, species.speciesCode)
      console.log(`Added ${species.comName} (${species.speciesCode}) to goal list "${targetList.name}"`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === listId
            ? { ...list, speciesCodes: [...list.speciesCodes, species.speciesCode] }
            : list
        )
      )

      // Show success toast
      setShowSuccessToast(`Added ${species.comName} to ${targetList.name}`)
      setTimeout(() => setShowSuccessToast(''), 3000)

      // Clear search
      setSearchQuery('')
      setShowSuggestions(false)
    } catch (error) {
      console.error('Failed to add species to goal list:', error)
    }
  }

  // Handle species removal
  const handleRemoveSpecies = async (speciesCode: string, speciesName: string) => {
    if (!activeListId) return

    try {
      const activeList = goalLists.find((list) => list.id === activeListId)
      if (!activeList) return

      // Remove species from the list
      await goalListsDB.removeSpeciesFromList(activeListId, speciesCode)
      console.log(`Removed ${speciesName} (${speciesCode}) from goal list`)

      // Update state
      setGoalLists((prev) =>
        prev.map((list) =>
          list.id === activeListId
            ? { ...list, speciesCodes: list.speciesCodes.filter((code) => code !== speciesCode) }
            : list
        )
      )

      // Show success toast
      setShowSuccessToast(`Removed ${speciesName} from ${activeList.name}`)
      setTimeout(() => setShowSuccessToast(''), 3000)
    } catch (error) {
      console.error('Failed to remove species from goal list:', error)
    }
  }

  // Filter species based on search query
  const filteredSpecies = searchQuery.trim()
    ? allSpecies.filter((species) => {
        const query = searchQuery.toLowerCase()
        return (
          species.comName.toLowerCase().includes(query) ||
          species.sciName.toLowerCase().includes(query) ||
          species.speciesCode.toLowerCase().includes(query)
        )
      }).slice(0, 10) // Limit to 10 suggestions
    : []

  const activeList = goalLists.find((list) => list.id === activeListId)
  const deletingList = goalLists.find((list) => list.id === deletingListId)

  // Filter the species codes in the current active list by listFilterTerm
  const filteredListCodes: string[] = (() => {
    if (!activeList) return []
    if (!listFilterTerm.trim()) return activeList.speciesCodes
    const q = listFilterTerm.toLowerCase()
    return activeList.speciesCodes.filter((code) => {
      const species = allSpecies.find((s) => s.speciesCode === code)
      if (!species) return code.toLowerCase().includes(q)
      return (
        species.comName.toLowerCase().includes(q) ||
        species.sciName.toLowerCase().includes(q) ||
        code.toLowerCase().includes(q)
      )
    })
  })()

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Goal Birds</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#2C3E50]">Goal Birds</h3>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-3 py-1.5 bg-[#2C3E7B] text-white text-xs font-medium rounded-lg hover:bg-[#1f2d5a] transition-colors"
          >
            + New List
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Create and manage lists of birds you want to see.
        </p>

        {/* List selector */}
        {goalLists.length > 0 && (
          <div className="space-y-2">
            {renamingListId === activeListId ? (
              /* Inline rename input */
              <div className="flex gap-2">
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmRename()
                    if (e.key === 'Escape') handleCancelRename()
                  }}
                  placeholder="Enter new name..."
                  className="flex-1 px-3 py-2 text-sm border border-[#2C3E7B] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  autoFocus
                  data-testid="rename-input"
                />
                <button
                  onClick={handleConfirmRename}
                  disabled={!renameValue.trim()}
                  className="px-3 py-2 text-sm text-white bg-[#2C3E7B] rounded-lg hover:bg-[#1f2d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Save new name"
                  data-testid="rename-save-btn"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelRename}
                  className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  title="Cancel rename"
                  data-testid="rename-cancel-btn"
                >
                  Cancel
                </button>
              </div>
            ) : (
              /* Normal list selector with rename button */
              <div className="flex gap-2">
                <select
                  value={activeListId || ''}
                  onChange={(e) => setActiveListId(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  data-testid="goal-list-selector"
                >
                  {goalLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name} ({list.speciesCodes.length} birds)
                    </option>
                  ))}
                </select>
                {activeList && (
                  <>
                    <button
                      onClick={() => handleStartRename(activeList)}
                      className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 hover:text-gray-800 transition-colors"
                      title="Rename list"
                      data-testid="rename-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleStartDelete(activeList)}
                      className="px-3 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors"
                      title="Delete list"
                      data-testid="delete-list-btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-white rounded-lg p-6 w-80 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-4">Create New Goal List</h4>

            <div className="space-y-4">
              <div>
                <label htmlFor="list-name" className="block text-sm font-medium text-gray-700 mb-1">
                  List Name
                </label>
                <input
                  id="list-name"
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                  placeholder="e.g., Dream Birds"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCreateDialog(false)
                    setNewListName('')
                  }}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateList}
                  disabled={!newListName.trim()}
                  className="px-4 py-2 text-sm text-white bg-[#2C3E7B] rounded-lg hover:bg-[#1f2d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && deletingList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCancelDelete}>
          <div className="bg-white rounded-lg p-6 w-96 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-4">Delete Goal List?</h4>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <span className="font-semibold">Warning:</span> You are about to delete the goal list{' '}
                  <span className="font-semibold">"{deletingList.name}"</span>
                  {deletingList.speciesCodes.length > 0 && (
                    <>
                      {' '}which contains <span className="font-semibold">{deletingList.speciesCodes.length} bird{deletingList.speciesCodes.length !== 1 ? 's' : ''}</span>
                    </>
                  )}.
                </p>
                <p className="text-sm text-red-800 mt-2">
                  This action cannot be undone.
                </p>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleCancelDelete}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  data-testid="delete-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                  data-testid="delete-confirm-btn"
                >
                  Delete List
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List content or empty state */}
      <div className="flex-1 overflow-y-auto mt-3">
        {goalLists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <h4 className="text-lg font-semibold text-[#2C3E50] mb-2">No Goal Lists Yet</h4>
            <p className="text-sm text-gray-600 mb-4">
              Create your first goal list to start tracking birds you want to see.
            </p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-4 py-2 bg-[#2C3E7B] text-white text-sm font-medium rounded-lg hover:bg-[#1f2d5a] transition-colors"
            >
              Create Your First List
            </button>
          </div>
        ) : activeList ? (
          <div className="space-y-3">
            {/* Search/Add Species Interface */}
            <div className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowSuggestions(true)
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Search species to add..."
                  className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                  data-testid="species-search-input"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && searchQuery.trim() && filteredSpecies.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredSpecies.map((species) => (
                    <button
                      key={species.speciesCode}
                      onClick={() => handleAddSpecies(species)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                      data-testid={`species-suggestion-${species.speciesCode}`}
                    >
                      <div className="text-sm font-medium text-[#2C3E50]">
                        {species.comName}
                      </div>
                      <div className="text-xs italic text-gray-600">
                        {species.sciName}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results message */}
              {showSuggestions && searchQuery.trim() && filteredSpecies.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                  <p className="text-sm text-gray-600">No species found matching "{searchQuery}"</p>
                </div>
              )}
            </div>

            {/* Species in List */}
            {activeList.speciesCodes.length === 0 ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-700">
                  <span className="font-medium">This list is empty.</span>
                  <br />
                  Search and add species above, or add from the Species tab.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Filter within list search bar */}
                <div className="relative">
                  <input
                    type="text"
                    value={listFilterTerm}
                    onChange={(e) => setListFilterTerm(e.target.value)}
                    placeholder="Filter list by name..."
                    className="w-full px-3 py-1.5 pr-8 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
                    data-testid="goal-list-filter-input"
                  />
                  {listFilterTerm ? (
                    <button
                      onClick={() => setListFilterTerm('')}
                      className="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600"
                      title="Clear filter"
                      data-testid="goal-list-filter-clear"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-2 top-1.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  )}
                </div>

                {/* Progress Summary */}
                {(() => {
                  const total = activeList.speciesCodes.length
                  const seenCount = activeList.speciesCodes.filter((code) => isSpeciesSeen(code)).length
                  const progressPct = total > 0 ? Math.round((seenCount / total) * 100) : 0
                  return (
                    <div className="space-y-1" data-testid="goal-list-progress-summary">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide" data-testid="goal-list-count">
                          {listFilterTerm.trim()
                            ? `${filteredListCodes.length} of ${activeList.speciesCodes.length} bird${activeList.speciesCodes.length !== 1 ? 's' : ''}`
                            : `${activeList.speciesCodes.length} bird${activeList.speciesCodes.length !== 1 ? 's' : ''} in list`}
                        </div>
                        <div
                          className="text-xs font-semibold text-green-700"
                          data-testid="goal-list-seen-count"
                        >
                          {seenCount} of {total} seen
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div
                        className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden"
                        data-testid="goal-list-progress-bar"
                        title={`${progressPct}% complete`}
                      >
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                          data-testid="goal-list-progress-fill"
                        />
                      </div>
                    </div>
                  )
                })()}

                {filteredListCodes.length === 0 ? (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-sm text-gray-500">No species match "{listFilterTerm}"</p>
                  </div>
                ) : (
                  filteredListCodes.map((code) => {
                    const species = allSpecies.find((s) => s.speciesCode === code)
                    const seen = isSpeciesSeen(code)
                    return (
                      <div
                        key={code}
                        className={`px-3 py-2 rounded-lg flex items-center justify-between transition-colors group ${
                          seen
                            ? 'bg-gray-100 hover:bg-gray-200'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        data-testid={`goal-species-${code}`}
                      >
                        {/* Clickable species info area */}
                        <button
                          className="flex-1 min-w-0 text-left"
                          onClick={() => species && setSelectedSpeciesCard(species)}
                          title={species ? `View ${species.comName} info` : code}
                          data-testid={`goal-species-info-btn-${code}`}
                        >
                          <div
                            className={`text-sm font-medium truncate ${
                              seen
                                ? 'line-through text-gray-400'
                                : 'text-[#2C3E50] hover:text-[#2C3E7B]'
                            }`}
                            data-testid={seen ? `goal-species-seen-${code}` : `goal-species-unseen-${code}`}
                          >
                            {species ? species.comName : code}
                          </div>
                          {species && (
                            <div className={`text-xs italic truncate ${seen ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                              {species.sciName}
                            </div>
                          )}
                          {seen && (
                            <div className="text-xs text-green-600 font-medium mt-0.5">
                              ✓ Seen
                            </div>
                          )}
                        </button>
                        {/* Action buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {/* Info button */}
                          {species && (
                            <button
                              onClick={() => setSelectedSpeciesCard(species)}
                              className="p-1 text-[#2C3E7B] hover:bg-[#2C3E7B] hover:text-white rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="View species info"
                              data-testid={`goal-species-info-icon-${code}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                          {/* Remove button */}
                          <button
                            onClick={() => handleRemoveSpecies(code, species?.comName || code)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove from list"
                            data-testid={`remove-species-${code}`}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* Rarest in North America Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              const rarestSuggestions = allSpecies
                .filter((sp) => sp.isRestrictedRange && !isSpeciesSeen(sp.speciesCode))
                .slice(0, 20) // Take up to 20 unseen restricted-range species

              if (rarestSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRarestSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    data-testid="rarest-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-bold text-sm">📍</span>
                      <span className="text-sm font-semibold text-amber-800">Rarest in North America</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                        {rarestSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-amber-600 transition-transform ${showRarestSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRarestSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="rarest-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Restricted-range species not yet on your life list. Tap + to add to this goal list.
                      </p>
                      {rarestSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`rarest-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                                  📍 Rare
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`rarest-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`rarest-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`rarest-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Easy Wins Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with Easy difficulty (score < 0.25), sorted by score ascending (easiest/highest probability first)
              const easyWinsSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore < 0.25 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => a.difficultyScore - b.difficultyScore)
                .slice(0, 20) // Top 20 easiest unseen species

              if (easyWinsSuggestions.length === 0) return null

              const getEasyBadgeStyle = (score: number) => {
                if (score < 0.10) return { bg: 'bg-green-100', text: 'text-green-800', label: 'Very Easy' }
                if (score < 0.18) return { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Easy' }
                return { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Fairly Easy' }
              }

              return (
                <div className="mt-4" data-testid="easy-wins-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowEasyWinsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                    data-testid="easy-wins-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-green-600 font-bold text-sm">⭐</span>
                      <span className="text-sm font-semibold text-green-800">Easy Wins</span>
                      <span className="text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full font-medium">
                        {easyWinsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-green-600 transition-transform ${showEasyWinsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showEasyWinsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="easy-wins-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Unseen species with high occurrence probability — sorted easiest first. Great lifers to target on your next trip!
                      </p>
                      {easyWinsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getEasyBadgeStyle(sp.difficultyScore)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`easy-wins-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`easy-wins-probability-badge-${sp.speciesCode}`}
                                >
                                  ⭐ {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`easy-wins-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`easy-wins-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`easy-wins-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Hardest to Find Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with Very Hard difficulty, sorted by score descending (hardest first)
              const hardestSuggestions = allSpecies
                .filter((sp) => sp.difficultyScore >= 0.75 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => b.difficultyScore - a.difficultyScore)
                .slice(0, 20) // Top 20 hardest unseen species

              if (hardestSuggestions.length === 0) return null

              const getDifficultyBadgeStyle = (score: number) => {
                if (score >= 0.90) return { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Extremely Hard' }
                if (score >= 0.75) return { bg: 'bg-red-100', text: 'text-red-800', label: 'Very Hard' }
                return { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Hard' }
              }

              return (
                <div className="mt-4" data-testid="hardest-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowHardestSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    data-testid="hardest-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-purple-600 font-bold text-sm">🔭</span>
                      <span className="text-sm font-semibold text-purple-800">Hardest to Find</span>
                      <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full font-medium">
                        {hardestSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-purple-600 transition-transform ${showHardestSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showHardestSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="hardest-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Species with the lowest average occurrence probability — sorted hardest first. Tap + to add to this goal list.
                      </p>
                      {hardestSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getDifficultyBadgeStyle(sp.difficultyScore)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`hardest-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`hardest-difficulty-badge-${sp.speciesCode}`}
                                >
                                  🔭 {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`hardest-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`hardest-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`hardest-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Long-Distance Migrants Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with rangeShiftScore >= 0.5, sorted by score descending (biggest migrants first)
              const migrantSuggestions = allSpecies
                .filter((sp) => (sp.rangeShiftScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.rangeShiftScore ?? 0) - (a.rangeShiftScore ?? 0))
                .slice(0, 20) // Top 20 most dramatic long-distance migrants

              if (migrantSuggestions.length === 0) return null

              const getMigrantBadgeStyle = (score: number) => {
                if (score >= 0.875) return { bg: 'bg-sky-100', text: 'text-sky-800', label: 'Epic Migration' }
                if (score >= 0.75) return { bg: 'bg-sky-100', text: 'text-sky-700', label: 'Long Range' }
                return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Migratory' }
              }

              return (
                <div className="mt-4" data-testid="migrants-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowMigrantSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors"
                    data-testid="migrants-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sky-600 font-bold text-sm">🦅</span>
                      <span className="text-sm font-semibold text-sky-800">Long-Distance Migrants</span>
                      <span className="text-xs bg-sky-200 text-sky-800 px-1.5 py-0.5 rounded-full font-medium">
                        {migrantSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-sky-600 transition-transform ${showMigrantSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showMigrantSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="migrants-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Species with the most dramatic range shifts across weeks — great for tracking on the migration animation. Tap + to add to this goal list.
                      </p>
                      {migrantSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const badgeStyle = getMigrantBadgeStyle(sp.rangeShiftScore ?? 0)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`migrants-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${badgeStyle.bg} ${badgeStyle.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`migrants-shift-badge-${sp.speciesCode}`}
                                >
                                  🦅 {badgeStyle.label}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`migrants-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 truncate mt-0.5">{sp.sciName}</p>
                            </div>
                            {/* Add / already-added button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`migrants-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`migrants-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Regional Icons Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)

              // Build flat list of regional icon species that are unseen
              // Each entry includes region info for grouping/labeling
              interface RegionalIconEntry {
                speciesCode: string
                comName: string
                sciName: string
                region: string
                regionKey: string
                emoji: string
              }

              const regionalIconEntries: RegionalIconEntry[] = []
              for (const regionGroup of REGIONAL_ICONS) {
                for (const code of regionGroup.speciesCodes) {
                  const sp = allSpecies.find((s) => s.speciesCode === code)
                  if (sp && !isSpeciesSeen(sp.speciesCode)) {
                    regionalIconEntries.push({
                      speciesCode: sp.speciesCode,
                      comName: sp.comName,
                      sciName: sp.sciName,
                      region: regionGroup.region,
                      regionKey: regionGroup.regionKey,
                      emoji: regionGroup.emoji,
                    })
                  }
                }
              }

              if (regionalIconEntries.length === 0) return null

              // Group entries by region for display
              const groupedByRegion: { [region: string]: RegionalIconEntry[] } = {}
              for (const entry of regionalIconEntries) {
                if (!groupedByRegion[entry.region]) groupedByRegion[entry.region] = []
                groupedByRegion[entry.region].push(entry)
              }

              // Only show regions that have at least one unseen species
              const regionsToShow = REGIONAL_ICONS.filter((rg) => groupedByRegion[rg.region]?.length > 0)

              return (
                <div className="mt-4" data-testid="regional-icons-suggestions-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRegionalIconsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
                    data-testid="regional-icons-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-teal-600 font-bold text-sm">🗺️</span>
                      <span className="text-sm font-semibold text-teal-800">Regional Icons</span>
                      <span className="text-xs bg-teal-200 text-teal-800 px-1.5 py-0.5 rounded-full font-medium">
                        {regionalIconEntries.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-teal-600 transition-transform ${showRegionalIconsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRegionalIconsSuggestions && (
                    <div className="mt-1 space-y-3" data-testid="regional-icons-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Signature species for each region — the must-see birds of the Southwest, Northeast, and beyond.
                      </p>
                      {regionsToShow.map((regionGroup) => {
                        const entries = groupedByRegion[regionGroup.region] || []
                        return (
                          <div key={regionGroup.regionKey} data-testid={`regional-icons-group-${regionGroup.regionKey}`}>
                            {/* Region label */}
                            <div className="flex items-center gap-1.5 px-1 mb-1">
                              <span className="text-sm">{regionGroup.emoji}</span>
                              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                                {regionGroup.region}
                              </span>
                            </div>
                            {/* Species in this region */}
                            <div className="space-y-1">
                              {entries.map((entry) => {
                                const alreadyInList = activeListCodes.has(entry.speciesCode)
                                const sp = allSpecies.find((s) => s.speciesCode === entry.speciesCode)
                                if (!sp) return null
                                return (
                                  <div
                                    key={entry.speciesCode}
                                    className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                                      alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                                    }`}
                                    data-testid={`regional-icons-suggestion-${entry.speciesCode}`}
                                  >
                                    {/* Species info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-sm font-medium text-[#2C3E50] truncate">
                                          {entry.comName}
                                        </span>
                                        <span
                                          className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                          data-testid={`regional-icons-region-badge-${entry.speciesCode}`}
                                        >
                                          {regionGroup.emoji} {regionGroup.region}
                                        </span>
                                        {alreadyInList && (
                                          <span
                                            className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                            data-testid={`regional-icons-in-list-badge-${entry.speciesCode}`}
                                          >
                                            ✓ In list
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs italic text-gray-500 truncate">{entry.sciName}</div>
                                    </div>

                                    {/* Add button */}
                                    {alreadyInList ? (
                                      <div
                                        className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                        title="Already in this goal list"
                                        data-testid={`regional-icons-already-added-${entry.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => handleAddSpecies(sp)}
                                        className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                        title={`Add ${entry.comName} to goal list`}
                                        data-testid={`regional-icons-add-btn-${entry.speciesCode}`}
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Seasonal Specialties Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter unseen species with high seasonality score (>= 0.5), sorted by score descending
              const seasonalSuggestions = allSpecies
                .filter((sp) => (sp.seasonalityScore ?? 0) >= 0.5 && !isSpeciesSeen(sp.speciesCode))
                .slice()
                .sort((a, b) => (b.seasonalityScore ?? 0) - (a.seasonalityScore ?? 0))
                .slice(0, 20) // Top 20 most seasonal unseen species

              if (seasonalSuggestions.length === 0) return null

              const getSeasonLabel = (peakWeek: number): string => {
                if (peakWeek === 0) return 'Year-round'
                if (peakWeek <= 13) return 'Winter (Jan–Mar)'
                if (peakWeek <= 26) return 'Spring (Apr–Jun)'
                if (peakWeek <= 39) return 'Summer (Jul–Sep)'
                return 'Fall (Oct–Dec)'
              }

              const getSeasonColor = (peakWeek: number) => {
                if (peakWeek === 0) return { bg: 'bg-gray-100', text: 'text-gray-700' }
                if (peakWeek <= 13) return { bg: 'bg-blue-100', text: 'text-blue-800' }
                if (peakWeek <= 26) return { bg: 'bg-pink-100', text: 'text-pink-800' }
                if (peakWeek <= 39) return { bg: 'bg-yellow-100', text: 'text-yellow-800' }
                return { bg: 'bg-orange-100', text: 'text-orange-800' }
              }

              return (
                <div className="mt-4" data-testid="seasonal-specialties-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowSeasonalSpecialtiesSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors"
                    data-testid="seasonal-suggestions-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-600 font-bold text-sm">🗓️</span>
                      <span className="text-sm font-semibold text-cyan-800">Seasonal Specialties</span>
                      <span className="text-xs bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded-full font-medium">
                        {seasonalSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-cyan-600 transition-transform ${showSeasonalSpecialtiesSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showSeasonalSpecialtiesSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="seasonal-suggestions-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Species with narrow availability windows — spike seasonally then disappear. Catch them while you can! Tap + to add to this goal list.
                      </p>
                      {seasonalSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        const seasonLabel = getSeasonLabel(sp.peakWeek ?? 0)
                        const seasonColor = getSeasonColor(sp.peakWeek ?? 0)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`seasonal-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                <span
                                  className={`text-xs ${seasonColor.bg} ${seasonColor.text} px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0`}
                                  data-testid={`seasonal-season-badge-${sp.speciesCode}`}
                                >
                                  🗓️ {seasonLabel}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`seasonal-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`seasonal-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`seasonal-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Colorful Characters Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated colorful species that are unseen — curated show-stoppers
              const colorfulSuggestions = COLORFUL_CHARACTERS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (colorfulSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="colorful-characters-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowColorfulCharactersSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-fuchsia-50 border border-fuchsia-200 rounded-lg hover:bg-fuchsia-100 transition-colors"
                    data-testid="colorful-characters-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-fuchsia-600 font-bold text-sm">🎨</span>
                      <span className="text-sm font-semibold text-fuchsia-800">Colorful Characters</span>
                      <span className="text-xs bg-fuchsia-200 text-fuchsia-800 px-1.5 py-0.5 rounded-full font-medium">
                        {colorfulSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-fuchsia-600 transition-transform ${showColorfulCharactersSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showColorfulCharactersSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="colorful-characters-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        The show-stoppers — birds famous for their stunning, vibrant plumage. A feast for the eyes and a joy to find! Tap + to add to this goal list.
                      </p>
                      {colorfulSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`colorful-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`colorful-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-fuchsia-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`colorful-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🎨</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`colorful-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`colorful-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`colorful-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Owls & Nightbirds Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated nocturnal species that are unseen
              const owlsNightbirdsSuggestions = OWLS_NIGHTBIRDS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (owlsNightbirdsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="owls-nightbirds-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowOwlsNightbirdsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                    data-testid="owls-nightbirds-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-indigo-600 font-bold text-sm">🦉</span>
                      <span className="text-sm font-semibold text-indigo-800">Owls &amp; Nightbirds</span>
                      <span className="text-xs bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded-full font-medium">
                        {owlsNightbirdsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-indigo-600 transition-transform ${showOwlsNightbirdsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showOwlsNightbirdsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="owls-nightbirds-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Creatures of the night — owls, nightjars, nighthawks, and other nocturnal species that require special effort and late hours to find. Tap + to add to this goal list.
                      </p>
                      {owlsNightbirdsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`owls-nightbirds-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`owls-nightbirds-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`owls-nightbirds-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🦉</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`owls-nightbirds-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`owls-nightbirds-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`owls-nightbirds-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Raptors Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated raptor species that are unseen
              const raptorsSuggestions = RAPTORS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (raptorsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="raptors-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowRaptorsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                    data-testid="raptors-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-amber-600 font-bold text-sm">🦅</span>
                      <span className="text-sm font-semibold text-amber-800">Raptors</span>
                      <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-medium">
                        {raptorsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-amber-600 transition-transform ${showRaptorsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showRaptorsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="raptors-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Hawks, eagles, falcons, ospreys, vultures, and other birds of prey — crowd-pleasers known for power, speed, and drama. Tap + to add to this goal list.
                      </p>
                      {raptorsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`raptors-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`raptors-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`raptors-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🦅</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`raptors-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`raptors-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`raptors-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* LBJs Suggestions */}
            {(() => {
              const activeListCodes = new Set(activeList.speciesCodes)
              // Filter curated LBJ species that are unseen
              const lbjsSuggestions = LBJS
                .map((code) => allSpecies.find((sp) => sp.speciesCode === code))
                .filter((sp): sp is Species => sp !== undefined && !isSpeciesSeen(sp.speciesCode))

              if (lbjsSuggestions.length === 0) return null

              return (
                <div className="mt-4" data-testid="lbjs-section">
                  {/* Section header - collapsible */}
                  <button
                    onClick={() => setShowLBJsSuggestions((prev) => !prev)}
                    className="w-full flex items-center justify-between py-2 px-3 bg-stone-50 border border-stone-200 rounded-lg hover:bg-stone-100 transition-colors"
                    data-testid="lbjs-toggle"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-stone-600 font-bold text-sm">🐦</span>
                      <span className="text-sm font-semibold text-stone-800">LBJs (Little Brown Jobs)</span>
                      <span className="text-xs bg-stone-200 text-stone-800 px-1.5 py-0.5 rounded-full font-medium">
                        {lbjsSuggestions.length}
                      </span>
                    </div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`h-4 w-4 text-stone-600 transition-transform ${showLBJsSuggestions ? 'rotate-180' : ''}`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {showLBJsSuggestions && (
                    <div className="mt-1 space-y-1" data-testid="lbjs-list">
                      <p className="text-xs text-gray-500 px-1 mb-2">
                        Sparrows, wrens, pipits, juncos, and other small brown birds — notoriously difficult to tell apart, a badge of honor for skilled birders. Tap + to add to this goal list.
                      </p>
                      {lbjsSuggestions.map((sp) => {
                        const alreadyInList = activeListCodes.has(sp.speciesCode)
                        return (
                          <div
                            key={sp.speciesCode}
                            className={`flex items-center justify-between px-2 py-2 rounded-lg ${
                              alreadyInList ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                            data-testid={`lbjs-suggestion-${sp.speciesCode}`}
                          >
                            {/* Species photo thumbnail */}
                            {sp.photoUrl ? (
                              <img
                                src={sp.photoUrl}
                                alt={sp.comName}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 mr-2"
                                data-testid={`lbjs-photo-${sp.speciesCode}`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0 mr-2"
                                data-testid={`lbjs-photo-placeholder-${sp.speciesCode}`}
                              >
                                <span className="text-lg">🐦</span>
                              </div>
                            )}

                            {/* Species info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-[#2C3E50] truncate">
                                  {sp.comName}
                                </span>
                                {alreadyInList && (
                                  <span
                                    className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0"
                                    data-testid={`lbjs-in-list-badge-${sp.speciesCode}`}
                                  >
                                    ✓ In list
                                  </span>
                                )}
                              </div>
                              <div className="text-xs italic text-gray-500 truncate">{sp.sciName}</div>
                            </div>

                            {/* Add button */}
                            {alreadyInList ? (
                              <div
                                className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default"
                                title="Already in this goal list"
                                data-testid={`lbjs-already-added-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddSpecies(sp)}
                                className="ml-2 flex-shrink-0 p-1.5 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1f2d5a] transition-colors"
                                title={`Add ${sp.comName} to goal list`}
                                data-testid={`lbjs-add-btn-${sp.speciesCode}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ) : null}
      </div>

      {/* List Picker — quick selector when multiple goal lists exist */}
      {listPickerSpecies && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          data-testid="list-picker-overlay"
          onClick={() => setListPickerSpecies(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-4 w-72 mx-4"
            data-testid="list-picker-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#2C3E50] truncate">Add to which list?</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{listPickerSpecies.comName}</p>
            </div>
            <div className="flex flex-col gap-2" data-testid="list-picker-options">
              {goalLists.map((list) => {
                const alreadyIn = list.speciesCodes.includes(listPickerSpecies.speciesCode)
                return (
                  <button
                    key={list.id}
                    onClick={() => {
                      if (!alreadyIn) void handleAddSpeciesToList(listPickerSpecies, list.id)
                      else setListPickerSpecies(null)
                    }}
                    disabled={alreadyIn}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      alreadyIn
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-[#f4f6fa] hover:bg-[#e8ecf5] text-[#2C3E50] cursor-pointer'
                    }`}
                    data-testid={`list-picker-option-${list.id}`}
                    title={alreadyIn ? `${listPickerSpecies.comName} is already in ${list.name}` : `Add to ${list.name}`}
                  >
                    <span className="truncate block">{list.name}</span>
                    {alreadyIn && (
                      <span className="text-xs text-green-600 font-normal">✓ Already added</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setListPickerSpecies(null)}
              className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1"
              data-testid="list-picker-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">{showSuccessToast}</span>
          </div>
        </div>
      )}

      {/* Duplicate Toast */}
      {showDuplicateToast && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-sm font-medium">{showDuplicateToast}</span>
          </div>
        </div>
      )}

      {/* Species Info Card Modal */}
      {selectedSpeciesCard && (
        <SpeciesInfoCard
          species={selectedSpeciesCard}
          onClose={() => setSelectedSpeciesCard(null)}
        />
      )}
    </div>
  )
}

interface TripPlanTabProps {
  selectedLocation?: SelectedLocation | null
  currentWeek?: number
  onWeekChange?: (week: number) => void
  onLocationSelect?: (location: SelectedLocation) => void
}

interface TripLifer {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  probability: number
  difficultyLabel: string
}

interface HotspotLocation {
  cellId: number
  coordinates: [number, number]
  liferCount: number
  rank: number
}

interface WeekOpportunity {
  week: number
  avgProbability: number
  topLocations: Array<{
    cellId: number
    coordinates: [number, number]
    probability: number
  }>
}

function TripPlanTab({
  selectedLocation,
  currentWeek = 26,
  onLocationSelect,
}: TripPlanTabProps) {
  // Mode: 'location', 'hotspots', 'window', or 'compare'
  const [mode, setMode] = useState<'location' | 'hotspots' | 'window' | 'compare'>('hotspots')

  // Location mode
  const [startWeek, setStartWeek] = useState(currentWeek)
  const [endWeek, setEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [lifers, setLifers] = useState<TripLifer[]>([])
  const [loading, setLoading] = useState(false)

  // Track which location to set next in compare mode
  const [nextCompareSlot, setNextCompareSlot] = useState<'A' | 'B'>('A')
  const lastProcessedLocationRef = useRef<SelectedLocation | null>(null)

  // Hotspots mode
  const [hotspotWeek, setHotspotWeek] = useState(currentWeek)
  const [hotspots, setHotspots] = useState<HotspotLocation[]>([])
  const [hotspotsLoading, setHotspotsLoading] = useState(false)

  // Window mode
  const [selectedSpeciesForWindow, setSelectedSpeciesForWindow] = useState<Species | null>(null)
  const [weekOpportunities, setWeekOpportunities] = useState<WeekOpportunity[]>([])
  const [windowLoading, setWindowLoading] = useState(false)
  const [speciesSearchTerm, setSpeciesSearchTerm] = useState('')
  const [showSpeciesSuggestions, setShowSpeciesSuggestions] = useState(false)

  // Compare mode
  const [locationA, setLocationA] = useState<SelectedLocation | null>(null)
  const [locationB, setLocationB] = useState<SelectedLocation | null>(null)
  const [compareStartWeek, setCompareStartWeek] = useState(currentWeek)
  const [compareEndWeek, setCompareEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [compareLoading, setCompareLoading] = useState(false)
  const [overlapLifers, setOverlapLifers] = useState<TripLifer[]>([])
  const [uniqueToA, setUniqueToA] = useState<TripLifer[]>([])
  const [uniqueToB, setUniqueToB] = useState<TripLifer[]>([])

  // Shared
  const [speciesData, setSpeciesData] = useState<Species[]>([])
  const [speciesLoaded, setSpeciesLoaded] = useState(false)
  const [gridData, setGridData] = useState<any>(null)
  const { seenSpecies } = useLifeList()

  const getWeekLabel = (week: number): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayOfYear = week * 7 - 3
    const date = new Date(2024, 0, dayOfYear)
    return `${monthNames[date.getMonth()]} ${date.getDate()}`
  }

  // Load species metadata once
  useEffect(() => {
    const fetchSpecies = async () => {
      try {
        const response = await fetch('/api/species')
        if (!response.ok) return
        const data: Species[] = await response.json()
        setSpeciesData(data)
        setSpeciesLoaded(true)
        console.log('Trip Plan: loaded species metadata', data.length)
      } catch (error) {
        console.error('Trip Plan: failed to load species', error)
      }
    }
    fetchSpecies()
  }, [])

  // Load grid data
  useEffect(() => {
    const fetchGrid = async () => {
      try {
        const response = await fetch('/api/grid')
        if (!response.ok) return
        const data = await response.json()
        setGridData(data)
      } catch (error) {
        console.error('Trip Plan: failed to load grid', error)
      }
    }
    fetchGrid()
  }, [])

  // Sync weeks with currentWeek
  useEffect(() => {
    setStartWeek(currentWeek)
    setEndWeek(Math.min(currentWeek + 2, 52))
    setHotspotWeek(currentWeek)
    setCompareStartWeek(currentWeek)
    setCompareEndWeek(Math.min(currentWeek + 2, 52))
  }, [currentWeek])

  // Handle location selection in compare mode
  useEffect(() => {
    if (mode === 'compare' && selectedLocation) {
      // Only process if this is a new location (avoid infinite loop)
      if (lastProcessedLocationRef.current?.cellId !== selectedLocation.cellId) {
        lastProcessedLocationRef.current = selectedLocation
        if (nextCompareSlot === 'A') {
          setLocationA(selectedLocation)
          setNextCompareSlot('B')
        } else {
          setLocationB(selectedLocation)
          setNextCompareSlot('A')
        }
      }
    }
  }, [selectedLocation, mode, nextCompareSlot])

  // Calculate hotspots
  useEffect(() => {
    if (mode !== 'hotspots' || !speciesLoaded || !gridData) return

    const calc = async () => {
      setHotspotsLoading(true)
      try {
        const response = await fetch(`/api/weeks/${hotspotWeek}`)
        if (!response.ok) {
          setHotspots([])
          setHotspotsLoading(false)
          return
        }

        const weekData: { cell_id: number; species_id: number; probability: number }[] = await response.json()
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        const cellCounts = new Map<number, number>()
        weekData.forEach(r => {
          const sp = speciesById.get(r.species_id)
          if (!sp || seenSpecies.has(sp.speciesCode)) return
          cellCounts.set(r.cell_id, (cellCounts.get(r.cell_id) || 0) + 1)
        })

        const cellCoords = new Map<number, [number, number]>()
        if (gridData.features) {
          gridData.features.forEach((f: any) => {
            const coords = f.geometry.coordinates[0][0]
            if (f.properties.cell_id && coords) {
              cellCoords.set(f.properties.cell_id, [coords[0], coords[1]])
            }
          })
        }

        const arr: HotspotLocation[] = []
        cellCounts.forEach((count, cellId) => {
          const coords = cellCoords.get(cellId)
          if (coords) arr.push({ cellId, coordinates: coords, liferCount: count, rank: 0 })
        })

        arr.sort((a, b) => b.liferCount - a.liferCount)
        arr.forEach((h, i) => h.rank = i + 1)

        setHotspots(arr.slice(0, 20))
      } catch (error) {
        console.error('Trip Plan: hotspots error', error)
        setHotspots([])
      } finally {
        setHotspotsLoading(false)
      }
    }
    calc()
  }, [mode, hotspotWeek, speciesLoaded, speciesData, gridData, seenSpecies])

  // Calculate window of opportunity
  useEffect(() => {
    if (mode !== 'window' || !selectedSpeciesForWindow || !speciesLoaded || !gridData) {
      setWeekOpportunities([])
      return
    }

    const calc = async () => {
      setWindowLoading(true)
      try {
        const targetId = selectedSpeciesForWindow.species_id
        const weeklyData = new Map<number, Array<{ cell_id: number; probability: number }>>()

        for (let week = 1; week <= 52; week++) {
          try {
            const response = await fetch(`/api/weeks/${week}`)
            if (!response.ok) continue
            const data: { cell_id: number; species_id: number; probability: number }[] = await response.json()
            weeklyData.set(week, data.filter(r => r.species_id === targetId))
          } catch (err) {
            console.error(`Window: week ${week} failed`, err)
          }
        }

        const cellCoords = new Map<number, [number, number]>()
        if (gridData.features) {
          gridData.features.forEach((f: any) => {
            const coords = f.geometry.coordinates[0][0]
            if (f.properties.cell_id && coords) {
              cellCoords.set(f.properties.cell_id, [coords[0], coords[1]])
            }
          })
        }

        const opps: WeekOpportunity[] = []
        weeklyData.forEach((records, week) => {
          if (records.length === 0) return
          const avgProb = records.reduce((sum, r) => sum + r.probability, 0) / records.length
          const topLocs = records
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5)
            .map(r => ({
              cellId: r.cell_id,
              coordinates: cellCoords.get(r.cell_id) || [0, 0] as [number, number],
              probability: r.probability
            }))
          opps.push({ week, avgProbability: avgProb, topLocations: topLocs })
        })

        opps.sort((a, b) => b.avgProbability - a.avgProbability)
        setWeekOpportunities(opps.slice(0, 10))
        console.log(`Window: found ${opps.length} weeks for ${selectedSpeciesForWindow.comName}`)
      } catch (error) {
        console.error('Window: error', error)
        setWeekOpportunities([])
      } finally {
        setWindowLoading(false)
      }
    }
    calc()
  }, [mode, selectedSpeciesForWindow, speciesLoaded, gridData])

  // Compare two locations
  useEffect(() => {
    if (mode !== 'compare' || !locationA || !locationB || !speciesLoaded) {
      setOverlapLifers([])
      setUniqueToA([])
      setUniqueToB([])
      return
    }

    const compareLocations = async () => {
      setCompareLoading(true)
      try {
        // Build species lookup map
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        // Determine weeks to load
        const weeksToLoad: number[] = []
        for (let w = compareStartWeek; w <= compareEndWeek; w++) {
          weeksToLoad.push(w)
        }

        // Accumulate probabilities for both locations
        const speciesAtA = new Map<number, { total: number; count: number }>()
        const speciesAtB = new Map<number, { total: number; count: number }>()

        for (const week of weeksToLoad) {
          try {
            const response = await fetch(`/api/weeks/${week}`)
            if (!response.ok) continue
            const weekData: { cell_id: number; species_id: number; probability: number }[] = await response.json()

            // Filter for location A
            weekData.filter(r => r.cell_id === locationA.cellId).forEach(record => {
              const existing = speciesAtA.get(record.species_id) || { total: 0, count: 0 }
              speciesAtA.set(record.species_id, {
                total: existing.total + record.probability,
                count: existing.count + 1
              })
            })

            // Filter for location B
            weekData.filter(r => r.cell_id === locationB.cellId).forEach(record => {
              const existing = speciesAtB.get(record.species_id) || { total: 0, count: 0 }
              speciesAtB.set(record.species_id, {
                total: existing.total + record.probability,
                count: existing.count + 1
              })
            })
          } catch (err) {
            console.error(`Compare: failed to load week ${week}`, err)
          }
        }

        // Build lifer lists
        const overlapList: TripLifer[] = []
        const uniqueAList: TripLifer[] = []
        const uniqueBList: TripLifer[] = []

        // Find overlap and unique to A
        speciesAtA.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          }

          if (speciesAtB.has(speciesId)) {
            overlapList.push(lifer)
          } else {
            uniqueAList.push(lifer)
          }
        })

        // Find unique to B
        speciesAtB.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return
          if (speciesAtA.has(speciesId)) return // Already counted in overlap

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          }

          uniqueBList.push(lifer)
        })

        // Sort all lists by probability
        overlapList.sort((a, b) => b.probability - a.probability)
        uniqueAList.sort((a, b) => b.probability - a.probability)
        uniqueBList.sort((a, b) => b.probability - a.probability)

        setOverlapLifers(overlapList)
        setUniqueToA(uniqueAList)
        setUniqueToB(uniqueBList)

        console.log(`Compare: Location A has ${speciesAtA.size} species, Location B has ${speciesAtB.size} species`)
        console.log(`Compare: ${overlapList.length} overlap, ${uniqueAList.length} unique to A, ${uniqueBList.length} unique to B`)
      } catch (error) {
        console.error('Compare: error', error)
        setOverlapLifers([])
        setUniqueToA([])
        setUniqueToB([])
      } finally {
        setCompareLoading(false)
      }
    }

    compareLocations()
  }, [mode, locationA, locationB, compareStartWeek, compareEndWeek, speciesLoaded, speciesData, seenSpecies])

  // Load location data
  useEffect(() => {
    if (mode !== 'location' || !selectedLocation || !speciesLoaded) {
      setLifers([])
      return
    }

    const loadTripData = async () => {
      setLoading(true)
      try {
        // Build species lookup map
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        // Determine weeks to load
        const weeksToLoad: number[] = []
        for (let w = startWeek; w <= endWeek; w++) {
          weeksToLoad.push(w)
        }

        // Accumulate probabilities for species in the selected cell
        const speciesProbabilities = new Map<number, { total: number; count: number }>()

        for (const week of weeksToLoad) {
          try {
            const response = await fetch(`/api/weeks/${week}`)
            if (!response.ok) continue
            const weekData: { cell_id: number; species_id: number; probability: number }[] = await response.json()
            const cellRecords = weekData.filter(r => r.cell_id === selectedLocation.cellId)
            cellRecords.forEach(record => {
              const existing = speciesProbabilities.get(record.species_id) || { total: 0, count: 0 }
              speciesProbabilities.set(record.species_id, {
                total: existing.total + record.probability,
                count: existing.count + 1
              })
            })
          } catch (err) {
            console.error(`Trip Plan: failed to load week ${week}`, err)
          }
        }

        // Build ranked lifer list (unseen species only)
        const liferList: TripLifer[] = []
        speciesProbabilities.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species) return
          if (seenSpecies.has(species.speciesCode)) return

          liferList.push({
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          })
        })

        // Sort by occurrence probability (highest first)
        liferList.sort((a, b) => b.probability - a.probability)
        setLifers(liferList)
        console.log(`Trip Plan: found ${liferList.length} lifers at cell ${selectedLocation.cellId} for weeks ${startWeek}-${endWeek}`)
      } catch (error) {
        console.error('Trip Plan: error loading data', error)
      } finally {
        setLoading(false)
      }
    }

    loadTripData()
  }, [selectedLocation, startWeek, endWeek, speciesLoaded, speciesData, seenSpecies])

  const formatProbability = (prob: number): string => {
    return (prob * 100).toFixed(1) + '%'
  }

  const getProbabilityColor = (prob: number): string => {
    if (prob >= 0.5) return 'text-green-700 bg-green-50'
    if (prob >= 0.2) return 'text-yellow-700 bg-yellow-50'
    if (prob >= 0.05) return 'text-orange-700 bg-orange-50'
    return 'text-red-700 bg-red-50'
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-3 pb-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-[#2C3E50]">Trip Planning</h3>

        {/* Mode Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('location')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'location' ? 'bg-[#2C3E7B] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid="location-mode-btn"
          >
            📍 Location
          </button>
          <button
            onClick={() => setMode('hotspots')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'hotspots' ? 'bg-[#2C3E7B] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid="hotspots-mode-btn"
          >
            🔥 Hotspots
          </button>
          <button
            onClick={() => setMode('window')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'window' ? 'bg-[#2C3E7B] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid="window-mode-btn"
          >
            🐦 Window
          </button>
          <button
            onClick={() => setMode('compare')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'compare' ? 'bg-[#2C3E7B] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid="compare-mode-btn"
          >
            ⚖️ Compare
          </button>
        </div>

        <p className="text-sm text-gray-600">
          {mode === 'location'
            ? 'Click a location on the map, then set your date range to see ranked lifers.'
            : mode === 'hotspots'
            ? 'Find top locations with the most unseen species for a given week.'
            : mode === 'window'
            ? 'Search for a species to see when and where it\'s most likely to be found.'
            : 'Select two locations on the map and compare their lifer availability.'}
        </p>
      </div>

      {/* Hotspots Mode: Week Picker */}
      {mode === 'hotspots' && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">Select Week</label>
          <input
            type="range"
            min="1"
            max="52"
            value={hotspotWeek}
            onChange={(e) => setHotspotWeek(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="hotspot-week-slider"
          />
          <div className="text-xs text-center text-[#2C3E7B] font-medium mt-1">
            Week {hotspotWeek} (~{getWeekLabel(hotspotWeek)})
          </div>
        </div>
      )}

      {/* Window Mode: Species Search */}
      {mode === 'window' && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">Select Target Species</label>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
              data-testid="species-search-input"
            />
            {showSpeciesSuggestions && speciesSearchTerm.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {speciesData
                  .filter(sp =>
                    sp.comName.toLowerCase().includes(speciesSearchTerm.toLowerCase()) ||
                    sp.sciName.toLowerCase().includes(speciesSearchTerm.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(sp => (
                    <button
                      key={sp.speciesCode}
                      onClick={() => {
                        setSelectedSpeciesForWindow(sp)
                        setSpeciesSearchTerm(sp.comName)
                        setShowSpeciesSuggestions(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-[#2C3E50]">{sp.comName}</div>
                      <div className="text-xs italic text-gray-500">{sp.sciName}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>
          {selectedSpeciesForWindow && (
            <div className="mt-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
              <div className="text-sm font-medium text-blue-800">{selectedSpeciesForWindow.comName}</div>
              <div className="text-xs italic text-blue-600">{selectedSpeciesForWindow.sciName}</div>
            </div>
          )}
        </div>
      )}

      {/* Location Mode: Location Display and Date Range */}
      {mode === 'location' && (
        <div className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">
            Selected Location
          </label>
          {selectedLocation ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800">
                Cell #{selectedLocation.cellId}
              </div>
              <div className="text-xs text-blue-600">
                {selectedLocation.coordinates[1].toFixed(2)}°N, {Math.abs(selectedLocation.coordinates[0]).toFixed(2)}°W
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-sm text-gray-500 italic">
                Click on the map to select a location
              </p>
            </div>
          )}
        </div>

        {/* Date Range (Week Range) Picker */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] mb-1">
            Date Range
          </label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Start Week</label>
              <input
                type="range"
                min="1"
                max="52"
                value={startWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setStartWeek(val)
                  if (val > endWeek) setEndWeek(val)
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] font-medium">
                Week {startWeek} (~{getWeekLabel(startWeek)})
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">End Week</label>
              <input
                type="range"
                min="1"
                max="52"
                value={endWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setEndWeek(val)
                  if (val < startWeek) setStartWeek(val)
                }}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] font-medium">
                Week {endWeek} (~{getWeekLabel(endWeek)})
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Compare Mode: Two Locations and Date Range */}
      {mode === 'compare' && (
        <div className="mt-3 space-y-3">
          {/* Location A */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1">
              Location A
            </label>
            {locationA ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-blue-800">
                      Cell #{locationA.cellId}
                    </div>
                    <div className="text-xs text-blue-600">
                      {locationA.coordinates[1].toFixed(2)}°N, {Math.abs(locationA.coordinates[0]).toFixed(2)}°W
                    </div>
                  </div>
                  <button
                    onClick={() => setLocationA(null)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    data-testid="clear-location-a-btn"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-500 italic">
                  Click on the map to select Location A
                </p>
              </div>
            )}
          </div>

          {/* Location B */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1">
              Location B
            </label>
            {locationB ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-green-800">
                      Cell #{locationB.cellId}
                    </div>
                    <div className="text-xs text-green-600">
                      {locationB.coordinates[1].toFixed(2)}°N, {Math.abs(locationB.coordinates[0]).toFixed(2)}°W
                    </div>
                  </div>
                  <button
                    onClick={() => setLocationB(null)}
                    className="text-green-600 hover:text-green-800 text-xs font-medium"
                    data-testid="clear-location-b-btn"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm text-gray-500 italic">
                  Click on the map to select Location B
                </p>
              </div>
            )}
          </div>

          {/* Date Range (Week Range) Picker */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] mb-1">
              Date Range
            </label>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Start Week</label>
                <input
                  type="range"
                  min="1"
                  max="52"
                  value={compareStartWeek}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setCompareStartWeek(val)
                    if (val > compareEndWeek) setCompareEndWeek(val)
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                  data-testid="compare-start-week-slider"
                />
                <div className="text-xs text-center text-[#2C3E7B] font-medium">
                  Week {compareStartWeek} (~{getWeekLabel(compareStartWeek)})
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">End Week</label>
                <input
                  type="range"
                  min="1"
                  max="52"
                  value={compareEndWeek}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setCompareEndWeek(val)
                    if (val < compareStartWeek) setCompareStartWeek(val)
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                  data-testid="compare-end-week-slider"
                />
                <div className="text-xs text-center text-[#2C3E7B] font-medium">
                  Week {compareEndWeek} (~{getWeekLabel(compareEndWeek)})
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {mode === 'hotspots' ? (
          hotspotsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
            </div>
          ) : hotspots.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">
                <span className="font-medium">No hotspots found.</span> You may have already seen all species for this week.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#2C3E50]">
                  Top Lifer Hotspots ({hotspots.length})
                </h4>
                <span className="text-xs text-gray-500">
                  Ranked by lifer count
                </span>
              </div>
              <div className="space-y-1" data-testid="hotspot-list">
                {hotspots.map((hotspot) => (
                  <button
                    key={hotspot.cellId}
                    onClick={() => {
                      if (onLocationSelect) {
                        onLocationSelect({
                          cellId: hotspot.cellId,
                          coordinates: hotspot.coordinates
                        })
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg hover:bg-orange-50 hover:border-orange-200 transition-colors text-left"
                    data-testid={`hotspot-${hotspot.cellId}`}
                  >
                    <div className="text-xs text-gray-400 w-6 text-right font-mono">
                      #{hotspot.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#2C3E50]">
                        Cell #{hotspot.cellId}
                      </div>
                      <div className="text-xs text-gray-500">
                        {hotspot.coordinates[1].toFixed(2)}°N, {Math.abs(hotspot.coordinates[0]).toFixed(2)}°W
                      </div>
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-orange-100 text-orange-800">
                      {hotspot.liferCount} lifers
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : mode === 'location' ? (
          !selectedLocation ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Select a location</span> on the map to see lifers you could find there.
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
            </div>
          ) : lifers.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-700">
                <span className="font-medium">No lifers found!</span> You have already seen all species recorded in this area during this period.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#2C3E50]">
                  Potential Lifers ({lifers.length})
                </h4>
                <span className="text-xs text-gray-500">
                  Sorted by probability
                </span>
              </div>
              <div className="space-y-1">
                {lifers.map((lifer, index) => (
                  <div
                    key={lifer.speciesCode}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-100 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <div className="text-xs text-gray-400 w-6 text-right font-mono">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#2C3E50] truncate">
                        {lifer.comName}
                      </div>
                      <div className="text-xs italic text-gray-500 truncate">
                        {lifer.sciName}
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getProbabilityColor(lifer.probability)}`}>
                      {formatProbability(lifer.probability)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : mode === 'window' ? (
          !selectedSpeciesForWindow ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Search for a species</span> above to see its window of opportunity.
              </p>
            </div>
          ) : windowLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
            </div>
          ) : weekOpportunities.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">
                <span className="font-medium">No data found</span> for {selectedSpeciesForWindow.comName}. This species may not be recorded in this region.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-[#2C3E50] mb-1">
                  Window of Opportunity
                </h4>
                <p className="text-xs text-gray-600">
                  Best weeks to find <span className="font-medium text-[#2C3E7B]">{selectedSpeciesForWindow.comName}</span>
                </p>
              </div>
              <div className="space-y-2" data-testid="window-opportunity-list">
                {weekOpportunities.map((opp, index) => (
                  <div
                    key={opp.week}
                    className="bg-white border border-gray-200 rounded-lg p-3 hover:border-[#2C3E7B] transition-colors"
                  >
                    {/* Week Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-400 w-5 text-right font-mono">
                          #{index + 1}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#2C3E50]">
                            Week {opp.week}
                          </div>
                          <div className="text-xs text-gray-500">
                            ~{getWeekLabel(opp.week)}
                          </div>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${getProbabilityColor(opp.avgProbability)}`}>
                        {formatProbability(opp.avgProbability)} avg
                      </div>
                    </div>

                    {/* Top Locations */}
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-medium text-gray-500 mb-1">
                        Best locations:
                      </div>
                      {opp.topLocations.slice(0, 3).map((loc, locIndex) => (
                        <button
                          key={loc.cellId}
                          onClick={() => {
                            if (onLocationSelect) {
                              onLocationSelect({
                                cellId: loc.cellId,
                                coordinates: loc.coordinates
                              })
                            }
                          }}
                          className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 hover:bg-blue-50 rounded text-left transition-colors"
                          data-testid={`window-location-${opp.week}-${locIndex}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-600">
                              Cell #{loc.cellId}
                            </div>
                            <div className="text-xs text-gray-400">
                              {loc.coordinates[1].toFixed(2)}°N, {Math.abs(loc.coordinates[0]).toFixed(2)}°W
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
        ) : mode === 'compare' ? (
          !locationA || !locationB ? (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
              <p className="text-sm text-purple-700">
                <span className="font-medium">Select two locations</span> on the map to compare their lifer availability.
              </p>
            </div>
          ) : compareLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
            </div>
          ) : (
            <div className="space-y-3" data-testid="compare-results">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-center">
                  <div className="text-xs text-blue-600 font-medium mb-1">Location A</div>
                  <div className="text-lg font-bold text-blue-800">{uniqueToA.length + overlapLifers.length}</div>
                  <div className="text-xs text-blue-600">total lifers</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-center">
                  <div className="text-xs text-purple-600 font-medium mb-1">Overlap</div>
                  <div className="text-lg font-bold text-purple-800">{overlapLifers.length}</div>
                  <div className="text-xs text-purple-600">at both</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                  <div className="text-xs text-green-600 font-medium mb-1">Location B</div>
                  <div className="text-lg font-bold text-green-800">{uniqueToB.length + overlapLifers.length}</div>
                  <div className="text-xs text-green-600">total lifers</div>
                </div>
              </div>

              {/* Overlap Species */}
              {overlapLifers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-purple-800 mb-2" data-testid="overlap-heading">
                    🔗 Overlap ({overlapLifers.length})
                  </h4>
                  <p className="text-xs text-gray-600 mb-2">Available at both locations</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="overlap-list">
                    {overlapLifers.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-purple-50 border border-purple-100 rounded text-xs"
                      >
                        <div className="text-gray-400 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-purple-900">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to Location A */}
              {uniqueToA.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-blue-800 mb-2" data-testid="unique-a-heading">
                    📍 Unique to Location A ({uniqueToA.length})
                  </h4>
                  <p className="text-xs text-gray-600 mb-2">Only at Location A</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="unique-a-list">
                    {uniqueToA.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-100 rounded text-xs"
                      >
                        <div className="text-gray-400 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-blue-900">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to Location B */}
              {uniqueToB.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-green-800 mb-2" data-testid="unique-b-heading">
                    📍 Unique to Location B ({uniqueToB.length})
                  </h4>
                  <p className="text-xs text-gray-600 mb-2">Only at Location B</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="unique-b-list">
                    {uniqueToB.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-100 rounded text-xs"
                      >
                        <div className="text-gray-400 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-green-900">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No lifers */}
              {overlapLifers.length === 0 && uniqueToA.length === 0 && uniqueToB.length === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-700">
                    <span className="font-medium">No lifers found!</span> You have already seen all species at both locations during this period.
                  </p>
                </div>
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}

function ProgressTab() {
  const { isSpeciesSeen, getTotalSeen } = useLifeList()
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [loading, setLoading] = useState(true)

  // Load species metadata on mount
  useEffect(() => {
    const loadSpecies = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/species')
        if (!response.ok) throw new Error('Failed to fetch species data')
        const data = await response.json() as Species[]
        setAllSpecies(data)
      } catch (error) {
        console.error('ProgressTab: failed to load species', error)
      } finally {
        setLoading(false)
      }
    }
    loadSpecies()
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">My Progress</h3>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
  }

  const totalSpecies = allSpecies.length
  const totalSeen = getTotalSeen()
  const percentComplete = totalSpecies > 0 ? (totalSeen / totalSpecies) * 100 : 0

  // Calculate family breakdown
  const familyStats: { [familyName: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    const family = species.familyComName
    if (!familyStats[family]) {
      familyStats[family] = { total: 0, seen: 0 }
    }
    familyStats[family].total++
    if (isSpeciesSeen(species.speciesCode)) {
      familyStats[family].seen++
    }
  })

  // Sort families by total species count (descending)
  const sortedFamilies = Object.entries(familyStats).sort((a, b) => b[1].total - a[1].total)

  return (
    <div className="space-y-4" data-testid="progress-tab">
      <h3 className="text-lg font-semibold text-[#2C3E50]">My Progress</h3>
      <p className="text-sm text-gray-600">
        Track your birding progress with stats and visual breakdowns by family.
      </p>

      {/* Overall Progress Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-[#2C3E50]">Overall Progress</h4>
          <span className="text-2xl font-bold text-[#2C3E7B]" data-testid="progress-percentage">
            {percentComplete.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden" data-testid="progress-bar-container">
          <div
            className="bg-[#27AE60] h-full rounded-full transition-all duration-300"
            style={{ width: `${percentComplete}%` }}
            data-testid="progress-bar-fill"
          />
        </div>

        {/* Species count */}
        <p className="text-sm text-gray-600" data-testid="progress-species-count">
          <span className="font-semibold text-[#2C3E7B]">{totalSeen}</span> of{' '}
          <span className="font-semibold">{totalSpecies}</span> species seen
        </p>
      </div>

      {/* Family Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-[#2C3E50]">Progress by Family</h4>
        <p className="text-xs text-gray-600">
          Showing top families by total species count
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="family-breakdown-list">
          {sortedFamilies.map(([familyName, stats]) => {
            const familyPercent = stats.total > 0 ? (stats.seen / stats.total) * 100 : 0
            return (
              <div key={familyName} className="space-y-1" data-testid={`family-${familyName.replace(/\s+/g, '-').toLowerCase()}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{familyName}</span>
                  <span className="text-gray-500">
                    {stats.seen}/{stats.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#2C3E7B] h-full rounded-full transition-all duration-200"
                    style={{ width: `${familyPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* What's Left Section */}
      {totalSeen > 0 && totalSeen < totalSpecies && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-800 mb-2">🎯 What's Left</h4>
          <p className="text-xs text-blue-700">
            You have <span className="font-semibold">{totalSpecies - totalSeen}</span> species remaining to complete your life list.
          </p>
        </div>
      )}

      {/* Completion Message */}
      {totalSeen === totalSpecies && totalSpecies > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h4 className="text-sm font-bold text-green-800 mb-1">Congratulations!</h4>
          <p className="text-xs text-green-700">
            You've seen all {totalSpecies} species!
          </p>
        </div>
      )}

      {/* Empty State */}
      {totalSeen === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700">
            <span className="font-medium">Get started:</span> Visit the Species tab to mark birds you've seen, or import your eBird life list from the Profile tab.
          </p>
        </div>
      )}
    </div>
  )
}

function ProfileTab() {
  const { importSpeciesList, clearAllSpecies, getTotalSeen } = useLifeList()
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ matched: number; unmatched: number; total: number } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)
    setImportError(null)

    try {
      // Read the CSV file
      const text = await file.text()
      const lines = text.split('\n')

      // Parse CSV header to find column indices
      const header = lines[0].split(',')
      const comNameIndex = header.findIndex(col => col.toLowerCase().includes('common name'))
      const sciNameIndex = header.findIndex(col => col.toLowerCase().includes('scientific name'))

      if (comNameIndex === -1 && sciNameIndex === -1) {
        throw new Error('CSV file must contain either "Common Name" or "Scientific Name" column')
      }

      // Fetch species metadata from API
      const response = await fetch('http://localhost:8000/api/species')
      if (!response.ok) {
        throw new Error('Failed to fetch species data')
      }
      const allSpecies = await response.json() as Array<{
        speciesCode: string
        comName: string
        sciName: string
      }>

      // Create lookup maps for matching
      const comNameMap = new Map<string, { code: string; name: string }>()
      const sciNameMap = new Map<string, { code: string; name: string }>()

      allSpecies.forEach(species => {
        const comKey = species.comName.toLowerCase().trim()
        const sciKey = species.sciName.toLowerCase().trim()
        comNameMap.set(comKey, { code: species.speciesCode, name: species.comName })
        sciNameMap.set(sciKey, { code: species.speciesCode, name: species.comName })
      })

      // Parse CSV and match species
      const matchedCodes: string[] = []
      const matchedNames: string[] = []
      let unmatchedCount = 0

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const cols = line.split(',')

        // Try to match by common name first, then scientific name
        let matched = false

        if (comNameIndex >= 0 && cols[comNameIndex]) {
          const comName = cols[comNameIndex].toLowerCase().trim()
          const match = comNameMap.get(comName)
          if (match) {
            matchedCodes.push(match.code)
            matchedNames.push(match.name)
            matched = true
          }
        }

        if (!matched && sciNameIndex >= 0 && cols[sciNameIndex]) {
          const sciName = cols[sciNameIndex].toLowerCase().trim()
          const match = sciNameMap.get(sciName)
          if (match) {
            matchedCodes.push(match.code)
            matchedNames.push(match.name)
            matched = true
          }
        }

        if (!matched) {
          unmatchedCount++
        }
      }

      // Import matched species
      if (matchedCodes.length > 0) {
        await importSpeciesList(matchedCodes, matchedNames)
      }

      setImportResult({
        matched: matchedCodes.length,
        unmatched: unmatchedCount,
        total: lines.length - 1 // Subtract header row
      })
    } catch (error) {
      console.error('Error importing CSV:', error)
      setImportError(error instanceof Error ? error.message : 'Failed to import CSV file')
    } finally {
      setImporting(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear your entire life list? This cannot be undone.')) {
      try {
        await clearAllSpecies()
        setImportResult(null)
      } catch (error) {
        console.error('Error clearing life list:', error)
      }
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-[#2C3E50]">Profile & Data</h3>
      <p className="text-sm text-gray-600">
        Manage your life list data. Import from eBird, export as CSV, or reset your list.
      </p>

      {/* Import Section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50]">Import eBird Life List</h4>
        <p className="text-xs text-gray-600">
          Upload your eBird CSV life list to automatically mark species as seen.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          data-testid="csv-file-input"
        />
        <button
          onClick={handleImportClick}
          disabled={importing}
          className="w-full px-4 py-2 bg-[#2C3E7B] text-white rounded-lg hover:bg-[#1e2a54] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          data-testid="import-csv-button"
        >
          {importing ? 'Importing...' : 'Import CSV'}
        </button>

        {/* Import Progress/Results */}
        {importing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3" data-testid="import-progress">
            <p className="text-sm text-blue-700">
              <span className="font-medium">Importing...</span> Please wait while we process your file.
            </p>
          </div>
        )}

        {importResult && !importing && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3" data-testid="import-success">
            <p className="text-sm text-green-700">
              <span className="font-medium">Import complete!</span>
            </p>
            <p className="text-xs text-green-600 mt-1">
              {importResult.matched} of {importResult.total} species matched and imported.
              {importResult.unmatched > 0 && ` (${importResult.unmatched} could not be matched)`}
            </p>
          </div>
        )}

        {importError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3" data-testid="import-error">
            <p className="text-sm text-red-700">
              <span className="font-medium">Import failed:</span> {importError}
            </p>
          </div>
        )}
      </div>

      {/* Stats Section */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] mb-2">Your Life List</h4>
        <p className="text-2xl font-bold text-[#2C3E7B]" data-testid="total-seen-count">
          {getTotalSeen()} species
        </p>
        <p className="text-xs text-gray-600">marked as seen</p>
      </div>

      {/* Clear All Section */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-medium text-[#2C3E50] mb-2">Reset Data</h4>
        <p className="text-xs text-gray-600 mb-2">
          Clear your entire life list. This action cannot be undone.
        </p>
        <button
          onClick={handleClearAll}
          className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          data-testid="clear-all-button"
        >
          Clear All Species
        </button>
      </div>
    </div>
  )
}
