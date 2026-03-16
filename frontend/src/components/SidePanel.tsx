import { memo, useState, useEffect } from 'react'
import type { GoalList } from '../lib/goalListsDB'
import ExploreTab from './ExploreTab'
import SpeciesTab from './SpeciesTab'
import GoalBirdsTab from './GoalBirdsTab'
import TripPlanTab from './TripPlanTab'
import ProgressTab from './ProgressTab'
import ProfileTab from './ProfileTab'

import type { MapViewMode } from './types'
export type { MapViewMode, SelectedLocation } from './types'

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
  selectedLocation?: { cellId: number; coordinates: [number, number]; name?: string } | null
  onSelectedLocationChange?: (location: { cellId: number; coordinates: [number, number]; name?: string } | null) => void
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
  liferCountRange?: [number, number]
  onLiferCountRangeChange?: (range: [number, number]) => void
  dataRange?: [number, number]
  showTotalRichness?: boolean
  onShowTotalRichnessChange?: (value: boolean) => void
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
const ProfileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
)

const tabs: Tab[] = [
  { id: 'explore', label: 'Explore', icon: <MapIcon /> },
  { id: 'species', label: 'Species', icon: <BirdIcon /> },
  { id: 'goals', label: 'Goals', icon: <GoalIcon /> },
  { id: 'trip', label: 'Plan', icon: <PinIcon /> },
  { id: 'progress', label: 'Stats', icon: <StatsIcon /> },
  { id: 'profile', label: 'Profile', icon: <ProfileIcon /> },
]

export default memo(function SidePanel({
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
  onHeatmapOpacityChange,
  liferCountRange,
  onLiferCountRangeChange,
  dataRange,
  showTotalRichness = false,
  onShowTotalRichnessChange,
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('explore')

  // Auto-switch to Trip Plan tab when a location is selected on the map
  useEffect(() => {
    if (selectedLocation) {
      setActiveTab('trip') // eslint-disable-line react-hooks/set-state-in-effect -- intentional UX: auto-navigate on map click
    }
  }, [selectedLocation])

  return (
    <>
      {/* ── Mobile Bottom Tab Bar ── */}
      <nav
        data-testid="mobile-tab-bar"
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTab === tab.id && !collapsed) {
                  // Clicking active tab again collapses the panel
                  onToggle()
                } else {
                  setActiveTab(tab.id)
                  // If panel is collapsed, expand it
                  if (collapsed) onToggle()
                }
              }}
              className={`flex-1 flex flex-col items-center py-2 transition-colors ${
                activeTab === tab.id && !collapsed
                  ? 'text-[#2C3E7B] dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
              title={tab.label}
            >
              <span className={`transition-transform ${activeTab === tab.id && !collapsed ? 'scale-110' : ''}`}>
                {tab.icon}
              </span>
              <span className="text-[10px] mt-0.5 font-medium leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── Side Panel (slides up on mobile, sidebar on desktop) ── */}
      <div
        data-testid="side-panel"
        className={`bg-white dark:bg-gray-900 flex flex-col transition-all duration-300 ease-in-out
          ${/* Mobile: fixed bottom sheet above tab bar */''}
          fixed md:relative bottom-0 left-0 right-0 z-40 md:z-auto
          border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-700
          ${collapsed
            ? 'h-0 md:w-0 overflow-hidden'
            : 'h-[55vh] md:h-full md:w-[360px]'
          }`}
        style={!collapsed ? { bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' } : undefined}
      >
        {/* Desktop Tab Navigation */}
        <nav
          data-testid="tab-navigation"
          className="hidden md:flex bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-1 flex flex-col items-center transition-all relative ${
                activeTab === tab.id
                  ? 'text-[#2C3E7B] dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              title={tab.label}
            >
              <span className="mb-0.5">{tab.icon}</span>
              <span className={`text-[10px] font-medium ${
                activeTab === tab.id ? 'font-semibold' : ''
              }`}>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#2C3E7B] dark:bg-blue-400 rounded-full" />
              )}
            </button>
          ))}
          <button
            onClick={onToggle}
            className="px-2 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 active:text-gray-700"
            title="Collapse panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </nav>

        {/* Mobile Panel Header — drag handle + active tab title */}
        <div className="md:hidden flex items-center justify-center py-2 border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={onToggle}
            className="flex flex-col items-center gap-1 px-8 py-1"
            title="Collapse panel"
          >
            <span className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {tabs.find(t => t.id === activeTab)?.label}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto p-4 dark:text-gray-200">
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
                liferCountRange={liferCountRange}
                onLiferCountRangeChange={onLiferCountRangeChange}
                dataRange={dataRange}
                showTotalRichness={showTotalRichness}
                onShowTotalRichnessChange={onShowTotalRichnessChange}
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
                selectedRegion={selectedRegion}
              />
            )}
            {activeTab === 'progress' && <ProgressTab />}
            {activeTab === 'profile' && <ProfileTab />}
          </div>
        )}
      </div>

      {/* Mobile backdrop when panel is open */}
      {!collapsed && (
        <div
          className="md:hidden fixed left-0 right-0 z-30 bg-black/20"
          onClick={onToggle}
          style={{
            top: '44px', /* below header */
            bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))', /* above tab bar */
          }}
        />
      )}
    </>
  )
})
