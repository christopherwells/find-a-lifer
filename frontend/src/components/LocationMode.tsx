import { useState, useEffect, useMemo } from 'react'
import type { Species, SelectedLocation, TripLifer } from './types'
import { ListSkeleton } from './Skeleton'
import {
  formatCoords,
  getWeekLabel,
} from './tripPlanUtils'
import { expandRegionFilter } from '../lib/regionGroups'
import TripSpeciesItem from './TripSpeciesItem'
import SpeciesInfoCard from './SpeciesInfoCard'

interface LocationModeProps {
  selectedLocation: SelectedLocation | null
  currentWeek: number
  speciesData: Species[]
  speciesLoaded: boolean
  seenSpecies: Set<string>
  cellLabels: Map<number, string>
  selectedRegion?: string | null
}

export default function LocationMode({
  selectedLocation,
  currentWeek,
  speciesData,
  speciesLoaded,
  seenSpecies,
  cellLabels,
  selectedRegion = null,
}: LocationModeProps) {
  const [startWeek, setStartWeek] = useState(currentWeek)
  const [endWeek, setEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [lifers, setLifers] = useState<TripLifer[]>([])
  const [loading, setLoading] = useState(false)
  const [sortMode, setSortMode] = useState<'probability' | 'name' | 'family'>('probability')
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null)

  const speciesByCode = useMemo(() => {
    const map = new Map<string, Species>()
    speciesData.forEach(sp => map.set(sp.speciesCode, sp))
    return map
  }, [speciesData])

  // Sync weeks with parent
  useEffect(() => {
    setStartWeek(currentWeek)
    setEndWeek(Math.min(currentWeek + 2, 52))
  }, [currentWeek])

  // Load location data
  useEffect(() => {
    if (!selectedLocation || !speciesLoaded) {
      setLifers([])
      return
    }

    const loadTripData = async () => {
      setLoading(true)
      try {
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        const weeksToLoad: number[] = []
        for (let w = startWeek; w <= endWeek; w++) {
          weeksToLoad.push(w)
        }

        const speciesProbabilities = new Map<number, { total: number; count: number }>()

        const { fetchWeekCells } = await import('../lib/dataCache')
        const weekResults = await Promise.all(
          weeksToLoad.map(async (week) => {
            try {
              const weekCells = await fetchWeekCells(week)
              const cellData = weekCells.get(selectedLocation.cellId)
              const speciesIds = cellData?.speciesIds || []
              return speciesIds.map(sid => ({ species_id: sid, probability: 1.0 }))
            } catch {
              return [] as { species_id: number; probability: number }[]
            }
          })
        )

        for (const cellRecords of weekResults) {
          for (const record of cellRecords) {
            const existing = speciesProbabilities.get(record.species_id) || { total: 0, count: 0 }
            speciesProbabilities.set(record.species_id, {
              total: existing.total + record.probability,
              count: existing.count + 1
            })
          }
        }

        const regionCodes = selectedRegion ? expandRegionFilter(selectedRegion) : null
        const liferList: TripLifer[] = []
        speciesProbabilities.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species) return
          if (seenSpecies.has(species.speciesCode)) return
          if (regionCodes && !regionCodes.some(code => species.regions?.includes(code))) return

          liferList.push({
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel,
            conservStatus: species.conservStatus,
            difficultyRating: species.difficultyRating,
          })
        })

        liferList.sort((a, b) => b.probability - a.probability)
        setLifers(liferList)
      } catch (error) {
        console.error('Trip Plan: error loading data', error)
      } finally {
        setLoading(false)
      }
    }

    loadTripData()
  }, [selectedLocation, startWeek, endWeek, speciesLoaded, speciesData, seenSpecies, selectedRegion])

  const sortedLifers = useMemo(() => {
    const sorted = [...lifers]
    switch (sortMode) {
      case 'name':
        sorted.sort((a, b) => a.comName.localeCompare(b.comName))
        break
      case 'family':
        sorted.sort((a, b) => a.familyComName.localeCompare(b.familyComName) || a.comName.localeCompare(b.comName))
        break
      case 'probability':
      default:
        sorted.sort((a, b) => b.probability - a.probability)
        break
    }
    return sorted
  }, [lifers, sortMode])

  const formatLocation = (coordinates: [number, number], cellId?: number, name?: string): string => {
    if (name) return name
    if (cellId != null) {
      const label = cellLabels.get(cellId)
      if (label) return label
    }
    return formatCoords(coordinates)
  }

  return (
    <>
      {/* Location Display and Date Range */}
      <div className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
            Selected Location
          </label>
          {selectedLocation ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {formatLocation(selectedLocation.coordinates, selectedLocation.cellId, selectedLocation.name)}
              </div>
              {(selectedLocation.name || cellLabels.has(selectedLocation.cellId)) && (
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                  {formatCoords(selectedLocation.coordinates)}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Click on the map to select a location
              </p>
            </div>
          )}
        </div>

        {/* Date Range Picker */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Date Range</label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Start Week</label>
              <input
                type="range" min="1" max="52" value={startWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setStartWeek(val)
                  if (val > endWeek) setEndWeek(val)
                }}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                Week {startWeek} (~{getWeekLabel(startWeek)})
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">End Week</label>
              <input
                type="range" min="1" max="52" value={endWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10)
                  setEndWeek(val)
                  if (val < startWeek) setStartWeek(val)
                }}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              />
              <div className="text-xs text-center text-[#2C3E7B] dark:text-blue-400 font-medium">
                Week {endWeek} (~{getWeekLabel(endWeek)})
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {!selectedLocation ? (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <span className="font-medium">Select a location</span> on the map to see lifers you could find there.
            </p>
          </div>
        ) : loading ? (
          <ListSkeleton count={4} />
        ) : lifers.length === 0 ? (
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-300 dark:text-green-700 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-green-700 dark:text-green-400">
              <span className="font-medium">No lifers found!</span> You have already seen all species recorded in this area during this period.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">
                Potential Lifers ({lifers.length})
              </h4>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as 'probability' | 'name' | 'family')}
                className="text-xs border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none"
                data-testid="lifer-sort-select"
              >
                <option value="probability">Probability</option>
                <option value="name">Name (A-Z)</option>
                <option value="family">Family</option>
              </select>
            </div>
            <div className="space-y-1">
              {sortedLifers.map((lifer, index) => (
                <TripSpeciesItem
                  key={lifer.speciesCode}
                  lifer={lifer}
                  index={index}
                  onClick={() => {
                    const sp = speciesByCode.get(lifer.speciesCode)
                    if (sp) setSelectedSpecies(sp)
                  }}
                />
              ))}
            </div>
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
