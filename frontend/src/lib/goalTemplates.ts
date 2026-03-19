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
  const threatened = new Set(['Vulnerable', 'Endangered', 'Critically Endangered'])
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
    sp.conservStatus === 'Data Deficient'
  )
}

/** Near-threatened species: NT conservation status. */
export function computeNearThreatenedSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.conservStatus === 'Near Threatened'
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

/** Restricted-range species: found in 2 or fewer regions. */
export function computeRestrictedRangeSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    (sp.regions?.length ?? 0) > 0 && (sp.regions?.length ?? 99) <= 2
  )
}

// ── Difficulty-based templates ───────────────────────────────────────────

/** Easy lifers: difficulty rating 1-3 (in region if specified). */
export function computeEasySpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.difficultyRating >= 1 && sp.difficultyRating <= 3
  ).sort((a, b) => a.difficultyRating - b.difficultyRating)
}

/** Hardest birds: difficulty rating 8-10 (in region if specified). */
export function computeHardestSpecies(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.difficultyRating >= 8
  ).sort((a, b) => b.difficultyRating - a.difficultyRating)
}

// ── Habitat-based templates ─────────────────────────────────────────────

/** Forest specialists: species with any forest habitat label. */
export function computeForestSpecialists(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  const forestLabels = new Set(['Forest', 'Conifer Forest', 'Tropical Forest', 'Deciduous Forest', 'Mixed Forest'])
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.habitatLabels?.some(l => forestLabels.has(l)) ?? false
  )
}

/** Ocean birds: species with Ocean habitat label. */
export function computeOceanBirds(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.habitatLabels?.includes('Ocean') ?? false
  )
}

/** Wetland birds: species with Freshwater or Wetland habitat label. */
export function computeWetlandBirds(
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  return filterByRegionAndStatus(allSpecies, region, seenCodes, (sp) =>
    sp.habitatLabels?.some(l => l === 'Freshwater' || l === 'Wetland') ?? false
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
    // Species in fewer total regions are more "regional"; within same count, easier first
    .sort((a, b) => a.totalRegions - b.totalRegions || a.species.difficultyRating - b.species.difficultyRating)
    .slice(0, 50)
    .map((entry) => entry.species)
}

// ── Template type registry ──────────────────────────────────────────────

export type ConservationTemplateType =
  | 'threatened'
  | 'near-threatened'
  | 'data-deficient'
  | 'invasive'
  | 'restricted-range'

export type DifficultyTemplateType = 'easy-lifers' | 'hardest-birds'

export type HabitatTemplateType = 'forest-specialists' | 'ocean-birds' | 'wetland-birds'

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

export const DIFFICULTY_TEMPLATES: Array<{
  id: DifficultyTemplateType
  label: string
  emoji: string
  description: string
  color: string
  requiresRegion: boolean
}> = [
  {
    id: 'easy-lifers',
    label: 'Easy Lifers',
    emoji: '⭐',
    description: 'Birds rated 1-3/10 difficulty — great for building your list',
    color: 'green',
    requiresRegion: false,
  },
  {
    id: 'hardest-birds',
    label: 'Hardest Birds',
    emoji: '🔭',
    description: 'Birds rated 8-10/10 difficulty — the ultimate challenge',
    color: 'purple',
    requiresRegion: false,
  },
]

export const HABITAT_TEMPLATES: Array<{
  id: HabitatTemplateType
  label: string
  emoji: string
  description: string
  color: string
  requiresRegion: boolean
}> = [
  {
    id: 'forest-specialists',
    label: 'Forest Specialists',
    emoji: '🌲',
    description: 'Birds of forests — conifer, tropical, deciduous, and mixed',
    color: 'emerald',
    requiresRegion: false,
  },
  {
    id: 'ocean-birds',
    label: 'Ocean Birds',
    emoji: '🌊',
    description: 'Seabirds and offshore specialists',
    color: 'blue',
    requiresRegion: false,
  },
  {
    id: 'wetland-birds',
    label: 'Wetland Birds',
    emoji: '💧',
    description: 'Freshwater and wetland species',
    color: 'cyan',
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

/** Compute species list for a given difficulty template type. */
export function computeDifficultyTemplate(
  type: DifficultyTemplateType,
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  switch (type) {
    case 'easy-lifers':
      return computeEasySpecies(allSpecies, region, seenCodes)
    case 'hardest-birds':
      return computeHardestSpecies(allSpecies, region, seenCodes)
  }
}

/** Compute species list for a given habitat template type. */
export function computeHabitatTemplate(
  type: HabitatTemplateType,
  allSpecies: Species[],
  region: string,
  seenCodes: Set<string>
): Species[] {
  switch (type) {
    case 'forest-specialists':
      return computeForestSpecialists(allSpecies, region, seenCodes)
    case 'ocean-birds':
      return computeOceanBirds(allSpecies, region, seenCodes)
    case 'wetland-birds':
      return computeWetlandBirds(allSpecies, region, seenCodes)
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
