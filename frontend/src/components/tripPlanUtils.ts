import type { Species } from './types'

/** Format coordinates as a human-readable string, handling all hemispheres */
export function formatCoords(coordinates: [number, number]): string {
  const [lng, lat] = coordinates
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(2)}\u00B0${latDir}, ${Math.abs(lng).toFixed(2)}\u00B0${lngDir}`
}

/** Convert a week number (1-52) to a human-readable date label */
export function getWeekLabel(week: number): string {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const dayOfYear = week * 7 - 3
  const date = new Date(2024, 0, dayOfYear)
  return `${monthNames[date.getMonth()]} ${date.getDate()}`
}

/** Format a probability as a percentage string */
export function formatProbability(prob: number): string {
  return (prob * 100).toFixed(1) + '%'
}

/** Return Tailwind classes for probability color coding */
export function getProbabilityColor(prob: number): string {
  if (prob >= 0.5) return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30'
  if (prob >= 0.2) return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30'
  if (prob >= 0.05) return 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30'
  return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
}

/** Extract cell center coordinates from GeoJSON grid features */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature collection
export function getCellCoordinates(gridData: any): Map<number, [number, number]> {
  const cellCoords = new Map<number, [number, number]>()
  if (!gridData?.features) return cellCoords
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
  return cellCoords
}

/** Build a species_id → Species lookup map */
export function buildSpeciesById(speciesData: Species[]): Map<number, Species> {
  const m = new Map<number, Species>()
  speciesData.forEach(sp => m.set(sp.species_id, sp))
  return m
}

/** Bounding boxes for region filtering [west, south, east, north] */
export const REGION_BBOX: Record<string, [number, number, number, number]> = {
  us_northeast: [-82, 37, -66, 48],
  us_southeast: [-92, 24, -75, 37],
  us_midwest: [-105, 36, -80, 49],
  us_west: [-125, 31, -100, 49],
  alaska: [-180, 51, -130, 72],
  hawaii: [-161, 18, -154, 23],
}

/** Filter an array by region bounding box */
export function isInRegionBbox(
  coords: [number, number],
  regionBbox: [number, number, number, number] | null
): boolean {
  if (!regionBbox) return true
  const [west, south, east, north] = regionBbox
  return coords[0] >= west && coords[0] <= east && coords[1] >= south && coords[1] <= north
}
