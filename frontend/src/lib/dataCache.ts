import type { Species, GoalWindowResult, CellCovariates } from '../components/types'

/**
 * Shared data cache for static files.
 * All data is served from /data/* as pre-computed static JSON.
 * No backend API at runtime.
 */

/** Base URL for data files — respects Vite's base path for GitHub Pages */
const DATA_BASE = `${import.meta.env.BASE_URL}data`

let speciesPromise: Promise<Species[]> | null = null
let regionNamesPromise: Promise<Record<string, string>> | null = null

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

// Cache cell covariates: "res" -> Map<cellId, CellCovariates>
const covariatesCache = new Map<string, Promise<Map<number, CellCovariates>>>()

// Resolution metadata cache
let resolutionsPromise: Promise<{ resolutions: number[]; default: number; zoomThresholds: Record<string, [number, number]> }> | null = null

/** Default resolution (backward compat) */
const DEFAULT_RES = 4

/** Get the data path prefix for a resolution */
function resPath(resolution?: number): string {
  if (resolution != null) return `${DATA_BASE}/r${resolution}`
  return DATA_BASE
}

/** Fetch species metadata (cached). Handles both old flat array and new {regionNames, species} formats. */
export function fetchSpecies(): Promise<Species[]> {
  if (!speciesPromise) {
    const p = fetch(`${DATA_BASE}/species.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: Species[] | { regionNames: Record<string, string>; species: Species[] }) => {
        if (Array.isArray(data)) {
          // Old flat array format — no region names available
          return data
        }
        // New format: { regionNames: {...}, species: [...] }
        if (data.regionNames) {
          regionNamesPromise = Promise.resolve(data.regionNames)
        }
        return data.species
      })
    speciesPromise = p.catch(err => {
      speciesPromise = null
      throw err
    })
  }
  return speciesPromise
}

/** Fetch region name mapping (cached). Only available after fetchSpecies() resolves with new-format data. */
export function fetchRegionNames(): Promise<Record<string, string>> {
  if (!regionNamesPromise) {
    // Trigger species fetch which populates regionNamesPromise
    return fetchSpecies().then(() => regionNamesPromise ?? Promise.resolve({}))
  }
  return regionNamesPromise
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

/**
 * Fetch environmental covariates for all cells at a given resolution.
 * Returns Map<cellId, CellCovariates> with land cover and elevation data.
 */
export function fetchCovariates(resolution?: number): Promise<Map<number, CellCovariates>> {
  const res = resolution ?? DEFAULT_RES
  const key = String(res)
  let p = covariatesCache.get(key)
  if (!p) {
    p = fetch(`${resPath(res)}/covariates.json`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: Record<string, CellCovariates>) => {
        const map = new Map<number, CellCovariates>()
        for (const [id, cov] of Object.entries(data)) {
          map.set(Number(id), cov)
        }
        return map
      })
      .catch(err => {
        covariatesCache.delete(key)
        throw err
      })
    covariatesCache.set(key, p)
  }
  return p
}

/** Build a map of cell_id → label from grid GeoJSON (cached per resolution) */
export async function getCellLabels(resolution?: number): Promise<Map<number, string>> {
  const grid = await fetchGrid(resolution)
  const labels = new Map<number, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GeoJSON feature
  for (const feature of (grid as any).features) {
    const cellId = feature.properties?.cell_id
    const label = feature.properties?.label
    if (cellId != null && label) labels.set(cellId, label)
  }
  return labels
}

/**
 * Returns a 52-element array of average reporting frequencies for a species.
 * Each element represents the average frequency (0-1) across all cells for that week.
 */
/** Cache of cell_id → state_code for sub-region filtering */
let cellStatesCache: Map<number, string> | null = null
let cellStatesLoading: Promise<Map<number, string>> | null = null

/** Load cell → state code mapping from static JSON */
async function getCellStates(resolution?: number): Promise<Map<number, string>> {
  if (cellStatesCache) return cellStatesCache
  if (cellStatesLoading) return cellStatesLoading
  const res = resolution ?? 4
  cellStatesLoading = fetch(`${import.meta.env.BASE_URL}data/r${res}/cell_states.json`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}))
    .then((data: Record<string, string>) => {
      const map = new Map<number, string>()
      for (const [cellId, stateCode] of Object.entries(data)) {
        map.set(Number(cellId), stateCode)
      }
      cellStatesCache = map
      return map
    })
  return cellStatesLoading
}

/** Check if a cell belongs to a sub-region based on its state code */
function cellInSubRegion(cellId: number, stateCodes: Set<string>, cellStates: Map<number, string>): boolean {
  const sc = cellStates.get(cellId)
  return sc ? stateCodes.has(sc) : false
}

export async function getSpeciesFrequencyProfile(
  speciesCode: string,
  resolution?: number,
  regionStateCodes?: string[]
): Promise<number[]> {
  const weeksData = await fetchSpeciesWeeks(speciesCode, resolution)
  const stateCodeSet = regionStateCodes ? new Set(regionStateCodes) : null
  const cellStates = stateCodeSet ? await getCellStates(resolution) : null
  const profile: number[] = new Array(52).fill(0)

  for (let w = 1; w <= 52; w++) {
    const cells = weeksData[String(w)]
    if (!cells || cells.length === 0) continue
    let totalFreq = 0
    let count = 0
    for (const [cellId, freq] of cells) {
      if (stateCodeSet && cellStates) {
        if (!cellInSubRegion(cellId, stateCodeSet, cellStates)) continue
      }
      totalFreq += freq / 255
      count++
    }
    if (count > 0) profile[w - 1] = totalFreq / count
  }

  return profile
}

/**
 * Returns top N cells with highest frequency for a species in a given week.
 */
export async function getSpeciesBestLocations(
  speciesCode: string,
  week: number,
  resolution?: number,
  topN = 5,
  regionStateCodes?: string[]
): Promise<Array<{ cellId: number; coordinates: [number, number]; name: string; freq: number }>> {
  const weeksData = await fetchSpeciesWeeks(speciesCode, resolution)
  const cells = weeksData[String(week)]
  if (!cells || cells.length === 0) return []

  // Get labels and coordinates
  const grid = await fetchGrid(resolution)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const features = (grid as any).features as Array<{ properties: { cell_id: number; label?: string; center_lat: number; center_lng: number } }>
  const cellMap = new Map<number, { label: string; coords: [number, number] }>()
  for (const f of features) {
    cellMap.set(f.properties.cell_id, {
      label: f.properties.label || `Cell ${f.properties.cell_id}`,
      coords: [f.properties.center_lng, f.properties.center_lat],
    })
  }

  // Filter by sub-region if specified
  let filtered = cells
  if (regionStateCodes) {
    const stateCodeSet = new Set(regionStateCodes)
    const cellStates = await getCellStates(resolution)
    filtered = cells.filter(([cellId]) => cellInSubRegion(cellId, stateCodeSet, cellStates))
  }

  // Sort by frequency descending
  const sorted = [...filtered].sort((a, b) => b[1] - a[1]).slice(0, topN)

  return sorted.map(([cellId, freq]) => {
    const info = cellMap.get(cellId)
    return {
      cellId,
      coordinates: info?.coords ?? [0, 0],
      name: info?.label ?? `Cell ${cellId}`,
      freq: freq / 255,
    }
  })
}

// ---- Client-side computation (replaces backend POST endpoints) ----

/**
 * Compute lifer summary from week cells data.
 * Returns [[cell_id, lifer_count, 200], ...] for cells with lifers.
 */
export function computeLiferSummary(
  weekCells: Map<number, CellSpeciesData>,
  seenSpeciesIds: Set<number>,
  includeOnly?: Set<number> | null
): [number, number, number][] {
  const result: [number, number, number][] = []
  weekCells.forEach(({ speciesIds }, cellId) => {
    const liferCount = speciesIds.filter(sid =>
      !seenSpeciesIds.has(sid) && (!includeOnly || includeOnly.has(sid))
    ).length
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

/**
 * Compute multi-species Window of Opportunity for a goal list.
 * For each week × cell, counts how many unseen goal species are present above
 * a frequency threshold, and computes combined observation probability.
 * Returns top results ranked by target count then combined frequency.
 *
 * Loads week cells data in batches of 8 for concurrency control.
 */
export async function computeGoalWindowOpportunities(
  goalSpeciesIds: Set<number>,
  seenSpeciesIds: Set<number>,
  speciesById: Map<number, Species>,
  cellCoords: Map<number, [number, number]>,
  cellLabels: Map<number, string>,
  weekRange: [number, number],
  minFreqThreshold: number = 0.05,
  resolution: number = 4,
  regionBbox?: [number, number, number, number] | null,
  abortSignal?: AbortSignal
): Promise<GoalWindowResult[]> {
  // Build set of unseen goal species
  const unseenGoalIds = new Set<number>()
  goalSpeciesIds.forEach(id => {
    if (!seenSpeciesIds.has(id)) unseenGoalIds.add(id)
  })
  if (unseenGoalIds.size === 0) return []

  const totalGoalSpecies = unseenGoalIds.size
  const thresholdUint8 = Math.round(minFreqThreshold * 255)

  // Determine weeks to load
  const weeks: number[] = []
  for (let w = weekRange[0]; w <= weekRange[1]; w++) {
    weeks.push(w)
  }

  // Load weeks in batches of 8 for concurrency control
  const BATCH_SIZE = 8
  const allResults: GoalWindowResult[] = []

  for (let batchStart = 0; batchStart < weeks.length; batchStart += BATCH_SIZE) {
    if (abortSignal?.aborted) return []

    const batch = weeks.slice(batchStart, batchStart + BATCH_SIZE)
    const weekCellsMaps = await Promise.all(
      batch.map(w => fetchWeekCells(w, resolution))
    )

    for (let bi = 0; bi < batch.length; bi++) {
      const week = batch[bi]
      const weekCells = weekCellsMaps[bi]

      weekCells.forEach(({ speciesIds, freqs }, cellId) => {
        // Optional region filtering
        if (regionBbox) {
          const coords = cellCoords.get(cellId)
          if (!coords) return
          const [west, south, east, north] = regionBbox
          if (coords[0] < west || coords[0] > east || coords[1] < south || coords[1] > north) return
        }

        if (!freqs) return // need frequency data for threshold check

        const presentSpecies: Array<{ speciesId: number; speciesCode: string; comName: string; freq: number }> = []
        let probNone = 1.0

        for (let i = 0; i < speciesIds.length; i++) {
          if (!unseenGoalIds.has(speciesIds[i])) continue
          if (freqs[i] < thresholdUint8) continue

          const sp = speciesById.get(speciesIds[i])
          const freq = freqs[i] / 255
          probNone *= (1 - freq)
          presentSpecies.push({
            speciesId: speciesIds[i],
            speciesCode: sp?.speciesCode || '',
            comName: sp?.comName || 'Unknown',
            freq,
          })
        }

        if (presentSpecies.length === 0) return

        const coords = cellCoords.get(cellId) || [0, 0] as [number, number]
        allResults.push({
          week,
          cellId,
          cellName: cellLabels.get(cellId) || '',
          coordinates: coords,
          targetCount: presentSpecies.length,
          totalGoalSpecies,
          combinedFreq: 1 - probNone,
          speciesPresent: presentSpecies.sort((a, b) => b.freq - a.freq),
        })
      })
    }
  }

  // Sort by target count desc, then combined freq desc
  allResults.sort((a, b) => {
    if (b.targetCount !== a.targetCount) return b.targetCount - a.targetCount
    return b.combinedFreq - a.combinedFreq
  })

  return allResults.slice(0, 50)
}
