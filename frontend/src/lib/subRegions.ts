/**
 * Sub-region definitions for regional species cards.
 * Each sub-region defines a geographic area using bounding boxes.
 * Used to filter sparklines, best locations, habitat, and difficulty
 * to the region where the user clicked.
 */

export interface SubRegion {
  id: string
  name: string
  /** State/province codes that belong to this sub-region (e.g., "US-ME", "CA-BC", "MX-OAX") */
  stateCodes: string[]
}

// ── Canada (4-way: West, Central, East, North) ─────────────────

const CA_WEST: SubRegion = {
  id: 'ca-west',
  name: 'Western Canada',
  stateCodes: ['CA-BC', 'CA-AB'],

}

const CA_CENTRAL: SubRegion = {
  id: 'ca-central',
  name: 'Central Canada',
  stateCodes: ['CA-SK', 'CA-MB'],
}

const CA_EAST: SubRegion = {
  id: 'ca-east',
  name: 'Eastern Canada',
  stateCodes: ['CA-ON', 'CA-QC', 'CA-NB', 'CA-NS', 'CA-NL', 'CA-PE'],
}

const CA_NORTH: SubRegion = {
  id: 'ca-north',
  name: 'Northern Canada',
  stateCodes: ['CA-YT', 'CA-NT', 'CA-NU'],
}

// ── US (8 regions) ─────────────────────────────────────────────

const US_NORTHEAST: SubRegion = {
  id: 'us-ne',
  name: 'Northeastern US',
  stateCodes: ['US-ME', 'US-NH', 'US-VT', 'US-MA', 'US-RI', 'US-CT',
               'US-NY', 'US-NJ', 'US-PA', 'US-DE', 'US-MD', 'US-DC'],
}

const US_SOUTHEAST: SubRegion = {
  id: 'us-se',
  name: 'Southeastern US',
  stateCodes: ['US-VA', 'US-WV', 'US-NC', 'US-SC', 'US-GA', 'US-FL',
               'US-AL', 'US-MS', 'US-TN', 'US-KY', 'US-LA', 'US-AR'],
}

const US_MIDWEST: SubRegion = {
  id: 'us-mw',
  name: 'Midwestern US',
  stateCodes: ['US-OH', 'US-IN', 'US-IL', 'US-MI', 'US-WI', 'US-MN',
               'US-IA', 'US-MO', 'US-ND', 'US-SD', 'US-NE', 'US-KS'],
}

const US_SOUTHWEST: SubRegion = {
  id: 'us-sw',
  name: 'Southwestern US',
  stateCodes: ['US-TX', 'US-OK', 'US-NM', 'US-AZ'],
}

const US_WEST: SubRegion = {
  id: 'us-west',
  name: 'Western US',
  stateCodes: ['US-CA', 'US-OR', 'US-WA'],
}

const US_ROCKIES: SubRegion = {
  id: 'us-rockies',
  name: 'US Rockies',
  stateCodes: ['US-NV', 'US-UT', 'US-CO', 'US-WY', 'US-MT', 'US-ID'],
}

const US_ALASKA: SubRegion = {
  id: 'us-ak',
  name: 'Alaska',
  stateCodes: ['US-AK'],
}

const US_HAWAII: SubRegion = {
  id: 'us-hi',
  name: 'Hawaii',
  stateCodes: ['US-HI'],
}

// ── Mexico (2-way, split at Transvolcanic Belt) ────────────────

const MX_NORTH: SubRegion = {
  id: 'mx-north',
  name: 'Northern Mexico',
  stateCodes: ['MX-BCN', 'MX-BCS', 'MX-SON', 'MX-CHH', 'MX-COA', 'MX-NLE',
               'MX-TAM', 'MX-SIN', 'MX-DUR', 'MX-ZAC', 'MX-SLP', 'MX-AGU',
               'MX-NAY', 'MX-JAL'],
}

const MX_SOUTH: SubRegion = {
  id: 'mx-south',
  name: 'Southern Mexico',
  stateCodes: ['MX-COL', 'MX-MIC', 'MX-GUA', 'MX-GRO', 'MX-OAX', 'MX-CHP',
               'MX-TAB', 'MX-VER', 'MX-PUE', 'MX-TLA', 'MX-HID', 'MX-MEX',
               'MX-MOR', 'MX-QUE', 'MX-CAM', 'MX-ROO', 'MX-YUC', 'MX-CMX', 'MX-DIF'],
}

// ── Central America (2-way, split at Nicaraguan Depression) ────

