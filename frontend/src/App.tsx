import { useState } from 'react'
import TopBar from './components/TopBar'
import SidePanel from './components/SidePanel'
import MapView from './components/MapView'
import './App.css'

function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false)
  const [currentWeek, setCurrentWeek] = useState(26) // Default to week 26 (late June)

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
        />

        {/* Map Area */}
        <div className="flex-1 relative">
          <MapView darkMode={darkMode} currentWeek={currentWeek} />
        </div>
      </div>
    </div>
  )
}

export default App
