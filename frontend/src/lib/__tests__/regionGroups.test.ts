import { describe, it, expect } from 'vitest'
import {
  expandRegionFilter,
  GROUPED_CODES,
  REGION_BBOX,
  REGION_GROUPS,
  REGION_GROUP_CATEGORIES,
} from '../regionGroups'

describe('expandRegionFilter', () => {
  it('expands Greater Antilles to its constituent codes', () => {
    expect(expandRegionFilter('Greater Antilles')).toEqual(['CU', 'JM', 'HT', 'DO', 'PR'])
  })

  it('expands Central America to its constituent codes', () => {
    expect(expandRegionFilter('Central America')).toEqual(['BZ', 'GT', 'SV', 'HN', 'NI', 'CR', 'PA'])
  })

  it('passes through standalone country codes like US', () => {
    expect(expandRegionFilter('US')).toEqual(['US'])
  })

  it('expands US sub-regions to country code US', () => {
    expect(expandRegionFilter('Northeastern US')).toEqual(['US'])
    expect(expandRegionFilter('Southeastern US')).toEqual(['US'])
  })

  it('expands Canada sub-regions to country codes', () => {
    expect(expandRegionFilter('Pacific Northwest & Alaska')).toEqual(['CA', 'US'])
    expect(expandRegionFilter('Atlantic Canada & Islands')).toEqual(['CA', 'PM', 'GL'])
  })

  it('expands Mexico sub-regions to country code MX', () => {
    expect(expandRegionFilter('Northern Mexico')).toEqual(['MX'])
    expect(expandRegionFilter('Southern Mexico')).toEqual(['MX'])
  })

  it('passes through empty string', () => {
    expect(expandRegionFilter('')).toEqual([''])
  })
})

describe('GROUPED_CODES', () => {
  it('contains all individual codes from all groups', () => {
    const allCodes = Object.values(REGION_GROUPS).flat()
    for (const code of allCodes) {
      expect(GROUPED_CODES.has(code), `expected GROUPED_CODES to contain ${code}`).toBe(true)
    }
  })

  it('contains specific Caribbean and Central American codes', () => {
    expect(GROUPED_CODES.has('CU')).toBe(true)
    expect(GROUPED_CODES.has('JM')).toBe(true)
    expect(GROUPED_CODES.has('BZ')).toBe(true)
    expect(GROUPED_CODES.has('PA')).toBe(true)
  })

  it('does NOT contain group names', () => {
    expect(GROUPED_CODES.has('Greater Antilles')).toBe(false)
    expect(GROUPED_CODES.has('Central America')).toBe(false)
    expect(GROUPED_CODES.has('Western Atlantic Islands')).toBe(false)
  })

  it('contains country codes subsumed into sub-regions (US, CA, MX)', () => {
    expect(GROUPED_CODES.has('US')).toBe(true)
    expect(GROUPED_CODES.has('CA')).toBe(true)
    expect(GROUPED_CODES.has('MX')).toBe(true)
  })
})

describe('REGION_BBOX', () => {
  it('has entries for all group names', () => {
    for (const groupName of Object.keys(REGION_GROUPS)) {
      expect(REGION_BBOX[groupName], `missing bbox for group ${groupName}`).toBeDefined()
    }
  })

  it('has entries for all individual country codes in groups', () => {
    const allCodes = Object.values(REGION_GROUPS).flat()
    for (const code of allCodes) {
      expect(REGION_BBOX[code], `missing bbox for code ${code}`).toBeDefined()
    }
  })

  it('has entries for standalone country codes', () => {
    expect(REGION_BBOX['US']).toBeDefined()
    expect(REGION_BBOX['CA']).toBeDefined()
    expect(REGION_BBOX['MX']).toBeDefined()
  })

  it('bbox values have valid format: west < east and south < north', () => {
    for (const [key, [[west, south], [east, north]]] of Object.entries(REGION_BBOX)) {
      expect(west, `${key}: west (${west}) should be < east (${east})`).toBeLessThan(east)
      expect(south, `${key}: south (${south}) should be < north (${north})`).toBeLessThan(north)
    }
  })
})

describe('REGION_GROUP_CATEGORIES', () => {
  it('maps all group names to a category string', () => {
    for (const groupName of Object.keys(REGION_GROUPS)) {
      expect(
        typeof REGION_GROUP_CATEGORIES[groupName],
        `missing category for group ${groupName}`
      ).toBe('string')
    }
  })

  it('has expected category values', () => {
    expect(REGION_GROUP_CATEGORIES['Central America']).toBe('Central America')
    expect(REGION_GROUP_CATEGORIES['Greater Antilles']).toBe('Caribbean')
    expect(REGION_GROUP_CATEGORIES['Western Atlantic Islands']).toBe('Caribbean')
    expect(REGION_GROUP_CATEGORIES['Northeastern US']).toBe('United States')
    expect(REGION_GROUP_CATEGORIES['Pacific Northwest & Alaska']).toBe('Canada')
    expect(REGION_GROUP_CATEGORIES['Northern Mexico']).toBe('Mexico')
  })
})
