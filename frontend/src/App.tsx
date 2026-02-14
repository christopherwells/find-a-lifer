import { useState, useEffect } from 'react'
import TopBar from './components/TopBar'
import SidePanel, { type MapViewMode } from './components/SidePanel'
import MapView from './components/MapView'
import { useLifeList } from './contexts/LifeListContext'
import { goalListsDB } from './lib/goalListsDB'
import './App.css'

export interface SelectedLocation {
  cellId: number
  coordinates: [number, number] // [lng, lat]
  name?: string
}

function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false)
  const [currentWeek, setCurrentWeek] = useState(26) // Default to week 26 (late June)
  const [viewMode, setViewMode] = useState<MapViewMode>('density')
  const [goalBirdsOnlyFilter, setGoalBirdsOnlyFilter] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null)
  const [goalSpeciesCodes, setGoalSpeciesCodes] = useState<Set<string>>(new Set())
  const [selectedSpecies, setSelectedSpecies] = useState<string | null>(null)
  const { seenSpecies } = useLifeList()

  // Load goal species from all goal lists, refresh when view mode changes to goal-birds
  useEffect(() => {
    const loadGoalSpecies = async () => {
      try {
        const lists = await goalListsDB.getAllLists()
        const allCodes = new Set<string>()
        lists.forEach((list) => {
          list.speciesCodes.forEach((code) => allCodes.add(code))
        })
        setGoalSpeciesCodes(allCodes)
        console.log(`App: loaded ${allCodes.size} goal species from ${lists.length} lists`)
      } catch (error) {
        console.error('App: failed to load goal species', error)
      }
    }

    // Always load goal species so the map can switch modes instantly
    loadGoalSpecies()
  }, [viewMode, goalBirdsOnlyFilter]) // Re-load when view mode or filter changes to pick up latest list changes

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Top Bar */}
      <TopBar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
      />

      {/* Main Content: Side Panel + Map */}
      <div className="flex-1 flex overflow-hidden">
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
          selectedSpecies={selectedSpecies}
          onSelectedSpeciesChange={setSelectedSpecies}
          goalSpeciesCodes={goalSpeciesCodes}
        />

        {/* Map Area */}
        <div className="flex-1 relative">
          <MapView
            darkMode={darkMode}
            currentWeek={currentWeek}
            viewMode={viewMode}
            goalBirdsOnlyFilter={goalBirdsOnlyFilter}
            onLocationSelect={setSelectedLocation}
            goalSpeciesCodes={goalSpeciesCodes}
            seenSpecies={seenSpecies}
            selectedSpecies={selectedSpecies}
          />
        </div>
      </div>
    </div>
  )
}

export default App
