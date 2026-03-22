import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import TopBar from './components/TopBar'
import SidePanel from './components/SidePanel'
import MapView from './components/MapView'
import MapControls from './components/MapControls'
import ErrorBoundary from './components/ErrorBoundary'
import AboutPage from './components/AboutPage'
import Toast from './components/Toast'
import { useLifeList } from './contexts/LifeListContext'
import { useToast } from './contexts/ToastContext'
import { MapControlsProvider } from './contexts/MapControlsContext'
import { trackEvent } from './lib/analytics'
import { openFilePicker, processCSVFile } from './lib/csvImport'
import { isTourComplete, startTour } from './lib/featureTour'
import { fetchSpecies } from './lib/dataCache'
import type { Species } from './components/types'
import './App.css'

const ProfileTab = lazy(() => import('./components/ProfileTab'))

function AppInner() {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true'
  })
  // Start collapsed on mobile so the map is visible
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(() => {
    return window.innerWidth < 768
  })
  const [showAbout, setShowAbout] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAddSpecies, setShowAddSpecies] = useState(false) // kept for backward compat with AddSpeciesModal
  const tourStartedRef = useRef(false)
  const { effectiveSeenSpecies, isSpeciesSeen, toggleSpecies, importSpeciesList, activeTripName, activeTripMemberCount } = useLifeList()
  const { showToast } = useToast()

  // Session counting
  useEffect(() => {
    const count = parseInt(localStorage.getItem('sessionCount') || '0', 10) + 1
    localStorage.setItem('sessionCount', String(count))
    trackEvent('app_open', { session_count: count })
  }, [])

  // Launch driver.js feature tour on first visit (after map has loaded)
  useEffect(() => {
    if (isTourComplete() || tourStartedRef.current) return
    tourStartedRef.current = true
    // Small delay so the map and controls are fully rendered before highlighting
    const timer = setTimeout(() => {
      startTour()
    }, 1200)
    return () => clearTimeout(timer)
  }, [])

  // Persist dark mode and toggle class on document root
  useEffect(() => {
    localStorage.setItem('darkMode', String(darkMode))
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const handleShowTour = useCallback(() => {
    startTour()
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
    // On first import, prompt for geolocation to fly map to user's area
    if (!localStorage.getItem('mapPosition') && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          // Access the exposed map instance from MapView
          const mapInstance = (window as unknown as Record<string, unknown>).__maplibreglMap as { flyTo: (opts: { center: [number, number]; zoom: number }) => void } | undefined
          if (mapInstance) {
            mapInstance.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 7 })
          }
        },
        () => { /* User denied or error — no action */ },
        { timeout: 10000 }
      )
    }
  }, [showToast])

  const handleImportClick = useCallback(async () => {
    const file = await openFilePicker()
    if (!file) return
    try {
      const result = await processCSVFile(file, importSpeciesList)
      if (result.newCount > 0) handleImportComplete(result.newCount)
      else if (result.matched > 0) {
        showToast({ type: 'muted', message: `All ${result.matched} species already in your list`, duration: 3000 })
      }
    } catch (error) {
      console.error('Import error:', error)
      showToast({ type: 'muted', message: error instanceof Error ? error.message : 'Import failed', duration: 4000 })
    }
  }, [importSpeciesList, handleImportComplete, showToast])

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
        onShowOnboarding={handleShowTour}
        onImportClick={handleImportClick}
        onShowProfile={() => setShowProfile(true)}
      />

      {/* Main Content: Map + Side Panel */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Map Area — always visible; pb-[52px] on mobile for bottom tab bar */}
        <div id="main-content" className="flex-1 relative order-first pb-[52px] md:pb-0">
          <ErrorBoundary section="map">
          <MapView
            darkMode={darkMode}
            seenSpecies={effectiveSeenSpecies}
          />
          </ErrorBoundary>
          {/* Trip mode banner */}
          {activeTripName && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-40 bg-[#2C3E7B] text-white px-3 py-1.5 rounded-full shadow-lg text-xs font-medium flex items-center gap-2 pointer-events-none">
              <span>Trip: {activeTripName}</span>
              <span className="bg-white/20 px-1.5 py-0.5 rounded-full">{activeTripMemberCount}</span>
            </div>
          )}
          {/* Floating map controls — mobile only (desktop uses ExploreTab in panel) */}
          <MapControls
            seenSpecies={effectiveSeenSpecies}
          />
        </div>

        {/* Side Panel */}
        <ErrorBoundary section="tab">
        <SidePanel
          collapsed={sidePanelCollapsed}
          onToggle={() => setSidePanelCollapsed((prev) => !prev)}
        />
        </ErrorBoundary>
      </div>

      {/* Modals */}
      {showAbout && <AboutPage onClose={() => setShowAbout(false)} />}
      {showProfile && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-12 md:pt-20">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowProfile(false)} />
          <div className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 mx-4">
            <button
              onClick={() => setShowProfile(false)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-6 w-6 border-2 border-[#2C3E7B] border-t-transparent rounded-full animate-spin" /></div>}>
              <ProfileTab
                onShowAbout={() => { setShowProfile(false); setShowAbout(true) }}
                onShowOnboarding={() => { setShowProfile(false); handleShowTour() }}
              />
            </Suspense>
          </div>
        </div>
      )}
      {showAddSpecies && (
        <AddSpeciesModal
          onClose={() => setShowAddSpecies(false)}
          isSpeciesSeen={isSpeciesSeen}
          toggleSpecies={toggleSpecies}
          showToast={showToast}
        />
      )}
      {/* Global Toast */}
      <Toast />
    </div>
  )
}

