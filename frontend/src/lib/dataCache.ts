import type { Species } from '../components/types'

/**
 * Shared data cache for static files.
 * All data is served from /data/* as pre-computed static JSON.
 * No backend API at runtime.
 */

/** Base URL for data files — respects Vite's base path for GitHub Pages */
const DATA_BASE = `${import.meta.env.BASE_URL}data`

let speciesPromise: Promise<Species[]> | null = null
let regionsPromise: Promise<any> | null = null

// Resolution-aware caches: "res-week" or "res" as key prefix
const gridPromiseByRes = new Map<number, Promise<any>>()

// Cache week cells data: "res-week" -> Map<cellId, speciesIds[]>
const weekCellsCache = new Map<string, Promise<Map<number, number[]>>>()

// Cache week summaries: "res-week" -> summary
const weekSummaryCache = new Map<string, Promise<[number, number, number, number?][]>>()

// Cache species-weeks files: "res-speciesCode" -> data
const speciesWeeksCache = new Map<string, Promise<Record<string, [number, number][]>>>()

// Resolution metadata cache
let resolutionsPromise: Promise<{ resolutions: number[]; default: number; zoomThresholds: Record<string, [number, number]> }> | null = null

/** Default resolution (backward compat) */
const DEFAULT_RES = 4

/** Get the data path prefix for a resolution */
function resPath(resolution?: number): string {
  if (resolution != null) return `${DATA_BASE}/r${resolution}`
  return DATA_BASE
}

/** Fetch species metadata (cached) */
export function fetchSpecies(): Promise<Species[]> {
  if (!speciesPromise) {
    speciesPromise = fetch(`${DATA_BASE}/species.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        speciesPromise = null
        throw err
      })
  }
  return speciesPromise
}

/** Fetch grid GeoJSON for a specific resolution (cached) */
export function fetchGrid(resolution?: number): Promise<any> {
  const res = resolution ?? DEFAULT_RES
  let p = gridPromiseByRes.get(res)
  if (!p) {
    p = fetch(`${resPath(res)}/grid.geojson`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        gridPromiseByRes.delete(res)
        throw err
      })
    gridPromiseByRes.set(res, p)
  }
  return p
}

/** Fetch resolution metadata */
export function fetchResolutions(): Promise<{ resolutions: number[]; default: number; zoomThresholds: Record<string, [number, number]> }> {
  if (!resolutionsPromise) {
    resolutionsPromise = fetch(`${DATA_BASE}/resolutions.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        resolutionsPromise = null
        throw err
      })
  }
  return resolutionsPromise
}

/** Fetch regions GeoJSON (cached) */
export function fetchRegions(): Promise<any> {
  if (!regionsPromise) {
    regionsPromise = fetch(`${DATA_BASE}/regions.geojson`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        regionsPromise = null
        throw err
      })
  }
  return regionsPromise
}

