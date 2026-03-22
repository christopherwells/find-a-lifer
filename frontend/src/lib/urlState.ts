/**
 * URL state encoding/decoding for shareable map views.
 * Encodes map state (week, mode, species, center, zoom) into URL hash.
 * Format: #w=12&m=density&met=expected&s=amecro&c=-73.5,43.2&z=7.5
 */

import type { MapViewMode, LiferMetric } from '../components/types'

export interface ShareableMapState {
  week?: number
  viewMode?: MapViewMode
  liferMetric?: LiferMetric
  selectedSpecies?: string | null
  center?: [number, number]
  zoom?: number
}

const MODE_SHORT: Record<string, string> = {
  density: 'd',
  probability: 'p',
  species: 's',
  'goal-birds': 'g',
}

const SHORT_TO_MODE: Record<string, MapViewMode> = {
  d: 'density',
  p: 'probability',
  s: 'species',
  g: 'goal-birds',
}

const METRIC_SHORT: Record<string, string> = {
  count: 'c',
  chance: 'ch',
  expected: 'e',
}

const SHORT_TO_METRIC: Record<string, LiferMetric> = {
  c: 'count',
  ch: 'chance',
  e: 'expected',
}

/** Encode map state into a URL hash string */
export function encodeMapState(state: ShareableMapState): string {
  const params: string[] = []

  if (state.week != null) params.push(`w=${state.week}`)
  if (state.viewMode) params.push(`m=${MODE_SHORT[state.viewMode] || state.viewMode}`)
  if (state.liferMetric) params.push(`met=${METRIC_SHORT[state.liferMetric] || state.liferMetric}`)
  if (state.selectedSpecies) params.push(`sp=${state.selectedSpecies}`)
  if (state.center) {
    params.push(`c=${state.center[0].toFixed(4)},${state.center[1].toFixed(4)}`)
  }
  if (state.zoom != null) params.push(`z=${state.zoom.toFixed(1)}`)

  return params.length > 0 ? `#${params.join('&')}` : ''
}

/** Decode URL hash into map state */
export function decodeMapState(hash: string): ShareableMapState | null {
  if (!hash || hash.length <= 1) return null
  const clean = hash.startsWith('#') ? hash.slice(1) : hash
  if (!clean) return null

  const params = new URLSearchParams(clean)
  const state: ShareableMapState = {}
  let hasAny = false

  const w = params.get('w')
  if (w) {
    const week = parseInt(w, 10)
    if (week >= 1 && week <= 52) { state.week = week; hasAny = true }
  }

  const m = params.get('m')
  if (m) {
    const mode = SHORT_TO_MODE[m]
    if (mode) { state.viewMode = mode; hasAny = true }
  }

  const met = params.get('met')
  if (met) {
    const metric = SHORT_TO_METRIC[met]
    if (metric) { state.liferMetric = metric; hasAny = true }
  }

  const sp = params.get('sp')
  if (sp && sp.length > 0) { state.selectedSpecies = sp; hasAny = true }

  const c = params.get('c')
  if (c) {
    const parts = c.split(',')
    if (parts.length === 2) {
      const lng = parseFloat(parts[0])
      const lat = parseFloat(parts[1])
      if (!isNaN(lng) && !isNaN(lat)) { state.center = [lng, lat]; hasAny = true }
    }
  }

  const z = params.get('z')
  if (z) {
    const zoom = parseFloat(z)
    if (!isNaN(zoom) && zoom >= 0 && zoom <= 22) { state.zoom = zoom; hasAny = true }
  }

  return hasAny ? state : null
}

/** Build a full shareable URL for the current state */
export function buildShareUrl(state: ShareableMapState): string {
  const base = window.location.href.split('#')[0]
  const hash = encodeMapState(state)
  return base + hash
}
