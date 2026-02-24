import { memo, useState, useEffect } from 'react'
import type { GoalList } from '../lib/goalListsDB'
import ExploreTab from './ExploreTab'
import SpeciesTab from './SpeciesTab'
import GoalBirdsTab from './GoalBirdsTab'
import TripPlanTab from './TripPlanTab'
import ProgressTab from './ProgressTab'
import ProfileTab from './ProfileTab'

export type { MapViewMode, SelectedLocation } from './types'

type TabId = 'explore' | 'species' | 'goals' | 'trip' | 'progress' | 'profile'

interface SidePanelProps {
  collapsed: boolean
  onToggle: () => void
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: 'density' | 'probability' | 'species' | 'goal-birds'
  onViewModeChange?: (mode: 'density' | 'probability' | 'species' | 'goal-birds') => void
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
}

interface Tab {
  id: TabId
  label: string
  icon: string
}

const tabs: Tab[] = [
  { id: 'explore', label: 'Explore', icon: '' },
  { id: 'species', label: 'Species', icon: '' },
  { id: 'goals', label: 'Goals', icon: '' },
  { id: 'trip', label: 'Plan', icon: '' },
  { id: 'progress', label: 'Stats', icon: '' },
  { id: 'profile', label: 'Profile', icon: '' },
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
  dataRange
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
      className={`h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ${
        collapsed ? 'w-12' : 'w-80'
      }`}
    >
      {/* Tab Navigation */}
      <nav
        data-testid="tab-navigation"
        className="flex border-b border-gray-200 dark:border-gray-700"
      >
        {collapsed ? (
          <button
            onClick={onToggle}
            className="w-12 h-10 flex items-center justify-center text-[#2C3E7B] dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Expand panel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        ) : (
          <>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-1 text-[11px] font-medium text-center transition-colors ${
                  activeTab === tab.id
                    ? 'text-[#2C3E7B] dark:text-blue-400 border-b-2 border-[#2C3E7B] dark:border-blue-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title={tab.label}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={onToggle}
              className="px-1.5 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
              title="Collapse panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        )}
      </nav>

      {/* Tab Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3 dark:text-gray-200">
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
})
