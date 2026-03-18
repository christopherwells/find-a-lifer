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

/** MapLibre expression for amber/gold intensity using feature-state 'value' (0-1) */
export function buildAmberExpression(): maplibregl.ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['feature-state', 'value'], -1],
    -1, 'rgba(0, 0, 0, 0)',               // Default: no data (transparent)
    0, 'rgba(212, 160, 23, 0.1)',          // Low intensity
    1, 'rgba(212, 160, 23, 0.85)',         // High intensity
  ] as maplibregl.ExpressionSpecification
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
