/**
 * Pure computation functions for conservation and regional goal list templates.
 * These produce filtered/sorted species arrays that can be previewed and turned
 * into goal lists via goalListsDB.saveList().
 */

import type { Species } from '../components/types'
import { expandRegionFilter } from './regionGroups'

// ── Conservation templates ──────────────────────────────────────────────

/** Threatened species: VU, EN, or CR conservation status, optionally filtered to a region. */
export function computeThreatenedSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  const threatened = new Set(['VU', 'EN', 'CR'])
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    threatened.has(sp.conservStatus)
  )
}

/** Data-deficient species: DD conservation status. */
export function computeDataDeficientSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.conservStatus === 'DD'
  )
}

/** Near-threatened species: NT conservation status. */
export function computeNearThreatenedSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.conservStatus === 'NT'
  )
}

/** Invasive / introduced species in a specific region. */
export function computeInvasiveSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  if (!region) return []
  const regionCodes = expandRegionFilter(region)
  return allSpecies.filter((sp) => {
    if (seenCodes.has(sp.speciesCode)) return false
    // Check if species is introduced or vagrant/accidental in ANY of the expanded region codes
    return regionCodes.some((code) => {
      const status = sp.invasionStatus?.[code]
      return status === 'Introduced' || status === 'Vagrant/Accidental'
    })
  })
}

/** Restricted-range species in a region (or all if no region). */
export function computeRestrictedRangeSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.isRestrictedRange
  )
}

// ── Regional templates ──────────────────────────────────────────────────

/**
 * Endemic-leaning species: those whose range is concentrated in the selected region.
 * Measured by what fraction of the species' total region list is the target region.
 * Species present in fewer total regions → more concentrated.
 */
export function computeRegionalSpecialties(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  if (!region) return []
  const regionCodes = expandRegionFilter(region)

  return allSpecies
    .filter((sp) => {
      if (seenCodes.has(sp.speciesCode)) return false
      const regions = sp.regions ?? []
      // Must be present in the target region
      return regionCodes.some((code) => regions.includes(code))
    })
    .map((sp) => ({
      species: sp,
      totalRegions: (sp.regions ?? []).length,
    }))
    // Species in fewer total regions are more "regional"
    .sort((a, b) => a.totalRegions - b.totalRegions)
    .slice(0, 30)
    .map((entry) => entry.species)
}

// ── Template type registry ──────────────────────────────────────────────

export type ConservationTemplateType =
  | 'threatened'
  | 'near-threatened'
  | 'data-deficient'
  | 'invasive'
  | 'restricted-range'

export type RegionalTemplateType = 'regional-specialties'

export const CONSERVATION_TEMPLATES: Array<{
  id: ConservationTemplateType
  label: string
  emoji: string
  description: string
  color: string       // Tailwind color key for theming the section
  requiresRegion: boolean
}> = [
  {
    id: 'threatened',
    label: 'Threatened Species',
    emoji: '🔴',
    description: 'Vulnerable, Endangered, and Critically Endangered species',
    color: 'red',
    requiresRegion: false,
  },
  {
    id: 'near-threatened',
    label: 'Near Threatened',
    emoji: '🟡',
    description: 'Species approaching threatened status',
    color: 'yellow',
    requiresRegion: false,
  },
  {
    id: 'restricted-range',
    label: 'Restricted Range',
    emoji: '📍',
    description: 'Species with limited geographic distributions',
    color: 'amber',
    requiresRegion: false,
  },
  {
    id: 'invasive',
    label: 'Introduced / Invasive',
    emoji: '🌐',
    description: 'Non-native species introduced to a region',
    color: 'orange',
    requiresRegion: true,
  },
  {
    id: 'data-deficient',
    label: 'Data Deficient',
    emoji: '❓',
    description: 'Species lacking sufficient data for assessment',
    color: 'gray',
    requiresRegion: false,
  },
]

export const REGIONAL_TEMPLATES: Array<{
  id: RegionalTemplateType
  label: string
  emoji: string
  description: string
  color: string
}> = [
  {
    id: 'regional-specialties',
    label: 'Regional Specialties',
    emoji: '🗺️',
    description: 'Species most concentrated in the selected region',
    color: 'teal',
  },
]

// ── Dispatch helper ─────────────────────────────────────────────────────

/** Compute species list for a given conservation template type. */
export function computeConservationTemplate(
  type: ConservationTemplateType,
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  switch (type) {
    case 'threatened':
      return computeThreatenedSpecies(allSpecies, region, seenCodes)
    case 'near-threatened':
      return computeNearThreatenedSpecies(allSpecies, region, seenCodes)
    case 'data-deficient':
      return computeDataDeficientSpecies(allSpecies, region, seenCodes)
    case 'invasive':
      return computeInvasiveSpecies(allSpecies, region, seenCodes)
    case 'restricted-range':
      return computeRestrictedRangeSpecies(allSpecies, region, seenCodes)
  }
}

/** Compute species list for a given regional template type. */
export function computeRegionalTemplate(
  type: RegionalTemplateType,
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  switch (type) {
    case 'regional-specialties':
      return computeRegionalSpecialties(allSpecies, region, seenCodes)
  }
}

// ── Shared helpers ──────────────────────────────────────────────────────

/** Filter species by region (optional) + seen status + a custom predicate. */
function filterByRegionAndStatus(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>,
  predicate: (sp: Species) => boolean
): Species[] {
  const regionCodes = region ? expandRegionFilter(region) : null

  return allSpecies.filter((sp) => {
    if (seenCodes.has(sp.speciesCode)) return false
    if (!predicate(sp)) return false
    if (regionCodes) {
      const regions = sp.regions ?? []
      if (!regionCodes.some((code) => regions.includes(code))) return false
    }
    return true
  })
}
