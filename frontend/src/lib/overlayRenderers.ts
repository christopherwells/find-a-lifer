/**
 * Pure overlay computation functions extracted from MapView.tsx.
 *
 * Each function takes pre-loaded data and returns a Map<cellId, rawValue>
 * ready for region masking and quantile normalization. No React state,
 * no MapLibre references, no async I/O.
 */

import type { CellSpeciesData } from './dataCache'
import type { SpeciesMeta, WeeklySummary } from './mapHelpers'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Return type for overlay computations that produce a cell-value map */
export interface OverlayResult {
  /** Raw cell values before region masking / normalization */
  values: Map<number, number>
}

// ---------------------------------------------------------------------------
// Species Range mode — single species
// ---------------------------------------------------------------------------

/**
 * Build a cell -> reporting frequency map for a single species.
 */
export function computeSingleSpeciesRange(
  weekCells: Map<number, CellSpeciesData>,
  speciesId: number,
  getSpeciesCells: (wc: Map<number, CellSpeciesData>, sid: number) => { cell_id: number; probability: number }[],
): OverlayResult {
  const records = getSpeciesCells(weekCells, speciesId)
  const values = new Map<number, number>()
  for (const r of records) {
    if (r.probability > 0) values.set(r.cell_id, r.probability)
  }
  return { values }
}

// ---------------------------------------------------------------------------
// Species Range mode — multi-species bitmask
// ---------------------------------------------------------------------------

/**
 * Build a cell -> bitmask map for 2-4 species.
 * Bit i is set when species i is present in the cell.
 */
export function computeMultiSpeciesRange(
  weekCells: Map<number, CellSpeciesData>,
  speciesIds: number[],
  getSpeciesCells: (wc: Map<number, CellSpeciesData>, sid: number) => { cell_id: number; probability: number }[],
): OverlayResult {
  const values = new Map<number, number>()
  for (let i = 0; i < speciesIds.length; i++) {
    const records = getSpeciesCells(weekCells, speciesIds[i])
    const bit = 1 << i
    for (const r of records) {
      if (r.probability > 0) {
        const prev = values.get(r.cell_id) || 0
        values.set(r.cell_id, prev | bit)
      }
    }
  }
  return { values }
}

/**
 * Build a MapLibre match-expression color map for multi-species bitmasks.
 * Returns [bitmask, hexColor] pairs.
 */
