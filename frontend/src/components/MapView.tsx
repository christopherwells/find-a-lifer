import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

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
}

interface OccurrenceRecord {
  cell_id: number
  species_id: number
  probability: number
}

interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
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
  conservStatus?: string
  difficultyLabel?: string
  isRestrictedRange?: boolean
}

/**
 * Generate a rainbow gradient color based on a normalized value (0 to 1)
 * Rainbow spectrum: red → orange → yellow → green → blue → indigo → violet
 * Returns an RGBA string with the given alpha value
 */
function getRainbowColor(normalizedValue: number, alpha: number = 0.8): string {
  // Clamp value between 0 and 1
  const t = Math.max(0, Math.min(1, normalizedValue))

  // Define rainbow color stops (RGB values)
  const colorStops = [
    { r: 255, g: 0, b: 0 },     // Red
    { r: 255, g: 127, b: 0 },   // Orange
    { r: 255, g: 255, b: 0 },   // Yellow
    { r: 0, g: 255, b: 0 },     // Green
    { r: 0, g: 0, b: 255 },     // Blue
    { r: 75, g: 0, b: 130 },    // Indigo
    { r: 148, g: 0, b: 211 }    // Violet
  ]

  // Calculate which two color stops to interpolate between
  const scaledValue = t * (colorStops.length - 1)
  const lowerIndex = Math.floor(scaledValue)
  const upperIndex = Math.ceil(scaledValue)
  const fraction = scaledValue - lowerIndex

  // Interpolate between the two color stops
  const lowerColor = colorStops[lowerIndex]
  const upperColor = colorStops[upperIndex]

  const r = Math.round(lowerColor.r + (upperColor.r - lowerColor.r) * fraction)
  const g = Math.round(lowerColor.g + (upperColor.g - lowerColor.g) * fraction)
  const b = Math.round(lowerColor.b + (upperColor.b - lowerColor.b) * fraction)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface LifersPopup {
  cellId: number
  coordinates: [number, number]
  lifers: LiferInCell[]
}

// Module-level cache for species metadata (to avoid re-fetching)
let speciesMetaCache: SpeciesMeta[] | null = null

// Helper function to generate legend tick labels
function getLegendTicks(min: number, max: number, isPercentage: boolean, numTicks: number = 3): string[] {
  if (max === 0) return ['0', '0', '0']

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

export default function MapView({
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
  selectedLocation = null
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [weeklyData, setWeeklyData] = useState<OccurrenceRecord[]>([])
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)
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
  // Refs for latest values accessible inside map click handler
  const viewModeRef = useRef(viewMode)
  const weeklyDataRef = useRef(weeklyData)
  const goalSpeciesCodesRef = useRef(goalSpeciesCodes)
  const seenSpeciesRef = useRef(seenSpecies)
  const selectedSpeciesRef = useRef(selectedSpecies)

  // Keep refs updated with latest values for use in map event handlers
  useEffect(() => { viewModeRef.current = viewMode }, [viewMode])
  useEffect(() => { weeklyDataRef.current = weeklyData }, [weeklyData])
  useEffect(() => { goalSpeciesCodesRef.current = goalSpeciesCodes }, [goalSpeciesCodes])
  useEffect(() => { seenSpeciesRef.current = seenSpecies }, [seenSpecies])
  useEffect(() => { selectedSpeciesRef.current = selectedSpecies }, [selectedSpecies])

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
    const loadSpeciesMetadata = async () => {
      if (speciesMetaCache) return // Already loaded
      try {
        const response = await fetch('/api/species')
        if (!response.ok) {
          console.error('MapView: failed to fetch species metadata')
          return
        }
        const data: SpeciesMeta[] = await response.json()
        speciesMetaCache = data
        console.log(`MapView: cached ${data.length} species metadata entries`)
      } catch (err) {
        console.error('MapView: error fetching species metadata', err)
      }
    }
    loadSpeciesMetadata()
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
          const response = await fetch('/api/species')
          if (!response.ok) {
            console.error('MapView: failed to fetch species metadata')
            return
          }
          const data: SpeciesMeta[] = await response.json()
          speciesMetaCache = data
          console.log(`MapView: cached ${data.length} species metadata entries`)
        } catch (err) {
          console.error('MapView: error fetching species metadata', err)
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

  // Load weekly occurrence data when currentWeek changes
  useEffect(() => {
    const loadWeekData = async () => {
      setIsLoadingWeek(true)
      try {
        const response = await fetch(`/api/weeks/${currentWeek}`)
        if (!response.ok) {
          console.error(`Failed to load week ${currentWeek} data:`, response.statusText)
          return
        }
        const data: OccurrenceRecord[] = await response.json()
        setWeeklyData(data)
        console.log(`Loaded week ${currentWeek} data:`, {
          recordCount: data.length,
          sample: data.slice(0, 3),
        })
      } catch (error) {
        console.error(`Error loading week ${currentWeek} data:`, error)
      } finally {
        setIsLoadingWeek(false)
      }
    }

    loadWeekData()
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
        // Fetch grid GeoJSON from API
        const response = await fetch('/api/grid')
        if (!response.ok) {
          console.error('Failed to load grid data:', response.statusText)
          return
        }
        const gridData = await response.json()

        // Add grid data as a source
        map.current.addSource('grid', {
          type: 'geojson',
          data: gridData,
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

        // Add grid cell border layer
        map.current.addLayer({
          id: 'grid-border',
          type: 'line',
          source: 'grid',
          paint: {
            'line-color': '#088',
            'line-width': 1,
            'line-opacity': 0.5,
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
              // Goal Birds mode: show inspect popup for this cell
              const currentWeeklyData = weeklyDataRef.current
              const currentGoalCodes = goalSpeciesCodesRef.current
              const currentSeenSpecies = seenSpeciesRef.current

              if (!speciesMetaCache) {
                console.warn('MapView: species metadata not yet loaded for popup')
                return
              }

              // Find all goal species records for this cell
              const cellRecords = currentWeeklyData.filter(
                (r) => r.cell_id === cellId && r.probability > 0
              )

              // Map species_id to speciesMeta for quick lookup
              const idToMeta = new Map<number, SpeciesMeta>()
              speciesMetaCache.forEach((s) => idToMeta.set(s.species_id, s))

              // Build goal birds list for this cell
              const goalBirds: GoalBirdInCell[] = []
              cellRecords.forEach((record) => {
                const meta = idToMeta.get(record.species_id)
                if (!meta) return
                if (!currentGoalCodes.has(meta.speciesCode)) return
                goalBirds.push({
                  speciesCode: meta.speciesCode,
                  comName: meta.comName,
                  sciName: meta.sciName,
                  probability: record.probability,
                  isSeen: currentSeenSpecies.has(meta.speciesCode),
                  conservStatus: meta.conservStatus,
                  difficultyLabel: meta.difficultyLabel,
                  isRestrictedRange: meta.isRestrictedRange
                })
              })

              // Sort by probability descending (highest probability first)
              goalBirds.sort((a, b) => b.probability - a.probability)

              setGoalBirdsPopup({
                cellId,
                coordinates: coords,
                birds: goalBirds
              })
              console.log(`Goal Birds popup: cell ${cellId} has ${goalBirds.length} goal birds`)
            } else if (viewModeRef.current === 'density') {
              // Density mode: show lifers (unseen species) in this cell
              const currentWeeklyData = weeklyDataRef.current
              const currentSeenSpecies = seenSpeciesRef.current

              if (!speciesMetaCache) {
                console.warn('MapView: species metadata not yet loaded for popup')
                return
              }

              // Find all species records for this cell
              const cellRecords = currentWeeklyData.filter(
                (r) => r.cell_id === cellId && r.probability > 0
              )

              // Map species_id to speciesMeta for quick lookup
              const idToMeta = new Map<number, SpeciesMeta>()
              speciesMetaCache.forEach((s) => idToMeta.set(s.species_id, s))

              // Build lifers list for this cell (unseen species only)
              const lifers: LiferInCell[] = []
              cellRecords.forEach((record) => {
                const meta = idToMeta.get(record.species_id)
                if (!meta) return
                // Only include unseen species
                if (currentSeenSpecies.has(meta.speciesCode)) return
                lifers.push({
                  speciesCode: meta.speciesCode,
                  comName: meta.comName,
                  sciName: meta.sciName,
                  probability: record.probability,
                  conservStatus: meta.conservStatus,
                  difficultyLabel: meta.difficultyLabel,
                  isRestrictedRange: meta.isRestrictedRange
                })
              })

              // Sort by probability descending (highest probability first)
              lifers.sort((a, b) => b.probability - a.probability)

              setLifersPopup({
                cellId,
                coordinates: coords,
                lifers
              })
              console.log(`Lifers popup: cell ${cellId} has ${lifers.length} lifers`)
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
          featureCount: gridData.features?.length || 0,
        })
      } catch (error) {
        console.error('Error loading grid data:', error)
      }
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [darkMode])

  // Update map overlay when weekly data, view mode, or goal species changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return
    if (weeklyData.length === 0) return

    if (viewMode === 'species') {
      // Species Range mode: highlight cells where the selected species occurs
      if (!selectedSpecies) {
        // No species selected: show faint neutral overlay
        setSelectedSpeciesMeta(null)
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
        }
        console.log('Species Range: no species selected')
        return
      }

      // Look up species_id from cache (may need to load first)
      const lookupAndRender = async () => {
        if (!speciesMetaCache) {
          try {
            const response = await fetch('/api/species')
            if (!response.ok) return
            const data: SpeciesMeta[] = await response.json()
            speciesMetaCache = data
          } catch { return }
        }
        const speciesMeta = speciesMetaCache.find((s) => s.speciesCode === selectedSpecies)
        if (!speciesMeta) {
          console.warn(`Species Range: species ${selectedSpecies} not found in metadata`)
          setSelectedSpeciesMeta(null)
          return
        }
        const speciesId = speciesMeta.species_id
        // Update state for legend display
        setSelectedSpeciesMeta(speciesMeta)

        // Find all cells with this species (probability > 0)
        const cellProbabilities = new Map<number, number>()
        weeklyData.forEach((record) => {
          if (record.species_id === speciesId && record.probability > 0) {
            cellProbabilities.set(record.cell_id, record.probability)
          }
        })

        console.log(`Species Range: ${selectedSpecies} (id=${speciesId}) found in ${cellProbabilities.size} cells this week`)

        // Calculate min/max probabilities for legend
        const probabilities = Array.from(cellProbabilities.values())
        const minProb = probabilities.length > 0 ? Math.min(...probabilities) : 0
        const maxProb = probabilities.length > 0 ? Math.max(...probabilities) : 0
        setLegendMin(minProb)
        setLegendMax(maxProb)

        if (cellProbabilities.size === 0) {
          // Species not present anywhere this week
          if (map.current && map.current.getLayer('grid-fill')) {
            map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
            map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
          }
          if (map.current && map.current.getLayer('grid-border')) {
            map.current.setPaintProperty('grid-border', 'line-color', '#999')
            map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
          }
          return
        }

        // Build paint expression: blue intensity scaled by probability
        const paintExpression: any = ['case']

        cellProbabilities.forEach((prob, cellId) => {
          // Use probability directly as normalized value (already 0-1)
          const color = getRainbowColor(prob, 1.0)
          paintExpression.push(['==', ['get', 'cell_id'], cellId])
          paintExpression.push(color)
        })

        // Default: species not present in this cell (light gray)
        paintExpression.push('rgba(200, 200, 200, 0.1)')

        if (map.current && map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current && map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#666')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
        }
      }

      lookupAndRender()
      return
    } else if (viewMode === 'goal-birds') {
      // Goal Birds mode: count unseen goal species per cell (amber/gold heatmap)
      if (goalSpeciesCodes.size === 0) {
        // No goal species defined: show empty overlay
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds: no goal species defined in any list')
        return
      }

      const goalSpeciesIdSet = goalSpeciesIdSetRef.current

      // Count unseen goal species present in each cell (probability > 0)
      const cellCounts = new Map<number, number>()
      let maxCount = 0

      weeklyData.forEach((record) => {
        if (record.probability > 0 && goalSpeciesIdSet.has(record.species_id)) {
          const prev = cellCounts.get(record.cell_id) || 0
          const next = prev + 1
          cellCounts.set(record.cell_id, next)
          if (next > maxCount) maxCount = next
        }
      })

      console.log(`Goal Birds overlay: ${cellCounts.size} cells with goal birds, max=${maxCount}, unseen goal species=${goalSpeciesIdSet.size}`)

      // Calculate min/max for legend
      const counts = Array.from(cellCounts.values()).filter(c => c > 0)
      const minCount = counts.length > 0 ? Math.min(...counts) : 0
      setLegendMin(minCount)
      setLegendMax(maxCount)

      if (maxCount === 0) {
        // No goal birds present anywhere this week
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        return
      }

      // Build paint expression: amber/gold color scaled by goal bird count
      const paintExpression: any = ['case']

      cellCounts.forEach((count, cellId) => {
        if (count === 0) return
        // Scale from 0.1 (1 goal bird) to 0.85 (max goal birds)
        const intensity = Math.min(0.85, (count / maxCount) * 0.75 + 0.1)
        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(`rgba(212, 160, 23, ${intensity.toFixed(3)})`)
      })

      // Default: no goal birds in this cell — very faint
      paintExpression.push('rgba(212, 160, 23, 0.02)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#666')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
      }
    } else if (viewMode === 'probability') {
      // Probability mode: show max occurrence probability per cell
      // When goalBirdsOnlyFilter is active, only consider goal species
      const goalSpeciesIdSet = goalSpeciesIdSetRef.current
      const useGoalFilter = goalBirdsOnlyFilter && goalSpeciesCodes.size > 0

      // Compute max probability per cell (across all or goal species)
      const cellMaxProbability = new Map<number, number>()

      weeklyData.forEach((record) => {
        if (record.probability <= 0) return
        // When filter active, skip non-goal species
        if (useGoalFilter && !goalSpeciesIdSet.has(record.species_id)) return

        const existing = cellMaxProbability.get(record.cell_id) || 0
        if (record.probability > existing) {
          cellMaxProbability.set(record.cell_id, record.probability)
        }
      })

      console.log(`Probability overlay: ${cellMaxProbability.size} cells, goal filter=${useGoalFilter}, goal species=${goalSpeciesIdSet.size}`)

      // Calculate min/max probabilities for legend
      const probabilities = Array.from(cellMaxProbability.values())
      const minProb = probabilities.length > 0 ? Math.min(...probabilities) : 0
      const maxProb = probabilities.length > 0 ? Math.max(...probabilities) : 1
      setLegendMin(minProb)
      setLegendMax(maxProb)

      if (cellMaxProbability.size === 0) {
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
        }
        return
      }

      // Build paint expression: purple/violet color scaled by max probability
      const paintExpression: any = ['case']

      cellMaxProbability.forEach((maxProb, cellId) => {
        // Use max probability directly as normalized value (already 0-1)
        const color = getRainbowColor(maxProb, 1.0)
        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(color)
      })

      // Default: no occurrence data in this cell (light gray)
      paintExpression.push('rgba(200, 200, 200, 0.1)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#666')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
      }
    } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
      // Density mode with Goal Birds Only filter: count unseen goal species per cell (teal)
      if (goalSpeciesCodes.size === 0) {
        // No goal species defined: show very faint overlay
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        console.log('Goal Birds Only filter: no goal species defined')
        return
      }

      const goalSpeciesIdSet = goalSpeciesIdSetRef.current

      // Count unseen goal species present in each cell (probability > 0)
      const cellCounts = new Map<number, number>()
      let maxCount = 0

      weeklyData.forEach((record) => {
        if (record.probability > 0 && goalSpeciesIdSet.has(record.species_id)) {
          const prev = cellCounts.get(record.cell_id) || 0
          const next = prev + 1
          cellCounts.set(record.cell_id, next)
          if (next > maxCount) maxCount = next
        }
      })

      console.log(`Goal Birds Only density: ${cellCounts.size} cells with goal birds, max=${maxCount}, unseen goal species=${goalSpeciesIdSet.size}`)

      // Calculate min/max for legend
      const counts = Array.from(cellCounts.values()).filter(c => c > 0)
      const minCount = counts.length > 0 ? Math.min(...counts) : 0
      setLegendMin(minCount)
      setLegendMax(maxCount)

      if (maxCount === 0) {
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(200, 200, 200, 0.1)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#999')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        return
      }

      // Build paint expression: rainbow gradient scaled by goal bird count
      const paintExpression: any = ['case']

      cellCounts.forEach((count, cellId) => {
        if (count === 0) return
        // Calculate normalized value based on goal bird count
        const normalizedValue = count / maxCount
        const color = getRainbowColor(normalizedValue, 1.0)
        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(color)
      })

      // Default: no goal birds in this cell (light gray)
      paintExpression.push('rgba(200, 200, 200, 0.1)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#666')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
      }
    } else {
      // Default density mode: lifer density heatmap based on number of UNSEEN species
      // Build seenSpeciesIdSet from seenSpecies codes
      const seenSpeciesIdSet = new Set<number>()
      if (seenSpecies.size > 0 && speciesMetaCache) {
        speciesMetaCache.forEach((s) => {
          if (seenSpecies.has(s.speciesCode)) {
            seenSpeciesIdSet.add(s.species_id)
          }
        })
      }

      // Count number of unseen species per cell
      const cellLiferCounts = new Map<number, number>()

      weeklyData.forEach((record) => {
        // Skip species that have been seen
        if (seenSpeciesIdSet.has(record.species_id)) return
        if (record.probability <= 0) return

        const current = cellLiferCounts.get(record.cell_id) || 0
        cellLiferCounts.set(record.cell_id, current + 1)
      })

      const maxLifers = Math.max(...Array.from(cellLiferCounts.values()), 0)
      const minLifers = cellLiferCounts.size > 0 ? Math.min(...Array.from(cellLiferCounts.values())) : 0

      // Update legend data range
      setLegendMin(minLifers)
      setLegendMax(maxLifers)

      const paintExpression: any = ['case']

      cellLiferCounts.forEach((liferCount, cellId) => {
        // Calculate normalized value (0 to 1) based on lifer count
        const normalizedValue = liferCount / maxLifers
        // Get rainbow color with full opacity (alpha controlled by heatmapOpacity prop)
        const color = getRainbowColor(normalizedValue, 1.0)

        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(color)
      })

      // Default: cells with zero lifers or all species seen (light gray)
      paintExpression.push('rgba(200, 200, 200, 0.1)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', heatmapOpacity)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#666')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.4)
      }
      console.log(`Updated density overlay with ${cellLiferCounts.size} cells, max lifers=${maxLifers}, seen species=${seenSpeciesIdSet.size}`)
    }
  }, [weeklyData, viewMode, goalBirdsOnlyFilter, goalSpeciesCodes, seenSpecies, goalSpeciesIdSetVersion, selectedSpecies, heatmapOpacity])

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
      {viewMode === 'goal-birds' && (
        <div
          data-testid="goal-birds-legend"
          className="absolute bottom-12 left-4 bg-white bg-opacity-90 rounded-lg shadow-md border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-[#2C3E50]">🎯 Goal Birds Density</div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {(() => {
              const ticks = getLegendTicks(legendMin, legendMax, false, 5)
              return (
                <>
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                  <span>{ticks[0]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <span>{ticks[1]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <span>{ticks[2]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <span>{ticks[3]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(148, 0, 211)' }}></div>
                  <span>{ticks[4]}</span>
                </>
              )
            })()}
          </div>
          <div className="text-xs text-gray-400 mt-1">Goal birds per cell</div>
          {goalSpeciesCodes.size === 0 && (
            <div className="text-xs text-amber-600 mt-1">
              Add goal birds in the Goal Birds tab
            </div>
          )}
        </div>
      )}

      {/* Standard Lifer Density legend */}
      {viewMode === 'density' && !goalBirdsOnlyFilter && (
        <div
          data-testid="lifer-density-legend"
          className="absolute bottom-12 left-4 bg-white bg-opacity-90 rounded-lg shadow-md border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-[#2C3E50]">🔭 Lifer Density</div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {(() => {
              const ticks = getLegendTicks(legendMin, legendMax, false, 5)
              return (
                <>
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                  <span>{ticks[0]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <span>{ticks[1]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <span>{ticks[2]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <span>{ticks[3]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(148, 0, 211)' }}></div>
                  <span>{ticks[4]}</span>
                </>
              )
            })()}
          </div>
          <div className="text-xs text-gray-400 mt-1">Unseen species per area</div>
        </div>
      )}

      {/* Species Range legend */}
      {viewMode === 'species' && selectedSpecies && (
        <div
          data-testid="species-range-legend"
          className="absolute bottom-12 left-4 bg-white bg-opacity-90 rounded-lg shadow-md border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-[#2C3E50]">🐦 Species Range</div>
          </div>
          {selectedSpeciesMeta && (
            <div className="text-sm font-medium text-[#2C3E7B] mb-1">
              {selectedSpeciesMeta.comName}
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {(() => {
              const ticks = getLegendTicks(legendMin, legendMax, true, 5)
              return (
                <>
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                  <span>{ticks[0]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <span>{ticks[1]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <span>{ticks[2]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <span>{ticks[3]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(148, 0, 211)' }}></div>
                  <span>{ticks[4]}</span>
                </>
              )
            })()}
          </div>
          <div className="text-xs text-gray-400 mt-1">Occurrence probability</div>
        </div>
      )}

      {/* Probability view legend */}
      {viewMode === 'probability' && (
        <div
          data-testid="probability-legend"
          className="absolute bottom-12 left-4 bg-white bg-opacity-90 rounded-lg shadow-md border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-[#2C3E50]">
              {goalBirdsOnlyFilter ? '🎯 Goal Birds Probability' : '📊 Occurrence Probability'}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {(() => {
              const ticks = getLegendTicks(legendMin, legendMax, true, 5)
              return (
                <>
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                  <span>{ticks[0]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <span>{ticks[1]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <span>{ticks[2]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <span>{ticks[3]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(148, 0, 211)' }}></div>
                  <span>{ticks[4]}</span>
                </>
              )
            })()}
          </div>
          {goalBirdsOnlyFilter && goalSpeciesCodes.size === 0 && (
            <div className="text-xs text-purple-600 mt-1">
              Add goal birds in the Goal Birds tab
            </div>
          )}
        </div>
      )}

      {/* Goal Birds Only filter legend in density mode */}
      {viewMode === 'density' && goalBirdsOnlyFilter && (
        <div
          data-testid="goal-birds-only-density-legend"
          className="absolute bottom-12 left-4 bg-white bg-opacity-90 rounded-lg shadow-md border border-gray-200 px-3 py-2"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="text-xs font-semibold text-[#2C3E50]">🎯 Goal Birds Only</div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-600">
            {(() => {
              const ticks = getLegendTicks(legendMin, legendMax, false, 5)
              return (
                <>
                  <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgb(255, 0, 0)' }}></div>
                  <span>{ticks[0]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(255, 255, 0)' }}></div>
                  <span>{ticks[1]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 255, 0)' }}></div>
                  <span>{ticks[2]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(0, 0, 255)' }}></div>
                  <span>{ticks[3]}</span>
                  <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgb(148, 0, 211)' }}></div>
                  <span>{ticks[4]}</span>
                </>
              )
            })()}
          </div>
          {goalSpeciesCodes.size === 0 && (
            <div className="text-xs text-teal-600 mt-1">
              Add goal birds in the Goal Birds tab
            </div>
          )}
        </div>
      )}

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
                      <div className="text-xs font-medium text-amber-700">
                        {(bird.probability * 100).toFixed(1)}%
                      </div>
                      {bird.isSeen && (
                        <span className="text-xs text-green-600 font-medium ml-1" title="Already seen">✓</span>
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
              Click another cell to update · Sorted by probability
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
              <ul className="divide-y divide-gray-100">
                {lifersPopup.lifers.map((lifer) => (
                  <li
                    key={lifer.speciesCode}
                    data-testid={`lifer-item-${lifer.speciesCode}`}
                    className="px-3 py-2 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="text-sm font-medium text-gray-800">
                        {lifer.comName}
                      </div>
                      <div className="text-xs text-gray-500 italic">
                        {lifer.sciName}
                      </div>
                      {/* Badges */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {/* Conservation status badge */}
                        {lifer.conservStatus && lifer.conservStatus !== 'Unknown' && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              lifer.conservStatus === 'Least Concern'
                                ? 'bg-green-100 text-green-800'
                                : lifer.conservStatus === 'Near Threatened'
                                ? 'bg-yellow-100 text-yellow-800'
                                : lifer.conservStatus === 'Vulnerable'
                                ? 'bg-orange-100 text-orange-800'
                                : lifer.conservStatus === 'Endangered'
                                ? 'bg-red-100 text-red-800'
                                : lifer.conservStatus === 'Critically Endangered'
                                ? 'bg-red-200 text-red-900'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            data-testid={`popup-conservation-badge-${lifer.speciesCode}`}
                          >
                            🌿
                          </span>
                        )}
                        {/* Difficulty badge */}
                        {lifer.difficultyLabel && (
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              lifer.difficultyLabel === 'Easy'
                                ? 'bg-green-100 text-green-800'
                                : lifer.difficultyLabel === 'Moderate'
                                ? 'bg-yellow-100 text-yellow-800'
                                : lifer.difficultyLabel === 'Hard'
                                ? 'bg-orange-100 text-orange-800'
                                : lifer.difficultyLabel === 'Very Hard'
                                ? 'bg-red-100 text-red-800'
                                : lifer.difficultyLabel === 'Extremely Hard'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                            data-testid={`popup-difficulty-badge-${lifer.speciesCode}`}
                          >
                            🔭
                          </span>
                        )}
                        {/* Restricted range badge */}
                        {lifer.isRestrictedRange && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                            data-testid={`popup-restricted-badge-${lifer.speciesCode}`}
                          >
                            📍
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <div className="text-xs font-medium text-teal-700">
                        {(lifer.probability * 100).toFixed(1)}%
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
            <p className="text-xs text-gray-400 text-center">
              Click another cell to update · Sorted by probability
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
