import type { Species } from '../components/types'

/**
 * Shared data cache for static files.
 * All data is served from /data/* as pre-computed static JSON.
 * No backend API at runtime.
 */

/** Base URL for data files — respects Vite's base path for GitHub Pages */
const DATA_BASE = `${import.meta.env.BASE_URL}data`

let speciesPromise: Promise<Species[]> | null = null
let gridPromise: Promise<any> | null = null
let regionsPromise: Promise<any> | null = null

// Cache week cells data: week -> Map<cellId, speciesIds[]>
const weekCellsCache = new Map<number, Promise<Map<number, number[]>>>()

// Cache week summaries
const weekSummaryCache = new Map<number, Promise<[number, number, number][]>>()

// Cache species-weeks files: speciesCode -> { weekStr: [[cellId, freq], ...] }
const speciesWeeksCache = new Map<string, Promise<Record<string, [number, number][]>>>()

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

/** Fetch grid GeoJSON (cached) */
export function fetchGrid(): Promise<any> {
  if (!gridPromise) {
    gridPromise = fetch(`${DATA_BASE}/grid.geojson`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        gridPromise = null
        throw err
      })
  }
  return gridPromise
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

/** Fetch weekly summary: [[cell_id, species_count, max_prob_uint8], ...] */
export function fetchWeekSummary(week: number): Promise<[number, number, number][]> {
  let p = weekSummaryCache.get(week)
  if (!p) {
    const ww = String(week).padStart(2, '0')
    p = fetch(`${DATA_BASE}/weeks/week_${ww}_summary.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        weekSummaryCache.delete(week)
        throw err
      })
    weekSummaryCache.set(week, p)
  }
  return p
}

/**
 * Fetch week cells data and parse into a Map<cellId, speciesIds[]>.
 * Raw format: [[cell_id, [species_id, ...]], ...]
 */
export function fetchWeekCells(week: number): Promise<Map<number, number[]>> {
  let p = weekCellsCache.get(week)
  if (!p) {
    const ww = String(week).padStart(2, '0')
    p = fetch(`${DATA_BASE}/weeks/week_${ww}_cells.json`)
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
        weekCellsCache.delete(week)
        throw err
      })
    weekCellsCache.set(week, p)
  }
  return p
}

/**
 * Fetch per-species occurrence data across all 52 weeks.
 * Returns { "1": [[cell_id, freq], ...], "2": [...], ... }
 */
export function fetchSpeciesWeeks(speciesCode: string): Promise<Record<string, [number, number][]>> {
  let p = speciesWeeksCache.get(speciesCode)
  if (!p) {
    p = fetch(`${DATA_BASE}/species-weeks/${speciesCode}.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        speciesWeeksCache.delete(speciesCode)
        throw err
      })
    speciesWeeksCache.set(speciesCode, p)
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
