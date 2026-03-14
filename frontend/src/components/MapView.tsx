import { memo, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// Safe min/max for large arrays (avoids call stack overflow with spread on 100K+ elements)
function safeMin(arr: number[]): number {
  if (arr.length === 0) return 0
  let min = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] < min) min = arr[i]
  return min
}
function safeMax(arr: number[]): number {
  if (arr.length === 0) return 0
  let max = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] > max) max = arr[i]
  return max
}



interface MapViewProps {
  darkMode?: boolean
  currentWeek?: number
  viewMode?: string
  goalBirdsOnlyFilter?: boolean
  onLocationSelect?: (location: { cellId: number; coordinates: [number, number] }) => void
  goalSpeciesCodes?: Set<string>
  seenSpecies?: Set<string>
  selectedSpecies?: string | null
  selectedRegion?: string | null
  heatmapOpacity?: number
  selectedLocation?: { cellId: number; coordinates: [number, number] } | null
  liferCountRange?: [number, number]
  onDataRangeChange?: (range: [number, number]) => void
}

interface OccurrenceRecord {
  cell_id: number
  species_id: number
  probability: number
}

// Summary data: [cell_id, species_count, max_prob_uint8]
type WeeklySummary = [number, number, number][]

interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  isRestrictedRange?: boolean
}

interface GoalBirdInCell {
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  isSeen: boolean
  conservStatus?: string
  difficultyLabel?: string
  isRestrictedRange?: boolean
}

interface GoalBirdsPopup {
  cellId: number
  coordinates: [number, number]
  birds: GoalBirdInCell[]
}

interface LiferInCell {
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  isRestrictedRange?: boolean
}

/**
 * Viridis perceptual color gradient — designed for uniform readability.
 * Dark purple (low) → teal → green → yellow (high).
 * Perceptually uniform: equal steps in data produce equal visual contrast.
 * Empty cells (no data) are fully transparent.
 */
function buildHeatExpression(): maplibregl.ExpressionSpecification {
  // Extended viridis: purple → teal → green → yellow → orange → red
  // Stretches the classic viridis into warm tones for a wider perceptual range.
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'value'], -1],
    -1,    'rgba(0, 0, 0, 0)',             // No data: fully transparent
    0.001, '#440154',                       // Lowest: deep purple
    0.1,   '#482878',                       // Very low: purple
    0.2,   '#3E4A89',                       // Low: blue-purple
    0.3,   '#31688E',                       // Low-mid: slate blue
    0.4,   '#26838F',                       // Mid-low: teal
    0.5,   '#1F9D8A',                       // Mid: green-teal
    0.6,   '#6CCE59',                       // Mid-high: lime green
    0.7,   '#B5DE2B',                       // High: yellow-green
    0.8,   '#FDE725',                       // Very high: vivid yellow
    0.9,   '#FCA50A',                       // Near-max: bright orange
    1.0,   '#E23028',                       // Highest: red
  ] as maplibregl.ExpressionSpecification
}

// MapLibre expression for amber/gold intensity using feature-state 'value' (0-1)
function buildAmberExpression(): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'value'], -1],
    -1, 'rgba(200, 200, 200, 0.1)',       // Default: no data
    0, 'rgba(212, 160, 23, 0.1)',          // Low intensity
    1, 'rgba(212, 160, 23, 0.85)',         // High intensity
  ] as maplibregl.ExpressionSpecification
}

interface LifersPopup {
  cellId: number
  coordinates: [number, number]
  lifers: LiferInCell[]
}

// Module-level cache for species metadata (to avoid re-fetching)
let speciesMetaCache: SpeciesMeta[] | null = null
let speciesMetaPromise: Promise<SpeciesMeta[]> | null = null

// Module-level cache for grid GeoJSON (persisted in IndexedDB)
let gridGeoJsonCache: GeoJSON.FeatureCollection | null = null

const GRID_CACHE_DB = 'find-a-lifer-grid-cache'
const GRID_CACHE_STORE = 'grid'
const GRID_CACHE_KEY = 'gridGeoJson'

