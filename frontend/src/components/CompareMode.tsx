import { useState, useEffect, useRef, useMemo } from 'react'
import type { Species, SelectedLocation, TripLifer, CompareLocations } from './types'
import { ListSkeleton } from './Skeleton'
import {
  formatCoords,
  getWeekLabel,
} from './tripPlanUtils'
import TripSpeciesItem from './TripSpeciesItem'
import SpeciesInfoCard from './SpeciesInfoCard'
import { expandRegionFilter } from '../lib/regionGroups'

interface CompareModeProps {
  selectedLocation: SelectedLocation | null
  currentWeek: number
  speciesData: Species[]
  speciesLoaded: boolean
  seenSpecies: Set<string>
  cellLabels: Map<number, string>
  onCompareLocationsChange?: (locations: CompareLocations | null) => void
  selectedRegion?: string | null
}

export default function CompareMode({
  selectedLocation,
  currentWeek,
  speciesData,
  speciesLoaded,
  seenSpecies,
  cellLabels,
  onCompareLocationsChange,
  selectedRegion = null,
}: CompareModeProps) {
  const [locationA, setLocationA] = useState<SelectedLocation | null>(null)
  const [locationB, setLocationB] = useState<SelectedLocation | null>(null)
  const [compareStartWeek, setCompareStartWeek] = useState(currentWeek)
  const [compareEndWeek, setCompareEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [compareLoading, setCompareLoading] = useState(false)
  const [overlapLifers, setOverlapLifers] = useState<TripLifer[]>([])
  const [uniqueToA, setUniqueToA] = useState<TripLifer[]>([])
  const [uniqueToB, setUniqueToB] = useState<TripLifer[]>([])
  const [nextCompareSlot, setNextCompareSlot] = useState<'A' | 'B'>('A')
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const lastProcessedLocationRef = useRef<SelectedLocation | null>(null)

  const speciesByCode = useMemo(() => {
    const map = new Map<string, Species>()
    speciesData.forEach(sp => map.set(sp.speciesCode, sp))
    return map
  }, [speciesData])

  const toggleExpand = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  // Sync weeks with parent
  useEffect(() => {
    setCompareStartWeek(currentWeek)
    setCompareEndWeek(Math.min(currentWeek + 2, 52))
  }, [currentWeek])

  // Notify parent about compare location changes
  useEffect(() => {
    onCompareLocationsChange?.({ locationA, locationB })
  }, [locationA, locationB, onCompareLocationsChange])

  // Handle location selection
  useEffect(() => {
    if (selectedLocation) {
      if (lastProcessedLocationRef.current?.cellId !== selectedLocation.cellId) {
        lastProcessedLocationRef.current = selectedLocation
        if (nextCompareSlot === 'A') {
          setLocationA(selectedLocation)
          setNextCompareSlot('B')
        } else {
          setLocationB(selectedLocation)
          setNextCompareSlot('A')
        }
      }
    }
  }, [selectedLocation, nextCompareSlot])

  // Compare two locations
  useEffect(() => {
    if (!locationA || !locationB || !speciesLoaded) {
      setOverlapLifers([])
      setUniqueToA([])
      setUniqueToB([])
      return
    }

    const compareLocations = async () => {
      setCompareLoading(true)
      try {
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        const weeksToLoad: number[] = []
        for (let w = compareStartWeek; w <= compareEndWeek; w++) {
          weeksToLoad.push(w)
        }

        const speciesAtA = new Map<number, { total: number; count: number }>()
        const speciesAtB = new Map<number, { total: number; count: number }>()

        const { fetchWeekCells } = await import('../lib/dataCache')
        const cellFetches = weeksToLoad.flatMap(week => [
          fetchWeekCells(week)
            .then(weekCells => {
              const cellData = weekCells.get(locationA!.cellId)
              const speciesIds = cellData?.speciesIds || []
              return { location: 'A' as const, data: speciesIds.map(sid => ({ species_id: sid, probability: 1.0 })) }
            })
            .catch(() => ({ location: 'A' as const, data: [] as { species_id: number; probability: number }[] })),
          fetchWeekCells(week)
            .then(weekCells => {
              const cellData = weekCells.get(locationB!.cellId)
              const speciesIds = cellData?.speciesIds || []
              return { location: 'B' as const, data: speciesIds.map(sid => ({ species_id: sid, probability: 1.0 })) }
            })
            .catch(() => ({ location: 'B' as const, data: [] as { species_id: number; probability: number }[] })),
        ])

        const results = await Promise.all(cellFetches)

        for (const { location, data } of results) {
          const target = location === 'A' ? speciesAtA : speciesAtB
          for (const record of data) {
            const existing = target.get(record.species_id) || { total: 0, count: 0 }
            target.set(record.species_id, {
              total: existing.total + record.probability,
              count: existing.count + 1
            })
          }
        }

        const regionCodes = selectedRegion ? expandRegionFilter(selectedRegion) : null
        const overlapList: TripLifer[] = []
        const uniqueAList: TripLifer[] = []
        const uniqueBList: TripLifer[] = []

        speciesAtA.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return
          if (regionCodes && !regionCodes.some(code => species.regions?.includes(code))) return

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel,
            conservStatus: species.conservStatus,
            difficultyRating: species.difficultyRating,
          }

          if (speciesAtB.has(speciesId)) {
            overlapList.push(lifer)
          } else {
            uniqueAList.push(lifer)
          }
        })

        speciesAtB.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return
          if (speciesAtA.has(speciesId)) return
          if (regionCodes && !regionCodes.some(code => species.regions?.includes(code))) return

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel,
            conservStatus: species.conservStatus,
            difficultyRating: species.difficultyRating,
          }

          uniqueBList.push(lifer)
        })

        overlapList.sort((a, b) => b.probability - a.probability)
        uniqueAList.sort((a, b) => b.probability - a.probability)
        uniqueBList.sort((a, b) => b.probability - a.probability)

        setOverlapLifers(overlapList)
        setUniqueToA(uniqueAList)
        setUniqueToB(uniqueBList)
      } catch (error) {
        console.error('Compare: error', error)
        setOverlapLifers([])
        setUniqueToA([])
        setUniqueToB([])
      } finally {
        setCompareLoading(false)
      }
    }

    compareLocations()
  }, [locationA, locationB, compareStartWeek, compareEndWeek, speciesLoaded, speciesData, seenSpecies])

  const formatLocation = (coordinates: [number, number], cellId?: number, name?: string): string => {
    if (name) return name
    if (cellId != null) {
      const label = cellLabels.get(cellId)
      if (label) return label
    }
    return formatCoords(coordinates)
  }

  const renderSpeciesList = (list: TripLifer[], colorClass: string, sectionKey: string, maxShown = 20) => {
    const isExpanded = expandedSections.has(sectionKey)
    const visibleList = isExpanded ? list : list.slice(0, maxShown)
    return (
      <div className={`space-y-1 ${isExpanded ? '' : 'max-h-48'} overflow-y-auto`}>
        {visibleList.map((lifer, index) => (
          <TripSpeciesItem
            key={lifer.speciesCode}
            lifer={lifer}
            index={index}
            showProbability={false}
            colorClass={colorClass}
            onClick={() => {
              const sp = speciesByCode.get(lifer.speciesCode)
              if (sp) setSelectedSpecies(sp)
            }}
          />
        ))}
        {list.length > maxShown && !isExpanded && (
          <button
            onClick={() => toggleExpand(sectionKey)}
            className="w-full text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium text-center py-1.5"
          >
            Show all {list.length} species
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Two Locations and Date Range */}
      <div className="mt-3 space-y-3">
        {/* Location A */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Location A</label>
          {locationA ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  {formatLocation(locationA.coordinates, locationA.cellId, locationA.name)}
                </div>
                <button
                  onClick={() => setLocationA(null)}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
                  data-testid="clear-location-a-btn"
                >
                  Clear
                </button>
              </div>
              {(locationA.name || cellLabels.has(locationA.cellId)) && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatCoords(locationA.coordinates)}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">Click on the map to select Location A</p>
            </div>
          )}
        </div>

        {/* Location B */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Location B</label>
          {locationB ? (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-green-800 dark:text-green-300">
                  {formatLocation(locationB.coordinates, locationB.cellId, locationB.name)}
                </div>
                <button
                  onClick={() => setLocationB(null)}
                  className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-xs font-medium"
                  data-testid="clear-location-b-btn"
                >
                  Clear
                </button>
              </div>
              {(locationB.name || cellLabels.has(locationB.cellId)) && (
                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {formatCoords(locationB.coordinates)}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">Click on the map to select Location B</p>
            </div>
          )}
        </div>

        {/* Date Range */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Date Range</label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Start Week</label>
              <input
                type="range" min="1" max="52" value={compareStartWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setCompareStartWeek(val)
                  if (val > compareEndWeek) setCompareEndWeek(val)
                }}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                data-testid="compare-start-week-slider"
              />
              <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                Week {compareStartWeek} (~{getWeekLabel(compareStartWeek)})
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">End Week</label>
              <input
                type="range" min="1" max="52" value={compareEndWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setCompareEndWeek(val)
                  if (val < compareStartWeek) setCompareStartWeek(val)
                }}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
                data-testid="compare-end-week-slider"
              />
              <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                Week {compareEndWeek} (~{getWeekLabel(compareEndWeek)})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {!locationA || !locationB ? (
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="text-sm text-purple-700 dark:text-purple-400">
              <span className="font-medium">Select two locations</span> on the map to compare their lifer availability.
            </p>
          </div>
        ) : compareLoading ? (
          <ListSkeleton count={4} />
        ) : (
          <div className="space-y-3" data-testid="compare-results">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2 text-center">
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1 truncate" title={formatLocation(locationA.coordinates, locationA.cellId, locationA.name)}>
                  {formatLocation(locationA.coordinates, locationA.cellId, locationA.name)}
                </div>
                <div className="text-lg font-bold text-blue-800 dark:text-blue-300">{uniqueToA.length + overlapLifers.length}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400">total lifers</div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-2 text-center">
                <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Overlap</div>
                <div className="text-lg font-bold text-purple-800 dark:text-purple-300">{overlapLifers.length}</div>
                <div className="text-xs text-purple-600 dark:text-purple-400">at both</div>
              </div>
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-2 text-center">
                <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1 truncate" title={formatLocation(locationB.coordinates, locationB.cellId, locationB.name)}>
                  {formatLocation(locationB.coordinates, locationB.cellId, locationB.name)}
                </div>
                <div className="text-lg font-bold text-green-800 dark:text-green-300">{uniqueToB.length + overlapLifers.length}</div>
                <div className="text-xs text-green-600 dark:text-green-400">total lifers</div>
              </div>
            </div>

            {/* Overlap */}
            {overlapLifers.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2" data-testid="overlap-heading">
                  Overlap ({overlapLifers.length})
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Available at both locations</p>
                {renderSpeciesList(overlapLifers, 'purple', 'overlap')}
              </div>
            )}

            {/* Unique to A */}
            {uniqueToA.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2" data-testid="unique-a-heading">
                  Unique to {formatLocation(locationA.coordinates, locationA.cellId, locationA.name)} ({uniqueToA.length})
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Only at {formatLocation(locationA.coordinates, locationA.cellId, locationA.name)}</p>
                {renderSpeciesList(uniqueToA, 'blue', 'uniqueA')}
              </div>
            )}

            {/* Unique to B */}
            {uniqueToB.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2" data-testid="unique-b-heading">
                  Unique to {formatLocation(locationB.coordinates, locationB.cellId, locationB.name)} ({uniqueToB.length})
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Only at {formatLocation(locationB.coordinates, locationB.cellId, locationB.name)}</p>
                {renderSpeciesList(uniqueToB, 'green', 'uniqueB')}
              </div>
            )}

            {/* No lifers */}
            {overlapLifers.length === 0 && uniqueToA.length === 0 && uniqueToB.length === 0 && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-300 dark:text-green-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm text-green-700 dark:text-green-400">
                  <span className="font-medium">No lifers found!</span> You have already seen all species at both locations during this period.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedSpecies && (
        <SpeciesInfoCard
          species={selectedSpecies}
          onClose={() => setSelectedSpecies(null)}
          currentWeek={currentWeek}
        />
      )}
    </>
  )
}
