import { useState, useEffect, useRef, useMemo } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import type { Species, TripPlanTabProps, TripLifer, HotspotLocation, WeekOpportunity, SelectedLocation } from './types'
import { ListSkeleton } from './Skeleton'
import { fetchSpecies, fetchGrid } from '../lib/dataCache'

// Bounding boxes for region filtering [west, south, east, north]
const REGION_BBOX: Record<string, [number, number, number, number]> = {
  us_northeast: [-82, 37, -66, 48],
  us_southeast: [-92, 24, -75, 37],
  us_midwest: [-105, 36, -80, 49],
  us_west: [-125, 31, -100, 49],
  alaska: [-180, 51, -130, 72],
  hawaii: [-161, 18, -154, 23],
}

export default function TripPlanTab({
  selectedLocation,
  currentWeek = 26,
  onLocationSelect,
  selectedRegion = null,
}: TripPlanTabProps) {
  // Mode: 'location', 'hotspots', 'window', or 'compare'
  const [mode, setMode] = useState<'location' | 'hotspots' | 'window' | 'compare'>('hotspots')

  // Location mode
  const [startWeek, setStartWeek] = useState(currentWeek)
  const [endWeek, setEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [lifers, setLifers] = useState<TripLifer[]>([])
  const [loading, setLoading] = useState(false)

  // Track which location to set next in compare mode
  const [nextCompareSlot, setNextCompareSlot] = useState<'A' | 'B'>('A')
  const lastProcessedLocationRef = useRef<SelectedLocation | null>(null)

  // Hotspots mode
  const [hotspotWeek, setHotspotWeek] = useState(currentWeek)
  const [hotspots, setHotspots] = useState<HotspotLocation[]>([])
  const [hotspotsLoading, setHotspotsLoading] = useState(false)

  // Sort modes
  const [sortMode, setSortMode] = useState<'probability' | 'name' | 'family'>('probability')
  const [hotspotSortMode, setHotspotSortMode] = useState<'liferCount' | 'cellId'>('liferCount')

  // Window mode
  const [selectedSpeciesForWindow, setSelectedSpeciesForWindow] = useState<Species | null>(null)
  const [weekOpportunities, setWeekOpportunities] = useState<WeekOpportunity[]>([])
  const [windowLoading, setWindowLoading] = useState(false)
  const [speciesSearchTerm, setSpeciesSearchTerm] = useState('')
  const [showSpeciesSuggestions, setShowSpeciesSuggestions] = useState(false)

  // Compare mode
  const [locationA, setLocationA] = useState<SelectedLocation | null>(null)
  const [locationB, setLocationB] = useState<SelectedLocation | null>(null)
  const [compareStartWeek, setCompareStartWeek] = useState(currentWeek)
  const [compareEndWeek, setCompareEndWeek] = useState(Math.min(currentWeek + 2, 52))
  const [compareLoading, setCompareLoading] = useState(false)
  const [overlapLifers, setOverlapLifers] = useState<TripLifer[]>([])
  const [uniqueToA, setUniqueToA] = useState<TripLifer[]>([])
  const [uniqueToB, setUniqueToB] = useState<TripLifer[]>([])

  // Shared
  const [speciesData, setSpeciesData] = useState<Species[]>([])
  const [speciesLoaded, setSpeciesLoaded] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature collection
  const [gridData, setGridData] = useState<any>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const { seenSpecies } = useLifeList()

  const getWeekLabel = (week: number): string => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const dayOfYear = week * 7 - 3
    const date = new Date(2024, 0, dayOfYear)
    return `${monthNames[date.getMonth()]} ${date.getDate()}`
  }

  // Load species metadata once (shared cache)
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

  // Load grid data (shared cache)
  useEffect(() => {
    fetchGrid()
      .then(data => setGridData(data))
      .catch(() => {
        setDataError('Failed to load grid data. Is the server running?')
      })
  }, [])

  // Sync weeks with currentWeek
  useEffect(() => {
    setStartWeek(currentWeek)
    setEndWeek(Math.min(currentWeek + 2, 52))
    setHotspotWeek(currentWeek)
    setCompareStartWeek(currentWeek)
    setCompareEndWeek(Math.min(currentWeek + 2, 52))
  }, [currentWeek])

  // Handle location selection in compare mode
  useEffect(() => {
    if (mode === 'compare' && selectedLocation) {
      // Only process if this is a new location (avoid infinite loop)
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
  }, [selectedLocation, mode, nextCompareSlot])

  // Calculate hotspots using lightweight lifer-summary endpoint
  useEffect(() => {
    if (mode !== 'hotspots' || !speciesLoaded || !gridData) return

    const controller = new AbortController()

    const calc = async () => {
      setHotspotsLoading(true)
      try {
        const { fetchWeekCells, computeLiferSummary } = await import('../lib/dataCache')
        const weekCells = await fetchWeekCells(hotspotWeek)
        if (controller.signal.aborted) return

        // Build seen species ID set from species codes
        const seenIds = new Set<number>()
        speciesData.forEach(sp => {
          if (seenSpecies.has(sp.speciesCode)) seenIds.add(sp.species_id)
        })

        const summaryData = computeLiferSummary(weekCells, seenIds)

        const cellCoords = new Map<number, [number, number]>()
        if (gridData.features) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature
          gridData.features.forEach((f: any) => {
            const id = f.properties?.cell_id
            if (id != null && f.properties.center_lng != null && f.properties.center_lat != null) {
              cellCoords.set(id, [f.properties.center_lng, f.properties.center_lat])
            } else if (id != null && f.geometry?.coordinates?.[0]?.[0]) {
              // Fallback to first polygon vertex
              const coords = f.geometry.coordinates[0][0]
              cellCoords.set(id, [coords[0], coords[1]])
            }
          })
        }

        const regionBbox = selectedRegion ? REGION_BBOX[selectedRegion] : null

        const arr: HotspotLocation[] = []
        for (const [cellId, liferCount] of summaryData) {
          if (liferCount === 0) continue
          const coords = cellCoords.get(cellId)
          if (!coords) continue
          if (regionBbox) {
            const [west, south, east, north] = regionBbox
            if (coords[0] < west || coords[0] > east || coords[1] < south || coords[1] > north) continue
          }
          arr.push({ cellId, coordinates: coords, liferCount, rank: 0 })
        }

        arr.sort((a, b) => b.liferCount - a.liferCount)
        arr.forEach((h, i) => h.rank = i + 1)

        setHotspots(arr.slice(0, 20))
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
  }, [mode, hotspotWeek, speciesLoaded, speciesData, gridData, seenSpecies, selectedRegion])

  // Calculate window of opportunity using per-species endpoint (parallel)
  useEffect(() => {
    if (mode !== 'window' || !selectedSpeciesForWindow || !speciesLoaded || !gridData) {
      setWeekOpportunities([])
      return
    }

    const controller = new AbortController()

    const calc = async () => {
      setWindowLoading(true)
      try {
        const speciesCode = selectedSpeciesForWindow.speciesCode

        // Fetch all 52 weeks from a single species-weeks file (instead of 52 API calls)
        const { fetchSpeciesWeeks } = await import('../lib/dataCache')
        const speciesWeekData = await fetchSpeciesWeeks(speciesCode)
        if (controller.signal.aborted) return

        const weeklyResults = Array.from({ length: 52 }, (_, i) => i + 1).map(week => {
          const weekEntries = speciesWeekData[String(week)] || []
          const records = weekEntries.map(([cellId]) => ({ cell_id: cellId, probability: 1.0 }))
          return { week, records }
        })

        const cellCoords = new Map<number, [number, number]>()
        if (gridData.features) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature
          gridData.features.forEach((f: any) => {
            const id = f.properties?.cell_id
            if (id != null && f.properties.center_lng != null && f.properties.center_lat != null) {
              cellCoords.set(id, [f.properties.center_lng, f.properties.center_lat])
            } else if (id != null && f.geometry?.coordinates?.[0]?.[0]) {
              const coords = f.geometry.coordinates[0][0]
              cellCoords.set(id, [coords[0], coords[1]])
            }
          })
        }

        const regionBbox = selectedRegion ? REGION_BBOX[selectedRegion] : null

        const opps: WeekOpportunity[] = []
        for (const { week, records } of weeklyResults) {
          const filtered = regionBbox
            ? records.filter(r => {
                const coords = cellCoords.get(r.cell_id)
                if (!coords) return false
                const [west, south, east, north] = regionBbox
                return coords[0] >= west && coords[0] <= east && coords[1] >= south && coords[1] <= north
              })
            : records
          if (filtered.length === 0) continue
          const avgProb = filtered.reduce((sum, r) => sum + r.probability, 0) / filtered.length
          const topLocs = filtered
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5)
            .map(r => ({
              cellId: r.cell_id,
              coordinates: cellCoords.get(r.cell_id) || [0, 0] as [number, number],
              probability: r.probability
            }))
          opps.push({ week, avgProbability: avgProb, topLocations: topLocs })
        }

        opps.sort((a, b) => b.avgProbability - a.avgProbability)
        setWeekOpportunities(opps.slice(0, 10))
        console.log(`Window: found ${opps.length} weeks for ${selectedSpeciesForWindow.comName}`)
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Window: error', error)
          setWeekOpportunities([])
        }
      } finally {
        setWindowLoading(false)
      }
    }
    calc()

    return () => controller.abort()
  }, [mode, selectedSpeciesForWindow, speciesLoaded, gridData, selectedRegion])

  // Compare two locations
  useEffect(() => {
    if (mode !== 'compare' || !locationA || !locationB || !speciesLoaded) {
      setOverlapLifers([])
      setUniqueToA([])
      setUniqueToB([])
      return
    }

    const compareLocations = async () => {
      setCompareLoading(true)
      try {
        // Build species lookup map
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        // Determine weeks to load
        const weeksToLoad: number[] = []
        for (let w = compareStartWeek; w <= compareEndWeek; w++) {
          weeksToLoad.push(w)
        }

        // Accumulate probabilities for both locations using per-cell endpoint
        const speciesAtA = new Map<number, { total: number; count: number }>()
        const speciesAtB = new Map<number, { total: number; count: number }>()

        // Load week cells and extract data for both locations
        const { fetchWeekCells } = await import('../lib/dataCache')
        const cellFetches = weeksToLoad.flatMap(week => [
          fetchWeekCells(week)
            .then(weekCells => {
              const cellData = weekCells.get(locationA!.cellId)
              const speciesIds = cellData?.speciesIds || []
              return { week, location: 'A' as const, data: speciesIds.map(sid => ({ species_id: sid, probability: 1.0 })) }
            })
            .catch(() => ({ week, location: 'A' as const, data: [] as { species_id: number; probability: number }[] })),
          fetchWeekCells(week)
            .then(weekCells => {
              const cellData = weekCells.get(locationB!.cellId)
              const speciesIds = cellData?.speciesIds || []
              return { week, location: 'B' as const, data: speciesIds.map(sid => ({ species_id: sid, probability: 1.0 })) }
            })
            .catch(() => ({ week, location: 'B' as const, data: [] as { species_id: number; probability: number }[] })),
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

        // Build lifer lists
        const overlapList: TripLifer[] = []
        const uniqueAList: TripLifer[] = []
        const uniqueBList: TripLifer[] = []

        // Find overlap and unique to A
        speciesAtA.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          }

          if (speciesAtB.has(speciesId)) {
            overlapList.push(lifer)
          } else {
            uniqueAList.push(lifer)
          }
        })

        // Find unique to B
        speciesAtB.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species || seenSpecies.has(species.speciesCode)) return
          if (speciesAtA.has(speciesId)) return // Already counted in overlap

          const lifer: TripLifer = {
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          }

          uniqueBList.push(lifer)
        })

        // Sort all lists by probability
        overlapList.sort((a, b) => b.probability - a.probability)
        uniqueAList.sort((a, b) => b.probability - a.probability)
        uniqueBList.sort((a, b) => b.probability - a.probability)

        setOverlapLifers(overlapList)
        setUniqueToA(uniqueAList)
        setUniqueToB(uniqueBList)

        console.log(`Compare: Location A has ${speciesAtA.size} species, Location B has ${speciesAtB.size} species`)
        console.log(`Compare: ${overlapList.length} overlap, ${uniqueAList.length} unique to A, ${uniqueBList.length} unique to B`)
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
  }, [mode, locationA, locationB, compareStartWeek, compareEndWeek, speciesLoaded, speciesData, seenSpecies])

  // Load location data
  useEffect(() => {
    if (mode !== 'location' || !selectedLocation || !speciesLoaded) {
      setLifers([])
      return
    }

    const loadTripData = async () => {
      setLoading(true)
      try {
        // Build species lookup map
        const speciesById = new Map<number, Species>()
        speciesData.forEach(sp => speciesById.set(sp.species_id, sp))

        // Determine weeks to load
        const weeksToLoad: number[] = []
        for (let w = startWeek; w <= endWeek; w++) {
          weeksToLoad.push(w)
        }

        // Accumulate probabilities for species in the selected cell using per-cell endpoint
        const speciesProbabilities = new Map<number, { total: number; count: number }>()

        // Load week cells and extract data for selected location
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

        // Build ranked lifer list (unseen species only)
        const liferList: TripLifer[] = []
        speciesProbabilities.forEach((prob, speciesId) => {
          const species = speciesById.get(speciesId)
          if (!species) return
          if (seenSpecies.has(species.speciesCode)) return

          liferList.push({
            species_id: speciesId,
            speciesCode: species.speciesCode,
            comName: species.comName,
            sciName: species.sciName,
            familyComName: species.familyComName,
            probability: prob.total / prob.count,
            difficultyLabel: species.difficultyLabel
          })
        })

        // Sort by occurrence probability (highest first)
        liferList.sort((a, b) => b.probability - a.probability)
        setLifers(liferList)
        console.log(`Trip Plan: found ${liferList.length} lifers at cell ${selectedLocation.cellId} for weeks ${startWeek}-${endWeek}`)
      } catch (error) {
        console.error('Trip Plan: error loading data', error)
      } finally {
        setLoading(false)
      }
    }

    loadTripData()
  }, [selectedLocation, startWeek, endWeek, speciesLoaded, speciesData, seenSpecies])

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

  const sortedHotspots = useMemo(() => {
    const sorted = [...hotspots]
    switch (hotspotSortMode) {
      case 'cellId':
        sorted.sort((a, b) => a.cellId - b.cellId)
        break
      case 'liferCount':
      default:
        sorted.sort((a, b) => b.liferCount - a.liferCount)
        break
    }
    return sorted
  }, [hotspots, hotspotSortMode])

  const formatProbability = (prob: number): string => {
    return (prob * 100).toFixed(1) + '%'
  }

  const getProbabilityColor = (prob: number): string => {
    if (prob >= 0.5) return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
    if (prob >= 0.2) return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
    if (prob >= 0.05) return 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30'
    return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
  }

  // Clear/Reset all trip planning selections
  const handleClearAll = () => {
    // Clear location mode
    if (onLocationSelect) {
      onLocationSelect(null)
    }
    setStartWeek(currentWeek)
    setEndWeek(Math.min(currentWeek + 2, 52))
    setLifers([])
    setLoading(false)

    // Clear hotspots mode
    setHotspotWeek(currentWeek)
    setHotspots([])
    setHotspotsLoading(false)

    // Clear window mode
    setSelectedSpeciesForWindow(null)
    setSpeciesSearchTerm('')
    setShowSpeciesSuggestions(false)
    setWeekOpportunities([])
    setWindowLoading(false)

    // Clear compare mode
    setLocationA(null)
    setLocationB(null)
    setCompareStartWeek(currentWeek)
    setCompareEndWeek(Math.min(currentWeek + 2, 52))
    setOverlapLifers([])
    setUniqueToA([])
    setUniqueToB([])
    setCompareLoading(false)
    setNextCompareSlot('A')
    lastProcessedLocationRef.current = null

    console.log('Trip Plan: cleared all selections')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="space-y-2 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">Trip Planning</h3>
          <button
            onClick={handleClearAll}
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

        {/* Mode Toggle — segmented control matching Explore tab */}
        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 grid grid-cols-4">
          {(['location', 'hotspots', 'window', 'compare'] as const).map((m) => (
            <button
              key={m}
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

      {/* Hotspots Mode: Week Picker */}
      {mode === 'hotspots' && (
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
      )}

      {/* Window Mode: Species Search */}
      {mode === 'window' && (
        <div className="mt-3">
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">Select Target Species</label>
          <div className="relative">
            <input
              type="text"
              placeholder="Search for a species..."
              value={speciesSearchTerm}
              onChange={(e) => {
                setSpeciesSearchTerm(e.target.value)
                setShowSpeciesSuggestions(true)
              }}
              onFocus={() => setShowSpeciesSuggestions(true)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2C3E7B] focus:border-transparent"
              data-testid="species-search-input"
            />
            {showSpeciesSuggestions && speciesSearchTerm.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {speciesData
                  .filter(sp =>
                    sp.comName.toLowerCase().includes(speciesSearchTerm.toLowerCase()) ||
                    sp.sciName.toLowerCase().includes(speciesSearchTerm.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(sp => (
                    <button
                      key={sp.speciesCode}
                      onClick={() => {
                        setSelectedSpeciesForWindow(sp)
                        setSpeciesSearchTerm(sp.comName)
                        setShowSpeciesSuggestions(false)
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200">{sp.comName}</div>
                      <div className="text-xs italic text-gray-500 dark:text-gray-400">{sp.sciName}</div>
                    </button>
                  ))}
              </div>
            )}
          </div>
          {selectedSpeciesForWindow && (
            <div className="mt-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-300">{selectedSpeciesForWindow.comName}</div>
              <div className="text-xs italic text-blue-600 dark:text-blue-400">{selectedSpeciesForWindow.sciName}</div>
            </div>
          )}
        </div>
      )}

      {/* Location Mode: Location Display and Date Range */}
      {mode === 'location' && (
        <div className="mt-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
            Selected Location
          </label>
          {selectedLocation ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                {selectedLocation.coordinates[1].toFixed(2)}°N, {Math.abs(selectedLocation.coordinates[0]).toFixed(2)}°W
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                Click on the map to select a location
              </p>
            </div>
          )}
        </div>

        {/* Date Range (Week Range) Picker */}
        <div>
          <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
            Date Range
          </label>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Start Week</label>
              <input
                type="range"
                min="1"
                max="52"
                value={startWeek}
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
                type="range"
                min="1"
                max="52"
                value={endWeek}
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
      )}

      {/* Compare Mode: Two Locations and Date Range */}
      {mode === 'compare' && (
        <div className="mt-3 space-y-3">
          {/* Location A */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
              Location A
            </label>
            {locationA ? (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    {locationA.coordinates[1].toFixed(2)}°N, {Math.abs(locationA.coordinates[0]).toFixed(2)}°W
                  </div>
                  <button
                    onClick={() => setLocationA(null)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
                    data-testid="clear-location-a-btn"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  Click on the map to select Location A
                </p>
              </div>
            )}
          </div>

          {/* Location B */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
              Location B
            </label>
            {locationB ? (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-green-800 dark:text-green-300">
                    {locationB.coordinates[1].toFixed(2)}°N, {Math.abs(locationB.coordinates[0]).toFixed(2)}°W
                  </div>
                  <button
                    onClick={() => setLocationB(null)}
                    className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-xs font-medium"
                    data-testid="clear-location-b-btn"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                  Click on the map to select Location B
                </p>
              </div>
            )}
          </div>

          {/* Date Range (Week Range) Picker */}
          <div>
            <label className="block text-sm font-medium text-[#2C3E50] dark:text-gray-200 mb-1">
              Date Range
            </label>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5">Start Week</label>
                <input
                  type="range"
                  min="1"
                  max="52"
                  value={compareStartWeek}
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
                  type="range"
                  min="1"
                  max="52"
                  value={compareEndWeek}
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
      )}

      {/* Results Section */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {mode === 'hotspots' ? (
          hotspotsLoading ? (
            <ListSkeleton count={4} />
          ) : hotspots.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium">No hotspots found.</span> You may have already seen all species for this week.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100">
                  Top Lifer Hotspots ({hotspots.length})
                  {selectedRegion && (
                    <span className="ml-1 text-[10px] font-normal text-blue-600 dark:text-blue-400">
                      ({selectedRegion.replace('us_', 'US ').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())})
                    </span>
                  )}
                </h4>
                <select
                  value={hotspotSortMode}
                  onChange={(e) => setHotspotSortMode(e.target.value as 'liferCount' | 'cellId')}
                  className="text-[11px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none"
                  data-testid="hotspot-sort-select"
                >
                  <option value="liferCount">Lifer count</option>
                  <option value="cellId">Cell ID</option>
                </select>
              </div>
              <div className="space-y-1" data-testid="hotspot-list">
                {sortedHotspots.map((hotspot) => (
                  <button
                    key={hotspot.cellId}
                    onClick={() => {
                      if (onLocationSelect) {
                        onLocationSelect({
                          cellId: hotspot.cellId,
                          coordinates: hotspot.coordinates
                        })
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/30 hover:border-orange-200 dark:hover:border-orange-700 transition-colors text-left"
                    data-testid={`hotspot-${hotspot.cellId}`}
                  >
                    <div className="text-xs text-gray-400 dark:text-gray-500 w-6 text-right font-mono">
                      #{hotspot.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200">
                        {hotspot.coordinates[1].toFixed(2)}°N, {Math.abs(hotspot.coordinates[0]).toFixed(2)}°W
                      </div>
                    </div>
                    <div className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                      {hotspot.liferCount} lifers
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        ) : mode === 'location' ? (
          !selectedLocation ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-medium">Select a location</span> on the map to see lifers you could find there.
              </p>
            </div>
          ) : loading ? (
            <ListSkeleton count={4} />
          ) : lifers.length === 0 ? (
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
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
                  className="text-[11px] border border-gray-200 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none"
                  data-testid="lifer-sort-select"
                >
                  <option value="probability">Probability</option>
                  <option value="name">Name (A-Z)</option>
                  <option value="family">Family</option>
                </select>
              </div>
              <div className="space-y-1">
                {sortedLifers.map((lifer, index) => (
                  <div
                    key={lifer.speciesCode}
                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <div className="text-xs text-gray-400 dark:text-gray-500 w-6 text-right font-mono">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                        {lifer.comName}
                      </div>
                      <div className="text-xs italic text-gray-500 dark:text-gray-400 truncate">
                        {lifer.sciName}
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getProbabilityColor(lifer.probability)}`}>
                      {formatProbability(lifer.probability)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : mode === 'window' ? (
          !selectedSpeciesForWindow ? (
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <p className="text-sm text-blue-700 dark:text-blue-400">
                <span className="font-medium">Search for a species</span> above to see its window of opportunity.
              </p>
            </div>
          ) : windowLoading ? (
            <ListSkeleton count={4} />
          ) : weekOpportunities.length === 0 ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                <span className="font-medium">No data found</span> for {selectedSpeciesForWindow.comName}. This species may not be recorded in this region.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3">
                <h4 className="text-sm font-semibold text-[#2C3E50] dark:text-gray-100 mb-1">
                  Window of Opportunity
                </h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Best weeks to find <span className="font-medium text-[#2C3E7B] dark:text-blue-400">{selectedSpeciesForWindow.comName}</span>
                </p>
              </div>
              <div className="space-y-2" data-testid="window-opportunity-list">
                {weekOpportunities.map((opp, index) => (
                  <div
                    key={opp.week}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-[#2C3E7B] dark:hover:border-blue-500 transition-colors"
                  >
                    {/* Week Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-gray-400 dark:text-gray-500 w-5 text-right font-mono">
                          #{index + 1}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[#2C3E50] dark:text-gray-200">
                            Week {opp.week}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            ~{getWeekLabel(opp.week)}
                          </div>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${getProbabilityColor(opp.avgProbability)}`}>
                        {formatProbability(opp.avgProbability)} avg
                      </div>
                    </div>

                    {/* Top Locations */}
                    <div className="mt-2 space-y-1">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Best locations:
                      </div>
                      {opp.topLocations.slice(0, 3).map((loc, locIndex) => (
                        <button
                          key={loc.cellId}
                          onClick={() => {
                            if (onLocationSelect) {
                              onLocationSelect({
                                cellId: loc.cellId,
                                coordinates: loc.coordinates
                              })
                            }
                          }}
                          className="w-full flex items-center justify-between px-2 py-1.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-left transition-colors"
                          data-testid={`window-location-${opp.week}-${locIndex}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {loc.coordinates[1].toFixed(2)}°N, {Math.abs(loc.coordinates[0]).toFixed(2)}°W
                            </div>
                          </div>
                          <div className={`px-1.5 py-0.5 rounded text-xs font-medium ${getProbabilityColor(loc.probability)}`}>
                            {formatProbability(loc.probability)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : mode === 'compare' ? (
          !locationA || !locationB ? (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4 text-center">
              <p className="text-sm text-purple-700 dark:text-purple-400">
                <span className="font-medium">Select two locations</span> on the map to compare their lifer availability.
              </p>
            </div>
          ) : compareLoading ? (
            <ListSkeleton count={4} />
          ) : (
            <div className="space-y-3" data-testid="compare-results">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Location A</div>
                  <div className="text-lg font-bold text-blue-800 dark:text-blue-300">{uniqueToA.length + overlapLifers.length}</div>
                  <div className="text-xs text-blue-600 dark:text-blue-400">total lifers</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Overlap</div>
                  <div className="text-lg font-bold text-purple-800 dark:text-purple-300">{overlapLifers.length}</div>
                  <div className="text-xs text-purple-600 dark:text-purple-400">at both</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Location B</div>
                  <div className="text-lg font-bold text-green-800 dark:text-green-300">{uniqueToB.length + overlapLifers.length}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">total lifers</div>
                </div>
              </div>

              {/* Overlap Species */}
              {overlapLifers.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300 mb-2" data-testid="overlap-heading">
                    🔗 Overlap ({overlapLifers.length})
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Available at both locations</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="overlap-list">
                    {overlapLifers.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800 rounded text-xs"
                      >
                        <div className="text-gray-400 dark:text-gray-500 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-purple-900 dark:text-purple-200">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to Location A */}
              {uniqueToA.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2" data-testid="unique-a-heading">
                    📍 Unique to Location A ({uniqueToA.length})
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Only at Location A</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="unique-a-list">
                    {uniqueToA.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 rounded text-xs"
                      >
                        <div className="text-gray-400 dark:text-gray-500 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-blue-900 dark:text-blue-200">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unique to Location B */}
              {uniqueToB.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2" data-testid="unique-b-heading">
                    📍 Unique to Location B ({uniqueToB.length})
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Only at Location B</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="unique-b-list">
                    {uniqueToB.slice(0, 20).map((lifer, index) => (
                      <div
                        key={lifer.speciesCode}
                        className="flex items-center gap-2 px-2 py-1.5 bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-800 rounded text-xs"
                      >
                        <div className="text-gray-400 dark:text-gray-500 w-5 text-right font-mono">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0 truncate font-medium text-green-900 dark:text-green-200">
                          {lifer.comName}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No lifers */}
              {overlapLifers.length === 0 && uniqueToA.length === 0 && uniqueToB.length === 0 && (
                <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-700 dark:text-green-400">
                    <span className="font-medium">No lifers found!</span> You have already seen all species at both locations during this period.
                  </p>
                </div>
              )}
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
