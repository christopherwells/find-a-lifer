import type { Species } from '../components/types'

/**
 * Shared data cache for static files.
 * All data is served from /data/* as pre-computed static JSON.
 * No backend API at runtime.
 */

/** Base URL for data files — respects Vite's base path for GitHub Pages */
const DATA_BASE = `${import.meta.env.BASE_URL}data`

let speciesPromise: Promise<Species[]> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON structure varies by consumer (MapLibre, custom)
let regionsPromise: Promise<any> | null = null

// Resolution-aware caches: "res-week" or "res" as key prefix
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON structure varies by consumer
const gridPromiseByRes = new Map<number, Promise<any>>()

/** Per-cell species data with optional reporting frequencies */
export interface CellSpeciesData {
  speciesIds: number[]
  /** Reporting frequency per species (0-255 uint8, divide by 255 for 0-1). Same order as speciesIds. */
  freqs: number[] | null
}

// Cache week cells data: "res-week" -> Map<cellId, CellSpeciesData>
const weekCellsCache = new Map<string, Promise<Map<number, CellSpeciesData>>>()

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON cast by consumers
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON cast by consumers
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
 * Fetch week cells data for a resolution.
 * Raw format: [[cell_id, [species_id, ...], [freq_uint8, ...]], ...]
 * The freqs array is optional (backward compat with old data).
 */
export function fetchWeekCells(week: number, resolution?: number): Promise<Map<number, CellSpeciesData>> {
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
      .then((raw: (number | number[])[][]) => {
        const m = new Map<number, CellSpeciesData>()
        for (const entry of raw) {
          const cellId = entry[0] as number
          const speciesIds = entry[1] as number[]
          const freqs = entry.length > 2 ? (entry[2] as number[]) : null
          m.set(cellId, { speciesIds, freqs })
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
  weekCells: Map<number, CellSpeciesData>,
  seenSpeciesIds: Set<number>
): [number, number, number][] {
  const result: [number, number, number][] = []
  weekCells.forEach(({ speciesIds }, cellId) => {
    const liferCount = speciesIds.filter(sid => !seenSpeciesIds.has(sid)).length
    if (liferCount > 0) {
      result.push([cellId, liferCount, 200])
    }
  })
  return result
}

/**
 * Compute combined probability of seeing at least one target bird per cell.
 * P = 1 - ∏(1 - freq_i) for all target species in each cell.
 * targetSpeciesIds: species to include (lifers not on life list, or goal list species).
 * If null, includes ALL species in the cell.
 */
export function computeCombinedProbability(
  weekCells: Map<number, CellSpeciesData>,
  targetSpeciesIds: Set<number> | null
): Map<number, number> {
  const result = new Map<number, number>()
  weekCells.forEach(({ speciesIds, freqs }, cellId) => {
    if (!freqs) return // no frequency data available
    let probNone = 1.0
    let count = 0
    for (let i = 0; i < speciesIds.length; i++) {
      if (targetSpeciesIds !== null && !targetSpeciesIds.has(speciesIds[i])) continue
      const freq = freqs[i] / 255
      probNone *= (1 - freq)
      count++
    }
    if (count > 0) {
      const probAny = 1 - probNone
      if (probAny > 0.001) result.set(cellId, probAny)
    }
  })
  return result
}

/**
 * Get species records for a specific cell from week cells data.
 * Returns array of {species_id, speciesCode, comName, probability} sorted by taxon order.
 */
export function getCellSpecies(
  weekCells: Map<number, CellSpeciesData>,
  cellId: number,
  speciesById: Map<number, Species>
): { species_id: number; speciesCode: string; comName: string; probability: number }[] {
  const cellData = weekCells.get(cellId)
  if (!cellData) return []
  const { speciesIds, freqs } = cellData
  const records = speciesIds.map((sid, i) => {
    const sp = speciesById.get(sid)
    return {
      species_id: sid,
      speciesCode: sp?.speciesCode || '',
      comName: sp?.comName || 'Unknown',
      probability: freqs ? freqs[i] / 255 : 1.0,
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
  weekCells: Map<number, CellSpeciesData>,
  speciesId: number
): { cell_id: number; probability: number }[] {
  const records: { cell_id: number; probability: number }[] = []
  weekCells.forEach(({ speciesIds, freqs }, cellId) => {
    const idx = speciesIds.indexOf(speciesId)
    if (idx !== -1) {
      records.push({ cell_id: cellId, probability: freqs ? freqs[idx] / 255 : 1.0 })
    }
  })
  return records
}

/**
 * Get batch species data from week cells.
 * Returns {speciesId: [{cell_id, probability}, ...], ...}
 */
export function getSpeciesBatch(
  weekCells: Map<number, CellSpeciesData>,
  speciesIds: Set<number>
): Record<number, { cell_id: number; probability: number }[]> {
  const result: Record<number, { cell_id: number; probability: number }[]> = {}
  speciesIds.forEach(sid => { result[sid] = [] })

  weekCells.forEach(({ speciesIds: cellSpeciesIds, freqs }, cellId) => {
    for (let i = 0; i < cellSpeciesIds.length; i++) {
      const sid = cellSpeciesIds[i]
      if (speciesIds.has(sid)) {
        result[sid].push({ cell_id: cellId, probability: freqs ? freqs[i] / 255 : 1.0 })
      }
    }
  })
  return result
}
