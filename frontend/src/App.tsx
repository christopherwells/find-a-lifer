import { useState, useEffect, useMemo, useCallback } from 'react'
import TopBar from './components/TopBar'
import SidePanel, { type MapViewMode } from './components/SidePanel'
import MapView from './components/MapView'
import MapControls from './components/MapControls'
import AboutPage from './components/AboutPage'
import OnboardingOverlay from './components/OnboardingOverlay'
import Toast from './components/Toast'
import { useLifeList } from './contexts/LifeListContext'
import { useToast } from './contexts/ToastContext'
import { goalListsDB, type GoalList } from './lib/goalListsDB'
import { trackEvent } from './lib/analytics'
import type { SelectedLocation, SpeciesFilters, CompareLocations } from './components/types'
import './App.css'

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
  const [selectedSpeciesMulti, setSelectedSpeciesMulti] = useState<string[]>([])
  const [compareLocations, setCompareLocations] = useState<CompareLocations | null>(null)
  const [showAbout, setShowAbout] = useState(false)
  const [, setActiveTab] = useState<string>('explore')
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('hasSeenOnboarding'))
  const [beginnerMode, setBeginnerMode] = useState(() => {
    const stored = localStorage.getItem('beginnerMode')
    if (stored !== null) return stored === 'true'
    // Default to beginner mode for first 3 sessions (count +1 for current session)
    const count = parseInt(localStorage.getItem('sessionCount') || '0', 10) + 1
    return count < 3
  })
  const { effectiveSeenSpecies } = useLifeList()
  const { showToast } = useToast()

  // Session counting for progressive disclosure
  useEffect(() => {
    const count = parseInt(localStorage.getItem('sessionCount') || '0', 10) + 1
    localStorage.setItem('sessionCount', String(count))
    trackEvent('app_open', { session_count: count })
  }, [])

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

  const handleOnboardingComplete = () => {
    localStorage.setItem('hasSeenOnboarding', 'true')
    setShowOnboarding(false)
  }

  const handleShowOnboarding = () => {
    localStorage.removeItem('hasSeenOnboarding')
    setShowOnboarding(true)
  }

  // Shared view mode change handler — resets filters appropriately
  const handleViewModeChange = useCallback((mode: MapViewMode) => {
    setViewMode(mode)
    trackEvent('view_mode_change', { mode })
    if (mode !== 'density' && mode !== 'probability' && mode !== 'species') setGoalBirdsOnlyFilter(false)
    if (mode !== 'species') {
      setSelectedSpecies(null)
      setSelectedSpeciesMulti([])
    }
  }, [])

  const handleActiveGoalListIdChange = useCallback((id: string | null) => {
    setActiveGoalListId(id)
    if (id) localStorage.setItem('activeGoalListId', id)
    else localStorage.removeItem('activeGoalListId')
  }, [])

  const handleBeginnerModeChange = useCallback((value: boolean) => {
    setBeginnerMode(value)
    localStorage.setItem('beginnerMode', String(value))
  }, [])

  const handleImportComplete = useCallback((newCount: number) => {
    trackEvent('import_life_list', { species_count: newCount })
    // Switch to map view (collapse panel on mobile)
    setSidePanelCollapsed(true)
    // Show import summary toast
    showToast({
      type: 'import-summary',
      message: `Added ${newCount} new species to your life list`,
      detail: 'Explore the map to find your next lifer!',
      duration: 5000,
    })
  }, [showToast])

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Top Bar */}
      <TopBar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        onShowAbout={() => setShowAbout(true)}
        onShowOnboarding={handleShowOnboarding}
      />

      {/* Main Content: Map + Side Panel */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Map Area — always visible; pb-[52px] on mobile for bottom tab bar */}
        <div id="main-content" className="flex-1 relative order-first pb-[52px] md:pb-0">
          <MapView
            darkMode={darkMode}
            currentWeek={currentWeek}
            viewMode={viewMode}
            goalBirdsOnlyFilter={goalBirdsOnlyFilter}
            onLocationSelect={setSelectedLocation}
            goalSpeciesCodes={goalSpeciesCodes}
            seenSpecies={effectiveSeenSpecies}
            selectedSpecies={selectedSpecies}
            selectedSpeciesMulti={selectedSpeciesMulti}
            selectedRegion={selectedRegion}
            heatmapOpacity={heatmapOpacity}
            selectedLocation={selectedLocation}
            liferCountRange={liferCountRange}
            onDataRangeChange={setDataRange}
            showTotalRichness={showTotalRichness}
            speciesFilters={speciesFilters}
            compareLocations={compareLocations}
          />
          {/* Floating map controls — mobile only (desktop uses ExploreTab in panel) */}
          <MapControls
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            beginnerMode={beginnerMode}
            onBeginnerModeChange={handleBeginnerModeChange}
            currentWeek={currentWeek}
            onWeekChange={setCurrentWeek}
            heatmapOpacity={heatmapOpacity}
            onHeatmapOpacityChange={setHeatmapOpacity}
            goalBirdsOnlyFilter={goalBirdsOnlyFilter}
            onGoalBirdsOnlyFilterChange={setGoalBirdsOnlyFilter}
            showTotalRichness={showTotalRichness}
            onShowTotalRichnessChange={setShowTotalRichness}
            goalLists={goalLists}
            activeGoalListId={activeGoalListId}
            onActiveGoalListIdChange={handleActiveGoalListIdChange}
            goalSpeciesCodes={goalSpeciesCodes}
            selectedSpecies={selectedSpecies}
            onSelectedSpeciesChange={setSelectedSpecies}
            selectedSpeciesMulti={selectedSpeciesMulti}
            onSelectedSpeciesMultiChange={setSelectedSpeciesMulti}
            liferCountRange={liferCountRange}
            onLiferCountRangeChange={setLiferCountRange}
            dataRange={dataRange}
            seenSpecies={effectiveSeenSpecies}
          />
        </div>

        {/* Side Panel */}
        <SidePanel
          collapsed={sidePanelCollapsed}
          onToggle={() => setSidePanelCollapsed((prev) => !prev)}
          currentWeek={currentWeek}
          onWeekChange={setCurrentWeek}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          goalBirdsOnlyFilter={goalBirdsOnlyFilter}
          onGoalBirdsOnlyFilterChange={setGoalBirdsOnlyFilter}
          selectedLocation={selectedLocation}
          onSelectedLocationChange={setSelectedLocation}
          selectedSpecies={selectedSpecies}
          onSelectedSpeciesChange={setSelectedSpecies}
          selectedSpeciesMulti={selectedSpeciesMulti}
          onSelectedSpeciesMultiChange={setSelectedSpeciesMulti}
          goalSpeciesCodes={goalSpeciesCodes}
          goalLists={goalLists}
          activeGoalListId={activeGoalListId}
          onActiveGoalListIdChange={handleActiveGoalListIdChange}
          onGoalListsChange={setGoalLists}
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
          onCompareLocationsChange={setCompareLocations}
          beginnerMode={beginnerMode}
          onBeginnerModeChange={handleBeginnerModeChange}
          onActiveTabChange={setActiveTab}
          onImportComplete={handleImportComplete}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((prev) => !prev)}
          onShowAbout={() => setShowAbout(true)}
          onShowOnboarding={handleShowOnboarding}
        />
      </div>

      {/* Modals */}
      {showAbout && <AboutPage onClose={() => setShowAbout(false)} />}
      {showOnboarding && (
        <OnboardingOverlay onComplete={handleOnboardingComplete} onImportComplete={handleImportComplete} />
      )}

      {/* Global Toast */}
      <Toast />
    </div>
  )
}

export default App
