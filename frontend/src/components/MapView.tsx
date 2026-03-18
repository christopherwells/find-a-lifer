import { memo, useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getDisplayGroup } from '../lib/familyGroups'
import { expandRegionFilter, REGION_BBOX } from '../lib/regionGroups'
import Badge from './Badge'
import SpeciesInfoCard from './SpeciesInfoCard'
import type { Species, CellCovariates } from './types'

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

/** Compute the centroid of a GeoJSON Polygon or MultiPolygon feature */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeCentroid(feature: any): [number, number] | null {
  const geom = feature.geometry
  const ring: number[][] | null =
    geom.type === 'Polygon' ? geom.coordinates[0] :
    geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null
  if (!ring || ring.length < 2) return null
  const n = ring.length - 1 // exclude closing vertex (== first vertex)
  let lngSum = 0, latSum = 0
  for (let i = 0; i < n; i++) { lngSum += ring[i][0]; latSum += ring[i][1] }
  return [lngSum / n, latSum / n]
}



interface MapViewProps {
  darkMode?: boolean
  currentWeek?: number
  viewMode?: string
  goalBirdsOnlyFilter?: boolean
  onLocationSelect?: (location: { cellId: number; coordinates: [number, number]; name?: string }) => void
  goalSpeciesCodes?: Set<string>
  seenSpecies?: Set<string>
  selectedSpecies?: string | null
  selectedRegion?: string | null
  heatmapOpacity?: number
  selectedLocation?: { cellId: number; coordinates: [number, number] } | null
  liferCountRange?: [number, number]
  onDataRangeChange?: (range: [number, number]) => void
  showTotalRichness?: boolean
  speciesFilters?: { family: string; region: string; conservStatus: string; invasionStatus: string; difficulty: string }
  compareLocations?: { locationA: { cellId: number; coordinates: [number, number] } | null; locationB: { cellId: number; coordinates: [number, number] } | null } | null
}

interface OccurrenceRecord {
  cell_id: number
  species_id: number
  probability: number
}

// Summary data: [cell_id, species_count, max_prob_uint8, n_checklists?]
type WeeklySummary = [number, number, number, number?][]

interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
  isRestrictedRange?: boolean
  invasionStatus?: Record<string, string>
  regions?: string[]
}

interface GoalBirdInCell {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  isSeen: boolean
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
  isRestrictedRange?: boolean
}

interface GoalBirdsPopup {
  cellId: number
  coordinates: [number, number]
  birds: GoalBirdInCell[]
  nChecklists?: number
  label?: string
}

interface LiferInCell {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
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
    -1, 'rgba(0, 0, 0, 0)',               // Default: no data (transparent)
    0, 'rgba(212, 160, 23, 0.1)',          // Low intensity
    1, 'rgba(212, 160, 23, 0.85)',         // High intensity
  ] as maplibregl.ExpressionSpecification
}

interface LifersPopup {
  cellId: number
  coordinates: [number, number]
  lifers: LiferInCell[]
  totalSpecies: number
  filteredTotal: number  // species matching active filters (before seen check)
  hasActiveFilter: boolean
  nChecklists?: number
  label?: string
  estimated?: boolean
}

// Module-level cache for species metadata (populated by shared dataCache, used for sync access)
let speciesMetaCache: SpeciesMeta[] | null = null

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
  const { fetchSpecies } = await import('../lib/dataCache')
  const data = await fetchSpecies() as SpeciesMeta[]
  speciesMetaCache = data
  // Build species-by-id lookup
  speciesByIdCache = new Map()
  data.forEach(s => speciesByIdCache!.set(s.species_id, s))
  return data
}

