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
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null)
  const [goalSpeciesCodes, setGoalSpeciesCodes] = useState<Set<string>>(new Set())
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
  }, [viewMode]) // Re-load when view mode changes to pick up latest list changes

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
          onViewModeChange={setViewMode}
          selectedLocation={selectedLocation}
        />

        {/* Map Area */}
        <div className="flex-1 relative">
          <MapView
            darkMode={darkMode}
            currentWeek={currentWeek}
            viewMode={viewMode}
            onLocationSelect={setSelectedLocation}
            goalSpeciesCodes={goalSpeciesCodes}
            seenSpecies={seenSpecies}
          />
        </div>
      </div>
    </div>
  )
}

export default App
