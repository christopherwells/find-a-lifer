import { useState, useEffect, useMemo } from 'react'
import TopBar from './components/TopBar'
import SidePanel, { type MapViewMode } from './components/SidePanel'
import MapView from './components/MapView'
import { useLifeList } from './contexts/LifeListContext'
import { goalListsDB, type GoalList } from './lib/goalListsDB'
import type { SpeciesFilters } from './components/types'
import './App.css'

export interface SelectedLocation {
  cellId: number
  coordinates: [number, number] // [lng, lat]
  name?: string
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true'
  })
  // Start collapsed on mobile so the map is visible
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(() => {
    return window.innerWidth < 768
  })
  const [currentWeek, setCurrentWeek] = useState(() => {
    // Default to current week of year
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const diff = now.getTime() - start.getTime()
    const oneWeek = 7 * 24 * 60 * 60 * 1000
    return Math.min(52, Math.max(1, Math.ceil(diff / oneWeek)))
  })
  const [viewMode, setViewMode] = useState<MapViewMode>('density')
  const [goalBirdsOnlyFilter, setGoalBirdsOnlyFilter] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null)
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null)
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [activeGoalListId, setActiveGoalListId] = useState<string | null>(null)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.8) // Default to 80% opacity
  const [liferCountRange, setLiferCountRange] = useState<[number, number]>([0, 9999])
  const [dataRange, setDataRange] = useState<[number, number]>([0, 0])
  const [showTotalRichness, setShowTotalRichness] = useState(false)
  const [speciesFilters, setSpeciesFilters] = useState<SpeciesFilters>({ family: '', region: '', conservStatus: '', invasionStatus: '', difficulty: '' })
  const { seenSpecies } = useLifeList()

  // Persist dark mode and toggle class on document root
  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // Load all goal lists on startup
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        const lists = await goalListsDB.getAllLists()
        setGoalLists(lists)

        // Restore saved active list from localStorage
        const savedActiveListId = localStorage.getItem('activeGoalListId')
        const validSavedId = savedActiveListId && lists.some((l) => l.id === savedActiveListId)
        const resolvedActiveId = validSavedId ? savedActiveListId : (lists.length > 0 ? lists[0].id : null)

        setActiveGoalListId((prevId) => {
          // If we already have a valid active list, keep it (don't reset on re-loads)
          if (prevId && lists.some((l) => l.id === prevId)) return prevId
          return resolvedActiveId
        })

        console.log(`App: loaded ${lists.length} goal lists`)
      } catch (error) {
        console.error('App: failed to load goal lists', error)
      }
    }

    loadGoalLists()
  }, [])

  // Compute goal species codes from the ACTIVE list — derived from state, no effect needed
  const goalSpeciesCodes = useMemo(() => {
    if (!activeGoalListId) return new Set<string>()
    const activeList = goalLists.find((l) => l.id === activeGoalListId)
    if (!activeList) return new Set<string>()
    return new Set<string>(activeList.speciesCodes)
  }, [activeGoalListId, goalLists])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Top Bar */}
      <TopBar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
      />

      {/* Main Content: Map + Side Panel */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Map Area — pb-[52px] on mobile for bottom tab bar */}
        <div className="flex-1 relative order-first pb-[52px] md:pb-0">
          <MapView
            darkMode={darkMode}
            currentWeek={currentWeek}
            viewMode={viewMode}
            goalBirdsOnlyFilter={goalBirdsOnlyFilter}
            onLocationSelect={setSelectedLocation}
            goalSpeciesCodes={goalSpeciesCodes}
            seenSpecies={seenSpecies}
            selectedSpecies={selectedSpecies}
            selectedRegion={selectedRegion}
            heatmapOpacity={heatmapOpacity}
            selectedLocation={selectedLocation}
            liferCountRange={liferCountRange}
            onDataRangeChange={setDataRange}
            showTotalRichness={showTotalRichness}
            speciesFilters={speciesFilters}
          />
        </div>

        {/* Side Panel */}
        <SidePanel
          collapsed={sidePanelCollapsed}
          onToggle={() => setSidePanelCollapsed((prev) => !prev)}
          currentWeek={currentWeek}
          onWeekChange={setCurrentWeek}
          viewMode={viewMode}
          onViewModeChange={(mode) => {
            setViewMode(mode)
            // Reset goal birds only filter when switching away from density, probability, and species
            if (mode !== 'density' && mode !== 'probability' && mode !== 'species') setGoalBirdsOnlyFilter(false)
            // Reset selected species when switching away from species view
            if (mode !== 'species') setSelectedSpecies(null)
          }}
          goalBirdsOnlyFilter={goalBirdsOnlyFilter}
          onGoalBirdsOnlyFilterChange={setGoalBirdsOnlyFilter}
          selectedLocation={selectedLocation}
          onSelectedLocationChange={setSelectedLocation}
          selectedSpecies={selectedSpecies}
          onSelectedSpeciesChange={setSelectedSpecies}
          goalSpeciesCodes={goalSpeciesCodes}
          goalLists={goalLists}
          activeGoalListId={activeGoalListId}
          onActiveGoalListIdChange={(id) => {
            setActiveGoalListId(id)
            if (id) localStorage.setItem('activeGoalListId', id)
            else localStorage.removeItem('activeGoalListId')
          }}
          selectedRegion={selectedRegion}
          onSelectedRegionChange={setSelectedRegion}
          heatmapOpacity={heatmapOpacity}
          onHeatmapOpacityChange={setHeatmapOpacity}
          liferCountRange={liferCountRange}
          onLiferCountRangeChange={setLiferCountRange}
          dataRange={dataRange}
          showTotalRichness={showTotalRichness}
          onShowTotalRichnessChange={setShowTotalRichness}
          speciesFilters={speciesFilters}
          onSpeciesFiltersChange={setSpeciesFilters}
        />
      </div>
    </div>
  )
}

export default App