// Shared species-by-ID lookup, built when speciesMetaCache loads
let speciesByIdCache: Map<number, SpeciesMeta> | null = null

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
  us_midwest: { center: [-93, 42], zoom: 5 },
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
  onDataRangeChange,
  showTotalRichness = false,
  speciesFilters,
  compareLocations = null,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary>([])
  const [weeklyData, setWeeklyData] = useState<OccurrenceRecord[]>([])
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)
  const [debugInfo, setDebugInfo] = useState('')
  const [gridReady, setGridReady] = useState(false)
  // Ref to track the set of species_ids that are unseen goal species
  const goalSpeciesIdSetRef = useRef<Set<number>>(new Set())
  // Counter incremented each time the goal species ID set is rebuilt, to trigger overlay re-render
  const [goalSpeciesIdSetVersion, setGoalSpeciesIdSetVersion] = useState(0)
  // Goal Birds click-to-inspect popup
  const [goalBirdsPopup, setGoalBirdsPopup] = useState<GoalBirdsPopup | null>(null)
  // Lifer density click-to-inspect popup
  const [lifersPopup, setLifersPopup] = useState<LifersPopup | null>(null)
  // Popup pagination — show all or first 20
  const [popupShowAll, setPopupShowAll] = useState(false)
  // Species info card opened from popup species name click
  const [popupSpeciesCard, setPopupSpeciesCard] = useState<Species | null>(null)
  // Cell covariates for popup habitat bar
  const [popupCovariates, setPopupCovariates] = useState<CellCovariates | null>(null)
  // Checklist counts per cell (from weekly summary, for low-data warnings)
  const cellChecklistCountsRef = useRef<Map<number, number>>(new Map())
  // Species counts per cell (from weekly summary, for fallback when cells file is missing data)
  const cellSpeciesCountsRef = useRef<Map<number, number>>(new Map())
  // Active H3 resolution (changes with zoom level)
  const [activeResolution, setActiveResolution] = useState(3)
  const activeResolutionRef = useRef(3)
  // Species metadata for the selected species (used in legend)
  const [selectedSpeciesMeta, setSelectedSpeciesMeta] = useState<SpeciesMeta | null>(null)
  // Legend data range values (for numeric labels)
  const [legendMin, setLegendMin] = useState(0)
  const [legendMax, setLegendMax] = useState(0)
  // Track which cells have feature-state set (for efficient clearing)
  const featureStateCellIds = useRef<Set<number>>(new Set())
  // Map cell_id -> smoothed value (1=neighbor, 2=fallback) from grid GeoJSON
  const smoothedMapRef = useRef<Map<number, number>>(new Map())
  // Map cell_id -> [lng, lat] centroid (used for region bbox masking)
  const cellCentersRef = useRef<Map<number, [number, number]>>(new Map())
  // All cell IDs in current grid (for exhaustive feature-state setting)
  const allCellIdsRef = useRef<Set<number>>(new Set())
  // Bumped after grid swap completes so overlay effect waits for new grid
  const [gridVersion, setGridVersion] = useState(0)
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

  // Compare mode location markers (A = blue, B = orange)
  const compareMarkerARef = useRef<maplibregl.Marker | null>(null)
  const compareMarkerBRef = useRef<maplibregl.Marker | null>(null)

  useEffect(() => {
    if (!map.current) return

    // Remove existing markers
    if (compareMarkerARef.current) {
      compareMarkerARef.current.remove()
      compareMarkerARef.current = null
    }
    if (compareMarkerBRef.current) {
      compareMarkerBRef.current.remove()
      compareMarkerBRef.current = null
    }

    if (!compareLocations) return

    // Create Marker A (blue)
    if (compareLocations.locationA) {
      const elA = document.createElement('div')
      elA.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;color:white;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:default;'
      elA.style.backgroundColor = '#2C3E7B'
      elA.textContent = 'A'
      compareMarkerARef.current = new maplibregl.Marker({ element: elA })
        .setLngLat(compareLocations.locationA.coordinates)
        .addTo(map.current)
    }

    // Create Marker B (orange)
    if (compareLocations.locationB) {
      const elB = document.createElement('div')
      elB.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;color:white;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:default;'
      elB.style.backgroundColor = '#E67E22'
      elB.textContent = 'B'
      compareMarkerBRef.current = new maplibregl.Marker({ element: elB })
        .setLngLat(compareLocations.locationB.coordinates)
        .addTo(map.current)
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (compareMarkerARef.current) {
        compareMarkerARef.current.remove()
        compareMarkerARef.current = null
      }
      if (compareMarkerBRef.current) {
        compareMarkerBRef.current.remove()
        compareMarkerBRef.current = null
      }
    }
  }, [compareLocations])

  // Build species filter ID set from Species tab filters (family, region, conservation, invasion, difficulty)
  // null = no filter active (show all), Set = only these species match
  const speciesFilterIdsRef = useRef<Set<number> | null>(null)
  useEffect(() => {
    const hasFilter = speciesFilters && (speciesFilters.family || speciesFilters.region || speciesFilters.conservStatus || speciesFilters.invasionStatus || speciesFilters.difficulty)
    if (!hasFilter || !speciesMetaCache) {
      speciesFilterIdsRef.current = null
      return
    }
    const matching = new Set<number>()
    for (const s of speciesMetaCache) {
      if (speciesFilters.family && getDisplayGroup(s.familyComName ?? '') !== speciesFilters.family) continue
      if (speciesFilters.region) {
        const codes = expandRegionFilter(speciesFilters.region)
        if (!codes.some(c => s.regions?.includes(c))) continue
      }
      if (speciesFilters.conservStatus && s.conservStatus !== speciesFilters.conservStatus) continue
      if (speciesFilters.difficulty && s.difficultyLabel !== speciesFilters.difficulty) continue
      if (speciesFilters.invasionStatus) {
        // Per-region invasion: "native wins" logic (same as SpeciesTab)
        const statuses = Object.values(s.invasionStatus || {})
        const effective = statuses.includes('Native') ? 'Native'
          : statuses.includes('Introduced') ? 'Introduced'
          : statuses[0] ?? ''
        if (effective !== speciesFilters.invasionStatus) continue
      }
      matching.add(s.species_id)
    }
    speciesFilterIdsRef.current = matching
  }, [speciesFilters])

  // Close popup when switching away from goal-birds mode
  useEffect(() => {
    if (viewMode !== 'goal-birds') {
      setGoalBirdsPopup(null)
    }
  }, [viewMode])

  // Close lifer popup when switching away from density/probability mode
  useEffect(() => {
    if (viewMode !== 'density' && viewMode !== 'probability') {
      setLifersPopup(null)
    }
  }, [viewMode])

  // Load species metadata on mount (needed for click-to-inspect popup)
  useEffect(() => {
    loadSpeciesMetaCache().catch((err) => {
      console.error('MapView: error fetching species metadata', err)
    })
  }, [])

  // Load cell covariates when popup opens
  useEffect(() => {
    if (!lifersPopup) {
      setPopupCovariates(null)
      return
    }
    let cancelled = false
    import('../lib/dataCache').then(({ fetchCovariates }) => {
      fetchCovariates(activeResolution).then(covMap => {
        if (!cancelled) {
          setPopupCovariates(covMap.get(lifersPopup.cellId) ?? null)
        }
      }).catch(() => {
        if (!cancelled) setPopupCovariates(null)
      })
    })
    return () => { cancelled = true }
  }, [lifersPopup?.cellId, activeResolution]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Zoom to region when species filter region changes
  useEffect(() => {
    if (!map.current) return
    const region = speciesFilters?.region
    if (region && REGION_BBOX[region]) {
      map.current.fitBounds(REGION_BBOX[region], { padding: 40, duration: 1200 })
    }
  }, [speciesFilters?.region])

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
        const { fetchWeekSummary } = await import('../lib/dataCache')
        const summary: WeeklySummary = await fetchWeekSummary(currentWeek, activeResolution)
        if (abortController.signal.aborted) return
        setWeeklySummary(summary)
        // Build checklist counts and species counts maps from summary
        const counts = new Map<number, number>()
        const speciesCounts = new Map<number, number>()
        summary.forEach(([cellId, speciesCount, , nChecklists]) => {
          if (nChecklists != null) counts.set(cellId, nChecklists)
          if (speciesCount > 0) speciesCounts.set(cellId, speciesCount)
        })
        cellChecklistCountsRef.current = counts
        cellSpeciesCountsRef.current = speciesCounts
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
  }, [currentWeek, activeResolution])

  // Zoom to selected location when it changes (from Trip Plan hotspots)
  useEffect(() => {
    if (!map.current || !selectedLocation) return

    // Offset for side panel: on desktop (>=768px), panel is ~384px on the right
    const isDesktop = window.innerWidth >= 768
    map.current.flyTo({
      center: selectedLocation.coordinates,
      zoom: 7,
      duration: 1500,
      padding: isDesktop ? { top: 0, bottom: 0, left: 0, right: 384 } : { top: 0, bottom: 200, left: 0, right: 0 },
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

    // Expose map instance for testing
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__maplibreglMap = map.current
    }

    // Add navigation controls
    map.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    // Add GPS locate button
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
      }),
      'top-right'
    )

    // Add scale bar
    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: 200 }),
      'bottom-right'
    )

    // Track zoom level changes to switch H3 resolution
    map.current.on('zoomend', () => {
      if (!map.current) return
      const zoom = map.current.getZoom()
      let newRes = 4  // default
      if (zoom < 3.5) newRes = 2
      else if (zoom < 5.5) newRes = 3
      if (newRes !== activeResolutionRef.current) {
        activeResolutionRef.current = newRes
        // Clear cell click cache and close popups when resolution changes (cell IDs differ between resolutions)
        cellDataCache.clear()
        setGoalBirdsPopup(null)
        setLifersPopup(null)
        setActiveResolution(newRes)
        console.log(`Zoom ${zoom.toFixed(1)} → switching to H3 resolution ${newRes}`)
      }
    })

    // Load grid data and add to map
    map.current.on('load', async () => {
      if (!map.current) return

      try {
        // Load grid GeoJSON: try network first, fall back to IndexedDB cache (offline)
        let gridData = gridGeoJsonCache
        if (!gridData) {
          try {
            const { fetchGrid } = await import('../lib/dataCache')
            const fetched = await fetchGrid(activeResolutionRef.current) as GeoJSON.FeatureCollection
            if (fetched.type === 'FeatureCollection' && Array.isArray(fetched.features)) {
              gridData = fetched
              saveGridToCache(gridData)
              console.log(`Grid GeoJSON fetched from network: ${gridData.features.length} features`)
            }
          } catch {
            // Network failed — try IndexedDB cache (offline mode)
            gridData = await loadGridFromCache()
            if (gridData) {
              console.log(`Grid GeoJSON loaded from offline cache: ${gridData.features.length} features`)
            }
          }
        }
        if (!gridData) {
          console.error('Grid data unavailable — no network or cache')
          return
        }
        gridGeoJsonCache = gridData

        // Build smoothed cell map and centroid map for opacity modulation and region masking
        const newSmoothedMap = new Map<number, number>()
        const newCentersMap = new Map<number, [number, number]>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature typing
        gridData.features.forEach((f: any) => {
          if (f.properties?.smoothed) {
            newSmoothedMap.set(f.properties.cell_id, f.properties.smoothed)
          }
          const center = computeCentroid(f)
          if (center) newCentersMap.set(f.properties.cell_id, center)
        })
        smoothedMapRef.current = newSmoothedMap
        cellCentersRef.current = newCentersMap
        allCellIdsRef.current = new Set(newCentersMap.keys())

        // Auto-zoom to data extent on first load
        if (gridData.features.length > 0 && gridData.features.length < 500) {
          const bounds = new maplibregl.LngLatBounds()
          for (const feature of gridData.features) {
            const geom = feature.geometry
            if (geom.type === 'Polygon') {
              for (const ring of geom.coordinates) {
                for (const coord of ring) {
                  bounds.extend(coord as [number, number])
                }
              }
            } else if (geom.type === 'MultiPolygon') {
              for (const polygon of geom.coordinates) {
                for (const ring of polygon) {
                  for (const coord of ring) {
                    bounds.extend(coord as [number, number])
                  }
                }
              }
            }
          }
          if (!bounds.isEmpty()) {
            map.current.fitBounds(bounds, { padding: 40, maxZoom: 8, duration: 0 })
          }
        }

        // Add grid data as a source
        map.current.addSource('grid', {
          type: 'geojson',
          data: gridData,
          promoteId: 'cell_id',
        })

        // Add grid cell fill layer — starts hidden, heatmap paint applied dynamically
        map.current.addLayer({
          id: 'grid-fill',
          type: 'fill',
          source: 'grid',
          paint: {
            'fill-color': 'rgba(0, 0, 0, 0)',
            'fill-opacity': 0,
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

        // Add dashed border for estimated/smoothed cells (smoothed=1 or 2)
        map.current.addLayer({
          id: 'grid-smoothed-border',
          type: 'line',
          source: 'grid',
          filter: ['>', ['get', 'smoothed'], 0],
          paint: {
            'line-color': 'rgba(255, 255, 255, 0.4)',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              6, 0.5,
              8, 1,
              10, 1.5,
            ],
            'line-dasharray': [2, 2],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              6, 0.2,
              8, 0.5,
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
            const cellLabel = feature.properties?.label as string | undefined

            // Skip popups for cells with no data this week (uncolored hexes)
            const featureState = map.current?.getFeatureState({ source: 'grid', id: feature.id })
            const hasData = featureState && featureState.value !== undefined && featureState.value !== -1
            if (!hasData && (viewModeRef.current === 'goal-birds' || viewModeRef.current === 'density' || viewModeRef.current === 'probability')) {
              return
            }

            if (viewModeRef.current === 'goal-birds') {
              // Goal Birds mode: load cell data from API
              const currentGoalCodes = goalSpeciesCodesRef.current
              const currentSeenSpecies = seenSpeciesRef.current

              // Use currentWeek from closure — get it from the slider's current value
              const weekEl = document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')
              const week = weekEl ? parseInt(weekEl.value) : 26

              const cacheKey = `${activeResolutionRef.current}-${week}-${cellId}`
              const processGoalBirds = (records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                const goalBirds: GoalBirdInCell[] = []
                const idToMeta = new Map<number, SpeciesMeta>()
                if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

                records.forEach((record) => {
                  if (!currentGoalCodes.has(record.speciesCode)) return
                  if (speciesFilterIdsRef.current && !speciesFilterIdsRef.current.has(record.species_id)) return
                  const meta = idToMeta.get(record.species_id)
                  goalBirds.push({
                    species_id: record.species_id,
                    speciesCode: record.speciesCode,
                    comName: record.comName,
                    sciName: meta?.sciName || '',
                    probability: record.probability,
                    isSeen: currentSeenSpecies.has(record.speciesCode),
                    conservStatus: meta?.conservStatus,
                    difficultyLabel: meta?.difficultyLabel,
                    difficultyScore: meta?.difficultyScore,
                    difficultyRating: meta?.difficultyRating,
                    isRestrictedRange: meta?.isRestrictedRange
                  })
                })

                goalBirds.sort((a, b) => b.probability - a.probability)
                setGoalBirdsPopup({ cellId, coordinates: coords, birds: goalBirds, nChecklists: cellChecklistCountsRef.current.get(cellId), label: cellLabel })
                setPopupShowAll(false)
                console.log(`Goal Birds popup: cell ${cellId} has ${goalBirds.length} goal birds`)
              }

              const cached = cellDataCache.get(cacheKey)
              if (cached) {
                processGoalBirds(cached)
              } else {
                import('../lib/dataCache').then(({ fetchWeekCells, getCellSpecies }) =>
                  fetchWeekCells(week, activeResolutionRef.current).then(weekCells => {
                    const records = getCellSpecies(weekCells, cellId, speciesByIdCache || new Map())
                    cellDataCache.set(cacheKey, records)
                    processGoalBirds(records)
                  })
                ).catch(err => console.error('Goal Birds popup: error loading cell data', err))
              }
            } else if (viewModeRef.current === 'density' || viewModeRef.current === 'probability') {
              // Density mode: load cell data from API
              const currentSeenSpecies = seenSpeciesRef.current

              const weekEl = document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')
              const week = weekEl ? parseInt(weekEl.value) : 26

              const densityCacheKey = `${activeResolutionRef.current}-${week}-${cellId}`
              const processLifers = (records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                const idToMeta = new Map<number, SpeciesMeta>()
                if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

                const hasActiveFilter = speciesFilterIdsRef.current !== null
                let filteredTotal = 0
                const lifers: LiferInCell[] = []
                records.forEach((record) => {
                  if (hasActiveFilter && !speciesFilterIdsRef.current!.has(record.species_id)) return
                  filteredTotal++
                  if (currentSeenSpecies.has(record.speciesCode)) return
                  const meta = idToMeta.get(record.species_id)
                  lifers.push({
                    species_id: record.species_id,
                    speciesCode: record.speciesCode,
                    comName: record.comName,
                    sciName: meta?.sciName || '',
                    probability: record.probability,
                    familyComName: meta?.familyComName,
                    taxonOrder: meta?.taxonOrder,
                    conservStatus: meta?.conservStatus,
                    difficultyLabel: meta?.difficultyLabel,
                    difficultyScore: meta?.difficultyScore,
                    difficultyRating: meta?.difficultyRating,
                    isRestrictedRange: meta?.isRestrictedRange
                  })
                })

                lifers.sort((a, b) => b.probability - a.probability)
                const isEstimated = (smoothedMapRef.current.get(cellId) ?? 0) > 0
                // Use cells file count, but fall back to summary species count for cells with data inconsistency
                const totalSpecies = records.length > 0 ? records.length : (cellSpeciesCountsRef.current.get(cellId) ?? 0)
                setLifersPopup({ cellId, coordinates: coords, lifers, totalSpecies, filteredTotal, hasActiveFilter, nChecklists: cellChecklistCountsRef.current.get(cellId), label: cellLabel, estimated: isEstimated })
                setPopupShowAll(false)
                console.log(`Lifers popup: cell ${cellId} has ${lifers.length} lifers out of ${totalSpecies} species`)
              }

              const densityCached = cellDataCache.get(densityCacheKey)
              if (densityCached) {
                processLifers(densityCached)
              } else {
                import('../lib/dataCache').then(({ fetchWeekCells, getCellSpecies }) =>
                  fetchWeekCells(week, activeResolutionRef.current).then(weekCells => {
                    const records = getCellSpecies(weekCells, cellId, speciesByIdCache || new Map())
                    cellDataCache.set(densityCacheKey, records)
                    processLifers(records)
                  })
                ).catch(err => console.error('Lifers popup: error loading cell data', err))
              }
            } else {
              // Other modes: select location for trip planning
              setGoalBirdsPopup(null)
              setLifersPopup(null)
              if (onLocationSelect) {
                onLocationSelect({ cellId, coordinates: coords, name: cellLabel })
                console.log('Selected location for trip planning:', { cellId, coordinates: coords, name: cellLabel })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode])

  // Swap grid source data when activeResolution changes
  useEffect(() => {
    if (!map.current || !gridReady) return
    const loadNewGrid = async () => {
      try {
        const { fetchGrid } = await import('../lib/dataCache')
        const newGrid = await fetchGrid(activeResolution) as GeoJSON.FeatureCollection
        if (!map.current) return
        const src = map.current.getSource('grid') as maplibregl.GeoJSONSource | undefined
        if (src) {
          // Clear existing feature states before swapping (cell IDs differ between resolutions)
          featureStateCellIds.current.forEach((cellId) => {
            map.current!.removeFeatureState({ source: 'grid', id: cellId })
          })
          featureStateCellIds.current.clear()
          // Update smoothed cell map and centroid map for new resolution
          const newSmoothedMap = new Map<number, number>()
          const newCentersMap = new Map<number, [number, number]>()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          newGrid.features.forEach((f: any) => {
            if (f.properties?.smoothed) {
              newSmoothedMap.set(f.properties.cell_id, f.properties.smoothed)
            }
            const center = computeCentroid(f)
            if (center) newCentersMap.set(f.properties.cell_id, center)
          })
          smoothedMapRef.current = newSmoothedMap
          cellCentersRef.current = newCentersMap
          allCellIdsRef.current = new Set(newCentersMap.keys())
          src.setData(newGrid)
          // Bump gridVersion so the overlay effect re-runs after grid is ready
          setGridVersion(v => v + 1)
          console.log(`Grid swapped to resolution ${activeResolution}: ${newGrid.features.length} features`)
        }
      } catch (err) {
        console.error(`Failed to load grid for resolution ${activeResolution}:`, err)
      }
    }
    loadNewGrid()
  }, [activeResolution, gridReady])

  // Update map overlay when weekly data, view mode, or goal species changes
  useEffect(() => {
    let cancelled = false
    // Track sourcedata retry listeners so cleanup can remove them
    let pendingRetryHandler: (() => void) | null = null

    if (!map.current || !gridReady) return
    if (weeklySummary.length === 0 && weeklyData.length === 0) return

    // Helper: filter a cell-value map to the selected region's bounding box.
    // Call this BEFORE computing legend min/max and normalization so the scale
    // reflects only the region of interest.
    const regionMask = (values: Map<number, number>): Map<number, number> => {
      const regionFilter = speciesFilters?.region
      if (!regionFilter || !REGION_BBOX[regionFilter]) return values
      const [[west, south], [east, north]] = REGION_BBOX[regionFilter]
      const masked = new Map<number, number>()
      values.forEach((value, cellId) => {
        const center = cellCentersRef.current.get(cellId)
        if (center && center[0] >= west && center[0] <= east && center[1] >= south && center[1] <= north) {
          masked.set(cellId, value)
        }
      })
      return masked
    }

    // Helper: apply feature states to ALL grid cells.
    // Cells in cellValues get their value; ALL other cells get value=-1 (hidden).
    // This guarantees no stale colored cells — every cell is explicitly set.
    const applyFeatureStates = (cellValues: Map<number, number>) => {
      if (!map.current || cancelled) return

      const allCellIds = allCellIdsRef.current
      const setStates = () => {
        if (!map.current || cancelled) return
        let setCount = 0
        for (const cellId of allCellIds) {
          try {
            const value = cellValues.get(cellId) ?? -1 // -1 = hidden (transparent)
            const smoothed = value >= 0 ? (smoothedMapRef.current.get(cellId) ?? 0) : 0
            map.current.setFeatureState({ source: 'grid', id: cellId }, { value, smoothed })
            setCount++
          } catch { /* tile not loaded yet for this cell */ }
        }
        featureStateCellIds.current = new Set(allCellIds)
        return setCount
      }

      const count = setStates()
      // If we couldn't set all cells (tiles not loaded), retry on sourcedata
      if (count !== undefined && count < allCellIds.size) {
        const retryOnSourceData = () => {
          if (!map.current || cancelled) {
            map.current?.off('sourcedata', retryOnSourceData)
            return
          }
          const retryCount = setStates()
          if (retryCount !== undefined && retryCount >= allCellIds.size) {
            map.current?.off('sourcedata', retryOnSourceData)
            pendingRetryHandler = null
          }
        }
        pendingRetryHandler = retryOnSourceData
        map.current.on('sourcedata', retryOnSourceData)
      }
    }

    const setNeutralOverlay = () => {
      applyFeatureStates(new Map()) // Set all cells to value=-1 (hidden)
      if (map.current?.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
        map.current.setPaintProperty('grid-fill', 'fill-opacity', [
              'case',
              ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,  // No data: hidden
              ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
              ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
              heatmapOpacity
            ])
      }
      if (map.current?.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#999')
        // When a region filter is active, hide borders for cells not in the neutral set
        map.current.setPaintProperty('grid-border', 'line-opacity', hasRegionFilter ? 0 : 0.2)
      }
    }

    const hasRegionFilter = !!speciesFilters?.region

    const setHeatOverlay = () => {
      if (map.current?.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', buildHeatExpression())
        map.current.setPaintProperty('grid-fill', 'fill-opacity', [
              'case',
              ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,  // No data: hidden
              ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
              ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
              heatmapOpacity
            ])
      }
      if (map.current?.getLayer('grid-border')) {
        // When a region filter is active, hide borders on out-of-region cells
        // (cells with no feature-state 'value' coalesce to -1)
        if (hasRegionFilter) {
          map.current.setPaintProperty('grid-border', 'line-color', '#666')
          map.current.setPaintProperty('grid-border', 'line-opacity', [
            'case',
            ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,
            0.4
          ] as maplibregl.ExpressionSpecification)
        } else {
          map.current.setPaintProperty('grid-border', 'line-color', '#666')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
        }
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

        // Load per-species data from static files
        try {
          const { fetchWeekCells, getSpeciesCells } = await import('../lib/dataCache')
          const weekCells = await fetchWeekCells(currentWeek, activeResolution)
          if (cancelled) return
          const records = getSpeciesCells(weekCells, speciesMeta.species_id)
          if (cancelled) return

          const cellProbabilities = new Map<number, number>()
          records.forEach((r) => {
            if (r.probability > 0) cellProbabilities.set(r.cell_id, r.probability)
          })

          const maskedProbs = regionMask(cellProbabilities)
          console.log(`Species Range: ${selectedSpecies} found in ${cellProbabilities.size} cells (${maskedProbs.size} in region)`)

          const probabilities = Array.from(maskedProbs.values())
          setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
          setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 0)

          if (maskedProbs.size === 0) {
            setNeutralOverlay()
            return
          }

          applyFeatureStates(maskedProbs)
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
        applyFeatureStates(new Map())
        if (map.current?.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', [
              'case',
              ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,  // No data: hidden
              ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
              ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
              heatmapOpacity
            ])
        }
        if (map.current?.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds: no goal species defined')
        return
      }

      const loadGoalBirds = async () => {
        let goalSpeciesIdSet = goalSpeciesIdSetRef.current
        // Apply species tab filters to goal species
        const filterIds = speciesFilterIdsRef.current
        if (filterIds) {
          goalSpeciesIdSet = new Set([...goalSpeciesIdSet].filter(sid => filterIds.has(sid)))
        }
        if (goalSpeciesIdSet.size === 0) {
          setNeutralOverlay()
          return
        }

        try {
          const { fetchWeekCells, getSpeciesBatch } = await import('../lib/dataCache')
          const weekCells = await fetchWeekCells(currentWeek, activeResolution)
          if (cancelled) return
          const batchData = getSpeciesBatch(weekCells, goalSpeciesIdSet)
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

          const maskedCounts = regionMask(cellCounts)
          const maskedVals = Array.from(maskedCounts.values()).filter(c => c > 0)
          const maskedMax = maskedVals.length > 0 ? safeMax(maskedVals) : 0
          console.log(`Goal Birds overlay: ${cellCounts.size} cells → ${maskedCounts.size} in region, max=${maskedMax}`)

          setLegendMin(maskedVals.length > 0 ? safeMin(maskedVals) : 0)
          setLegendMax(maskedMax)

          if (maskedMax === 0) {
            setNeutralOverlay()
            return
          }

          const normalizedCounts = new Map<number, number>()
          maskedCounts.forEach((count, cellId) => {
            if (count > 0) normalizedCounts.set(cellId, count / maskedMax)
          })
          applyFeatureStates(normalizedCounts)

          if (map.current?.getLayer('grid-fill')) {
            map.current.setPaintProperty('grid-fill', 'fill-color', buildAmberExpression())
            map.current.setPaintProperty('grid-fill', 'fill-opacity', [
              'case',
              ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,  // No data: hidden
              ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
              ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
              heatmapOpacity
            ])
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
    } else if (viewMode === 'probability') {
      // Combined probability: P(see at least one lifer/goal bird) = 1 - ∏(1 - freq_i)
      // Computed client-side using per-species reporting frequencies and the user's life list
      const loadCombinedProbability = async () => {
        try {
          const { fetchWeekCells, computeCombinedProbability } = await import('../lib/dataCache')
          // Ensure species metadata is loaded before building seenIds
          const currentSeenSpecies = seenSpeciesRef.current
          if (!speciesMetaCache && currentSeenSpecies.size > 0) {
            await loadSpeciesMetaCache()
          }
          if (cancelled) return
          const weekCells = await fetchWeekCells(currentWeek, activeResolution)
          if (cancelled) return

          // Build target species set: goal list species not yet seen, or all lifers
          const goalSpeciesIdSet = goalSpeciesIdSetRef.current
          const useGoalFilter = goalBirdsOnlyFilter && goalSpeciesCodes.size > 0

          let targetIds: Set<number> | null = null

          if (useGoalFilter || currentSeenSpecies.size > 0) {
            // Build seen ID set
            const seenIds = new Set<number>()
            if (speciesMetaCache && currentSeenSpecies.size > 0) {
              speciesMetaCache.forEach(s => {
                if (currentSeenSpecies.has(s.speciesCode)) seenIds.add(s.species_id)
              })
            }

            if (useGoalFilter) {
              // Goal list species that haven't been seen yet
              targetIds = new Set<number>()
              goalSpeciesIdSet.forEach(sid => {
                if (!seenIds.has(sid)) targetIds!.add(sid)
              })
            } else {
              // All species not yet seen (lifers)
              // We pass null to include all species, then filter out seen ones
              // Actually: build set of all possible species minus seen
              targetIds = new Set<number>()
              weekCells.forEach(({ speciesIds }) => {
                for (const sid of speciesIds) {
                  if (!seenIds.has(sid)) targetIds!.add(sid)
                }
              })
            }
          }
          // If no life list and no goal filter, targetIds stays null → all species

          // Apply species tab filters (conservation, invasion, difficulty)
          const filterIds = speciesFilterIdsRef.current
          if (filterIds) {
            if (targetIds) {
              // Intersect: keep only species in both target and filter sets
              targetIds.forEach(sid => { if (!filterIds.has(sid)) targetIds!.delete(sid) })
            } else {
              // No existing target — use filter as the target
              targetIds = new Set(filterIds)
            }
          }

          const cellProbabilities = computeCombinedProbability(weekCells, targetIds)
          if (cancelled) return

          const maskedProbs = regionMask(cellProbabilities)
          console.log(`Combined probability overlay: ${cellProbabilities.size} cells → ${maskedProbs.size} in region`)
          const probabilities = Array.from(maskedProbs.values())
          setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
          setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 1)

          if (maskedProbs.size === 0) { setNeutralOverlay(); return }
          applyFeatureStates(maskedProbs)
          setHeatOverlay()
        } catch (error) {
          if (!cancelled) console.error('Combined probability: error', error)
        }
      }
      loadCombinedProbability()
      return
    } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
      // Density mode with Goal Birds Only filter: need batch species data
      if (goalSpeciesCodes.size === 0) {
        applyFeatureStates(new Map())
        if (map.current?.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', [
              'case',
              ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
              ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
              heatmapOpacity
            ])
        }
        if (map.current?.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds Only filter: no goal species defined')
        return
      }

      const loadGoalDensity = async () => {
        let goalSpeciesIdSet = goalSpeciesIdSetRef.current
        // Apply species tab filters
        const filterIds = speciesFilterIdsRef.current
        if (filterIds) {
          goalSpeciesIdSet = new Set([...goalSpeciesIdSet].filter(sid => filterIds.has(sid)))
        }
        if (goalSpeciesIdSet.size === 0) { setNeutralOverlay(); return }
        try {
          const { fetchWeekCells, getSpeciesBatch } = await import('../lib/dataCache')
          const weekCells = await fetchWeekCells(currentWeek, activeResolution)
          if (cancelled) return
          const batchData = getSpeciesBatch(weekCells, goalSpeciesIdSet)
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

          const maskedCounts = regionMask(cellCounts)
          const maskedVals = Array.from(maskedCounts.values()).filter(c => c > 0)
          const maskedMax = maskedVals.length > 0 ? safeMax(maskedVals) : 0
          console.log(`Goal Birds Only density: ${cellCounts.size} cells → ${maskedCounts.size} in region, max=${maskedMax}`)
          setLegendMin(maskedVals.length > 0 ? safeMin(maskedVals) : 0)
          setLegendMax(maskedMax)

          if (maskedMax === 0) { setNeutralOverlay(); return }
          const normalizedCounts = new Map<number, number>()
          maskedCounts.forEach((count, cellId) => {
            if (count > 0) normalizedCounts.set(cellId, count / maskedMax)
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
        const cellLiferCounts = new Map<number, number>()

        const hasSpeciesFilter = speciesFilterIdsRef.current !== null
        const branch = (seenSpecies.size > 0 && !showTotalRichness) || hasSpeciesFilter ? 'lifer' : 'total'
        console.log(`Density: seenSpecies=${seenSpecies.size}, showTotalRichness=${showTotalRichness}, hasFilter=${hasSpeciesFilter}, branch=${branch}`)
        setDebugInfo(`seen=${seenSpecies.size} branch=${branch}`)
        if ((seenSpecies.size > 0 && !showTotalRichness) || hasSpeciesFilter) {
          try {
            const { fetchWeekCells, computeLiferSummary } = await import('../lib/dataCache')
            // Ensure species metadata is loaded before building seenIds.
            // Without this, seenIds stays empty and ALL species show as lifers.
            if (!speciesMetaCache && seenSpecies.size > 0) {
              await loadSpeciesMetaCache()
            }
            if (cancelled) return
            const weekCells = await fetchWeekCells(currentWeek, activeResolution)
            if (cancelled) return

            // Build seen species ID set
            const seenIds = new Set<number>()
            if (speciesMetaCache && seenSpecies.size > 0 && !showTotalRichness) {
              speciesMetaCache.forEach(s => {
                if (seenSpecies.has(s.speciesCode)) seenIds.add(s.species_id)
              })
            }

            const liferData = computeLiferSummary(weekCells, seenIds, speciesFilterIdsRef.current)
            liferData.forEach(([cellId, liferCount]) => {
              if (liferCount > 0) cellLiferCounts.set(cellId, liferCount)
            })
            const msg = `seen=${seenIds.size} liferCells=${cellLiferCounts.size}/${weekCells.size} allCells=${allCellIdsRef.current.size}`
            console.log(`Density lifer: ${msg}`)
            setDebugInfo(msg)
          } catch (error) {
            if (!cancelled) console.error('Lifer summary: error loading data', error)
            // Do NOT fall back to weeklySummary — that shows total species
            // (not lifers), causing cells with 0 lifers to appear colored.
            // Better to show nothing than misleading data.
          }
        } else {
          // No life list or showTotalRichness — use pre-computed summary (total species per cell)
          weeklySummary.forEach(([cellId, speciesCount]) => {
            if (speciesCount > 0) cellLiferCounts.set(cellId, speciesCount)
          })
        }

        if (cancelled) return

        // Apply region mask early so the data range slider reflects only in-region cells
        const regionCellCounts = regionMask(cellLiferCounts)

        let maxLifers = 0
        let minLifers = Infinity
        regionCellCounts.forEach((v) => {
          if (v > maxLifers) maxLifers = v
          if (v < minLifers) minLifers = v
        })
        if (regionCellCounts.size === 0) minLifers = 0

        // Report the data range (region-aware) so the slider knows the bounds
        if (lastReportedRangeRef.current[0] !== minLifers || lastReportedRangeRef.current[1] !== maxLifers) {
          lastReportedRangeRef.current = [minLifers, maxLifers]
          onDataRangeChangeRef.current?.([minLifers, maxLifers])
        }

        // Apply lifer count range filter
        const [filterMin, filterMax] = liferCountRange
        const filteredCounts = new Map<number, number>()
        regionCellCounts.forEach((liferCount, cellId) => {
          if (liferCount >= filterMin && liferCount <= filterMax) {
            filteredCounts.set(cellId, liferCount)
          }
        })

        // maskedCounts is already region-masked since we started from regionCellCounts
        const maskedCounts = filteredCounts

        let filteredMax = 0
        let filteredMin = Infinity
        maskedCounts.forEach((v) => {
          if (v > filteredMax) filteredMax = v
          if (v < filteredMin) filteredMin = v
        })
        if (maskedCounts.size === 0) filteredMin = 0

        setLegendMin(filteredMin)
        setLegendMax(filteredMax)

        const normalizedCounts = new Map<number, number>()
        if (filteredMax > 0) {
          maskedCounts.forEach((liferCount, cellId) => {
            normalizedCounts.set(cellId, liferCount / filteredMax)
          })
        }
        applyFeatureStates(normalizedCounts)
        if (normalizedCounts.size > 0) {
          setHeatOverlay()
        } else {
          setNeutralOverlay()
        }

        // DEBUG: verify feature states were actually applied
        if (map.current) {
          let staleCount = 0
          let hiddenCount = 0
          let coloredCount = 0
          for (const cellId of allCellIdsRef.current) {
            try {
              const state = map.current.getFeatureState({ source: 'grid', id: cellId })
              if (!state || state.value === undefined) staleCount++
              else if (state.value < 0) hiddenCount++
              else coloredCount++
            } catch { /* tile not loaded */ }
          }
          const verifyMsg = `colored=${coloredCount} hidden=${hiddenCount} stale=${staleCount} total=${allCellIdsRef.current.size}`
          console.log(`Density VERIFY: ${verifyMsg}`)
          setDebugInfo(prev => prev + ' | ' + verifyMsg)
        }
      }
      loadDensity()
    }

    return () => {
      cancelled = true
      // Clean up any pending sourcedata retry listener to prevent memory leak
      if (pendingRetryHandler && map.current) {
        map.current.off('sourcedata', pendingRetryHandler)
      }
    }
  }, [weeklySummary, weeklyData, currentWeek, viewMode, goalBirdsOnlyFilter, goalSpeciesCodes, seenSpecies, goalSpeciesIdSetVersion, selectedSpecies, heatmapOpacity, gridReady, liferCountRange, activeResolution, gridVersion, showTotalRichness, speciesFilters])

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainer}
        data-testid="map-container"
        className="w-full h-full"
        style={{ minHeight: '100%' }}
      />
      {/* DEBUG BANNER — remove after fixing purple hex bug */}
      {debugInfo && (
        <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-2 py-1 rounded z-50 font-mono">
          {debugInfo}
        </div>
      )}
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
        } else if (viewMode === 'probability') {
          legendTitle = seenSpecies.size > 0
            ? (goalBirdsOnlyFilter ? 'P(Goal Lifer)' : 'P(Any Lifer)')
            : 'P(Lifer)'
          isPercentage = true
          showLegend = true
          emptyMessage = goalBirdsOnlyFilter && goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
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
            className="absolute bottom-2 md:bottom-8 left-3 backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 px-3.5 py-2.5"
            style={{ minWidth: '200px', maxWidth: '240px' }}
          >
            <div className="text-[11px] font-bold text-gray-800 dark:text-gray-200 mb-2 tracking-tight">{legendTitle}</div>
            <div
              className="h-3 rounded-full shadow-inner"
              style={{ background: gradient }}
            />
            <div className="flex justify-between mt-1.5">
              {ticks.map((tick, i) => (
                <span key={i} className="text-[9px] font-medium text-gray-500 dark:text-gray-400 tabular-nums">{tick}</span>
              ))}
            </div>
            {emptyMessage && (
              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 font-medium">{emptyMessage}</div>
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
                  : `${goalBirdsPopup.birds.length} goal bird${goalBirdsPopup.birds.length !== 1 ? 's' : ''} · ${goalBirdsPopup.label || `Cell ${goalBirdsPopup.cellId}`}`}
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

          {/* Low data warning */}
          {goalBirdsPopup.nChecklists != null && goalBirdsPopup.nChecklists < 10 && (
            <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5">
              <span className="text-amber-500 text-xs">⚠</span>
              <span className="text-[10px] text-amber-700">
                Limited data ({goalBirdsPopup.nChecklists} checklist{goalBirdsPopup.nChecklists !== 1 ? 's' : ''}) — frequencies may be unreliable
              </span>
            </div>
          )}

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
                      <button
                        className={`text-sm font-medium text-left ${bird.isSeen ? 'line-through text-gray-400' : 'text-gray-800 hover:text-[#2C3E7B]'} cursor-pointer`}
                        onClick={() => {
                          const meta = speciesByIdCache?.get(bird.species_id)
                          if (meta) setPopupSpeciesCard(meta as unknown as Species)
                        }}
                      >
                        {bird.comName}
                      </button>
                      <div
                        className={`text-xs ${bird.isSeen ? 'line-through text-gray-300' : 'text-gray-500'}`}
                      >
                        {bird.sciName}
                      </div>
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {bird.conservStatus && bird.conservStatus !== 'Unknown' && (
                          <Badge variant="conservation" value={bird.conservStatus} size="icon" />
                        )}
                        {bird.difficultyLabel && (
                          <Badge variant="difficulty" value={bird.difficultyLabel} size="icon" />
                        )}
                        {bird.isRestrictedRange && (
                          <Badge variant="restricted-range" value="Restricted Range" size="icon" />
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
      {(viewMode === 'density' || viewMode === 'probability') && lifersPopup && (
        <div
          data-testid="lifers-popup"
          className="absolute top-4 right-4 bg-white rounded-lg shadow-xl border border-teal-200 w-72 max-h-96 flex flex-col z-10"
          style={{ maxHeight: '80%' }}
        >
          {/* Popup header */}
          <div className="flex items-center justify-between px-3 py-2 bg-teal-50 border-b border-teal-200 rounded-t-lg">
            <div>
              <div className="text-sm font-semibold text-teal-900">{seenSpecies.size === 0 ? '🔭 Species in Area' : '🔭 Lifers in Area'}</div>
              <div className="text-xs text-teal-700">
                {seenSpecies.size === 0
                  ? lifersPopup.hasActiveFilter
                    ? `${lifersPopup.filteredTotal} of ${lifersPopup.totalSpecies} match filter · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                    : `${lifersPopup.totalSpecies} species · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                  : lifersPopup.lifers.length === 0
                    ? lifersPopup.hasActiveFilter
                      ? `No lifers match filter / ${lifersPopup.filteredTotal} species · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                      : lifersPopup.totalSpecies === 0
                        ? `No species data · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                        : `No lifers to find / ${lifersPopup.totalSpecies} species · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                    : lifersPopup.hasActiveFilter
                      ? `${lifersPopup.lifers.length} lifer${lifersPopup.lifers.length !== 1 ? 's' : ''} match filter / ${lifersPopup.filteredTotal} species · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`
                      : `${lifersPopup.lifers.length} lifer${lifersPopup.lifers.length !== 1 ? 's' : ''} to find / ${lifersPopup.totalSpecies} species · ${lifersPopup.label || `Cell ${lifersPopup.cellId}`}`}
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

          {/* Estimated cell warning */}
          {lifersPopup.estimated && (
            <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 flex items-center gap-1.5">
              <span className="text-red-500 text-xs">⚠</span>
              <span className="text-[10px] text-red-700 dark:text-red-400">
                No checklist data — species estimated from neighboring cells
              </span>
            </div>
          )}
          {/* Low data warning */}
          {!lifersPopup.estimated && lifersPopup.nChecklists != null && lifersPopup.nChecklists < 10 && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-b border-teal-200 dark:border-teal-800 flex items-center gap-1.5">
              <span className="text-amber-500 text-xs">⚠</span>
              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                Limited data ({lifersPopup.nChecklists} checklist{lifersPopup.nChecklists !== 1 ? 's' : ''}) — frequencies may be unreliable
              </span>
            </div>
          )}

          {/* Import prompt when no life list (only show when no filter is active) */}
          {seenSpecies.size === 0 && lifersPopup.lifers.length > 0 && !lifersPopup.hasActiveFilter && (
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-teal-200 dark:border-teal-800 text-center">
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Import your life list in <strong>Profile</strong> to see which are lifers</p>
            </div>
          )}
          {/* Filter active indicator */}
          {lifersPopup.hasActiveFilter && (
            <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border-b border-teal-200 dark:border-teal-800 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              <span className="text-[10px] text-blue-700 dark:text-blue-400">
                Filtered — {lifersPopup.filteredTotal} of {lifersPopup.totalSpecies} species match
              </span>
            </div>
          )}
          {/* Habitat bar */}
          {popupCovariates && (
            <div className="px-3 py-2 border-b border-teal-200 dark:border-teal-800 space-y-1" data-testid="habitat-bar">
              <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Habitat</p>
              {(() => {
                const cov = popupCovariates as unknown as Record<string, number>
                const ocean = cov.ocean || 0
                // Support both split forest types (new) and combined 'trees' (legacy)
                const hasForestSplit = 'needleleaf' in cov || 'evergreen_broadleaf' in cov
                const landCovKeys = hasForestSplit
                  ? ['needleleaf', 'evergreen_broadleaf', 'deciduous_broadleaf', 'mixed_forest', 'shrub', 'herb', 'cultivated', 'urban', 'water', 'flooded']
                  : ['trees', 'shrub', 'herb', 'cultivated', 'urban', 'water', 'flooded']
                const landSum = landCovKeys.reduce((s, k) => s + (cov[k] || 0), 0)
                const barren = Math.max(0, 1 - ocean - landSum)

                // 12-bin categories with simple, friendly names and emojis
                const categories = hasForestSplit ? [
                  { key: 'ocean', val: ocean, color: '#1B4F72', label: 'Ocean', icon: '\u{1F30A}' },
                  { key: 'needleleaf', val: cov.needleleaf || 0, color: '#1B5E20', label: 'Conifer', icon: '\u{1F332}' },
                  { key: 'evergreen_broadleaf', val: cov.evergreen_broadleaf || 0, color: '#2E7D32', label: 'Tropical', icon: '\u{1F334}' },
                  { key: 'deciduous_broadleaf', val: cov.deciduous_broadleaf || 0, color: '#558B2F', label: 'Deciduous', icon: '\u{1F333}' },
                  { key: 'mixed_forest', val: cov.mixed_forest || 0, color: '#33691E', label: 'Mixed', icon: '\u{1F343}' },
                  { key: 'shrub', val: cov.shrub || 0, color: '#8B6914', label: 'Scrub', icon: '\u{1F335}' },
                  { key: 'herb', val: cov.herb || 0, color: '#A8D08D', label: 'Grassland', icon: '\u{1F33F}' },
                  { key: 'cultivated', val: cov.cultivated || 0, color: '#D4A843', label: 'Farmland', icon: '\u{1F33E}' },
                  { key: 'urban', val: cov.urban || 0, color: '#888', label: 'Developed', icon: '\u{1F3D8}' },
                  { key: 'water', val: Math.max(0, (cov.water || 0) - ocean), color: '#4A90D9', label: 'Freshwater', icon: '\u{1F4A7}' },
                  { key: 'flooded', val: cov.flooded || 0, color: '#6B8E9B', label: 'Wetland', icon: '\u{1F3DE}' },
                  { key: 'barren', val: barren, color: '#C4A882', label: 'Barren', icon: '\u{1F3DC}' },
                ] : [
                  // Legacy fallback (combined trees)
                  { key: 'ocean', val: ocean, color: '#1B4F72', label: 'Ocean', icon: '\u{1F30A}' },
                  { key: 'trees', val: cov.trees || 0, color: '#22763F', label: 'Forest', icon: '\u{1F332}' },
                  { key: 'shrub', val: cov.shrub || 0, color: '#8B6914', label: 'Scrub', icon: '\u{1F335}' },
                  { key: 'herb', val: cov.herb || 0, color: '#A8D08D', label: 'Grassland', icon: '\u{1F33F}' },
                  { key: 'cultivated', val: cov.cultivated || 0, color: '#D4A843', label: 'Farmland', icon: '\u{1F33E}' },
                  { key: 'urban', val: cov.urban || 0, color: '#888', label: 'Developed', icon: '\u{1F3D8}' },
                  { key: 'water', val: Math.max(0, (cov.water || 0) - ocean), color: '#4A90D9', label: 'Freshwater', icon: '\u{1F4A7}' },
                  { key: 'flooded', val: cov.flooded || 0, color: '#6B8E9B', label: 'Wetland', icon: '\u{1F3DE}' },
                  { key: 'barren', val: barren, color: '#C4A882', label: 'Barren', icon: '\u{1F3DC}' },
                ]
                const total = categories.reduce((s, c) => s + c.val, 0)
                const scale = total > 0 ? 100 / total : 0

                return (
                  <>
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                      {categories.map(({ key, val, color }) => {
                        const pct = val * scale
                        if (pct < 1.5) return null
                        return (
                          <div
                            key={key}
                            style={{ width: `${pct}%`, backgroundColor: color }}
                            title={`${key}: ${(val * 100).toFixed(0)}%`}
                          />
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0">
                      {categories.map(({ key, val, icon, label }) => {
                        if (val < 0.03) return null
                        return (
                          <span key={key} className="text-[9px] text-gray-500 dark:text-gray-400">
                            {icon} {label} {(val * 100).toFixed(0)}%
                          </span>
                        )
                      })}
                      {popupCovariates.elev_mean > 0 && (
                        <span className="text-[9px] text-gray-500 dark:text-gray-400">
                          ⛰ {Math.round(popupCovariates.elev_mean)}m
                        </span>
                      )}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
          {/* Lifer list */}
          <div className="overflow-y-auto flex-1">
            {lifersPopup.lifers.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-gray-500">
                {lifersPopup.hasActiveFilter ? (
                  lifersPopup.filteredTotal === 0 ? (
                    <>
                      <p>No species matching your filter were recorded in this cell this week.</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different cell, week, or clear the filter.</p>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl mb-2">🎉</div>
                      <p>You've seen all {lifersPopup.filteredTotal} matching species in this cell!</p>
                      <p className="text-xs text-gray-400 mt-1">Try a different cell or week to find more lifers.</p>
                    </>
                  )
                ) : seenSpecies.size === 0 ? (
                  <>
                    <p>Import your life list in the <strong>Profile</strong> tab to see which are lifers.</p>
                    {lifersPopup.totalSpecies > 0 && (
                      <p className="text-xs text-gray-400 mt-1">{lifersPopup.totalSpecies} species recorded here this week.</p>
                    )}
                  </>
                ) : lifersPopup.totalSpecies === 0 ? (
                  <>
                    <p>No species data for this cell this week.</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different cell or week.</p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl mb-2">🎉</div>
                    <p>You've seen all {lifersPopup.totalSpecies} species in this cell!</p>
                    <p className="text-xs text-gray-400 mt-1">Try a different cell or week to find more lifers.</p>
                  </>
                )}
              </div>
            ) : (
              <div>
                {(() => {
                  // Group lifers by display group in ecological order
                  const familyMap = new Map<string, LiferInCell[]>()
                  const familyMinOrder = new Map<string, number>()
                  lifersPopup.lifers.forEach((lifer) => {
                    const family = getDisplayGroup(lifer.familyComName || 'Other')
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
                  // Pagination: flatten to count total, then paginate within families
                  const allLifers = families.flatMap(([, lifers]) => lifers)
                  const POPUP_PAGE_SIZE = window.innerWidth < 768 ? 12 : 20
                  const totalCount = allLifers.length
                  const displayLimit = popupShowAll ? totalCount : POPUP_PAGE_SIZE
                  let displayedCount = 0

                  return (
                    <>
                      {families.map(([family, lifers]) => {
                        // Skip families entirely if we've hit the limit
                        if (!popupShowAll && displayedCount >= displayLimit) return null
                        const remainingSlots = displayLimit - displayedCount
                        const visibleLifers = popupShowAll ? lifers : lifers.slice(0, remainingSlots)
                        displayedCount += visibleLifers.length
                        return (
                          <div key={family}>
                            <div className="px-2 py-0.5 bg-gray-100 border-b border-gray-200 sticky top-0">
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{family}</span>
                            </div>
                            {visibleLifers.map((lifer) => (
                              <div
                                key={lifer.speciesCode}
                                data-testid={`lifer-item-${lifer.speciesCode}`}
                                className="px-2 py-0.5 flex items-center border-b border-gray-50 leading-tight"
                              >
                                <button
                                  className="text-xs text-gray-800 dark:text-gray-200 truncate flex-1 text-left hover:text-[#2C3E7B] dark:hover:text-blue-400 cursor-pointer"
                                  onClick={() => {
                                    const meta = speciesByIdCache?.get(lifer.species_id)
                                    if (meta) setPopupSpeciesCard(meta as unknown as Species)
                                  }}
                                >
                                  {lifer.comName}
                                </button>
                                <div className="flex items-center gap-px flex-shrink-0 ml-1">
                                  {lifer.conservStatus && lifer.conservStatus !== 'Unknown' && lifer.conservStatus !== 'Least Concern' && (
                                    <Badge variant="conservation" value={lifer.conservStatus} size="icon" />
                                  )}
                                  {lifer.difficultyRating != null && lifer.difficultyRating >= 5 && (
                                    <span
                                      className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 px-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                                        lifer.difficultyRating >= 10 ? 'bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200'
                                        : lifer.difficultyRating >= 9 ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                                        : lifer.difficultyRating >= 8 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300'
                                        : lifer.difficultyRating >= 7 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                        : lifer.difficultyRating >= 6 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
                                        : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                      }`}
                                      title={`Difficulty: ${lifer.difficultyRating}/10`}
                                    >
                                      {lifer.difficultyRating}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {!popupShowAll && totalCount > POPUP_PAGE_SIZE && (
                        <button
                          className="w-full px-3 py-2 text-xs text-[#2C3E7B] dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-center"
                          onClick={() => setPopupShowAll(true)}
                          data-testid="popup-show-all"
                        >
                          Show all {totalCount} species
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
            <p className="text-xs text-gray-400 text-center">
              Click species name for details · Click cell to update
            </p>
          </div>
        </div>
      )}

      {/* Species Info Card from popup click */}
      {popupSpeciesCard && (
        <SpeciesInfoCard
          species={popupSpeciesCard}
          onClose={() => setPopupSpeciesCard(null)}
          currentWeek={currentWeek}
          onCellClick={(cellId, coordinates) => {
            setPopupSpeciesCard(null)
            setLifersPopup(null)
            onLocationSelect?.({ cellId, coordinates })
          }}
        />
      )}
    </div>
  )
})
