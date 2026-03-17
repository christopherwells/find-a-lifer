/**
 * Caribbean and other region groupings for the species filter dropdown.
 * Individual Caribbean country codes are merged into display groups.
 */

/** Maps a display group name to the constituent eBird region codes */
export const REGION_GROUPS: Record<string, string[]> = {
  'Greater Antilles': ['CU', 'JM', 'HT', 'DO', 'PR'],
  'Western Atlantic Islands': ['BS', 'BM'],
  // 'Lesser Antilles': ['BB', 'TT', 'LC', ...] // add when EBD data is processed
}

/** Set of region codes that are hidden from the dropdown (subsumed into a group) */
export const GROUPED_CODES = new Set(Object.values(REGION_GROUPS).flat())

/** Expand a filter value (group name or single code) to an array of region codes */
export function expandRegionFilter(value: string): string[] {
  return REGION_GROUPS[value] ?? [value]
}

/**
 * Bounding boxes for all known region codes and groups.
 * Used to zoom the map when a region filter is selected.
 * Format: [[west, south], [east, north]]
 */
export const REGION_BBOX: Record<string, [[number, number], [number, number]]> = {
  // North America
  US: [[-125, 24], [-66, 49]],
  CA: [[-141, 42], [-52, 70]],
  GL: [[-74, 59], [-11, 84]],
  PM: [[-56.5, 46.7], [-56.1, 47.1]],
  MX: [[-117.1, 14.5], [-86.7, 32.7]],
  // Central America
  GT: [[-92.2, 13.7], [-88.2, 17.8]],
  SV: [[-90.1, 13.1], [-87.7, 14.4]],
  HN: [[-89.4, 12.9], [-83.1, 16.5]],
  NI: [[-87.7, 10.7], [-83.2, 15.0]],
  CR: [[-85.9,  8.0], [-82.6, 11.2]],
  PA: [[-83.1,  7.2], [-77.2,  9.6]],
  // Caribbean individual codes (kept for completeness even if grouped in dropdown)
  CU: [[-85.0, 19.8], [-74.1, 23.3]],
  JM: [[-78.4, 17.7], [-76.2, 18.5]],
  HT: [[-74.5, 18.0], [-71.6, 20.1]],
  DO: [[-72.0, 17.5], [-68.3, 20.0]],
  PR: [[-67.3, 17.9], [-65.2, 18.5]],
  BS: [[-79.5, 20.9], [-72.7, 27.3]],
  BM: [[-65.2, 32.2], [-64.5, 32.5]],
  // Caribbean groups
  'Greater Antilles':        [[-85.0, 17.5], [-65.2, 23.3]],
  'Western Atlantic Islands':[[-79.5, 20.9], [-64.5, 32.5]],
  'Lesser Antilles':         [[-63.0, 10.0], [-60.0, 18.0]],
}
