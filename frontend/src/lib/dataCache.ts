import type { Species } from '../components/types'

/**
 * Shared data cache for species metadata and grid GeoJSON.
 * Prevents redundant fetches across components — species was fetched 8x
 * and grid 2x independently before this module.
 */

let speciesPromise: Promise<Species[]> | null = null
let gridPromise: Promise<any> | null = null

/** Fetch species metadata (cached — single request shared across all components) */
export function fetchSpecies(): Promise<Species[]> {
  if (!speciesPromise) {
    speciesPromise = fetch('/api/species')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        speciesPromise = null // Allow retry on failure
        throw err
      })
  }
  return speciesPromise
}

/** Fetch grid GeoJSON (cached — single request shared across all components) */
export function fetchGrid(): Promise<any> {
  if (!gridPromise) {
    gridPromise = fetch('/api/grid')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .catch(err => {
        gridPromise = null // Allow retry on failure
        throw err
      })
  }
  return gridPromise
}
