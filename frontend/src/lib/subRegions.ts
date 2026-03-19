/**
 * Sub-region definitions for regional species cards.
 * Each sub-region defines a geographic area using bounding boxes.
 * Used to filter sparklines, best locations, habitat, and difficulty
 * to the region where the user clicked.
 */

export interface SubRegion {
  id: string
  name: string
  /** Bounding box: [west, south, east, north] */
  bbox: [number, number, number, number]
  /** Optional: only match if cell's parent region code is in this set */
  regionCodes?: string[]
}

// ── Canada (3-way, split by longitude) ─────────────────────────

const CA_WEST: SubRegion = {
  id: 'ca-west',
  name: 'Western Canada',
  bbox: [-141, 48, -120, 70],
  regionCodes: ['CA'],
}

const CA_CENTRAL: SubRegion = {
  id: 'ca-central',
  name: 'Central Canada',
  bbox: [-120, 48, -89, 70],
  regionCodes: ['CA'],
}

const CA_EAST: SubRegion = {
  id: 'ca-east',
  name: 'Eastern Canada',
  bbox: [-89, 42, -50, 63],
  regionCodes: ['CA'],
}

// ── US (8 regions, when data arrives) ──────────────────────────

const US_NORTHEAST: SubRegion = {
  id: 'us-ne',
  name: 'Northeast',
  bbox: [-80, 37, -66, 48],
}

const US_SOUTHEAST: SubRegion = {
  id: 'us-se',
  name: 'Southeast',
  bbox: [-95, 24, -75, 37],
}

const US_MIDWEST: SubRegion = {
  id: 'us-mw',
  name: 'Midwest',
  bbox: [-105, 36, -80, 49],
}

const US_SOUTHWEST: SubRegion = {
  id: 'us-sw',
  name: 'Southwest',
  bbox: [-115, 25, -93, 37],
}

const US_WEST: SubRegion = {
  id: 'us-west',
  name: 'West',
  bbox: [-125, 32, -116, 49],
}

const US_ROCKIES: SubRegion = {
  id: 'us-rockies',
  name: 'Rockies',
  bbox: [-117, 35, -102, 49],
}

const US_ALASKA: SubRegion = {
  id: 'us-ak',
  name: 'Alaska',
  bbox: [-180, 51, -130, 72],
}

const US_HAWAII: SubRegion = {
  id: 'us-hi',
  name: 'Hawaii',
  bbox: [-161, 18, -154, 23],
}

// ── Mexico ─────────────────────────────────────────────────────

const MEXICO: SubRegion = {
  id: 'mx',
  name: 'Mexico',
  bbox: [-118, 14, -86, 33],
  regionCodes: ['MX'],
}

// ── Central America (2-way, split at Nicaraguan Depression) ────

const CA_NORTH: SubRegion = {
  id: 'ca-north',
  name: 'Northern Central America',
  bbox: [-92, 12, -83, 18],
  regionCodes: ['BZ', 'GT', 'SV', 'HN', 'NI'],
}

const CA_SOUTH: SubRegion = {
  id: 'ca-south',
  name: 'Southern Central America',
  bbox: [-86, 7, -77, 12],
  regionCodes: ['CR', 'PA'],
}

// ── Caribbean (3-way) ──────────────────────────────────────────

const GREATER_ANTILLES: SubRegion = {
  id: 'caribbean-greater',
  name: 'Greater Antilles',
  bbox: [-85, 17, -64, 24],
  regionCodes: ['CU', 'JM', 'HT', 'DO', 'PR'],
}

const WESTERN_ATLANTIC: SubRegion = {
  id: 'atlantic-west',
  name: 'Western Atlantic Islands',
  bbox: [-80, 20, -60, 33],
  regionCodes: ['BM', 'BS'],
}

// Note: Lesser Antilles not defined yet (no data)

// ── All sub-regions, ordered for detection priority ────────────
// More specific regions first (smaller bbox checked before larger)

export const SUB_REGIONS: SubRegion[] = [
  // Caribbean (small islands first)
  WESTERN_ATLANTIC,
  GREATER_ANTILLES,
  // Alaska/Hawaii (before mainland US)
  US_ALASKA,
  US_HAWAII,
  // Canada (before US to avoid overlap in border areas)
  CA_WEST,
  CA_CENTRAL,
  CA_EAST,
  // US regions
  US_NORTHEAST,
  US_SOUTHEAST,
  US_MIDWEST,
  US_SOUTHWEST,
  US_WEST,
  US_ROCKIES,
  // Central America
  CA_NORTH,
  CA_SOUTH,
  // Mexico (large bbox, checked after CA to avoid overlap)
  MEXICO,
]

/**
 * Detect which sub-region a cell belongs to based on its centroid coordinates.
 * Returns the first matching sub-region, or null if none match.
 */
export function detectSubRegion(lng: number, lat: number): SubRegion | null {
  for (const region of SUB_REGIONS) {
    const [west, south, east, north] = region.bbox
    if (lng >= west && lng <= east && lat >= south && lat <= north) {
      return region
    }
  }
  return null
}

/**
 * Check if a cell (by its centroid) falls within a specific sub-region.
 */
export function cellInSubRegion(lng: number, lat: number, region: SubRegion): boolean {
  const [west, south, east, north] = region.bbox
  return lng >= west && lng <= east && lat >= south && lat <= north
}

/**
 * Find all sub-regions where a species has occurrence data.
 * Takes a list of cell centroids where the species occurs.
 */
export function getSpeciesSubRegions(
  cellCentroids: Array<[number, number]>
): SubRegion[] {
  const found = new Set<string>()
  const result: SubRegion[] = []

  for (const [lng, lat] of cellCentroids) {
    const region = detectSubRegion(lng, lat)
    if (region && !found.has(region.id)) {
      found.add(region.id)
      result.push(region)
    }
  }

  return result
}
