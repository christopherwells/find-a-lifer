import { describe, it, expect, vi, beforeEach } from 'vitest'

// We need to reset module state between tests since dataCache uses module-level caching
let fetchSpecies: () => Promise<any>
let fetchGrid: () => Promise<any>

beforeEach(async () => {
  vi.restoreAllMocks()
  // Re-import to reset module-level promise caches
  vi.resetModules()
  const mod = await import('../dataCache')
  fetchSpecies = mod.fetchSpecies
  fetchGrid = mod.fetchGrid
})

describe('fetchSpecies', () => {
  it('fetches species data from /api/species', async () => {
    const mockData = [
      { species_id: 1, speciesCode: 'amerob', comName: 'American Robin', sciName: 'Turdus migratorius' },
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchSpecies()
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('/api/species')
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

    // After failure, cache is cleared so next call retries
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

    // Should allow retry after network error
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
  it('fetches grid data from /api/grid', async () => {
    const mockData = { type: 'FeatureCollection', features: [] }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const result = await fetchGrid()
    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith('/api/grid')
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
