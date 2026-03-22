import { useState, useEffect, useMemo } from 'react'
import type { Species, SelectedLocation, HotspotLocation } from './types'
import { ListSkeleton } from './Skeleton'
import {
  formatCoords,
  getWeekLabel,
  getCellCoordinates,
  REGION_BBOX,
  isInRegionBbox,
} from './tripPlanUtils'

interface HotspotsModeProps {
  currentWeek: number
  speciesData: Species[]
  speciesLoaded: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature collection
  gridData: any
  seenSpecies: Set<string>
  selectedRegion: string | null
  cellLabels: Map<number, string>
  onLocationSelect?: (location: SelectedLocation | null) => void
}

export default function HotspotsMode({
  currentWeek,
  speciesData,
  speciesLoaded,
  gridData,
  seenSpecies,
  selectedRegion,
  cellLabels,
  onLocationSelect,
}: HotspotsModeProps) {
  const [hotspotWeek, setHotspotWeek] = useState(currentWeek)
  const [hotspots, setHotspots] = useState<HotspotLocation[]>([])
  const [hotspotsLoading, setHotspotsLoading] = useState(false)
  const [hotspotSortMode, setHotspotSortMode] = useState<'liferCount' | 'name'>('liferCount')
  const [showAll, setShowAll] = useState(false)

  // Sync week with parent
  useEffect(() => { setHotspotWeek(currentWeek) }, [currentWeek])

  // Calculate hotspots
  useEffect(() => {
    if (!speciesLoaded || !gridData) return

    const controller = new AbortController()

    const calc = async () => {
      setHotspotsLoading(true)
      try {
        const { fetchWeekCells, computeLiferSummary } = await import('../lib/dataCache')
        const weekCells = await fetchWeekCells(hotspotWeek)
        if (controller.signal.aborted) return

        const seenIds = new Set<number>()
        const validIds = new Set<number>()
        speciesData.forEach(sp => {
          validIds.add(sp.species_id)
          if (seenSpecies.has(sp.speciesCode)) seenIds.add(sp.species_id)
        })

        const summaryData = computeLiferSummary(weekCells, seenIds, null, validIds)
        const cellCoords = getCellCoordinates(gridData)
        const regionBbox = selectedRegion ? REGION_BBOX[selectedRegion] : null

        const arr: HotspotLocation[] = []
        for (const [cellId, liferCount] of summaryData) {
          if (liferCount === 0) continue
          const coords = cellCoords.get(cellId)
          if (!coords) continue
          if (!isInRegionBbox(coords, regionBbox)) continue
          arr.push({ cellId, coordinates: coords, liferCount, rank: 0 })
        }

        arr.sort((a, b) => b.liferCount - a.liferCount)
        arr.forEach((h, i) => h.rank = i + 1)

        setHotspots(arr)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Trip Plan: hotspots error', error)
          setHotspots([])
        }
      } finally {
        setHotspotsLoading(false)
      }
    }
    calc()

    return () => controller.abort()
  }, [hotspotWeek, speciesLoaded, speciesData, gridData, seenSpecies, selectedRegion])

  const sortedHotspots = useMemo(() => {
    const sorted = [...hotspots]
    if (hotspotSortMode === 'name') {
      sorted.sort((a, b) => {
        const nameA = cellLabels.get(a.cellId) || ''
        const nameB = cellLabels.get(b.cellId) || ''
        return nameA.localeCompare(nameB)
      })
    } else {
      sorted.sort((a, b) => b.liferCount - a.liferCount)
    }
    return sorted
  }, [hotspots, hotspotSortMode])

  const formatLocation = (coordinates: [number, number], cellId?: number): string => {
    if (cellId != null) {
      const label = cellLabels.get(cellId)
      if (label) return label
    }
    return formatCoords(coordinates)
  }

  return (
    <>
      {/* Week Picker */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Select Week</label>
        <input
          type="range"
          min="1"
          max="52"
          value={hotspotWeek}
          onChange={(e) => setHotspotWeek(parseInt(e.target.value, 10))}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
          data-testid="hotspot-week-slider"
        />
        <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium mt-1">
          Week {hotspotWeek} (~{getWeekLabel(hotspotWeek)})
        </div>
      </div>

      {/* Results */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {hotspotsLoading ? (
          <ListSkeleton count={4} />
        ) : hotspots.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-medium">No hotspots found.</span> You may have already seen all species for this week.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">
                Top Lifer Hotspots ({hotspots.length})
              </h4>
            </div>
            <div className="space-y-1" data-testid="hotspot-list">
              {(showAll ? sortedHotspots : sortedHotspots.slice(0, 20)).map((hotspot) => (
                <button
                  key={hotspot.cellId}
                  onClick={() => {
                    onLocationSelect?.({
                      cellId: hotspot.cellId,
                      coordinates: hotspot.coordinates,
                      name: cellLabels.get(hotspot.cellId)
                    })
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 hover:border-orange-200 dark:hover:border-orange-700 transition-colors text-left"
                  data-testid={`hotspot-${hotspot.cellId}`}
                >
                  <div className="text-xs text-gray-400 dark:text-gray-500 w-6 text-right font-mono">
                    #{hotspot.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                      {formatLocation(hotspot.coordinates, hotspot.cellId)}
                    </div>
                  </div>
                  <div className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                    {hotspot.liferCount} lifers
                  </div>
                </button>
              ))}
              {!showAll && sortedHotspots.length > 20 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-center py-1.5"
                >
                  Show all {sortedHotspots.length} hotspots
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