export function buildMultiSpeciesBitmaskColors(
  numSpecies: number,
): [number, string][] {
  const MULTI_COLORS = ['#4A90D9', '#E74C3C', '#27AE60', '#8E44AD']
  const maxBitmask = (1 << numSpecies) - 1
  const result: [number, string][] = []

  for (let bm = 1; bm <= maxBitmask; bm++) {
    if (bm === maxBitmask) {
      // All species present: gold
      result.push([bm, '#FFD700'])
    } else {
      const presentIndices: number[] = []
      for (let i = 0; i < numSpecies; i++) {
        if (bm & (1 << i)) presentIndices.push(i)
      }
      if (presentIndices.length === 1) {
        result.push([bm, MULTI_COLORS[presentIndices[0]]])
      } else {
        // Blend: average RGB of present species
        const hexToRgb = (hex: string) => {
          const n = parseInt(hex.slice(1), 16)
          return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
        }
        const rgbToHex = (r: number, g: number, b: number) =>
          '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
        let rSum = 0, gSum = 0, bSum = 0
        for (const idx of presentIndices) {
          const [r, g, b] = hexToRgb(MULTI_COLORS[idx])
          rSum += r; gSum += g; bSum += b
        }
        const n = presentIndices.length
        result.push([bm, rgbToHex(rSum / n, gSum / n, bSum / n)])
      }
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Goal Birds mode — goal species count per cell
// ---------------------------------------------------------------------------

/**
 * Count unseen goal species per cell.
 */
/**
 * Compute combined probability of seeing at least one goal bird per cell.
 * P = 1 - ∏(1 - freq_i) for all goal species in the cell.
 * More useful than count for trip planning — shows your CHANCE of success.
 */
export function computeGoalBirdsProbability(
  weekCells: Map<number, CellSpeciesData>,
  goalSpeciesIdSet: Set<number>,
  getSpeciesBatch: (wc: Map<number, CellSpeciesData>, sids: Set<number>) => Record<number, { cell_id: number; probability: number }[]>,
): OverlayResult {
  const batchData = getSpeciesBatch(weekCells, goalSpeciesIdSet)
  // Accumulate P(miss) = ∏(1 - freq_i) per cell, then P(hit) = 1 - P(miss)
  const missProbability = new Map<number, number>()
  Object.values(batchData).forEach((records) => {
    for (const r of records) {
      if (r.probability > 0) {
        const prevMiss = missProbability.get(r.cell_id) ?? 1
        missProbability.set(r.cell_id, prevMiss * (1 - r.probability))
      }
    }
  })
  const values = new Map<number, number>()
  missProbability.forEach((miss, cellId) => {
    values.set(cellId, 1 - miss)
  })
  return { values }
}

// ---------------------------------------------------------------------------
// Combined Probability mode
// ---------------------------------------------------------------------------

/**
 * Build target species ID set for combined probability mode.
 *
 * Three cases:
 * - Goal filter active: unseen goal species
 * - Life list present (no goal filter): all unseen species in weekCells
 * - No life list, no goal filter: null (all species)
 *
 * Then intersects with speciesFilterIds if provided.
 */
export function buildProbabilityTargetIds(
  weekCells: Map<number, CellSpeciesData>,
  speciesMetaCache: SpeciesMeta[] | null,
  seenSpecies: Set<string>,
  goalBirdsOnlyFilter: boolean,
  goalSpeciesIdSet: Set<number>,
  goalSpeciesCodes: Set<string>,
  speciesFilterIds: Set<number> | null,
): Set<number> | null {
  // Build valid species ID set (excludes dropped species still in weekly data)
  const validIds = new Set<number>()
  if (speciesMetaCache) {
    speciesMetaCache.forEach(s => validIds.add(s.species_id))
  }

  const useGoalFilter = goalBirdsOnlyFilter && goalSpeciesCodes.size > 0
  let targetIds: Set<number> | null = null

  if (useGoalFilter || seenSpecies.size > 0) {
    // Build seen ID set
    const seenIds = new Set<number>()
    if (speciesMetaCache && seenSpecies.size > 0) {
      speciesMetaCache.forEach(s => {
        if (seenSpecies.has(s.speciesCode)) seenIds.add(s.species_id)
      })
    }

    if (useGoalFilter) {
      // Goal list species that haven't been seen yet
      targetIds = new Set<number>()
      goalSpeciesIdSet.forEach(sid => {
        if (!seenIds.has(sid)) targetIds!.add(sid)
      })
    } else {
      // All species not yet seen (lifers), excluding dropped species
      targetIds = new Set<number>()
      weekCells.forEach(({ speciesIds }) => {
        for (const sid of speciesIds) {
          if (validIds.has(sid) && !seenIds.has(sid)) targetIds!.add(sid)
        }
      })
    }
  }
  // If no life list and no goal filter, targetIds stays null -> all species

  // Apply species tab filters
  if (speciesFilterIds) {
    if (targetIds) {
      targetIds.forEach(sid => { if (!speciesFilterIds.has(sid)) targetIds!.delete(sid) })
    } else {
      targetIds = new Set(speciesFilterIds)
    }
  }

  return targetIds
}

/**
 * Compute combined probability overlay values.
 * Wraps dataCache.computeCombinedProbability with the target ID building logic.
 */
export function computeProbabilityOverlay(
  weekCells: Map<number, CellSpeciesData>,
  targetIds: Set<number> | null,
  computeCombinedProbability: (wc: Map<number, CellSpeciesData>, targets: Set<number> | null) => Map<number, number>,
): OverlayResult {
  const values = computeCombinedProbability(weekCells, targetIds)
  return { values }
}

// ---------------------------------------------------------------------------
// Default Density mode
// ---------------------------------------------------------------------------

/**
 * Build cell-value map for default density overlay.
 *
 * Two paths:
 * - Life list present (or species filter active): use computeLiferSummary
 * - No life list and showTotalRichness: use pre-computed weeklySummary
 */
export function computeDensityFromLiferSummary(
  weekCells: Map<number, CellSpeciesData>,
  speciesMetaCache: SpeciesMeta[] | null,
  seenSpecies: Set<string>,
  showTotalRichness: boolean,
  speciesFilterIds: Set<number> | null,
  computeLiferSummary: (
    wc: Map<number, CellSpeciesData>,
    seenIds: Set<number>,
    includeOnly?: Set<number> | null,
    validIds?: Set<number> | null,
  ) => [number, number, number][],
): OverlayResult {
  const values = new Map<number, number>()

  // Build seen species ID set + valid species ID set
  const seenIds = new Set<number>()
  const validIds = new Set<number>()
  if (speciesMetaCache) {
    speciesMetaCache.forEach(s => {
      validIds.add(s.species_id)
      if (seenSpecies.size > 0 && !showTotalRichness && seenSpecies.has(s.speciesCode)) {
        seenIds.add(s.species_id)
      }
    })
  }

  const liferData = computeLiferSummary(weekCells, seenIds, speciesFilterIds, validIds)
  for (const [cellId, liferCount] of liferData) {
    if (liferCount > 0) values.set(cellId, liferCount)
  }
  return { values }
}

/**
 * Build cell-value map from pre-computed weekly summary (total species per cell).
 * Used when user has no life list and showTotalRichness is false.
 */
export function computeDensityFromSummary(
  weeklySummary: WeeklySummary,
): OverlayResult {
  const values = new Map<number, number>()
  for (const [cellId, speciesCount] of weeklySummary) {
    if (speciesCount > 0) values.set(cellId, speciesCount)
  }
  return { values }
}

// ---------------------------------------------------------------------------
// Density range filtering (applied after region masking in density mode)
// ---------------------------------------------------------------------------

/**
 * Filter a cell-value map to only include cells within the lifer count range.
 */
export function applyLiferCountRangeFilter(
  values: Map<number, number>,
  filterMin: number,
  filterMax: number,
): Map<number, number> {
  const filtered = new Map<number, number>()
  values.forEach((count, cellId) => {
    if (count >= filterMin && count <= filterMax) {
      filtered.set(cellId, count)
    }
  })
  return filtered
}

// ---------------------------------------------------------------------------
// Region masking (shared across all modes)
// ---------------------------------------------------------------------------

/**
 * Filter a cell-value map to only include cells within a region's bounding box.
 * Returns the input map unmodified if no region filter is active.
 */
export function regionMask(
  values: Map<number, number>,
  regionBbox: [[number, number], [number, number]] | null,
  cellCenters: Map<number, [number, number]>,
): Map<number, number> {
  if (!regionBbox) return values
  const [[west, south], [east, north]] = regionBbox
  const masked = new Map<number, number>()
  values.forEach((value, cellId) => {
    const center = cellCenters.get(cellId)
    if (center && center[0] >= west && center[0] <= east && center[1] >= south && center[1] <= north) {
      masked.set(cellId, value)
    }
  })
  return masked
}
