import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to reset module state between tests since dataCache uses module-level caching
let fetchSpecies: () => Promise<any>
let fetchGrid: () => Promise<any>
let fetchWeekSummary: (week: number) => Promise<any>
let fetchWeekCells: (week: number) => Promise<any>
let computeLiferSummary: (weekCells: Map<number, number[]>, seenIds: Set<number>) => any
let getCellSpecies: (weekCells: Map<number, number[]>, cellId: number, speciesById: Map<number, any>) => any
let getSpeciesBatch: (weekCells: Map<number, number[]>, speciesIds: Set<number>) => any

beforeEach(async () => {
  vi.restoreAllMocks()
  // Re-import to reset module-level promise caches
  vi.resetModules()
  const mod = await import('../dataCache')
  fetchSpecies = mod.fetchSpecies
  fetchGrid = mod.fetchGrid
  fetchWeekSummary = mod.fetchWeekSummary
  fetchWeekCells = mod.fetchWeekCells
  computeLiferSummary = mod.computeLiferSummary
  getCellSpecies = mod.getCellSpecies
  getSpeciesBatch = mod.getSpeciesBatch
})

describe('fetchSpecies', () => {
  it('fetches species data from /data/species.json', async () => {
    const mockData = [
      { species_id: 1, speciesCode: 'amerob', comName: 'American Robin', sciName: 'Turdus migratorius' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSpecies()
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('/data/species.json')
  })

  it('caches the result and only fetches once', async () => {
    const mockData = [{ species_id: 1, speciesCode: 'amerob', comName: 'American Robin', sciName: 'T.m.' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result1 = await fetchSpecies()
    const result2 = await fetchSpecies()

    expect(result1).toBe(result2) // Same reference (cached promise)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on HTTP error and allows retry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(fetchSpecies()).rejects.toThrow('HTTP 500')

    const mockData = [{ species_id: 1, speciesCode: 'amerob', comName: 'American Robin', sciName: 'T.m.' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSpecies()
    expect(result).toEqual(mockData)
  })

  it('throws on network error and allows retry', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    await expect(fetchSpecies()).rejects.toThrow('Network error')

    const mockData = [{ species_id: 1, speciesCode: 'amerob', comName: 'American Robin', sciName: 'T.m.' }]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSpecies()
    expect(result).toEqual(mockData)
  })
})

describe('fetchGrid', () => {
  it('fetches grid data from /data/grid.geojson', async () => {
    const mockData = { type: 'FeatureCollection', features: [] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchGrid()
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('/data/grid.geojson')
  })

  it('caches the result and only fetches once', async () => {
    const mockData = { type: 'FeatureCollection', features: [] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result1 = await fetchGrid()
    const result2 = await fetchGrid()

    expect(result1).toBe(result2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws on HTTP error and allows retry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    await expect(fetchGrid()).rejects.toThrow('HTTP 404')

    const mockData = { type: 'FeatureCollection', features: [] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchGrid()
    expect(result).toEqual(mockData)
  })
})

describe('fetchWeekSummary', () => {
  it('fetches week summary with zero-padded week number', async () => {
    const mockData = [[1, 10, 200], [2, 5, 150]]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchWeekSummary(3)
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('/data/weeks/week_03_summary.json')
  })
})

describe('fetchWeekCells', () => {
  it('parses raw cell-grouped format into Map', async () => {
    const raw = [[100, [1, 2, 3]], [200, [4, 5]]]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(raw),
    })

    const result = await fetchWeekCells(1)
    expect(result).toBeInstanceOf(Map)
    expect(result.get(100)).toEqual([1, 2, 3])
    expect(result.get(200)).toEqual([4, 5])
  })
})

describe('computeLiferSummary', () => {
  it('excludes seen species and returns lifer counts', () => {
    const weekCells = new Map<number, number[]>([
      [100, [1, 2, 3, 4]],
      [200, [2, 3]],
      [300, [1]],
    ])
    const seenIds = new Set([1, 2])

    const result = computeLiferSummary(weekCells, seenIds)
    // Cell 100: 2 lifers (3, 4), Cell 200: 1 lifer (3), Cell 300: 0 lifers
    expect(result).toContainEqual([100, 2, 200])
    expect(result).toContainEqual([200, 1, 200])
    expect(result.find((r: any) => r[0] === 300)).toBeUndefined()
  })
})

describe('getCellSpecies', () => {
  it('returns species records for a cell sorted by taxon order', () => {
    const weekCells = new Map<number, number[]>([[100, [2, 1]]])
    const speciesById = new Map([
      [1, { species_id: 1, speciesCode: 'amerob', comName: 'American Robin', taxonOrder: 200 }],
      [2, { species_id: 2, speciesCode: 'houspa', comName: 'House Sparrow', taxonOrder: 100 }],
    ])

    const result = getCellSpecies(weekCells, 100, speciesById)
    expect(result).toHaveLength(2)
    expect(result[0].speciesCode).toBe('houspa') // lower taxonOrder first
    expect(result[1].speciesCode).toBe('amerob')
  })
})

describe('getSpeciesBatch', () => {
  it('returns cells for each requested species', () => {
    const weekCells = new Map<number, number[]>([
      [100, [1, 2, 3]],
      [200, [2, 4]],
      [300, [1, 3]],
    ])
    const speciesIds = new Set([1, 3])

    const result = getSpeciesBatch(weekCells, speciesIds)
    expect(result[1]).toHaveLength(2) // cells 100, 300
    expect(result[3]).toHaveLength(2) // cells 100, 300
  })
})