async function loadGridFromCache(): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(GRID_CACHE_DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(GRID_CACHE_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction(GRID_CACHE_STORE, 'readonly')
    const store = tx.objectStore(GRID_CACHE_STORE)
    const data = await new Promise<GeoJSON.FeatureCollection | undefined>((resolve, reject) => {
      const req = store.get(GRID_CACHE_KEY)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return data || null
  } catch {
    return null
  }
}

async function saveGridToCache(data: GeoJSON.FeatureCollection): Promise<void> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(GRID_CACHE_DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(GRID_CACHE_STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const tx = db.transaction(GRID_CACHE_STORE, 'readwrite')
    const store = tx.objectStore(GRID_CACHE_STORE)
    store.put(data, GRID_CACHE_KEY)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.warn('Failed to cache grid data:', err)
  }
}

// Session-level cache for per-cell click data (week -> cellId -> records)
const cellDataCache = new Map<string, { speciesCode: string; comName: string; probability: number; species_id: number }[]>()

async function loadSpeciesMetaCache(): Promise<SpeciesMeta[]> {
  if (speciesMetaCache) return speciesMetaCache
  if (speciesMetaPromise) return speciesMetaPromise
  speciesMetaPromise = fetch('/api/species')
    .then((response) => {
      if (!response.ok) throw new Error('Failed to fetch species metadata')
      return response.json() as Promise<SpeciesMeta[]>
    })
    .then((data) => {
      speciesMetaCache = data
      console.log(`MapView: cached ${data.length} species metadata entries`)
      return data
    })
    .catch((err) => {
      speciesMetaPromise = null // Allow retry on failure
      throw err
    })
  return speciesMetaPromise
}

// Helper function to generate legend tick labels
function getLegendTicks(min: number, max: number, isPercentage: boolean, numTicks: number = 5): string[] {
  if (max === 0) return Array(numTicks).fill('0')

  const ticks: string[] = []
  for (let i = 0; i < numTicks; i++) {
    const value = min + (max - min) * (i / (numTicks - 1))
    if (isPercentage) {
      ticks.push(`${Math.round(value * 100)}%`)
    } else {
      ticks.push(Math.round(value).toString())
    }
  }
  return ticks
}

// Region bounds for zoom presets
const REGION_BOUNDS: Record<string, { center: [number, number]; zoom: number }> = {
  us_northeast: { center: [-73.5, 42], zoom: 5.5 },
  us_southeast: { center: [-83.5, 31], zoom: 5.5 },
  us_west: { center: [-114.5, 40.5], zoom: 4.5 },
  alaska: { center: [-150, 64], zoom: 4 },
  hawaii: { center: [-157, 20.5], zoom: 6.5 }
}

export default memo(function MapView({
  darkMode = false,
  currentWeek = 26,
  viewMode = 'density',
  goalBirdsOnlyFilter = false,
  onLocationSelect,
  goalSpeciesCodes = new Set(),
  seenSpecies = new Set(),
  selectedSpecies = null,
  selectedRegion = null,
  heatmapOpacity = 0.8,
  selectedLocation = null,
  liferCountRange = [0, 9999],
  onDataRangeChange
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>([])
  const [weeklyData, setWeeklyData] = useState<OccurrenceRecord[]>([])
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)
  const [gridReady, setGridReady] = useState(false)
  // Ref to track the set of species_ids that are unseen goal species
  const goalSpeciesIdSetRef = useRef<Set<number>>(new Set())
  // Counter incremented each time the goal species ID set is rebuilt, to trigger overlay re-render
  const [goalSpeciesIdSetVersion, setGoalSpeciesIdSetVersion] = useState(0)
  // Goal Birds click-to-inspect popup
  const [goalBirdsPopup, setGoalBirdsPopup] = useState<GoalBirdsPopup | null>(null)
  // Lifer density click-to-inspect popup
  const [lifersPopup, setLifersPopup] = useState<LifersPopup | null>(null)
  // Species metadata for the selected species (used in legend)
  const [selectedSpeciesMeta, setSelectedSpeciesMeta] = useState<SpeciesMeta | null>(null)
  // Legend data range values (for numeric labels)
  const [legendMin, setLegendMin] = useState(0)
  const [legendMax, setLegendMax] = useState(0)
  // Track which cells have feature-state set (for efficient clearing)
  const featureStateCellIds = useRef<Set<number>>(new Set())
  // Track last reported data range to avoid redundant callbacks
  const lastReportedRangeRef = useRef<[number, number]>([0, 0])

  // Refs for latest values accessible inside map click handler
  const viewModeRef = useRef(viewMode)
  const weeklyDataRef = useRef(weeklyData)
  const goalSpeciesCodesRef = useRef(goalSpeciesCodes)
  const seenSpeciesRef = useRef(seenSpecies)
  const selectedSpeciesRef = useRef(selectedSpecies)
  const onDataRangeChangeRef = useRef(onDataRangeChange)

  // Keep refs updated with latest values for use in map event handlers
  useEffect(() => { viewModeRef.current = viewMode }, [viewMode])
  useEffect(() => { weeklyDataRef.current = weeklyData }, [weeklyData])
  useEffect(() => { goalSpeciesCodesRef.current = goalSpeciesCodes }, [goalSpeciesCodes])
  useEffect(() => { seenSpeciesRef.current = seenSpecies }, [seenSpecies])
  useEffect(() => { selectedSpeciesRef.current = selectedSpecies }, [selectedSpecies])
  useEffect(() => { onDataRangeChangeRef.current = onDataRangeChange }, [onDataRangeChange])

  // Close popup when switching away from goal-birds mode
  useEffect(() => {
    if (viewMode !== 'goal-birds') {
      setGoalBirdsPopup(null)
    }
  }, [viewMode])

  // Close lifer popup when switching away from density mode
  useEffect(() => {
    if (viewMode !== 'density') {
      setLifersPopup(null)
    }
  }, [viewMode])

  // Load species metadata on mount (needed for click-to-inspect popup)
  useEffect(() => {
    loadSpeciesMetaCache().catch((err) => {
      console.error('MapView: error fetching species metadata', err)
    })
  }, [])

  // Zoom to selected region
  useEffect(() => {
    if (!map.current) return

    if (selectedRegion && REGION_BOUNDS[selectedRegion]) {
      const { center, zoom } = REGION_BOUNDS[selectedRegion]
      map.current.flyTo({
        center,
        zoom,
        duration: 1500 // 1.5 second animation
      })
      console.log(`MapView: zooming to ${selectedRegion}`)
    } else if (!selectedRegion) {
      // Return to continental US view when no region selected
      map.current.flyTo({
        center: [-98.5, 39.8],
        zoom: 3.5,
        duration: 1500
      })
      console.log('MapView: returning to continental US view')
    }
  }, [selectedRegion])

  // Load species metadata and build the goal species ID set
  // whenever goalSpeciesCodes or seenSpecies change
  useEffect(() => {
    const buildGoalSpeciesIdSet = async () => {
      // Load species metadata if not cached (needed for both goal species and density calculation)
      if (!speciesMetaCache && (goalSpeciesCodes.size > 0 || seenSpecies.size > 0)) {
        try {
          await loadSpeciesMetaCache()
        } catch (err) {
          console.error('MapView: error fetching species metadata', err)
          goalSpeciesIdSetRef.current = new Set()
          setGoalSpeciesIdSetVersion(v => v + 1)
          return
        }
      }

      // Skip if no goal species
      if (goalSpeciesCodes.size === 0) {
        goalSpeciesIdSetRef.current = new Set()
        setGoalSpeciesIdSetVersion(v => v + 1)
        return
      }

      // Build set of species_ids that are goal birds AND not yet seen
      const idSet = new Set<number>()
      speciesMetaCache?.forEach((s) => {
        if (goalSpeciesCodes.has(s.speciesCode) && !seenSpecies.has(s.speciesCode)) {
          idSet.add(s.species_id)
        }
      })
      goalSpeciesIdSetRef.current = idSet
      setGoalSpeciesIdSetVersion(v => v + 1)
      console.log(`MapView: built goal species ID set with ${idSet.size} unseen goal species`)
    }

    buildGoalSpeciesIdSet()
  }, [goalSpeciesCodes, seenSpecies])

  // Load weekly summary data when currentWeek changes
  // Summary is tiny (~80KB gzipped) and serves density + probability modes
  useEffect(() => {
    const abortController = new AbortController()

    const loadWeekData = async () => {
      setIsLoadingWeek(true)
      try {
        const summaryResponse = await fetch(`/api/weeks/${currentWeek}/summary`, {
          signal: abortController.signal,
        })
        if (abortController.signal.aborted) return
        if (!summaryResponse.ok) {
          console.error(`Failed to load week ${currentWeek} summary:`, summaryResponse.statusText)
          return
        }
        const summary: WeeklySummary = await summaryResponse.json()
        if (abortController.signal.aborted) return
        setWeeklySummary(summary)
        setWeeklyData([]) // Clear full data — loaded on demand
        console.log(`Loaded week ${currentWeek} summary: ${summary.length} cells`)
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(`Error loading week ${currentWeek} data:`, error)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingWeek(false)
        }
      }
    }

    loadWeekData()
    return () => { abortController.abort() }
  }, [currentWeek])

  // Zoom to selected location when it changes (from Trip Plan hotspots)
  useEffect(() => {
    if (!map.current || !selectedLocation) return

    map.current.flyTo({
      center: selectedLocation.coordinates,
      zoom: 7,
      duration: 1500
    })

    console.log(`Map: zooming to selected location Cell #${selectedLocation.cellId}`)
  }, [selectedLocation])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return

    // Use different tile styles for light/dark mode
    const style: maplibregl.StyleSpecification = darkMode
      ? {
          version: 8,
          name: 'Dark Mode',
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: 'carto-dark-layer',
              type: 'raster',
              source: 'carto-dark',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        }
      : {
          version: 8,
          name: 'Light Mode',
          sources: {
            'carto-voyager': {
              type: 'raster',
              tiles: [
                'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
                'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
              ],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: 'carto-voyager-layer',
              type: 'raster',
              source: 'carto-voyager',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        }

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style,
      center: [-98.5, 39.8], // Center of continental US
      zoom: 3.5,
      minZoom: 2,
      maxZoom: 15,
    })

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    // Add scale bar
    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200 }),
      'bottom-right'
    )

    // Load grid data and add to map
    map.current.on('load', async () => {
      if (!map.current) return

      try {
        // Load grid GeoJSON from IndexedDB cache, or fetch from API
        let gridData = gridGeoJsonCache
        if (!gridData) {
          gridData = await loadGridFromCache()
          if (gridData) {
            console.log(`Grid GeoJSON loaded from IndexedDB cache: ${gridData.features.length} features`)
          }
        }
        if (!gridData) {
          const response = await fetch('/api/grid')
          if (!response.ok) {
            console.error('Failed to load grid data:', response.statusText)
            return
          }
          const fetched = await response.json() as GeoJSON.FeatureCollection
          // Validate response is GeoJSON
          if (fetched.type !== 'FeatureCollection' || !Array.isArray(fetched.features)) {
            console.error('Grid data is not valid GeoJSON:', Object.keys(fetched))
            return
          }
          gridData = fetched
          // Cache in IndexedDB for future page loads
          saveGridToCache(gridData)
          console.log(`Grid GeoJSON fetched from API: ${gridData.features.length} features`)
        }
        gridGeoJsonCache = gridData

        // Add grid data as a source
        map.current.addSource('grid', {
          type: 'geojson',
          data: gridData,
          promoteId: 'cell_id',
        })

        // Add grid cell fill layer (semi-transparent)
        map.current.addLayer({
          id: 'grid-fill',
          type: 'fill',
          source: 'grid',
          paint: {
            'fill-color': '#088',
            'fill-opacity': 0.1,
          },
        })

        // Add grid cell border layer — subtle white outlines that define hex boundaries
        map.current.addLayer({
          id: 'grid-border',
          type: 'line',
          source: 'grid',
          paint: {
            'line-color': 'rgba(255, 255, 255, 0.15)',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              6, 0.3,
              8, 0.5,
              10, 0.8,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              6, 0.15,
              8, 0.3,
            ],
          },
        })

        // Add hover effect
        map.current.on('mouseenter', 'grid-fill', () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = 'pointer'
          }
        })

        map.current.on('mouseleave', 'grid-fill', () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = ''
          }
        })

        // Add click handler for trip planning location selection and Goal Birds inspect
        map.current.on('click', 'grid-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0]
            const cellId = feature.properties?.cell_id
            if (!cellId) return

            const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]

            if (viewModeRef.current === 'goal-birds') {
              // Goal Birds mode: load cell data from API
              const currentGoalCodes = goalSpeciesCodesRef.current
              const currentSeenSpecies = seenSpeciesRef.current

              // Use currentWeek from closure — get it from the slider's current value
              const weekEl = document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')
              const week = weekEl ? parseInt(weekEl.value) : 26

              const cacheKey = `${week}-${cellId}`
              const processGoalBirds = (records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                const goalBirds: GoalBirdInCell[] = []
                const idToMeta = new Map<number, SpeciesMeta>()
                if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

                records.forEach((record) => {
                  if (!currentGoalCodes.has(record.speciesCode)) return
                  const meta = idToMeta.get(record.species_id)
                  goalBirds.push({
                    speciesCode: record.speciesCode,
                    comName: record.comName,
                    sciName: meta?.sciName || '',
                    probability: record.probability,
                    isSeen: currentSeenSpecies.has(record.speciesCode),
                    conservStatus: meta?.conservStatus,
                    difficultyLabel: meta?.difficultyLabel,
                    isRestrictedRange: meta?.isRestrictedRange
                  })
                })

                goalBirds.sort((a, b) => b.probability - a.probability)
                setGoalBirdsPopup({ cellId, coordinates: coords, birds: goalBirds })
                console.log(`Goal Birds popup: cell ${cellId} has ${goalBirds.length} goal birds`)
              }

              const cached = cellDataCache.get(cacheKey)
              if (cached) {
                processGoalBirds(cached)
              } else {
                fetch(`/api/weeks/${week}/cells/${cellId}`)
                  .then(r => r.json())
                  .then((records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                    cellDataCache.set(cacheKey, records)
                    processGoalBirds(records)
                  })
                  .catch(err => console.error('Goal Birds popup: error loading cell data', err))
              }
            } else if (viewModeRef.current === 'density') {
              // Density mode: load cell data from API
              const currentSeenSpecies = seenSpeciesRef.current

              const weekEl = document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')
              const week = weekEl ? parseInt(weekEl.value) : 26

              const densityCacheKey = `${week}-${cellId}`
              const processLifers = (records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                const idToMeta = new Map<number, SpeciesMeta>()
                if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

                const lifers: LiferInCell[] = []
                records.forEach((record) => {
                  if (currentSeenSpecies.has(record.speciesCode)) return
                  const meta = idToMeta.get(record.species_id)
                  lifers.push({
                    speciesCode: record.speciesCode,
                    comName: record.comName,
                    sciName: meta?.sciName || '',
                    probability: record.probability,
                    familyComName: meta?.familyComName,
                    taxonOrder: meta?.taxonOrder,
                    conservStatus: meta?.conservStatus,
                    difficultyLabel: meta?.difficultyLabel,
                    isRestrictedRange: meta?.isRestrictedRange
                  })
                })

                lifers.sort((a, b) => b.probability - a.probability)
                setLifersPopup({ cellId, coordinates: coords, lifers })
                console.log(`Lifers popup: cell ${cellId} has ${lifers.length} lifers`)
              }

              const densityCached = cellDataCache.get(densityCacheKey)
              if (densityCached) {
                processLifers(densityCached)
              } else {
                fetch(`/api/weeks/${week}/cells/${cellId}`)
                  .then(r => r.json())
                  .then((records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                    cellDataCache.set(densityCacheKey, records)
                    processLifers(records)
                  })
                  .catch(err => console.error('Lifers popup: error loading cell data', err))
              }
            } else {
              // Other modes: select location for trip planning
              setGoalBirdsPopup(null)
              setLifersPopup(null)
              if (onLocationSelect) {
                onLocationSelect({ cellId, coordinates: coords })
                console.log('Selected location for trip planning:', { cellId, coordinates: coords })
              }
            }
          }
        })

        console.log('Grid data loaded successfully:', {
          featureCount: gridData!.features?.length || 0,
        })
        // Mark grid ready immediately — feature states work as soon as source is added.
        // The previous once('idle') approach failed with 229K features (event never fired).
        setGridReady(true)
      } catch (error) {
        console.error('Error loading grid data:', error)
      }
    })

    return () => {
      map.current?.remove()
      map.current = null
      setGridReady(false)
    }
  }, [darkMode])

  // Update map overlay when weekly data, view mode, or goal species changes
  useEffect(() => {
    let cancelled = false

    if (!map.current || !gridReady) return
    if (weeklySummary.length === 0 && weeklyData.length === 0) return

    // Helper: clear previous feature states and apply new ones
    const applyFeatureStates = (cellValues: Map<number, number>) => {
      if (!map.current) return
      featureStateCellIds.current.forEach((cellId) => {
        map.current!.removeFeatureState({ source: 'grid', id: cellId })
      })
      featureStateCellIds.current.clear()
      cellValues.forEach((value, cellId) => {
        map.current!.setFeatureState({ source: 'grid', id: cellId }, { value })
        featureStateCellIds.current.add(cellId)
      })
    }

    const clearFeatureStates = () => {
      if (!map.current) return
      featureStateCellIds.current.forEach((cellId) => {
        map.current!.removeFeatureState({ source: 'grid', id: cellId })
      })
      featureStateCellIds.current.clear()
    }

    const setNeutralOverlay = () => {
      clearFeatureStates()
      if (map.current?.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current?.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#999')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
      }
    }

    const setHeatOverlay = () => {
      if (map.current?.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', buildHeatExpression())
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current?.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#666')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
      }
    }

    if (viewMode === 'species') {
      // Species Range mode: load per-species data on demand from API
      if (!selectedSpecies) {
        setSelectedSpeciesMeta(null)
        setNeutralOverlay()
        console.log('Species Range: no species selected')
        return
      }

      const lookupAndRender = async () => {
        if (!speciesMetaCache) {
          try { await loadSpeciesMetaCache() } catch { return }
        }
        if (cancelled || !speciesMetaCache) return
        const speciesMeta = speciesMetaCache.find((s) => s.speciesCode === selectedSpecies)
        if (!speciesMeta) {
          console.warn(`Species Range: species ${selectedSpecies} not found in metadata`)
          setSelectedSpeciesMeta(null)
          return
        }
        setSelectedSpeciesMeta(speciesMeta)

        // Load per-species data from API
        try {
          const response = await fetch(`/api/weeks/${currentWeek}/species/${selectedSpecies}`)
          if (cancelled) return
          if (!response.ok) {
            console.warn(`Species Range: failed to load ${selectedSpecies} data`)
            setNeutralOverlay()
            return
          }
          const records: { cell_id: number; probability: number }[] = await response.json()
          if (cancelled) return

          const cellProbabilities = new Map<number, number>()
          records.forEach((r) => {
            if (r.probability > 0) cellProbabilities.set(r.cell_id, r.probability)
          })

          console.log(`Species Range: ${selectedSpecies} found in ${cellProbabilities.size} cells`)

          const probabilities = Array.from(cellProbabilities.values())
          setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
          setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 0)

          if (cellProbabilities.size === 0) {
            setNeutralOverlay()
            return
          }

          applyFeatureStates(cellProbabilities)
          setHeatOverlay()
        } catch (error) {
          if (!cancelled) console.error('Species Range: error loading data', error)
        }
      }

      lookupAndRender()
      return
    } else if (viewMode === 'goal-birds') {
      // Goal Birds mode: load batch species data from API
      if (goalSpeciesCodes.size === 0) {
        clearFeatureStates()
        if (map.current?.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current?.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds: no goal species defined')
        return
      }

      const loadGoalBirds = async () => {
        const goalSpeciesIdSet = goalSpeciesIdSetRef.current
        if (goalSpeciesIdSet.size === 0) {
          setNeutralOverlay()
          return
        }

        try {
          const ids = Array.from(goalSpeciesIdSet).join(',')
          const response = await fetch(`/api/weeks/${currentWeek}/species-batch?ids=${ids}`)
          if (cancelled) return
          if (!response.ok) {
            console.warn('Goal Birds: failed to load batch data')
            setNeutralOverlay()
            return
          }
          const batchData: Record<string, { cell_id: number; probability: number }[]> = await response.json()
          if (cancelled) return

          // Count goal species per cell
          const cellCounts = new Map<number, number>()
          let maxCount = 0
          Object.values(batchData).forEach((records) => {
            records.forEach((r) => {
              if (r.probability > 0) {
                const prev = cellCounts.get(r.cell_id) || 0
                const next = prev + 1
                cellCounts.set(r.cell_id, next)
                if (next > maxCount) maxCount = next
              }
            })
          })

          console.log(`Goal Birds overlay: ${cellCounts.size} cells, max=${maxCount}, goal species=${goalSpeciesIdSet.size}`)

          const counts = Array.from(cellCounts.values()).filter(c => c > 0)
          setLegendMin(counts.length > 0 ? safeMin(counts) : 0)
          setLegendMax(maxCount)

          if (maxCount === 0) {
            setNeutralOverlay()
            return
          }

          const normalizedCounts = new Map<number, number>()
          cellCounts.forEach((count, cellId) => {
            if (count > 0) normalizedCounts.set(cellId, count / maxCount)
          })
          applyFeatureStates(normalizedCounts)

          if (map.current?.getLayer('grid-fill')) {
            map.current.setPaintProperty('grid-fill', 'fill-color', buildAmberExpression())
            map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
          }
          if (map.current?.getLayer('grid-border')) {
            map.current.setPaintProperty('grid-border', 'line-color', '#666')
            map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
          }
        } catch (error) {
          if (!cancelled) console.error('Goal Birds: error loading data', error)
        }
      }

      loadGoalBirds()
      return
    } else if (viewMode === ('probability' as string)) {
      // DISABLED — hidden from UI, kept for future redesign.
      // S&T data provides relative abundance, not true detection probability.
      const goalSpeciesIdSet = goalSpeciesIdSetRef.current
      const useGoalFilter = goalBirdsOnlyFilter && goalSpeciesCodes.size > 0

      if (useGoalFilter) {
        // Need per-species data for goal filter
        const loadGoalProbability = async () => {
          if (goalSpeciesIdSet.size === 0) {
            setNeutralOverlay()
            return
          }
          try {
            const ids = Array.from(goalSpeciesIdSet).join(',')
            const response = await fetch(`/api/weeks/${currentWeek}/species-batch?ids=${ids}`)
            if (cancelled) return
            if (!response.ok) { setNeutralOverlay(); return }
            const batchData: Record<string, { cell_id: number; probability: number }[]> = await response.json()
            if (cancelled) return

            const cellMaxProbability = new Map<number, number>()
            Object.values(batchData).forEach((records) => {
              records.forEach((r) => {
                if (r.probability > 0) {
                  const existing = cellMaxProbability.get(r.cell_id) || 0
                  if (r.probability > existing) cellMaxProbability.set(r.cell_id, r.probability)
                }
              })
            })

            console.log(`Probability overlay (goal filter): ${cellMaxProbability.size} cells`)
            const probabilities = Array.from(cellMaxProbability.values())
            setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
            setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 1)

            if (cellMaxProbability.size === 0) { setNeutralOverlay(); return }
            applyFeatureStates(cellMaxProbability)
            setHeatOverlay()
          } catch (error) {
            if (!cancelled) console.error('Probability: error loading goal data', error)
          }
        }
        loadGoalProbability()
        return
      }

      // Use summary for max probability (no goal filter)
      const cellMaxProbability = new Map<number, number>()
      weeklySummary.forEach(([cellId, , maxProbU8]) => {
        const prob = maxProbU8 / 200
        if (prob > 0) cellMaxProbability.set(cellId, prob)
      })

      console.log(`Probability overlay: ${cellMaxProbability.size} cells (from summary)`)
      const probabilities = Array.from(cellMaxProbability.values())
      setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
      setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 1)

      if (cellMaxProbability.size === 0) { setNeutralOverlay(); return }
      applyFeatureStates(cellMaxProbability)
      setHeatOverlay()
    } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
      // Density mode with Goal Birds Only filter: need batch species data
      if (goalSpeciesCodes.size === 0) {
        clearFeatureStates()
        if (map.current?.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current?.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds Only filter: no goal species defined')
        return
      }

      const loadGoalDensity = async () => {
        const goalSpeciesIdSet = goalSpeciesIdSetRef.current
        if (goalSpeciesIdSet.size === 0) { setNeutralOverlay(); return }
        try {
          const ids = Array.from(goalSpeciesIdSet).join(',')
          const response = await fetch(`/api/weeks/${currentWeek}/species-batch?ids=${ids}`)
          if (cancelled) return
          if (!response.ok) { setNeutralOverlay(); return }
          const batchData: Record<string, { cell_id: number; probability: number }[]> = await response.json()
          if (cancelled) return

          const cellCounts = new Map<number, number>()
          let maxCount = 0
          Object.values(batchData).forEach((records) => {
            records.forEach((r) => {
              if (r.probability > 0) {
                const prev = cellCounts.get(r.cell_id) || 0
                const next = prev + 1
                cellCounts.set(r.cell_id, next)
                if (next > maxCount) maxCount = next
              }
            })
          })

          console.log(`Goal Birds Only density: ${cellCounts.size} cells, max=${maxCount}`)
          const counts = Array.from(cellCounts.values()).filter(c => c > 0)
          setLegendMin(counts.length > 0 ? safeMin(counts) : 0)
          setLegendMax(maxCount)

          if (maxCount === 0) { setNeutralOverlay(); return }
          const normalizedCounts = new Map<number, number>()
          cellCounts.forEach((count, cellId) => {
            if (count > 0) normalizedCounts.set(cellId, count / maxCount)
          })
          applyFeatureStates(normalizedCounts)
          setHeatOverlay()
        } catch (error) {
          if (!cancelled) console.error('Goal density: error loading data', error)
        }
      }
      loadGoalDensity()
      return
    } else {
      // Default density mode
      // If user has a life list, use the lifer-summary endpoint to subtract seen species
      // Otherwise, use the pre-computed summary (total species per cell)
      const loadDensity = async () => {
        let cellLiferCounts = new Map<number, number>()

        if (seenSpecies.size > 0) {
          try {
            const response = await fetch(`/api/weeks/${currentWeek}/lifer-summary`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seen_species_codes: Array.from(seenSpecies) }),
            })
            if (cancelled) return
            if (response.ok) {
              const liferData: [number, number, number][] = await response.json()
              liferData.forEach(([cellId, liferCount]) => {
                if (liferCount > 0) cellLiferCounts.set(cellId, liferCount)
              })
            } else {
              // Fallback to summary on error
              weeklySummary.forEach(([cellId, speciesCount]) => {
                if (speciesCount > 0) cellLiferCounts.set(cellId, speciesCount)
              })
            }
          } catch (error) {
            if (!cancelled) console.error('Lifer summary: error loading data', error)
            // Fallback to summary
            weeklySummary.forEach(([cellId, speciesCount]) => {
              if (speciesCount > 0) cellLiferCounts.set(cellId, speciesCount)
            })
          }
        } else {
          // No life list — use pre-computed summary (total species per cell)
          weeklySummary.forEach(([cellId, speciesCount]) => {
            if (speciesCount > 0) cellLiferCounts.set(cellId, speciesCount)
          })
        }

        if (cancelled) return

        let maxLifers = 0
        let minLifers = Infinity
        cellLiferCounts.forEach((v) => {
          if (v > maxLifers) maxLifers = v
          if (v < minLifers) minLifers = v
        })
        if (cellLiferCounts.size === 0) minLifers = 0

        // Report the unfiltered data range so the slider knows the bounds (only when changed)
        if (lastReportedRangeRef.current[0] !== minLifers || lastReportedRangeRef.current[1] !== maxLifers) {
          lastReportedRangeRef.current = [minLifers, maxLifers]
          onDataRangeChangeRef.current?.([minLifers, maxLifers])
        }

        // Apply lifer count range filter
        const [filterMin, filterMax] = liferCountRange
        const filteredCounts = new Map<number, number>()
        cellLiferCounts.forEach((liferCount, cellId) => {
          if (liferCount >= filterMin && liferCount <= filterMax) {
            filteredCounts.set(cellId, liferCount)
          }
        })

        let filteredMax = 0
        let filteredMin = Infinity
        filteredCounts.forEach((v) => {
          if (v > filteredMax) filteredMax = v
          if (v < filteredMin) filteredMin = v
        })
        if (filteredCounts.size === 0) filteredMin = 0

        setLegendMin(filteredMin)
        setLegendMax(filteredMax)

        const normalizedCounts = new Map<number, number>()
        if (filteredMax > 0) {
          filteredCounts.forEach((liferCount, cellId) => {
            normalizedCounts.set(cellId, liferCount / filteredMax)
          })
        }
        applyFeatureStates(normalizedCounts)
        setHeatOverlay()
      }
      loadDensity()
    }

    return () => { cancelled = true }
  }, [weeklySummary, weeklyData, currentWeek, viewMode, goalBirdsOnlyFilter, goalSpeciesCodes, seenSpecies, goalSpeciesIdSetVersion, selectedSpecies, heatmapOpacity, gridReady, liferCountRange])

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainer}
        data-testid="map-container"
        className="w-full h-full"
        style={{ minHeight: '100%' }}
      />
      {isLoadingWeek && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-lg shadow-lg border border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#2C3E7B] border-t-transparent"></div>
            <span className="text-sm text-gray-700">Loading week data...</span>
          </div>
        </div>
      )}
      {/* ── Unified gradient legend bar ── */}
      {(() => {
        // Determine legend config based on current view mode
        let legendTitle = ''
        let gradient = 'linear-gradient(to right, #440154, #482878, #3E4A89, #31688E, #26838F, #1F9D8A, #6CCE59, #B5DE2B, #FDE725, #FCA50A, #E23028)'
        let showLegend = false
        let isPercentage = false
        let emptyMessage = ''

        if (viewMode === 'goal-birds') {
          legendTitle = 'Goal Birds Density'
          gradient = 'linear-gradient(to right, rgba(212,160,23,0.1), rgba(212,160,23,0.4), rgba(218,165,32,0.7), rgba(255,193,7,0.9), rgba(255,215,0,1))'
          showLegend = true
          emptyMessage = goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
        } else if (viewMode === 'density' && !goalBirdsOnlyFilter) {
          legendTitle = seenSpecies.size > 0 ? 'Lifer Density' : 'Species Richness'
          showLegend = true
        } else if (viewMode === 'species' && selectedSpecies) {
          legendTitle = selectedSpeciesMeta ? selectedSpeciesMeta.comName : 'Species Range'
          isPercentage = true
          showLegend = true
        } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
          legendTitle = 'Goal Birds Only'
          showLegend = true
          emptyMessage = goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
        }

        if (!showLegend) return null

        const ticks = getLegendTicks(legendMin, legendMax, isPercentage, 5)
        return (
          <div
            data-testid="map-legend"
            className="absolute bottom-8 left-4 backdrop-blur-md bg-white/90 rounded-xl shadow-sm border border-white/60 px-3 py-2"
            style={{ minWidth: '220px' }}
          >
            <div className="text-[11px] font-semibold text-gray-700 mb-1.5">{legendTitle}</div>
            <div
              className="h-2.5 rounded-full"
              style={{ background: gradient }}
            />
            <div className="flex justify-between mt-1">
              {ticks.map((tick, i) => (
                <span key={i} className="text-[10px] text-gray-500">{tick}</span>
              ))}
            </div>
            {emptyMessage && (
              <div className="text-[10px] text-amber-600 mt-1">{emptyMessage}</div>
            )}
          </div>
        )
      })()}

      {/* Goal Birds click-to-inspect popup */}
      {viewMode === 'goal-birds' && goalBirdsPopup && (
        <div
          data-testid="goal-birds-popup"
          className="absolute top-4 right-4 bg-white rounded-lg shadow-xl border border-amber-200 w-72 max-h-96 flex flex-col z-10"
          style={{ maxHeight: '80%' }}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200 rounded-t-lg">
            <div>
              <div className="text-sm font-semibold text-amber-900">🎯 Goal Birds in Area</div>
              <div className="text-xs text-amber-700">
                {goalBirdsPopup.birds.length === 0
                  ? 'No goal birds here this week'
                  : `${goalBirdsPopup.birds.length} goal bird${goalBirdsPopup.birds.length !== 1 ? 's' : ''} · Cell ${goalBirdsPopup.cellId}`}
              </div>
            </div>
            <button
              onClick={() => setGoalBirdsPopup(null)}
              className="text-amber-600 hover:text-amber-900 transition-colors p-1 rounded"
              aria-label="Close popup"
              data-testid="goal-birds-popup-close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Bird list */}
          <div className="overflow-y-auto flex-1">
            {goalBirdsPopup.birds.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <div className="text-2xl mb-2">🔍</div>
                <p>None of your goal birds occur in this cell during this week.</p>
                <p className="text-xs text-gray-400 mt-1">Try a different cell or adjust the week.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {goalBirdsPopup.birds.map((bird) => (
                  <li
                    key={bird.speciesCode}
                    data-testid={`goal-bird-item-${bird.speciesCode}`}
                    className={`px-3 py-2 flex items-center justify-between ${bird.isSeen ? 'opacity-50' : ''}`}
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <div
                        className={`text-sm font-medium ${bird.isSeen ? 'line-through text-gray-400' : 'text-gray-800'}`}
                      >
                        {bird.comName}
                      </div>
                      <div
                        className={`text-xs ${bird.isSeen ? 'line-through text-gray-300' : 'text-gray-500'}`}
                      >
                        {bird.sciName}
                      </div>
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {/* Conservation status badge */}
                        {bird.conservStatus && bird.conservStatus !== 'Unknown' && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              bird.conservStatus === 'Least Concern'
                                ? 'bg-green-100 text-green-800'
                                : bird.conservStatus === 'Near Threatened'
                                ? 'bg-yellow-100 text-yellow-800'
                                : bird.conservStatus === 'Vulnerable'
                                ? 'bg-orange-100 text-orange-800'
                                : bird.conservStatus === 'Endangered'
                                ? 'bg-red-100 text-red-800'
                                : bird.conservStatus === 'Critically Endangered'
                                ? 'bg-red-200 text-red-900'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            data-testid={`goal-popup-conservation-badge-${bird.speciesCode}`}
                          >
                            🌿
                          </span>
                        )}
                        {/* Difficulty badge */}
                        {bird.difficultyLabel && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              bird.difficultyLabel === 'Easy'
                                ? 'bg-green-100 text-green-800'
                                : bird.difficultyLabel === 'Moderate'
                                ? 'bg-yellow-100 text-yellow-800'
                                : bird.difficultyLabel === 'Hard'
                                ? 'bg-orange-100 text-orange-800'
                                : bird.difficultyLabel === 'Very Hard'
                                ? 'bg-red-100 text-red-800'
                                : bird.difficultyLabel === 'Extremely Hard'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            data-testid={`goal-popup-difficulty-badge-${bird.speciesCode}`}
                          >
                            🔭
                          </span>
                        )}
                        {/* Restricted range badge */}
                        {bird.isRestrictedRange && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                            data-testid={`goal-popup-restricted-badge-${bird.speciesCode}`}
                          >
                            📍
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {bird.isSeen && (
                        <span className="text-xs text-green-600 font-medium" title="Already seen">✓</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
            <p className="text-xs text-gray-400 text-center">
              Click another cell to update · Sorted by abundance
            </p>
          </div>
        </div>
      )}

      {/* Lifer density click-to-inspect popup */}
      {viewMode === 'density' && lifersPopup && (
        <div
          data-testid="lifers-popup"
          className="absolute top-4 right-4 bg-white rounded-lg shadow-xl border border-teal-200 w-72 max-h-96 flex flex-col z-10"
          style={{ maxHeight: '80%' }}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-3 py-2 bg-teal-50 border-b border-teal-200 rounded-t-lg">
            <div>
              <div className="text-sm font-semibold text-teal-900">🔭 Lifers in Area</div>
              <div className="text-xs text-teal-700">
                {lifersPopup.lifers.length === 0
                  ? 'No lifers here this week'
                  : `${lifersPopup.lifers.length} lifer${lifersPopup.lifers.length !== 1 ? 's' : ''} · Cell ${lifersPopup.cellId}`}
              </div>
            </div>
            <button
              onClick={() => setLifersPopup(null)}
              className="text-teal-600 hover:text-teal-900 transition-colors p-1 rounded"
              aria-label="Close popup"
              data-testid="lifers-popup-close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Lifer list */}
          <div className="overflow-y-auto flex-1">
            {lifersPopup.lifers.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                <div className="text-2xl mb-2">🎉</div>
                <p>You've seen all species in this cell!</p>
                <p className="text-xs text-gray-400 mt-1">Try a different cell or week to find more lifers.</p>
              </div>
            ) : (
              <div>
                {(() => {
                  // Group lifers by family in eBird taxonomic order
                  const familyMap = new Map<string, LiferInCell[]>()
                  const familyMinOrder = new Map<string, number>()
                  lifersPopup.lifers.forEach((lifer) => {
                    const family = lifer.familyComName || 'Other'
                    if (!familyMap.has(family)) familyMap.set(family, [])
                    familyMap.get(family)!.push(lifer)
                    const order = lifer.taxonOrder ?? 99999
                    const cur = familyMinOrder.get(family) ?? 99999
                    if (order < cur) familyMinOrder.set(family, order)
                  })
                  // Sort families by taxonomic order, species within by taxonOrder too
                  const families = Array.from(familyMap.entries()).sort(
                    (a, b) => (familyMinOrder.get(a[0]) ?? 99999) - (familyMinOrder.get(b[0]) ?? 99999)
                  )
                  families.forEach(([, lifers]) => lifers.sort((a, b) => (a.taxonOrder ?? 99999) - (b.taxonOrder ?? 99999)))
                  return families.map(([family, lifers]) => (
                    <div key={family}>
                      <div className="px-2 py-0.5 bg-gray-100 border-b border-gray-200 sticky top-0">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{family}</span>
                      </div>
                      {lifers.map((lifer) => (
                        <div
                          key={lifer.speciesCode}
                          data-testid={`lifer-item-${lifer.speciesCode}`}
                          className="px-2 py-0.5 flex items-center border-b border-gray-50 leading-tight"
                        >
                          <span className="text-xs text-gray-800 truncate flex-1">{lifer.comName}</span>
                          <div className="flex items-center gap-px flex-shrink-0 ml-1">
                            {lifer.conservStatus && lifer.conservStatus !== 'Unknown' && lifer.conservStatus !== 'Least Concern' && (
                              <span
                                className={`text-[10px] w-4 h-4 flex items-center justify-center rounded ${
                                  lifer.conservStatus === 'Near Threatened' ? 'bg-yellow-100 text-yellow-700'
                                  : lifer.conservStatus === 'Vulnerable' ? 'bg-orange-100 text-orange-700'
                                  : lifer.conservStatus === 'Endangered' ? 'bg-red-100 text-red-700'
                                  : lifer.conservStatus === 'Critically Endangered' ? 'bg-red-200 text-red-900'
                                  : 'bg-gray-100 text-gray-500'
                                }`}
                                title={lifer.conservStatus}
                              >!</span>
                            )}
                            {lifer.difficultyLabel && lifer.difficultyLabel !== 'Easy' && lifer.difficultyLabel !== 'Moderate' && (
                              <span
                                className={`text-[10px] w-4 h-4 flex items-center justify-center rounded ${
                                  lifer.difficultyLabel === 'Hard' ? 'bg-orange-100 text-orange-700'
                                  : lifer.difficultyLabel === 'Very Hard' ? 'bg-red-100 text-red-700'
                                  : lifer.difficultyLabel === 'Extremely Hard' ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-500'
                                }`}
                                title={lifer.difficultyLabel}
                              >H</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
            <p className="text-xs text-gray-400 text-center">
              Click another cell to update · Sorted by abundance
            </p>
          </div>
        </div>
      )}
    </div>
  )
})
