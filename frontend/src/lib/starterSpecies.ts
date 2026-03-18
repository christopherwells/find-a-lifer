import type { Species } from '../components/types'

/**
 * Curated list of 25 common, widely-recognized US birds for the quick-start checklist.
 * Ordered roughly by how likely a casual observer would recognize them.
 * eBird species codes — must match codes in species.json.
 */
const STARTER_SPECIES_CODES = [
  'amerob',   // American Robin
  'amecro',   // American Crow
  'mallar3',  // Mallard
  'cangoo',   // Canada Goose
  'moudov',   // Mourning Dove
  'rocpig',   // Rock Pigeon
  'eursta',   // European Starling
  'houspa',   // House Sparrow
  'daejun',   // Dark-eyed Junco
  'amegfi',   // American Goldfinch
  'rewbla',   // Red-winged Blackbird
  'houfin',   // House Finch
  'dowwoo',   // Downy Woodpecker
  'norfli',   // Northern Flicker
  'sonspa',   // Song Sparrow
  'rethaw',   // Red-tailed Hawk
  'baleag',   // Bald Eagle
  'grbher3',  // Great Blue Heron
  'osprey',   // Osprey
  'killde',   // Killdeer
  'turvul',   // Turkey Vulture
  'cedwax',   // Cedar Waxwing
  'ribgul',   // Ring-billed Gull
  'barswa',   // Barn Swallow
  'wiltur',   // Wild Turkey
]

/**
 * Get the starter species checklist for new users.
 * Uses a curated list of common US birds, matched against the loaded species data.
 * Filters out species already in the user's life list.
 * Falls back to region-count ranking if fewer than 15 curated species match.
 */
export function getStarterSpecies(
  allSpecies: Species[],
  seenCodes: Set<string>,
  limit = 25
): Species[] {
  const codeToSpecies = new Map<string, Species>()
  for (const s of allSpecies) {
    codeToSpecies.set(s.speciesCode, s)
  }

  // Match curated codes in order, skipping seen and missing
  const result: Species[] = []
  const added = new Set<string>()
  for (const code of STARTER_SPECIES_CODES) {
    if (result.length >= limit) break
    if (seenCodes.has(code)) continue
    const species = codeToSpecies.get(code)
    if (species && !added.has(species.speciesCode)) {
      result.push(species)
      added.add(species.speciesCode)
    }
  }

  // Fallback: if curated list had too few matches, pad with most widespread species
  if (result.length < 15) {
    const remaining = allSpecies
      .filter((s) => !seenCodes.has(s.speciesCode) && !added.has(s.speciesCode))
      .filter((s) => s.regions && s.regions.length > 0)
      .sort((a, b) => (b.regions?.length ?? 0) - (a.regions?.length ?? 0))
    for (const s of remaining) {
      if (result.length >= limit) break
      result.push(s)
    }
  }

  return result
}
