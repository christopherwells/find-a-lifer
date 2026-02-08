import { useState } from 'react'
import TopBar from './components/TopBar'
import SidePanel, { type MapViewMode } from './components/SidePanel'
import MapView from './components/MapView'
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
          />
        </div>
      </div>
    </div>
  )
}

export default App
