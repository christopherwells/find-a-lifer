/**
 * Region groupings for the species filter dropdown.
 * Sub-regions (e.g., "Northeastern US") are shown under country optgroups.
 * Individual country codes that belong to a group/sub-region are hidden from
 * the dropdown and replaced by display names.
 */

/**
 * Maps a display group/sub-region name to the constituent eBird region codes.
 * For species.json filtering, these map to country-level codes.
 * For cell-level filtering, use REGION_BBOX bounding boxes.
 */
export const REGION_GROUPS: Record<string, string[]> = {
  // US sub-regions (all map to country code 'US' for species filtering)
  'Northeastern US':  ['US'],
  'Southeastern US':  ['US'],
  'Midwestern US':    ['US'],
  'Southwestern US':  ['US'],
  'Western US':       ['US'],
  'US Rockies':       ['US'],
  'Hawaii':           ['US'],
  // Canada sub-regions (all map to 'CA')
  'Pacific Northwest & Alaska': ['CA', 'US'],
  'Central Canada':   ['CA'],
  'Atlantic Canada & Islands': ['CA', 'PM', 'GL'],
  'Northern Canada':  ['CA'],
  // Mexico sub-regions (all map to 'MX')
  'Northern Mexico':  ['MX'],
  'Southern Mexico':  ['MX'],
  // Central America (groups individual country codes)
  'Central America':  ['BZ', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA'],
  // Caribbean (groups individual country codes)
  'Greater Antilles':        ['CU', 'JM', 'HT', 'DO', 'PR'],
  'Lesser Antilles':         ['TT', 'BB', 'KN', 'VI', 'VG', 'AW', 'MF', 'MQ', 'BQ', 'SX', 'AG', 'DM', 'GD', 'LC', 'VC'],
  'Western Atlantic Islands': ['BS', 'BM', 'TC'],
}

/** Which dropdown optgroup each group/sub-region belongs to */
export const REGION_GROUP_CATEGORIES: Record<string, string> = {
  // US
  'Northeastern US':  'United States',
  'Southeastern US':  'United States',
  'Midwestern US':    'United States',
  'Southwestern US':  'United States',
  'Western US':       'United States',
  'US Rockies':       'United States',
  'Hawaii':           'United States',
  // Canada
  'Pacific Northwest & Alaska': 'Canada',
  'Central Canada':   'Canada',
  'Atlantic Canada & Islands': 'Canada',
  'Northern Canada':  'Canada',
  // Mexico
  'Northern Mexico':  'Mexico',
  'Southern Mexico':  'Mexico',
  // Central America & Caribbean
  'Central America':          'Central America',
  'Greater Antilles':         'Caribbean',
  'Lesser Antilles':          'Caribbean',
  'Western Atlantic Islands': 'Caribbean',
}

/** Set of region codes that are hidden from the dropdown (subsumed into a group/sub-region) */
export const GROUPED_CODES = new Set(
  Object.values(REGION_GROUPS).flat()
)

/** Expand a filter value (group name, sub-region ID, or single code) to an array of region codes */
export function expandRegionFilter(value: string): string[] {
  // Check group names first
  if (REGION_GROUPS[value]) return REGION_GROUPS[value]
  // Check sub-region IDs (e.g., 'us-ne', 'ca-west', 'mx-south')
  // These map to their parent country code for species-level filtering
  if (value.startsWith('us-')) return ['US']
  if (value.startsWith('ca-')) return ['CA']
  if (value.startsWith('mx-')) return ['MX']
  if (value === 'caribbean-greater') return ['CU', 'JM', 'HT', 'DO', 'PR']
  if (value === 'caribbean-lesser') return ['TT', 'BB', 'KN', 'VI', 'VG', 'AW', 'MF', 'MQ', 'BQ', 'SX', 'AG', 'DM', 'GD', 'LC', 'VC']
  if (value === 'atlantic-west') return ['BM', 'BS', 'TC']
  if (value === 'ca-c-north') return ['BZ', 'GT', 'SV', 'HN', 'NI']
  if (value === 'ca-c-south') return ['CR', 'PA']
  return [value]
}

/**
 * Bounding boxes for all known region codes, groups, and sub-regions.
 * Used to zoom the map and mask out-of-region cells when a region filter is active.
 * Format: [[west, south], [east, north]]
 */
export const REGION_BBOX: Record<string, [[number, number], [number, number]]> = {
  // Country-level (kept for completeness)
  US: [[-125, 24], [-66, 49]],
  CA: [[-141, 42], [-52, 70]],
  GL: [[-74, 59], [-11, 84]],
  PM: [[-56.5, 46.7], [-56.1, 47.1]],
  MX: [[-117.1, 14.5], [-86.7, 32.7]],

  // US sub-regions
  'Northeastern US':  [[-80, 37], [-66, 48]],
  'Southeastern US':  [[-92, 24], [-75, 39]],
  'Midwestern US':    [[-104, 36], [-80, 49]],
  'Southwestern US':  [[-115, 25], [-93, 37]],
  'Western US':       [[-125, 32], [-114, 49]],
  'US Rockies':       [[-117, 34], [-104, 49]],
  'Hawaii':           [[-161, 18], [-154, 23]],

  // Canada sub-regions
  'Pacific Northwest & Alaska': [[-180, 48], [-110, 72]],
  'Central Canada':   [[-110, 49], [-89, 60]],
  'Atlantic Canada & Islands': [[-89, 42], [-52, 55]],
  'Northern Canada':  [[-141, 55], [-60, 70]],

  // Mexico sub-regions
  'Northern Mexico':  [[-117.1, 22], [-97, 32.7]],
  'Southern Mexico':  [[-105, 14.5], [-86.7, 22]],

  // Central America — individual codes kept for cell-level matching
  BZ: [[-89.2, 15.9], [-88.1, 18.5]],
  GT: [[-92.2, 13.7], [-88.2, 17.8]],
  SV: [[-90.1, 13.1], [-87.7, 14.4]],
  HN: [[-89.4, 12.9], [-83.1, 16.5]],
  NI: [[-87.7, 10.7], [-83.2, 15.0]],
  CR: [[-85.9,  8.0], [-82.6, 11.2]],
  PA: [[-83.1,  7.2], [-77.2,  9.6]],

  // Caribbean individual codes
  CU: [[-85.0, 19.8], [-74.1, 23.3]],
  JM: [[-78.4, 17.7], [-76.2, 18.5]],
  HT: [[-74.5, 18.0], [-71.6, 20.1]],
  DO: [[-72.0, 17.5], [-68.3, 20.0]],
  PR: [[-67.3, 17.9], [-65.2, 18.5]],
  TT: [[-61.9, 10.0], [-60.5, 11.4]],
  BB: [[-59.7, 13.0], [-59.4, 13.4]],
  KN: [[-62.9, 17.1], [-62.5, 17.4]],
  VI: [[-65.1, 17.7], [-64.6, 18.4]],
  VG: [[-64.8, 18.3], [-64.3, 18.8]],
  AW: [[-70.1, 12.4], [-69.9, 12.6]],
  MF: [[-63.2, 18.0], [-63.0, 18.1]],
  MQ: [[-61.3, 14.4], [-60.8, 14.9]],
  BQ: [[-68.4, 12.0], [-63.0, 17.7]],
  SX: [[-63.2, 18.0], [-63.0, 18.1]],
  AG: [[-62.0, 16.9], [-61.6, 17.7]],
  DM: [[-61.5, 15.2], [-61.2, 15.7]],
  GD: [[-61.8, 11.9], [-61.4, 12.3]],
  LC: [[-61.1, 13.7], [-60.9, 14.1]],
  VC: [[-61.5, 12.6], [-61.1, 13.4]],
  BS: [[-79.5, 20.9], [-72.7, 27.3]],
  BM: [[-65.2, 32.2], [-64.5, 32.5]],
  TC: [[-72.5, 21.1], [-71.1, 21.9]],

  // Sub-region IDs (same boxes as named versions, for RegionSelector compatibility)
  'us-ne':  [[-80, 37], [-66, 48]],
  'us-se':  [[-92, 24], [-75, 39]],
  'us-mw':  [[-104, 36], [-80, 49]],
  'us-sw':  [[-115, 25], [-93, 37]],
  'us-west': [[-125, 32], [-114, 49]],
  'us-rockies': [[-117, 34], [-104, 49]],
  'us-ak':  [[-180, 51], [-130, 72]],
  'us-hi':  [[-161, 18], [-154, 23]],
  'ca-west': [[-141, 48], [-110, 60]],
  'ca-central': [[-110, 49], [-89, 60]],
  'ca-east': [[-89, 42], [-52, 55]],
  'ca-north': [[-141, 55], [-60, 70]],
  'mx-north': [[-117.1, 22], [-97, 32.7]],
  'mx-south': [[-105, 14.5], [-86.7, 22]],
  'ca-c-north': [[-92.2, 12.9], [-83.1, 18.5]],
  'ca-c-south': [[-85.9, 7.2], [-77.2, 11.2]],
  'caribbean-greater': [[-85.0, 17.5], [-65.2, 23.3]],
  'caribbean-lesser': [[-70.1, 10.0], [-59.4, 18.8]],
  'atlantic-west': [[-79.5, 20.9], [-64.5, 32.5]],

  // Group-level bounding boxes
  'Central America':          [[-92.2,  7.2], [-77.2, 18.5]],
  'Greater Antilles':         [[-85.0, 17.5], [-65.2, 23.3]],
  'Western Atlantic Islands': [[-79.5, 20.9], [-64.5, 32.5]],
  'Lesser Antilles':          [[-70.1, 10.0], [-59.4, 18.8]],
}
