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
}

interface GoalBirdInCell {
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  isSeen: boolean
}

interface GoalBirdsPopup {
  cellId: number
  coordinates: [number, number]
  birds: GoalBirdInCell[]
}

// Module-level cache for species metadata (to avoid re-fetching)
let speciesMetaCache: SpeciesMeta[] | null = null

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
  selectedRegion = null
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
  // Species metadata for the selected species (used in legend)
  const [selectedSpeciesMeta, setSelectedSpeciesMeta] = useState<SpeciesMeta | null>(null)
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
                  isSeen: currentSeenSpecies.has(meta.speciesCode)
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
            } else {
              // Other modes: select location for trip planning
              setGoalBirdsPopup(null)
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
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(44, 62, 123, 0.04)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#2C3E7B')
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

        if (cellProbabilities.size === 0) {
          // Species not present anywhere this week
          if (map.current && map.current.getLayer('grid-fill')) {
            map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(44, 62, 123, 0.04)')
            map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
          }
          if (map.current && map.current.getLayer('grid-border')) {
            map.current.setPaintProperty('grid-border', 'line-color', '#2C3E7B')
            map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
          }
          return
        }

        // Build paint expression: blue intensity scaled by probability
        const paintExpression: any = ['case']

        cellProbabilities.forEach((prob, cellId) => {
          // Scale from 0.15 (lowest) to 0.85 (probability=1.0)
          const intensity = Math.min(0.85, prob * 0.7 + 0.15)
          paintExpression.push(['==', ['get', 'cell_id'], cellId])
          paintExpression.push(`rgba(44, 62, 123, ${intensity.toFixed(3)})`)
        })

        // Default: species not present in this cell — very faint
        paintExpression.push('rgba(44, 62, 123, 0.02)')

        if (map.current && map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
        }
        if (map.current && map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#2C3E7B')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.5)
        }
      }

      lookupAndRender()
      return
    } else if (viewMode === 'goal-birds') {
      // Goal Birds mode: count unseen goal species per cell (amber/gold heatmap)
      if (goalSpeciesCodes.size === 0) {
        // No goal species defined: show empty overlay
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(212, 160, 23, 0.03)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 0.8)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#D4A017')
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

      if (maxCount === 0) {
        // No goal birds present anywhere this week
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(212, 160, 23, 0.03)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 0.8)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#D4A017')
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
        map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#D4A017')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.5)
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

      if (cellMaxProbability.size === 0) {
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(138, 43, 226, 0.03)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#8A2BE2')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.2)
        }
        return
      }

      // Build paint expression: purple/violet color scaled by max probability
      const paintExpression: any = ['case']

      cellMaxProbability.forEach((maxProb, cellId) => {
        // Scale from 0.12 (very low) to 0.85 (probability ≥ 0.8)
        const intensity = Math.min(0.85, maxProb * 0.9 + 0.1)
        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(`rgba(138, 43, 226, ${intensity.toFixed(3)})`)
      })

      // Default: no occurrence data in this cell — very faint
      paintExpression.push('rgba(138, 43, 226, 0.02)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#8A2BE2')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.5)
      }
    } else if (viewMode === 'density' && goalBirdsOnlyFilter) {
      // Density mode with Goal Birds Only filter: count unseen goal species per cell (teal)
      if (goalSpeciesCodes.size === 0) {
        // No goal species defined: show very faint overlay
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(8, 136, 136, 0.05)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#088')
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

      if (maxCount === 0) {
        if (map.current.getLayer('grid-fill')) {
          map.current.setPaintProperty('grid-fill', 'fill-color', 'rgba(8, 136, 136, 0.05)')
          map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
        }
        if (map.current.getLayer('grid-border')) {
          map.current.setPaintProperty('grid-border', 'line-color', '#088')
          map.current.setPaintProperty('grid-border', 'line-opacity', 0.3)
        }
        return
      }

      // Build paint expression: teal color scaled by goal bird count
      const paintExpression: any = ['case']

      cellCounts.forEach((count, cellId) => {
        if (count === 0) return
        // Scale from 0.1 (1 goal bird) to 0.7 (max goal birds)
        const intensity = Math.min(0.7, (count / maxCount) * 0.6 + 0.1)
        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(`rgba(8, 136, 136, ${intensity.toFixed(3)})`)
      })

      // Default: no goal birds in this cell — very faint
      paintExpression.push('rgba(8, 136, 136, 0.02)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#088')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.5)
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

      const paintExpression: any = ['case']

      cellLiferCounts.forEach((liferCount, cellId) => {
        // Scale opacity based on lifer count (more lifers = darker color)
        const intensity = Math.min(0.85, (liferCount / maxLifers) * 0.7 + 0.15)

        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(`rgba(8, 136, 136, ${intensity})`)
      })

      // Default: cells with zero lifers or all species seen
      paintExpression.push('rgba(8, 136, 136, 0.05)')

      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        map.current.setPaintProperty('grid-fill', 'fill-opacity', 1)
      }
      if (map.current.getLayer('grid-border')) {
        map.current.setPaintProperty('grid-border', 'line-color', '#088')
        map.current.setPaintProperty('grid-border', 'line-opacity', 0.5)
      }
      console.log(`Updated density overlay with ${cellLiferCounts.size} cells, max lifers=${maxLifers}, seen species=${seenSpeciesIdSet.size}`)
    }
  }, [weeklyData, viewMode, goalBirdsOnlyFilter, goalSpeciesCodes, seenSpecies, goalSpeciesIdSetVersion, selectedSpecies])

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
            <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(212,160,23,0.12)' }}></div>
            <span>Few</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(212,160,23,0.5)' }}></div>
            <span>Some</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(212,160,23,0.85)' }}></div>
            <span>Many</span>
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
            <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(8,136,136,0.12)' }}></div>
            <span>Few</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(8,136,136,0.4)' }}></div>
            <span>Some</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(8,136,136,0.7)' }}></div>
            <span>Many</span>
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
            <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(44,62,123,0.2)' }}></div>
            <span>Low</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(44,62,123,0.5)' }}></div>
            <span>Med</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(44,62,123,0.85)' }}></div>
            <span>High</span>
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
            <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(138,43,226,0.15)' }}></div>
            <span>Low</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(138,43,226,0.5)' }}></div>
            <span>Med</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(138,43,226,0.85)' }}></div>
            <span>High</span>
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
            <div className="w-4 h-3 rounded" style={{ backgroundColor: 'rgba(8,136,136,0.12)' }}></div>
            <span>Few</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(8,136,136,0.4)' }}></div>
            <span>Some</span>
            <div className="w-4 h-3 rounded ml-1" style={{ backgroundColor: 'rgba(8,136,136,0.7)' }}></div>
            <span>Many</span>
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
    </div>
  )
}