const CENTRAL_AM_NORTH: SubRegion = {
  id: 'ca-c-north',
  name: 'Northern Central America',
  stateCodes: ['BZ', 'GT', 'SV', 'HN', 'NI'],
}

const CENTRAL_AM_SOUTH: SubRegion = {
  id: 'ca-c-south',
  name: 'Southern Central America',
  stateCodes: ['CR', 'PA'],
}

// ── Caribbean ─────────────────────────────────────────────────

const GREATER_ANTILLES: SubRegion = {
  id: 'caribbean-greater',
  name: 'Greater Antilles',
  stateCodes: ['CU', 'JM', 'HT', 'DO', 'PR'],
}

const WESTERN_ATLANTIC: SubRegion = {
  id: 'atlantic-west',
  name: 'Western Atlantic Islands',
  stateCodes: ['BM', 'BS', 'TC'],
}

const LESSER_ANTILLES: SubRegion = {
  id: 'caribbean-lesser',
  name: 'Lesser Antilles',
  stateCodes: ['TT', 'BB', 'KN', 'VI', 'VG', 'AW', 'MF', 'MQ', 'BQ', 'SX', 'AG', 'DM', 'GD', 'LC', 'VC'],
}

// ── All sub-regions ──────────────────────────────────────────

export const SUB_REGIONS: SubRegion[] = [
  // Caribbean
  WESTERN_ATLANTIC,
  GREATER_ANTILLES,
  LESSER_ANTILLES,
  // Alaska/Hawaii
  US_ALASKA,
  US_HAWAII,
  // Canada
  CA_NORTH,
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
  CENTRAL_AM_NORTH,
  CENTRAL_AM_SOUTH,
  // Mexico
  MX_NORTH,
  MX_SOUTH,
]

// Build reverse lookup: stateCode -> SubRegion
const STATE_TO_REGION: Record<string, SubRegion> = {}
for (const region of SUB_REGIONS) {
  for (const sc of region.stateCodes) {
    STATE_TO_REGION[sc] = region
  }
}

/**
 * Resolve a state code to its sub-region.
 * Tries exact match first (e.g., "US-ME"), then country prefix (e.g., "CU-03" → "CU").
 * This handles eBird state codes like "CU-03", "DO-01", "JM-01" that include province numbers.
 */
function resolveStateToRegion(stateCode: string): SubRegion | null {
  // Exact match (US-ME, CA-BC, MX-OAX, etc.)
  const exact = STATE_TO_REGION[stateCode]
  if (exact) return exact
  // Country prefix match (CU-03 → CU, DO-01 → DO, JM-01 → JM, etc.)
  const country = stateCode.split('-')[0]
  return STATE_TO_REGION[country] || null
}

/** Cell state code mapping: cell_id -> state_code. Loaded from cell_states.json */
let cellStatesCache: Record<string, string> | null = null
let cellStatesLoading: Promise<Record<string, string>> | null = null

/**
 * Load cell → state code mapping from static JSON.
 * Returns { cell_id: "US-ME", ... }
 */
export async function loadCellStates(resolution: number): Promise<Record<string, string>> {
  if (cellStatesCache) return cellStatesCache
  if (cellStatesLoading) return cellStatesLoading

  cellStatesLoading = fetch(`${import.meta.env.BASE_URL}data/r${resolution}/cell_states.json`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
    .then((data: Record<string, string>) => {
      cellStatesCache = data
      return data
    })
  return cellStatesLoading
}

/**
 * Detect which sub-region a cell belongs to using its state code.
 * Falls back to null if state code is unknown.
 */
export function detectSubRegionByState(stateCode: string): SubRegion | null {
  return resolveStateToRegion(stateCode)
}

/**
 * Detect sub-region for a cell by its ID (requires cell_states to be loaded).
 */
export function detectSubRegionForCell(cellId: number | string): SubRegion | null {
  if (!cellStatesCache) return null
  const stateCode = cellStatesCache[String(cellId)]
  if (!stateCode) return null
  return resolveStateToRegion(stateCode)
}

/**
 * Find all sub-regions where a species has occurrence data.
 * Takes a list of cell IDs where the species occurs.
 */
export function getSpeciesSubRegions(
  cellIds: Array<number | string>
): SubRegion[] {
  if (!cellStatesCache) return []
  const found = new Set<string>()
  const result: SubRegion[] = []

  for (const cellId of cellIds) {
    const region = detectSubRegionForCell(cellId)
    if (region && !found.has(region.id)) {
      found.add(region.id)
      result.push(region)
    }
  }

  return result
}
