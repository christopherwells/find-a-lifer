import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import type { Species, TripPlanTabProps } from './types'
import { fetchSpecies, fetchGrid } from '../lib/dataCache'
import { buildSpeciesById } from './tripPlanUtils'
import HotspotsMode from './HotspotsMode'
import LocationMode from './LocationMode'
import WindowMode from './WindowMode'
import CompareMode from './CompareMode'
import TripReportsSection from './TripReportsSection'

// Stable empty array to avoid creating new references on every render
const EMPTY_GOAL_LISTS: import('../lib/goalListsDB').GoalList[] = []

export default function TripPlanTab({
  selectedLocation,
  currentWeek = 26,
  onWeekChange,
  onLocationSelect,
  selectedRegion = null,
  onCompareLocationsChange,
  goalLists = EMPTY_GOAL_LISTS,
  activeGoalListId = null,
}: TripPlanTabProps) {
  const [mode, setMode] = useState<'location' | 'hotspots' | 'window' | 'compare'>('hotspots')

  // Shared data
  const [speciesData, setSpeciesData] = useState<Species[]>([])
  const [speciesLoaded, setSpeciesLoaded] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature collection
  const [gridData, setGridData] = useState<any>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const { seenSpecies } = useLifeList()

  const speciesById = useMemo(() => buildSpeciesById(speciesData), [speciesData])

  // Build cell_id → label lookup from grid features
  const cellLabels = useMemo(() => {
    const labels = new Map<number, string>()
    if (!gridData?.features) return labels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature
    gridData.features.forEach((f: any) => {
      const id = f.properties?.cell_id
      const label = f.properties?.label
      if (id != null && label) labels.set(id, label)
    })
    return labels
  }, [gridData])

  // Load species metadata once
  useEffect(() => {
    fetchSpecies()
      .then(data => {
        setSpeciesData(data)
        setSpeciesLoaded(true)
        setDataError(null)
      })
      .catch(() => {
        setDataError('Failed to load species data. Is the server running?')
      })
  }, [])

  // Load grid data
  useEffect(() => {
    fetchGrid()
      .then(data => setGridData(data))
      .catch(() => {
        setDataError('Failed to load grid data. Is the server running?')
      })
  }, [])

  // Notify parent: compare locations = null when not in compare mode
  useEffect(() => {
    if (mode !== 'compare') {
      onCompareLocationsChange?.(null)
    }
  }, [mode, onCompareLocationsChange])

  const handleReset = useCallback(() => {
    onLocationSelect?.(null)
    setMode('hotspots')
  }, [onLocationSelect])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Trip Planning</h3>
          <button
            onClick={handleReset}
            className="px-2 py-0.5 text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
            data-testid="clear-trip-plan-btn"
            title="Clear all trip planning selections"
          >
            Reset
          </button>
        </div>

        {dataError && (
          <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-1.5 rounded text-[11px]">
            {dataError}
          </div>
        )}

        {/* Mode Toggle */}
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 grid grid-cols-4" role="tablist" aria-label="Trip planning mode">
          {(['location', 'hotspots', 'window', 'compare'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`py-1.5 text-[11px] font-medium rounded-md text-center transition-all ${
                mode === m
                  ? 'bg-white dark:bg-gray-800 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              data-testid={`${m}-mode-btn`}
            >
              {m === 'location' ? 'Location' : m === 'hotspots' ? 'Hotspots' : m === 'window' ? 'Window' : 'Compare'}
            </button>
          ))}
        </div>
      </div>

      {/* Mode Content */}
      {mode === 'hotspots' && (
        <HotspotsMode
          currentWeek={currentWeek}
          speciesData={speciesData}
          speciesLoaded={speciesLoaded}
          gridData={gridData}
          seenSpecies={seenSpecies}
          selectedRegion={selectedRegion}
          cellLabels={cellLabels}
          onLocationSelect={onLocationSelect}
        />
      )}

      {mode === 'location' && (
        <LocationMode
          selectedLocation={selectedLocation ?? null}
          currentWeek={currentWeek}
          speciesData={speciesData}
          speciesLoaded={speciesLoaded}
          seenSpecies={seenSpecies}
          cellLabels={cellLabels}
          selectedRegion={selectedRegion}
        />
      )}

      {mode === 'window' && (
        <WindowMode
          currentWeek={currentWeek}
          speciesData={speciesData}
          speciesLoaded={speciesLoaded}
          gridData={gridData}
          seenSpecies={seenSpecies}
          selectedRegion={selectedRegion}
          cellLabels={cellLabels}
          speciesById={speciesById}
          onWeekChange={onWeekChange}
          onLocationSelect={onLocationSelect}
          goalLists={goalLists}
          activeGoalListId={activeGoalListId}
        />
      )}

      {mode === 'compare' && (
        <CompareMode
          selectedLocation={selectedLocation ?? null}
          currentWeek={currentWeek}
          speciesData={speciesData}
          speciesLoaded={speciesLoaded}
          seenSpecies={seenSpecies}
          cellLabels={cellLabels}
          onCompareLocationsChange={onCompareLocationsChange}
          selectedRegion={selectedRegion}
        />
      )}

      {/* Trip Reports */}
      <TripReportsSection />
    </div>
  )
}