/** Inline modal for searching and toggling species on the life list */
function AddSpeciesModal({
  onClose,
  isSpeciesSeen,
  toggleSpecies,
  showToast,
}: {
  onClose: () => void
  isSpeciesSeen: (code: string) => boolean
  toggleSpecies: (code: string, name: string) => Promise<void>
  showToast: (t: Omit<import('./contexts/ToastContext').Toast, 'id'>) => void
}) {
  const [query, setQuery] = useState('')
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load species list once on mount
  useEffect(() => {
    fetchSpecies().then((species) => {
      setAllSpecies(species)
      setLoading(false)
    })
  }, [])

  // Auto-focus search input on mount
  useEffect(() => {
    // Short delay so the modal animation doesn't interfere
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Filter species by query (comName and sciName), limit to 50 results
  const trimmed = query.trim().toLowerCase()
  const results = trimmed.length < 2
    ? []
    : allSpecies
        .filter(
          (s) =>
            s.comName.toLowerCase().includes(trimmed) ||
            s.sciName.toLowerCase().includes(trimmed)
        )
        .slice(0, 50)

  const handleToggle = async (species: Species) => {
    const wasSeen = isSpeciesSeen(species.speciesCode)
    try {
      await toggleSpecies(species.speciesCode, species.comName)
      showToast({
        type: wasSeen ? 'muted' : 'success',
        message: wasSeen
          ? `Removed ${species.comName} from life list`
          : `Added ${species.comName} to life list`,
        duration: 2500,
      })
    } catch {
      showToast({ type: 'muted', message: 'Failed to update life list', duration: 3000 })
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-12 md:pt-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Species</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by common or scientific name..."
            className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] dark:focus:ring-blue-500"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 border-2 border-[#2C3E7B] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : trimmed.length < 2 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              Type at least 2 characters to search
            </p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
              No species found
            </p>
          ) : (
            <ul>
              {results.map((species) => {
                const seen = isSpeciesSeen(species.speciesCode)
                return (
                  <li key={species.speciesCode}>
                    <button
                      onClick={() => handleToggle(species)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-h-[44px]"
                    >
                      {/* Seen indicator */}
                      <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                        seen
                          ? 'bg-green-500 text-white'
                          : 'border-2 border-gray-300 dark:border-gray-600'
                      }`}>
                        {seen && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      {/* Species info */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          seen
                            ? 'text-green-700 dark:text-green-400'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}>
                          {species.comName}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic truncate">
                          {species.sciName}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <MapControlsProvider>
      <AppInner />
    </MapControlsProvider>
  )
}

export default App
