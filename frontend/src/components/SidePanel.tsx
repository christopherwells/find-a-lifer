import { memo, useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import ExploreTab from './ExploreTab'
import SpeciesTab from './SpeciesTab'
import { useMapControls } from '../contexts/MapControlsContext'

const GoalBirdsTab = lazy(() => import('./GoalBirdsTab'))
const TripPlanTab = lazy(() => import('./TripPlanTab'))
const ProgressTab = lazy(() => import('./ProgressTab'))

import { trackEvent } from '../lib/analytics'
export type { MapViewMode, SelectedLocation } from './types'

type TabId = 'explore' | 'species' | 'goals' | 'trip' | 'progress'

interface SidePanelProps {
  collapsed: boolean
  onToggle: () => void
}

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

// SVG icons for tabs (cleaner than emoji)
const MapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" />
  </svg>
)
const BirdIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 7h.01"/>
    <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20"/>
    <path d="m20 7 2 .5-2 .5"/>
    <path d="M10 18v3"/>
    <path d="M14 17.75V21"/>
    <path d="M7 18a6 6 0 0 0 3.84-10.61"/>
  </svg>
)
const GoalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 110 12 6 6 0 010-12zm0 2a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z" />
  </svg>
)
const PinIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
  </svg>
)
const StatsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
  </svg>
)
const tabs: Tab[] = [
  { id: 'explore', label: 'Explore', icon: <MapIcon /> },
  { id: 'species', label: 'Species', icon: <BirdIcon /> },
  { id: 'goals', label: 'Goals', icon: <GoalIcon /> },
  { id: 'trip', label: 'Plan', icon: <PinIcon /> },
  { id: 'progress', label: 'Stats', icon: <StatsIcon /> },
]

export default memo(function SidePanel({
  collapsed,
  onToggle,
}: SidePanelProps) {
  const {
    state: { selectedLocation },
  } = useMapControls()

  const [activeTab, setActiveTabRaw] = useState<TabId>('explore')
  const setActiveTab = (tab: TabId) => {
    trackEvent('tab_switch', { tab })
    setActiveTabRaw(tab)
  }

  // Resizable sidebar width (desktop only)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved ? Math.max(320, Math.min(800, parseInt(saved))) : 420
  })
  const isResizing = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.max(320, Math.min(800, startWidth - (ev.clientX - startX)))
      setSidebarWidth(newWidth)
    }
    const onMouseUp = () => {
      isResizing.current = false
      localStorage.setItem('sidebarWidth', String(sidebarWidth))
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sidebarWidth])

  // Auto-switch to Trip Plan tab when a location is selected on the map
  useEffect(() => {
    if (selectedLocation) {
      setActiveTabRaw('trip') // eslint-disable-line react-hooks/set-state-in-effect -- intentional UX: auto-navigate on map click
      // Open the sheet if it was collapsed (e.g. user was on the map)
      if (collapsed) onToggle()
    }
  }, [selectedLocation]) // eslint-disable-line react-hooks/exhaustive-deps -- onToggle/collapsed are stable

  return (
    <>
      {/* ── Mobile Bottom Tab Bar ── */}
      <nav
        data-testid="mobile-tab-bar"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
        aria-label="Main navigation"
      >
        <div className="flex" role="tablist" aria-label="App sections">
          {tabs.map((tab) => {
            // Explore tab is highlighted when user is on the map (panel collapsed)
            // Other tabs are highlighted when their sheet is open
            const isHighlighted = tab.id === 'explore'
              ? collapsed
              : (activeTab === tab.id && !collapsed)
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isHighlighted}
                aria-controls="tab-content"
                onClick={() => {
                  if (tab.id === 'explore') {
                    // Explore = back to map (collapse any open sheet)
                    setActiveTab('explore')
                    if (!collapsed) onToggle()
                  } else if (activeTab === tab.id && !collapsed) {
                    // Clicking active non-explore tab again = collapse sheet
                    onToggle()
                  } else {
                    setActiveTab(tab.id)
                    if (collapsed) onToggle()
                  }
                }}
                className={`flex-1 flex flex-col items-center justify-center min-h-[44px] py-1.5 transition-colors ${
                  isHighlighted
                    ? 'text-[#2C3E7B] dark:text-blue-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                title={tab.label}
              >
                <span className={`transition-transform ${isHighlighted ? 'scale-110' : ''}`}>
                  {tab.icon}
                </span>
                <span className="text-xs mt-0.5 font-medium leading-none">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Side Panel (slides up on mobile, sidebar on desktop) ── */}
      {(() => {
        return (
      <div
        data-testid="side-panel"
        className={`bg-white dark:bg-gray-900 flex flex-col transition-all duration-300 ease-in-out
          ${/* Mobile: fixed full-screen sheet above tab bar */''}
          fixed md:relative bottom-0 left-0 right-0 z-40 md:z-auto
          border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700
          ${collapsed
            ? 'h-0 md:w-0 overflow-hidden'
            : 'md:h-full animate-sheet-up md:animate-none'
          }`}
        style={!collapsed ? {
          bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))',
          height: 'calc(100vh - 52px - 44px - env(safe-area-inset-bottom, 0px))',
          ...(window.innerWidth >= 768 ? { width: `${sidebarWidth}px`, bottom: 'auto', height: 'auto' } : {}),
        } : undefined}
      >
        {/* Resize handle (desktop only) */}
        {!collapsed && (
          <div
            className="hidden md:block absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#2C3E7B]/30 active:bg-[#2C3E7B]/50 transition-colors z-10"
            onMouseDown={handleMouseDown}
            title="Drag to resize"
          />
        )}
        {/* Desktop Tab Navigation */}
        <nav
          data-testid="tab-navigation"
          className="hidden md:flex bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
          aria-label="Main navigation"
        >
          <div className="flex flex-1" role="tablist" aria-label="App sections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="tab-content"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-1 flex flex-col items-center transition-all relative ${
                activeTab === tab.id
                  ? 'text-[#2C3E7B] dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={tab.label}
            >
              <span className="mb-0.5">{tab.icon}</span>
              <span className={`text-xs lg:text-xs font-medium ${
                activeTab === tab.id ? 'font-semibold' : ''
              }`}>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#2C3E7B] dark:bg-blue-400 rounded-full" />
              )}
            </button>
          ))}
          </div>
          <button
            onClick={onToggle}
            className="px-2 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 active:text-gray-700"
            title="Collapse panel"
            aria-label="Collapse panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </nav>

        {/* Tab Content */}
        {!collapsed && (
          <div id="tab-content" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="flex-1 overflow-y-auto p-4 dark:text-gray-200">
            {/* ExploreTab renders on desktop only; on mobile, MapControls handles explore */}
            {activeTab === 'explore' && (
              <div className="hidden md:block">
                <ExploreTab />
              </div>
            )}
            {activeTab === 'species' && <SpeciesTab />}
            <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="h-6 w-6 border-2 border-[#2C3E7B] border-t-transparent rounded-full animate-spin" /></div>}>
              {activeTab === 'goals' && <GoalBirdsTab />}
              {activeTab === 'trip' && <TripPlanTab />}
              {activeTab === 'progress' && <ProgressTab />}
            </Suspense>
          </div>
        )}
      </div>
        )
      })()}

      {/* Mobile backdrop when panel is open — pointer-events-none lets map remain interactive */}
      {!collapsed && (
        <div
          className="md:hidden fixed left-0 right-0 z-30 bg-black/20 pointer-events-none"
          style={{
            top: '0', /* full screen on mobile (TopBar hidden) */
            bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))', /* above tab bar */
          }}
        />
      )}
    </>
  )
})
