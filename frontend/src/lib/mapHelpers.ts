/**
 * Pure helper functions and types extracted from MapView.tsx.
 * These have no component state dependencies — they take inputs and return values.
 */

import type maplibregl from 'maplibre-gl'

// ---------------------------------------------------------------------------
// Types used only within MapView
// ---------------------------------------------------------------------------

export interface OccurrenceRecord {
  cell_id: number
  species_id: number
  probability: number
}

// Summary data: [cell_id, species_count, max_prob_uint8, n_checklists?]
export type WeeklySummary = [number, number, number, number?][]

export interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
  isRestrictedRange?: boolean
  invasionStatus?: Record<string, string>
  regions?: string[]
}

export interface GoalBirdInCell {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  isSeen: boolean
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
  isRestrictedRange?: boolean
}

export interface LiferInCell {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  probability: number
  familyComName?: string
  taxonOrder?: number
  conservStatus?: string
  difficultyLabel?: string
  difficultyScore?: number
  difficultyRating?: number
  isRestrictedRange?: boolean
  isSeen?: boolean  // true when species is already on user's life list (used in show-all mode)
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/** Safe Math.min for large arrays (avoids call stack overflow with spread on 100K+ elements) */
export function safeMin(arr: number[]): number {
  if (arr.length === 0) return 0
  let min = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] < min) min = arr[i]
  return min
}

/** Safe Math.max for large arrays (avoids call stack overflow with spread on 100K+ elements) */
export function safeMax(arr: number[]): number {
  if (arr.length === 0) return 0
  let max = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] > max) max = arr[i]
  return max
}

/** Compute the centroid of a GeoJSON Polygon or MultiPolygon feature */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeCentroid(feature: any): [number, number] | null {
  const geom = feature.geometry
  const ring: number[][] | null =
    geom.type === 'Polygon' ? geom.coordinates[0] :
    geom.type === 'MultiPolygon' ? geom.coordinates[0][0] : null
  if (!ring || ring.length < 2) return null
  const n = ring.length - 1 // exclude closing vertex (== first vertex)
  let lngSum = 0, latSum = 0
  for (let i = 0; i < n; i++) { lngSum += ring[i][0]; latSum += ring[i][1] }
  return [lngSum / n, latSum / n]
}

/**
 * Viridis perceptual color gradient — designed for uniform readability.
 * Dark purple (low) -> teal -> green -> yellow (high).
 * Perceptually uniform: equal steps in data produce equal visual contrast.
 * Empty cells (no data) are fully transparent.
 */
export function buildHeatExpression(): maplibregl.ExpressionSpecification {
  // Extended viridis: purple -> teal -> green -> yellow -> orange -> red
  // Stretches the classic viridis into warm tones for a wider perceptual range.
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'value'], -1],
    -1,    'rgba(0, 0, 0, 0)',             // No data: fully transparent
    0.001, '#440154',                       // Lowest: deep purple
    0.1,   '#482878',                       // Very low: purple
    0.2,   '#3E4A89',                       // Low: blue-purple
    0.3,   '#31688E',                       // Low-mid: slate blue
    0.4,   '#26838F',                       // Mid-low: teal
    0.5,   '#1F9D8A',                       // Mid: green-teal
    0.6,   '#6CCE59',                       // Mid-high: lime green
    0.7,   '#B5DE2B',                       // High: yellow-green
    0.8,   '#FDE725',                       // Very high: vivid yellow
    0.9,   '#FCA50A',                       // Near-max: bright orange
    1.0,   '#E23028',                       // Highest: red
  ] as maplibregl.ExpressionSpecification
}

/** MapLibre expression for amber/gold lightness ramp using feature-state 'value' (0-1).
 *  Light gold (#FFF3C4) → deep amber (#B7791F) instead of opacity-only variation. */
export function buildAmberExpression(): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'value'], -1],
    -1,    'rgba(0, 0, 0, 0)',               // No data: transparent
    0.001, '#FFF3C4',                        // Lowest: light gold
    0.25,  '#FBBF24',                        // Low: bright amber
    0.5,   '#D97706',                        // Mid: amber
    0.75,  '#B45309',                        // High: deep amber
    1.0,   '#92400E',                        // Highest: dark amber-brown
  ] as maplibregl.ExpressionSpecification
}

/**
 * Quantile normalization: maps raw values to their percentile rank (0-1).
 * Ensures cells are spread evenly across the color gradient instead of
 * clustering at one end due to outlier-dominated linear scaling.
 *
 * Returns: { normalized: Map<key, 0-1 value>, boundaries: number[] }
 * boundaries has `numTicks` entries showing the raw values at each quantile tick.
 */
export function quantileNormalize(
  values: Map<number, number>,
  numTicks: number = 5
): { normalized: Map<number, number>; boundaries: number[] } {
  const entries = Array.from(values.entries()).filter(([, v]) => v > 0)
  if (entries.length === 0) {
    return { normalized: new Map(), boundaries: Array(numTicks).fill(0) }
  }

  // Sort by value to compute ranks
  entries.sort((a, b) => a[1] - b[1])

  const normalized = new Map<number, number>()
  const n = entries.length

  for (let i = 0; i < n; i++) {
    // Rank-based percentile: 0 to 1
    const rank = n === 1 ? 1 : i / (n - 1)
    normalized.set(entries[i][0], Math.max(0.001, rank)) // Ensure min > 0 for color mapping
  }

  // Compute boundary values at each tick position for legend
  const boundaries: number[] = []
  for (let t = 0; t < numTicks; t++) {
    const idx = Math.round((t / (numTicks - 1)) * (n - 1))
    boundaries.push(entries[idx][1])
  }

  return { normalized, boundaries }
}

/** Generate legend tick labels for the heatmap gradient */
export function getLegendTicks(min: number, max: number, isPercentage: boolean, numTicks: number = 5): string[] {
  if (max === 0) return Array(numTicks).fill('0')

  const ticks: string[] = []
  for (let i = 0; i < numTicks; i++) {
    const value = min + (max - min) * (i / (numTicks - 1))
    if (isPercentage) {
      ticks.push(`${Math.round(value * 100)}%`)
    } else {
      ticks.push(Math.round(value).toString())
    }
  }
  return ticks
}

/** Format quantile boundary values as legend tick labels */
export function getQuantileTicks(boundaries: number[], isPercentage: boolean): string[] {
  return boundaries.map(v => {
    if (isPercentage) return `${Math.round(v * 100)}%`
    return Math.round(v).toString()
  })
}
