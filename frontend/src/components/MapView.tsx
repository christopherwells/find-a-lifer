import { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// getDisplayGroup removed — habitat filter replaced family filter
import { expandRegionFilter, REGION_BBOX } from '../lib/regionGroups'
import SpeciesInfoCard from './SpeciesInfoCard'
import { loadCellStates, isCellInRegion } from '../lib/subRegions'
import { trackEvent } from '../lib/analytics'
import { useToast } from '../contexts/ToastContext'
import { useMapControls } from '../contexts/MapControlsContext'
import type { Species, CellCovariates } from './types'
import {
  safeMin, safeMax, computeCentroid,
  buildHeatExpression, buildAmberExpression, getLegendTicks, quantileNormalize, getQuantileTicks,
  type SpeciesMeta, type LiferInCell, type GoalBirdInCell,
  type OccurrenceRecord, type WeeklySummary,
} from '../lib/mapHelpers'
import { getNotableBirds, type NotableBird } from '../lib/recommendationEngine'
import {
  computeSingleSpeciesRange,
  computeMultiSpeciesRange,
  buildMultiSpeciesBitmaskColors,
  computeGoalBirdsProbability,
  buildProbabilityTargetIds,
  computeProbabilityOverlay,
  computeDensityFromLiferSummary,
  computeDensityFromSummary,
  applyLiferCountRangeFilter,
  regionMask as regionMaskFn,
} from '../lib/overlayRenderers'
import { getAllLists, addSpeciesToList } from '../lib/goalListsDB'
import type { GoalList } from '../lib/goalListsDB'
import GoalBirdsPopupComponent from './GoalBirdsPopup'
import type { GoalBirdsPopupData } from './GoalBirdsPopup'
import LifersPopupComponent from './LifersPopup'
import type { LifersPopupData } from './LifersPopup'

interface MapViewProps {
  darkMode?: boolean
  seenSpecies?: Set<string>
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

// Region bounds for zoom presets
const REGION_BOUNDS: Record<string, { center: [number, number]; zoom: number }> = {
  // Super-regions
  'northern': { center: [-100, 58], zoom: 3 },
  'continental-us': { center: [-98, 39], zoom: 3.5 },
  'hawaii': { center: [-157, 20.5], zoom: 6.5 },
  'mex-central': { center: [-95, 18], zoom: 4 },
  'caribbean': { center: [-72, 19], zoom: 5 },
  // Sub-regions (17)
  'ca-west': { center: [-135, 58], zoom: 3.5 },
  'ca-central': { center: [-95, 55], zoom: 4 },
  'ca-east': { center: [-65, 50], zoom: 4 },
  'us-ne': { center: [-73.5, 42], zoom: 5.5 },
  'us-se': { center: [-83.5, 31], zoom: 5 },
  'us-mw': { center: [-93, 42], zoom: 5 },
  'us-sw': { center: [-103, 31], zoom: 5 },
  'us-west': { center: [-120, 39], zoom: 5 },
  'us-rockies': { center: [-110, 42], zoom: 4.5 },
  'us-hi': { center: [-157, 20.5], zoom: 6.5 },
  'mx-north': { center: [-105, 27], zoom: 5 },
  'mx-south': { center: [-96, 18], zoom: 5.5 },
  'ca-c-north': { center: [-87, 15], zoom: 6 },
  'ca-c-south': { center: [-82, 9.5], zoom: 6.5 },
  'caribbean-greater': { center: [-75, 20], zoom: 5.5 },
  'caribbean-lesser': { center: [-62, 15], zoom: 6 },
  'atlantic-west': { center: [-75, 26], zoom: 5.5 },
  // Legacy IDs (backward compat)
  us_northeast: { center: [-73.5, 42], zoom: 5.5 },
  us_southeast: { center: [-83.5, 31], zoom: 5.5 },
  us_midwest: { center: [-93, 42], zoom: 5 },
  us_west: { center: [-114.5, 40.5], zoom: 4.5 },
  alaska: { center: [-150, 64], zoom: 4 },
}

export default memo(function MapView({
  darkMode = false,
  seenSpecies = new Set(),
}: MapViewProps) {
  const {
    state: {
      currentWeek,
      viewMode,
      liferMetric,
      goalBirdsOnlyFilter,
      selectedSpecies,
      selectedSpeciesMulti,
      selectedRegion,
      heatmapOpacity,
      selectedLocation,
      liferCountRange,
      showTotalRichness,
      speciesFilters,
      compareLocations,
    },
    goalSpeciesCodes,
    setSelectedLocation: onLocationSelect,
    setDataRange: onDataRangeChange,
    setCurrentWeek,
    setSpeciesFilters,
  } = useMapControls()
  const { showToast } = useToast()
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
  const [goalBirdsPopup, setGoalBirdsPopup] = useState<GoalBirdsPopupData | null>(null)
  // Lifer density click-to-inspect popup
  const [lifersPopup, setLifersPopup] = useState<LifersPopupData | null>(null)
  // Popup pagination — show all or first 20
  const [popupShowAll, setPopupShowAll] = useState(false)
  // Toggle to show ALL species (including seen) in the popup with checkmarks
  const [popupShowAllSpecies, setPopupShowAllSpecies] = useState(false)
  // Cached raw cell records for re-processing when toggling show-all-species mode
  const popupCellRecordsRef = useRef<{ speciesCode: string; comName: string; probability: number; species_id: number }[] | null>(null)
  // Species info card opened from popup species name click
  const [popupSpeciesCard, setPopupSpeciesCard] = useState<Species | null>(null)
  const [popupRegionContext, setPopupRegionContext] = useState<{ subRegionId: string; cellLng: number; cellLat: number } | null>(null)
  // Goal lists for "Add to goal list" button on Notable Birds
  const [popupGoalLists, setPopupGoalLists] = useState<GoalList[]>([])
  const [popupGoalAddFeedback, setPopupGoalAddFeedback] = useState<{ speciesCode: string; listName: string; status: 'added' | 'already' } | null>(null)
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
  const [quantileBounds, setQuantileBounds] = useState<number[] | null>(null)
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

  // Notable birds computed from popup data for the "Notable Birds Here" section
  const notableBirds: NotableBird[] = useMemo(() => {
    // Compute from lifers popup (density/probability modes)
    // Only consider unseen species for notable birds (filter out seen when in show-all mode)
    if (lifersPopup && lifersPopup.lifers.length > 0 && speciesByIdCache) {
      const cellSpecies = lifersPopup.lifers.filter(l => !l.isSeen).map(lifer => {
        const meta = speciesByIdCache!.get(lifer.species_id)
        return {
          species: (meta as unknown as Species) || {
            species_id: lifer.species_id,
            speciesCode: lifer.speciesCode,
            comName: lifer.comName,
            sciName: lifer.sciName,
            difficultyRating: lifer.difficultyRating ?? 5,
            photoUrl: '',
          } as unknown as Species,
          frequency: lifer.probability,
        }
      }).filter(cs => cs.species.speciesCode) // filter out any bad data
      return getNotableBirds(cellSpecies, seenSpecies, goalSpeciesCodes)
    }
    // Compute from goal birds popup (goal-birds mode)
    if (goalBirdsPopup && goalBirdsPopup.birds.length > 0 && speciesByIdCache) {
      const cellSpecies = goalBirdsPopup.birds
        .filter(bird => !bird.isSeen)
        .map(bird => {
          const meta = speciesByIdCache!.get(bird.species_id)
          return {
            species: (meta as unknown as Species) || {
              species_id: bird.species_id,
              speciesCode: bird.speciesCode,
              comName: bird.comName,
              sciName: bird.sciName,
              difficultyRating: bird.difficultyRating ?? 5,
              photoUrl: '',
            } as unknown as Species,
            frequency: bird.probability,
          }
        }).filter(cs => cs.species.speciesCode)
      return getNotableBirds(cellSpecies, seenSpecies, goalSpeciesCodes)
    }
    return []
  }, [lifersPopup, goalBirdsPopup, seenSpecies, goalSpeciesCodes])

  // Load goal lists for the "+" button in Notable Birds
  useEffect(() => {
    let cancelled = false
    getAllLists().then(lists => {
      if (!cancelled) setPopupGoalLists(lists)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Handler for adding a species to the first (or only) goal list from Notable Birds
  const handleNotableAddToGoal = useCallback(async (speciesCode: string) => {
    if (popupGoalLists.length === 0) return
    const list = popupGoalLists[0] // Use first goal list for the quick-add button
    try {
      const added = await addSpeciesToList(list.id, speciesCode)
      setPopupGoalAddFeedback({
        speciesCode,
        listName: list.name,
        status: added ? 'added' : 'already'
      })
      if (added) {
        // Update local state
        setPopupGoalLists(prev => prev.map(l =>
          l.id === list.id ? { ...l, speciesCodes: [...l.speciesCodes, speciesCode] } : l
        ))
      }
      setTimeout(() => setPopupGoalAddFeedback(null), 2000)
    } catch {
      // Silently fail
    }
  }, [popupGoalLists])

  // Re-process lifers popup when show-all-species mode is toggled
  useEffect(() => {
    if (!lifersPopup || !popupCellRecordsRef.current) return
    const records = popupCellRecordsRef.current
    const idToMeta = new Map<number, SpeciesMeta>()
    if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

    const hasActiveFilter = speciesFilterIdsRef.current !== null
    let filteredTotal = 0
    const allItems: LiferInCell[] = []
    records.forEach((record) => {
      if (hasActiveFilter && !speciesFilterIdsRef.current!.has(record.species_id)) return
      filteredTotal++
      const seen = seenSpecies.has(record.speciesCode)
      if (!popupShowAllSpecies && seen) return  // In normal mode, skip seen species
      const meta = idToMeta.get(record.species_id)
      allItems.push({
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
        isRestrictedRange: meta?.isRestrictedRange,
        isSeen: seen
      })
    })

    // Sort: unseen first (by freq desc), then seen (by freq desc)
    allItems.sort((a, b) => {
      if (a.isSeen !== b.isSeen) return a.isSeen ? 1 : -1
      return b.probability - a.probability
    })

    const totalSpecies = records.length > 0 ? records.length : (cellSpeciesCountsRef.current.get(lifersPopup.cellId) ?? 0)
    setLifersPopup(prev => prev ? { ...prev, lifers: allItems, totalSpecies, filteredTotal, hasActiveFilter } : null)
    setPopupShowAll(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popupShowAllSpecies])

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
    const hasFilter = speciesFilters && (speciesFilters.habitat || speciesFilters.region || speciesFilters.conservStatus || speciesFilters.invasionStatus || speciesFilters.difficulty)
    if (!hasFilter || !speciesMetaCache) {
      speciesFilterIdsRef.current = null
      return
    }
    const matching = new Set<number>()
    for (const s of speciesMetaCache) {
      if (speciesFilters.habitat && !(s.habitatLabels ?? []).includes(speciesFilters.habitat)) continue
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

    const isMobile = window.innerWidth < 768

    // Restore last map position from localStorage, or default to US center
    const savedPosition = (() => {
      try {
        const saved = localStorage.getItem('mapPosition')
        if (saved) {
          const { center, zoom } = JSON.parse(saved)
          if (Array.isArray(center) && center.length === 2 && typeof zoom === 'number') {
            return { center: center as [number, number], zoom }
          }
        }
      } catch { /* ignore */ }
      return { center: [-98.5, 39.8] as [number, number], zoom: 3.5 }
    })()

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style,
      center: savedPosition.center,
      zoom: savedPosition.zoom,
      minZoom: 2,
      maxZoom: 15,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: isMobile ? false : undefined, // Hide on mobile; credits in About page
    })

    // Disable rotation on two-finger touch zoom (keep zoom, remove rotate)
    map.current.touchZoomRotate.disableRotation()

    // Expose map instance for testing
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__maplibreglMap = map.current
    }

    // Preload cell states for sub-region detection
    loadCellStates(4).catch(() => {/* non-critical */})

    // Add navigation controls (desktop only — mobile has pinch-to-zoom)
    if (!isMobile) {
      map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    }

    // Add GPS locate button
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
      }),
      'top-right'
    )

    // Add scale bar (bottom-right to avoid overlapping legend in bottom-left)
    map.current.addControl(
      new maplibregl.ScaleControl({ maxWidth: isMobile ? 100 : 200 }),
      'bottom-right'
    )

    // Track zoom level changes to switch H3 resolution
    // Mobile thresholds are lower so smaller hexes persist longer when zooming out
    const res2Threshold = isMobile ? 2.8 : 3.5
    const res3Threshold = isMobile ? 4.5 : 5.5
    // Save map position to localStorage on moveend
    map.current.on('moveend', () => {
      if (!map.current) return
      const center = map.current.getCenter()
      const zoom = map.current.getZoom()
      localStorage.setItem('mapPosition', JSON.stringify({
        center: [center.lng, center.lat],
        zoom: Math.round(zoom * 10) / 10,
      }))
    })

    map.current.on('zoomend', () => {
      if (!map.current) return
      const zoom = map.current.getZoom()
      let newRes = 4  // default
      if (zoom < res2Threshold) newRes = 2
      else if (zoom < res3Threshold) newRes = 3
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

        // Add grid cell border layer — subtle dark outlines that define hex boundaries
        map.current.addLayer({
          id: 'grid-border',
          type: 'line',
          source: 'grid',
          paint: {
            'line-color': darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              6, 0.5,
              8, 1.0,
              10, 1.5,
            ],
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              4, 0,
              5.5, 0.15,
              7, 0.35,
              9, 0.5,
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

        // Hover highlight layer — brighter fill on hovered cell
        map.current.addLayer({
          id: 'grid-hover',
          type: 'fill',
          source: 'grid',
          paint: {
            'fill-color': darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
          },
        })

        // Clicked cell ring — bright outline on selected cell
        map.current.addLayer({
          id: 'grid-selected-ring',
          type: 'line',
          source: 'grid',
          paint: {
            'line-color': darkMode ? '#FBBF24' : '#2C3E7B',
            'line-width': 2.5,
            'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0],
          },
        })

        // Track hovered cell for highlight
        let hoveredCellId: string | number | null = null

        map.current.on('mouseenter', 'grid-fill', () => {
          if (map.current) map.current.getCanvas().style.cursor = 'pointer'
        })

        map.current.on('mousemove', 'grid-fill', (e) => {
          if (!map.current || !e.features?.length) return
          const id = e.features[0].id
          if (hoveredCellId !== null && hoveredCellId !== id) {
            map.current.setFeatureState({ source: 'grid', id: hoveredCellId }, { hover: false })
          }
          hoveredCellId = id ?? null
          if (hoveredCellId !== null) {
            map.current.setFeatureState({ source: 'grid', id: hoveredCellId }, { hover: true })
          }
        })

        map.current.on('mouseleave', 'grid-fill', () => {
          if (map.current) {
            map.current.getCanvas().style.cursor = ''
            if (hoveredCellId !== null) {
              map.current.setFeatureState({ source: 'grid', id: hoveredCellId }, { hover: false })
              hoveredCellId = null
            }
          }
        })

        // Track selected cell for ring highlight
        let selectedCellFeatureId: string | number | null = null

        // Add click handler for trip planning location selection and Goal Birds inspect
        map.current.on('click', 'grid-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0]
            const cellId = feature.properties?.cell_id
            if (!cellId) return

            // Update selected cell ring
            if (map.current) {
              if (selectedCellFeatureId !== null) {
                map.current.setFeatureState({ source: 'grid', id: selectedCellFeatureId }, { selected: false })
              }
              selectedCellFeatureId = feature.id ?? null
              if (selectedCellFeatureId !== null) {
                map.current.setFeatureState({ source: 'grid', id: selectedCellFeatureId }, { selected: true })
              }
            }

            const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat]
            const cellLabel = feature.properties?.label as string | undefined

            // Skip popups for cells with no data this week (uncolored hexes)
            const featureState = map.current?.getFeatureState({ source: 'grid', id: feature.id })
            const hasData = featureState && featureState.value !== undefined && featureState.value !== -1
            if (!hasData && (viewModeRef.current === 'goal-birds' || viewModeRef.current === 'density' || viewModeRef.current === 'probability' || viewModeRef.current === 'species')) {
              const name = cellLabel || 'this area'
              showToast({ type: 'muted', message: `No bird data for ${name} this week`, duration: 3500 })
              return
            }

            trackEvent('cell_click', { view_mode: viewModeRef.current })

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
                (async () => {
                  if (!speciesByIdCache) await loadSpeciesMetaCache()
                  const { fetchWeekCells, getCellSpecies } = await import('../lib/dataCache')
                  const weekCells = await fetchWeekCells(week, activeResolutionRef.current)
                  const records = getCellSpecies(weekCells, cellId, speciesByIdCache || new Map())
                  cellDataCache.set(cacheKey, records)
                  processGoalBirds(records)
                })().catch(err => console.error('Goal Birds popup: error loading cell data', err))
              }
            } else if (viewModeRef.current === 'density' || viewModeRef.current === 'probability' || viewModeRef.current === 'species') {
              // Density mode: load cell data from API
              const currentSeenSpecies = seenSpeciesRef.current

              const weekEl = document.querySelector<HTMLInputElement>('[data-testid="week-slider"]')
              const week = weekEl ? parseInt(weekEl.value) : 26

              const densityCacheKey = `${activeResolutionRef.current}-${week}-${cellId}`
              const processLifers = (records: { speciesCode: string; comName: string; probability: number; species_id: number }[]) => {
                const idToMeta = new Map<number, SpeciesMeta>()
                if (speciesMetaCache) speciesMetaCache.forEach(s => idToMeta.set(s.species_id, s))

                // Cache raw records for re-processing when toggling show-all-species
                popupCellRecordsRef.current = records

                const hasActiveFilter = speciesFilterIdsRef.current !== null
                let filteredTotal = 0
                const lifers: LiferInCell[] = []
                records.forEach((record) => {
                  if (hasActiveFilter && !speciesFilterIdsRef.current!.has(record.species_id)) return
                  filteredTotal++
                  const seen = currentSeenSpecies.has(record.speciesCode)
                  if (seen) return  // In normal mode, skip seen species
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
                    isRestrictedRange: meta?.isRestrictedRange,
                    isSeen: false
                  })
                })

                lifers.sort((a, b) => b.probability - a.probability)
                const isEstimated = (smoothedMapRef.current.get(cellId) ?? 0) > 0
                // Use cells file count, but fall back to summary species count for cells with data inconsistency
                const totalSpecies = records.length > 0 ? records.length : (cellSpeciesCountsRef.current.get(cellId) ?? 0)
                setLifersPopup({ cellId, coordinates: coords, lifers, totalSpecies, filteredTotal, hasActiveFilter, nChecklists: cellChecklistCountsRef.current.get(cellId), label: cellLabel, estimated: isEstimated })
                setPopupShowAll(false)
                setPopupShowAllSpecies(false)
                console.log(`Lifers popup: cell ${cellId} has ${lifers.length} lifers out of ${totalSpecies} species`)
              }

              const densityCached = cellDataCache.get(densityCacheKey)
              if (densityCached) {
                processLifers(densityCached)
              } else {
                (async () => {
                  if (!speciesByIdCache) await loadSpeciesMetaCache()
                  const { fetchWeekCells, getCellSpecies } = await import('../lib/dataCache')
                  const weekCells = await fetchWeekCells(week, activeResolutionRef.current)
                  const records = getCellSpecies(weekCells, cellId, speciesByIdCache || new Map())
                  cellDataCache.set(densityCacheKey, records)
                  processLifers(records)
                })().catch(err => console.error('Lifers popup: error loading cell data', err))
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

    // Region mask: filter cell values to the selected region using state codes.
    // Uses cell_states.json for precise sub-region/super-region filtering.
    const regionFilter = speciesFilters?.region || null
    // Cell states will be loaded inside each async overlay function below
    const regionMask = (values: Map<number, number>): Map<number, number> =>
      regionMaskFn(values, regionFilter, isCellInRegion)

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
        map.current.setPaintProperty('grid-border', 'line-color', darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
        map.current.setPaintProperty('grid-border', 'line-opacity', hasRegionFilter ? 0 : [
          'interpolate', ['linear'], ['zoom'],
          4, 0, 5.5, 0.15, 7, 0.35, 9, 0.5
        ])
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
        const borderColor = darkMode ? 'rgba(200,200,200,0.3)' : 'rgba(0,0,0,0.25)'
        if (hasRegionFilter) {
          map.current.setPaintProperty('grid-border', 'line-color', borderColor)
          map.current.setPaintProperty('grid-border', 'line-opacity', [
            'case',
            ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,
            ['interpolate', ['linear'], ['zoom'], 4, 0, 5.5, 0.15, 7, 0.35, 9, 0.5]
          ] as maplibregl.ExpressionSpecification)
        } else {
          map.current.setPaintProperty('grid-border', 'line-color', borderColor)
          map.current.setPaintProperty('grid-border', 'line-opacity', [
            'interpolate', ['linear'], ['zoom'],
            4, 0, 5.5, 0.15, 7, 0.35, 9, 0.5
          ])
        }
      }
    }

    if (viewMode === 'species') {
      // Species Range mode: single or multi-species
      if (!selectedSpecies) {
        setSelectedSpeciesMeta(null)
        setNeutralOverlay()
        console.log('Species Range: no species selected')
        return
      }

      // Multi-species compare mode (2-4 species)
      if (selectedSpeciesMulti.length > 1) {
        const renderMultiSpecies = async () => {
          if (!speciesMetaCache) {
            try { await loadSpeciesMetaCache() } catch { return }
          }
          if (cancelled || !speciesMetaCache) return

          // Resolve species metadata for all selected species
          const speciesMetas = selectedSpeciesMulti.map((code) =>
            speciesMetaCache!.find((s) => s.speciesCode === code)
          ).filter(Boolean) as SpeciesMeta[]

          if (speciesMetas.length < 2) return
          setSelectedSpeciesMeta(speciesMetas[0]) // Primary for legend title

          try {
            const { fetchWeekCells, getSpeciesCells } = await import('../lib/dataCache')
            const weekCells = await fetchWeekCells(currentWeek, activeResolution)
            if (cancelled) return

            const { values: cellBitmasks } = computeMultiSpeciesRange(
              weekCells, speciesMetas.map(s => s.species_id), getSpeciesCells
            )
            if (cancelled) return

            const masked = regionMask(cellBitmasks)
            console.log(`Multi-species Range: ${speciesMetas.length} species, ${cellBitmasks.size} cells (${masked.size} in region)`)

            if (masked.size === 0) {
              setNeutralOverlay()
              setLegendMin(0)
              setLegendMax(0)
              return
            }

            // Use raw bitmask as feature-state value (1..maxBitmask)
            // Cells not present get -1 via applyFeatureStates
            applyFeatureStates(masked)
            setLegendMin(1)
            setLegendMax((1 << speciesMetas.length) - 1)

            // Build match expression mapping bitmask -> color
            const bitmaskColors = buildMultiSpeciesBitmaskColors(speciesMetas.length)

            // Build MapLibre match expression
            const matchArgs: (string | number | maplibregl.ExpressionSpecification)[] = []
            for (const [bm, color] of bitmaskColors) {
              matchArgs.push(bm, color)
            }

            const colorExpr = [
              'match',
              ['coalesce', ['feature-state', 'value'], -1],
              ...matchArgs,
              'rgba(0, 0, 0, 0)' // fallback (no data)
            ] as unknown as maplibregl.ExpressionSpecification

            if (map.current?.getLayer('grid-fill')) {
              map.current.setPaintProperty('grid-fill', 'fill-color', colorExpr)
              map.current.setPaintProperty('grid-fill', 'fill-opacity', [
                'case',
                ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,
                ['==', ['feature-state', 'smoothed'], 2], heatmapOpacity * 0.4,
                ['==', ['feature-state', 'smoothed'], 1], heatmapOpacity * 0.6,
                heatmapOpacity
              ])
            }
            if (map.current?.getLayer('grid-border')) {
              const bc = darkMode ? 'rgba(200,200,200,0.3)' : 'rgba(0,0,0,0.25)'
              if (hasRegionFilter) {
                map.current.setPaintProperty('grid-border', 'line-color', bc)
                map.current.setPaintProperty('grid-border', 'line-opacity', [
                  'case',
                  ['==', ['coalesce', ['feature-state', 'value'], -1], -1], 0,
                  ['interpolate', ['linear'], ['zoom'], 4, 0, 6, 0.3, 8, 0.5]
                ] as maplibregl.ExpressionSpecification)
              } else {
                map.current.setPaintProperty('grid-border', 'line-color', bc)
                map.current.setPaintProperty('grid-border', 'line-opacity', [
                  'interpolate', ['linear'], ['zoom'],
                  4, 0, 6, 0.3, 8, 0.5
                ])
              }
            }
          } catch (error) {
            if (!cancelled) console.error('Multi-species Range: error loading data', error)
          }
        }

        renderMultiSpecies()
        return
      }

      // Single species mode
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

          const { values: cellProbabilities } = computeSingleSpeciesRange(weekCells, speciesMeta.species_id, getSpeciesCells)
          if (cancelled) return

          const maskedProbs = regionMask(cellProbabilities)
          console.log(`Species Range: ${selectedSpecies} found in ${cellProbabilities.size} cells (${maskedProbs.size} in region)`)

          const probabilities = Array.from(maskedProbs.values())
          setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
          setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 0)

          if (maskedProbs.size === 0) {
            setNeutralOverlay()
            return
          }

          const rangeTickCount = window.innerWidth < 768 ? 3 : 5
          const { normalized: normalizedRange, boundaries: rangeBounds } = quantileNormalize(maskedProbs, rangeTickCount)
          setQuantileBounds(rangeBounds)
          applyFeatureStates(normalizedRange)
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
          map.current.setPaintProperty('grid-border', 'line-color', darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
          map.current.setPaintProperty('grid-border', 'line-opacity', [
            'interpolate', ['linear'], ['zoom'],
            4, 0, 5.5, 0.15, 7, 0.35, 9, 0.5
          ])
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

          const { values: cellCounts } = computeGoalBirdsProbability(weekCells, goalSpeciesIdSet, getSpeciesBatch)
          if (cancelled) return

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

          const goalTickCount = window.innerWidth < 768 ? 3 : 5
          const { normalized: normalizedCounts, boundaries: goalBounds } = quantileNormalize(maskedCounts, goalTickCount)
          setQuantileBounds(goalBounds)
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
            map.current.setPaintProperty('grid-border', 'line-color', darkMode ? 'rgba(200,200,200,0.3)' : 'rgba(0,0,0,0.25)')
            map.current.setPaintProperty('grid-border', 'line-opacity', [
              'interpolate', ['linear'], ['zoom'],
              4, 0, 6, 0.3, 8, 0.5
            ])
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

          // Build target species set using extracted helper
          const targetIds = buildProbabilityTargetIds(
            weekCells, speciesMetaCache, currentSeenSpecies,
            goalBirdsOnlyFilter, goalSpeciesIdSetRef.current, goalSpeciesCodes,
            speciesFilterIdsRef.current
          )

          const { values: cellProbabilities } = computeProbabilityOverlay(weekCells, targetIds, computeCombinedProbability)
          if (cancelled) return

          const maskedProbs = regionMask(cellProbabilities)
          console.log(`Combined probability overlay: ${cellProbabilities.size} cells → ${maskedProbs.size} in region`)
          const probabilities = Array.from(maskedProbs.values())
          setLegendMin(probabilities.length > 0 ? safeMin(probabilities) : 0)
          setLegendMax(probabilities.length > 0 ? safeMax(probabilities) : 1)

          if (maskedProbs.size === 0) { setNeutralOverlay(); return }
          const probTickCount = window.innerWidth < 768 ? 3 : 5
          const { normalized: normalizedProbs, boundaries: probBounds } = quantileNormalize(maskedProbs, probTickCount)
          setQuantileBounds(probBounds)
          applyFeatureStates(normalizedProbs)
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
          map.current.setPaintProperty('grid-border', 'line-color', darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)')
          map.current.setPaintProperty('grid-border', 'line-opacity', [
            'interpolate', ['linear'], ['zoom'],
            4, 0, 5.5, 0.15, 7, 0.35, 9, 0.5
          ])
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

          const { values: cellCounts } = computeGoalBirdsProbability(weekCells, goalSpeciesIdSet, getSpeciesBatch)
          if (cancelled) return

          const maskedCounts = regionMask(cellCounts)
          const maskedVals = Array.from(maskedCounts.values()).filter(c => c > 0)
          const maskedMax = maskedVals.length > 0 ? safeMax(maskedVals) : 0
          console.log(`Goal Birds Only density: ${cellCounts.size} cells → ${maskedCounts.size} in region, max=${maskedMax}`)
          setLegendMin(maskedVals.length > 0 ? safeMin(maskedVals) : 0)
          setLegendMax(maskedMax)

          if (maskedMax === 0) { setNeutralOverlay(); return }
          const gdTickCount = window.innerWidth < 768 ? 3 : 5
          const { normalized: normalizedCounts, boundaries: gdBounds } = quantileNormalize(maskedCounts, gdTickCount)
          setQuantileBounds(gdBounds)
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
        // Ensure cell_states loaded for state-code-based region masking
        if (regionFilter) await loadCellStates(activeResolution)

        let cellLiferCounts: Map<number, number>

        const hasSpeciesFilter = speciesFilterIdsRef.current !== null
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

            // Use expected lifers computation when that metric is selected
            if (liferMetric === 'expected') {
              const { computeExpectedLifers } = await import('../lib/overlayRenderers')
              const result = computeExpectedLifers(
                weekCells, speciesMetaCache, seenSpecies, showTotalRichness,
                speciesFilterIdsRef.current
              )
              cellLiferCounts = result.values
              console.log(`Expected lifers: cells=${cellLiferCounts.size}/${weekCells.size}`)
            } else {
              const result = computeDensityFromLiferSummary(
                weekCells, speciesMetaCache, seenSpecies, showTotalRichness,
                speciesFilterIdsRef.current, computeLiferSummary
              )
              cellLiferCounts = result.values
              console.log(`Density lifer: liferCells=${cellLiferCounts.size}/${weekCells.size}`)
            }
          } catch (error) {
            if (!cancelled) console.error('Lifer summary: error loading data', error)
            // Do NOT fall back to weeklySummary — that shows total species
            // (not lifers), causing cells with 0 lifers to appear colored.
            // Better to show nothing than misleading data.
            return
          }
        } else {
          // No life list or showTotalRichness — use pre-computed summary (total species per cell)
          cellLiferCounts = computeDensityFromSummary(weeklySummary).values
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
        const maskedCounts = applyLiferCountRangeFilter(regionCellCounts, liferCountRange[0], liferCountRange[1])

        let filteredMax = 0
        let filteredMin = Infinity
        maskedCounts.forEach((v) => {
          if (v > filteredMax) filteredMax = v
          if (v < filteredMin) filteredMin = v
        })
        if (maskedCounts.size === 0) filteredMin = 0

        setLegendMin(filteredMin)
        setLegendMax(filteredMax)

        const tickCount = window.innerWidth < 768 ? 3 : 5
        const { normalized: normalizedCounts, boundaries } = quantileNormalize(maskedCounts, tickCount)
        setQuantileBounds(boundaries)
        applyFeatureStates(normalizedCounts)
        if (normalizedCounts.size > 0) {
          setHeatOverlay()
        } else {
          setNeutralOverlay()
        }

        // DEBUG: verify feature states were actually applied
        if (map.current) {
          let staleCount = 0
          for (const cellId of allCellIdsRef.current) {
            try {
              const state = map.current.getFeatureState({ source: 'grid', id: cellId })
              if (!state || state.value === undefined) staleCount++
            } catch { /* tile not loaded */ }
          }
          if (staleCount > 0) {
            console.warn(`Density: ${staleCount} cells have no feature state (tiles not loaded yet)`)
          }
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
  }, [weeklySummary, weeklyData, currentWeek, viewMode, liferMetric, goalBirdsOnlyFilter, goalSpeciesCodes, seenSpecies, goalSpeciesIdSetVersion, selectedSpecies, selectedSpeciesMulti, heatmapOpacity, gridReady, liferCountRange, activeResolution, gridVersion, showTotalRichness, speciesFilters])

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
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--color-brand)] border-t-transparent"></div>
            <span className="text-sm text-gray-700">Loading week data...</span>
          </div>
        </div>
      )}
      {/* ── Unified gradient legend bar ── */}
      {(() => {
        // Multi-species custom legend
        const isMultiSpecies = viewMode === 'species' && selectedSpeciesMulti.length > 1
        if (isMultiSpecies) {
          const MULTI_COLORS = ['#4A90D9', '#E74C3C', '#27AE60', '#8E44AD']
          return (
            <div
              data-testid="map-legend"
              className="map-legend absolute left-3 backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 px-3.5 py-2.5"
            >
              <div className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2 tracking-tight">Species Comparison</div>
              <div className="space-y-1">
                {selectedSpeciesMulti.map((code, idx) => {
                  const meta = speciesMetaCache?.find((s) => s.speciesCode === code)
                  return (
                    <div key={code} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: MULTI_COLORS[idx] || '#666' }}
                      />
                      <span className="text-xs lg:text-xs text-gray-700 dark:text-gray-300 truncate">{meta?.comName || code}</span>
                    </div>
                  )
                })}
                <div className="flex items-center gap-1.5 pt-0.5 border-t border-gray-200/50 dark:border-gray-600/50">
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: '#FFD700' }}
                  />
                  <span className="text-xs lg:text-xs text-gray-700 dark:text-gray-300">All species overlap</span>
                </div>
              </div>
            </div>
          )
        }

        // Determine legend config based on current view mode
        let legendTitle = ''
        let gradient = 'linear-gradient(to right, #440154, #482878, #3E4A89, #31688E, #26838F, #1F9D8A, #6CCE59, #B5DE2B, #FDE725, #FCA50A, #E23028)'
        let showLegend = false
        let isPercentage = false
        let emptyMessage = ''

        if (viewMode === 'goal-birds') {
          legendTitle = 'Goal Bird Chance'
          isPercentage = true
          gradient = 'linear-gradient(to right, #FFF3C4, #FBBF24, #D97706, #B45309, #92400E)'
          showLegend = true
          emptyMessage = goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
        } else if (viewMode === 'density' && !goalBirdsOnlyFilter) {
          legendTitle = liferMetric === 'expected' ? 'Expected Lifers'
            : seenSpecies.size > 0 ? 'Lifer Count' : 'Species Count'
          showLegend = true
        } else if (viewMode === 'species' && selectedSpecies) {
          legendTitle = selectedSpeciesMeta ? selectedSpeciesMeta.comName : 'Species Range'
          isPercentage = true
          showLegend = true
        } else if (viewMode === 'probability') {
          legendTitle = seenSpecies.size > 0
            ? (goalBirdsOnlyFilter ? 'Goal Lifer Chance' : 'Lifer Chance')
            : 'Lifer Chance'
          isPercentage = true
          showLegend = true
          emptyMessage = goalBirdsOnlyFilter && goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
        } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
          legendTitle = 'Goal Birds Only'
          showLegend = true
          emptyMessage = goalSpeciesCodes.size === 0 ? 'Add goal birds in the Goal Birds tab' : ''
        }

        if (!showLegend) return null

        const tickCount = window.innerWidth < 768 ? 3 : 5
        // Use quantile boundary ticks when available, otherwise linear
        const ticks = quantileBounds && quantileBounds.length === tickCount
          ? getQuantileTicks(quantileBounds, isPercentage)
          : getLegendTicks(legendMin, legendMax, isPercentage, tickCount)
        return (
          <div
            data-testid="map-legend"
            className="map-legend absolute left-3 backdrop-blur-xl bg-white/85 dark:bg-gray-900/85 rounded-lg md:rounded-xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 px-2 py-1.5 md:px-3.5 md:py-2.5"
          >
            <div className="text-xs md:text-xs font-bold text-gray-800 dark:text-gray-200 mb-1 md:mb-2 tracking-tight">{legendTitle}</div>
            <div
              className="h-2.5 md:h-3 rounded-full shadow-inner"
              style={{ background: gradient }}
            />
            <div className="flex justify-between mt-1 md:mt-1.5">
              {ticks.map((tick, i) => (
                <span key={i} className="text-xs lg:text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{tick}</span>
              ))}
            </div>
            {emptyMessage && (
              <div className="text-xs lg:text-xs text-amber-600 dark:text-amber-400 mt-1 md:mt-1.5 font-medium">{emptyMessage}</div>
            )}
          </div>
        )
      })()}

      {/* Goal Birds click-to-inspect popup */}
      {viewMode === 'goal-birds' && goalBirdsPopup && (
        <GoalBirdsPopupComponent
          popup={goalBirdsPopup}
          notableBirds={notableBirds}
          speciesByIdCache={speciesByIdCache}
          onClose={() => setGoalBirdsPopup(null)}
          onSpeciesCardOpen={(species) => setPopupSpeciesCard(species)}
          onRegionContextChange={(ctx) => setPopupRegionContext(ctx)}
        />
      )}

      {/* Lifer density / range click-to-inspect popup */}
      {(viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && lifersPopup && (
        <LifersPopupComponent
          popup={lifersPopup}
          notableBirds={notableBirds}
          speciesByIdCache={speciesByIdCache}
          seenSpecies={seenSpecies}
          popupShowAll={popupShowAll}
          popupShowAllSpecies={popupShowAllSpecies}
          popupCovariates={popupCovariates}
          popupGoalLists={popupGoalLists}
          popupGoalAddFeedback={popupGoalAddFeedback}
          onClose={() => setLifersPopup(null)}
          onSpeciesCardOpen={(species) => setPopupSpeciesCard(species)}
          onRegionContextChange={(ctx) => setPopupRegionContext(ctx)}
          onShowAllToggle={() => setPopupShowAll(true)}
          onShowAllSpeciesToggle={() => setPopupShowAllSpecies(prev => !prev)}
          onNotableAddToGoal={handleNotableAddToGoal}
          onHabitatFilter={(habitat) => {
            setSpeciesFilters({ ...(speciesFilters || {}), habitat })
          }}
        />
      )}

      {/* Species Info Card from popup click */}
      {popupSpeciesCard && (
        <SpeciesInfoCard
          species={popupSpeciesCard}
          onClose={() => { setPopupSpeciesCard(null); setPopupRegionContext(null) }}
          currentWeek={currentWeek}
          onWeekChange={setCurrentWeek}
          regionContext={popupRegionContext ?? undefined}
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
