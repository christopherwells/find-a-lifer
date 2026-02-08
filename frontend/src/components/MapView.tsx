import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface MapViewProps {
  darkMode?: boolean
  currentWeek?: number
  viewMode?: string
  onLocationSelect?: (location: { cellId: number; coordinates: [number, number] }) => void
}

interface OccurrenceRecord {
  cell_id: number
  species_id: number
  probability: number
}

export default function MapView({ darkMode = false, currentWeek = 26, viewMode = 'density', onLocationSelect }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const [weeklyData, setWeeklyData] = useState<OccurrenceRecord[]>([])
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)

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

        // Add click handler for trip planning location selection
        map.current.on('click', 'grid-fill', (e) => {
          if (e.features && e.features.length > 0) {
            const feature = e.features[0]
            const cellId = feature.properties?.cell_id
            if (cellId && e.lngLat && onLocationSelect) {
              onLocationSelect({
                cellId: cellId,
                coordinates: [e.lngLat.lng, e.lngLat.lat]
              })
              console.log('Selected location for trip planning:', {
                cellId,
                coordinates: [e.lngLat.lng, e.lngLat.lat]
              })
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

  // Update map overlay when weekly data changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return
    if (weeklyData.length === 0) return

    // Aggregate occurrence data by cell_id (sum probabilities for all species in each cell)
    const cellAggregates = new Map<number, { total: number; count: number }>()

    weeklyData.forEach((record) => {
      const existing = cellAggregates.get(record.cell_id) || { total: 0, count: 0 }
      cellAggregates.set(record.cell_id, {
        total: existing.total + record.probability,
        count: existing.count + 1,
      })
    })

    // Update grid fill layer paint properties to show occurrence density
    const sourceData = map.current.getSource('grid') as maplibregl.GeoJSONSource
    if (sourceData && sourceData._data) {
      const gridData = sourceData._data as GeoJSON.FeatureCollection

      // Create expression for data-driven styling based on cell_id
      const paintExpression: any = ['case']

      cellAggregates.forEach((aggregate, cellId) => {
        // Average probability per species in this cell
        const avgProbability = aggregate.total / aggregate.count
        // Color intensity based on average probability (blue gradient)
        const opacity = Math.min(0.7, avgProbability * 2) // Scale opacity

        paintExpression.push(['==', ['get', 'cell_id'], cellId])
        paintExpression.push(`rgba(8, 136, 136, ${opacity})`)
      })

      // Default color for cells with no data
      paintExpression.push('rgba(8, 136, 136, 0.05)')

      // Update the paint property
      if (map.current.getLayer('grid-fill')) {
        map.current.setPaintProperty('grid-fill', 'fill-color', paintExpression)
        console.log(`Updated map overlay with ${cellAggregates.size} cells`)
      }
    }
  }, [weeklyData])

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
    </div>
  )
}