/** Fetch weekly summary for a resolution: [[cell_id, species_count, max_prob_uint8, n_checklists?], ...] */
export function fetchWeekSummary(week: number, resolution?: number): Promise<[number, number, number, number?][]> {
  const res = resolution ?? DEFAULT_RES
  const key = `${res}-${week}`
  let p = weekSummaryCache.get(key)
  if (!p) {
    const ww = String(week).padStart(2, '0')
    p = fetch(`${resPath(res)}/weeks/week_${ww}_summary.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        weekSummaryCache.delete(key)
        throw err
      })
    weekSummaryCache.set(key, p)
  }
  return p
}

/**
 * Fetch week cells data for a resolution and parse into a Map<cellId, speciesIds[]>.
 * Raw format: [[cell_id, [species_id, ...]], ...]
 */
export function fetchWeekCells(week: number, resolution?: number): Promise<Map<number, number[]>> {
  const res = resolution ?? DEFAULT_RES
  const key = `${res}-${week}`
  let p = weekCellsCache.get(key)
  if (!p) {
    const ww = String(week).padStart(2, '0')
    p = fetch(`${resPath(res)}/weeks/week_${ww}_cells.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((raw: [number, number[]][]) => {
        const m = new Map<number, number[]>()
        for (const [cellId, speciesIds] of raw) {
          m.set(cellId, speciesIds)
        }
        return m
      })
      .catch(err => {
        weekCellsCache.delete(key)
        throw err
      })
    weekCellsCache.set(key, p)
  }
  return p
}

/**
 * Fetch per-species occurrence data for a resolution across all 52 weeks.
 * Returns { "1": [[cell_id, freq], ...], "2": [...], ... }
 */
export function fetchSpeciesWeeks(speciesCode: string, resolution?: number): Promise<Record<string, [number, number][]>> {
  const res = resolution ?? DEFAULT_RES
  const key = `${res}-${speciesCode}`
  let p = speciesWeeksCache.get(key)
  if (!p) {
    p = fetch(`${resPath(res)}/species-weeks/${speciesCode}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        speciesWeeksCache.delete(key)
        throw err
      })
    speciesWeeksCache.set(key, p)
  }
  return p
}

// ---- Client-side computation (replaces backend POST endpoints) ----

/**
 * Compute lifer summary from week cells data.
 * Returns [[cell_id, lifer_count, 200], ...] for cells with lifers.
 */
export function computeLiferSummary(
  weekCells: Map<number, number[]>,
  seenSpeciesIds: Set<number>
): [number, number, number][] {
  const result: [number, number, number][] = []
  weekCells.forEach((speciesIds, cellId) => {
    const liferCount = speciesIds.filter(sid => !seenSpeciesIds.has(sid)).length
    if (liferCount > 0) {
      result.push([cellId, liferCount, 200])
    }
  })
  return result
}

/**
 * Get species records for a specific cell from week cells data.
 * Returns array of {species_id, speciesCode, comName, probability} sorted by taxon order.
 */
export function getCellSpecies(
  weekCells: Map<number, number[]>,
  cellId: number,
  speciesById: Map<number, Species>
): { species_id: number; speciesCode: string; comName: string; probability: number }[] {
  const speciesIds = weekCells.get(cellId) || []
  const records = speciesIds.map(sid => {
    const sp = speciesById.get(sid)
    return {
      species_id: sid,
      speciesCode: sp?.speciesCode || '',
      comName: sp?.comName || 'Unknown',
      probability: 1.0,
    }
  })
  records.sort((a, b) => {
    const ta = speciesById.get(a.species_id)?.taxonOrder ?? 99999
    const tb = speciesById.get(b.species_id)?.taxonOrder ?? 99999
    return ta - tb
  })
  return records
}

/**
 * Get cells where a species occurs from week cells data.
 * Returns [{cell_id, probability}, ...]
 */
export function getSpeciesCells(
  weekCells: Map<number, number[]>,
  speciesId: number
): { cell_id: number; probability: number }[] {
  const records: { cell_id: number; probability: number }[] = []
  weekCells.forEach((speciesIds, cellId) => {
    if (speciesIds.includes(speciesId)) {
      records.push({ cell_id: cellId, probability: 1.0 })
    }
  })
  return records
}

/**
 * Get batch species data from week cells.
 * Returns {speciesId: [{cell_id, probability}, ...], ...}
 */
export function getSpeciesBatch(
  weekCells: Map<number, number[]>,
  speciesIds: Set<number>
): Record<number, { cell_id: number; probability: number }[]> {
  const result: Record<number, { cell_id: number; probability: number }[]> = {}
  speciesIds.forEach(sid => { result[sid] = [] })

  weekCells.forEach((cellSpeciesIds, cellId) => {
    for (const sid of cellSpeciesIds) {
      if (speciesIds.has(sid)) {
        result[sid].push({ cell_id: cellId, probability: 1.0 })
      }
    }
  })
  return result
}
