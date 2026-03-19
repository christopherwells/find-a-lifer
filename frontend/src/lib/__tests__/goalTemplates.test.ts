import { describe, it, expect } from 'vitest'
import type { Species } from '../../components/types'
import {
  computeThreatenedSpecies,
  computeInvasiveSpecies,
  computeRestrictedRangeSpecies,
  computeNearThreatenedSpecies,
  computeDataDeficientSpecies,
  computeRegionalSpecialties,
  computeEasySpecies,
  computeHardestSpecies,
  computeForestSpecialists,
  computeOceanBirds,
  computeWetlandBirds,
  computeConservationTemplate,
  computeDifficultyTemplate,
  computeHabitatTemplate,
  computeRegionalTemplate,
  CONSERVATION_TEMPLATES,
  DIFFICULTY_TEMPLATES,
  HABITAT_TEMPLATES,
  REGIONAL_TEMPLATES,
} from '../goalTemplates'

/** Minimal Species factory — only fields used by goalTemplates */
function makeSpecies(overrides: Partial<Species> & { speciesCode: string }): Species {
  return {
    species_id: 1,
    comName: 'Test Bird',
    sciName: 'Testus birdus',
    familyComName: 'Test Family',
    taxonOrder: 1,
    invasionStatus: {},
    conservStatus: '',
    difficultyScore: 0,
    difficultyRating: 1,
    difficultyLabel: '',
    isRestrictedRange: false,
    ebirdUrl: '',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 1,
    rangeShiftScore: 0,
    regions: [],
    ...overrides,
  }
}

// -- Test data --

const vulnSpecies = makeSpecies({
  speciesCode: 'vuln1',
  species_id: 10,
  comName: 'Vulnerable Warbler',
  conservStatus: 'Vulnerable',
  regions: ['US', 'MX', 'CA'],  // 3 regions = NOT restricted range
})

const endSpecies = makeSpecies({
  speciesCode: 'end1',
  species_id: 11,
  comName: 'Endangered Sparrow',
  conservStatus: 'Endangered',
  regions: ['US', 'CA', 'MX'],  // 3 regions = NOT restricted range
})

const critSpecies = makeSpecies({
  speciesCode: 'crit1',
  species_id: 12,
  comName: 'Critical Crane',
  conservStatus: 'Critically Endangered',
  regions: ['CU', 'JM', 'HT'],  // 3 regions = NOT restricted range
})

const ntSpecies = makeSpecies({
  speciesCode: 'nt1',
  species_id: 13,
  comName: 'Near Threatened Finch',
  conservStatus: 'Near Threatened',
  regions: ['US', 'CA', 'MX'],  // 3 regions = NOT restricted range
})

const ddSpecies = makeSpecies({
  speciesCode: 'dd1',
  species_id: 14,
  comName: 'Data Deficient Owl',
  conservStatus: 'Data Deficient',
  regions: ['MX', 'GT', 'BZ'],  // 3 regions = NOT restricted range
})

const lcSpecies = makeSpecies({
  speciesCode: 'lc1',
  species_id: 15,
  comName: 'Least Concern Robin',
  conservStatus: 'Least Concern',
  regions: ['US', 'CA', 'MX'],
})

const restrictedSpecies = makeSpecies({
  speciesCode: 'rr1',
  species_id: 16,
  comName: 'Island Endemic',
  conservStatus: 'Least Concern',
  regions: ['CU'],  // only 1 region = restricted range
})

const invasiveUS = makeSpecies({
  speciesCode: 'inv1',
  species_id: 17,
  comName: 'House Sparrow',
  conservStatus: 'Least Concern',
  invasionStatus: { 'US': 'Introduced', 'CA': 'Introduced' },
  regions: ['US', 'CA', 'MX'],  // 3 regions = NOT restricted range
})

const vagrantMX = makeSpecies({
  speciesCode: 'vag1',
  species_id: 18,
  comName: 'Vagrant Starling',
  conservStatus: 'Least Concern',
  invasionStatus: { 'MX': 'Vagrant/Accidental' },
  regions: ['MX', 'GT', 'BZ'],  // 3 regions = NOT restricted range
})

const allSpecies: Species[] = [
  vulnSpecies,
  endSpecies,
  critSpecies,
  ntSpecies,
  ddSpecies,
  lcSpecies,
  restrictedSpecies,
  invasiveUS,
  vagrantMX,
]

const emptySeenCodes = new Set<string>()

// ── computeThreatenedSpecies ──────────────────────────────────────────

describe('computeThreatenedSpecies', () => {
  it('returns VU, EN, and CR species when no region filter', () => {
    const result = computeThreatenedSpecies(allSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('vuln1')
    expect(codes).toContain('end1')
    expect(codes).toContain('crit1')
    expect(codes).toHaveLength(3)
  })

  it('filters by region when region is specified', () => {
    const result = computeThreatenedSpecies(allSpecies, 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('vuln1')
    expect(codes).toContain('end1')
    expect(codes).not.toContain('crit1') // crit1 not in US
  })

  it('expands region groups (Greater Antilles includes CU)', () => {
    const result = computeThreatenedSpecies(allSpecies, 'Greater Antilles', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('crit1') // CU is in Greater Antilles
    expect(codes).not.toContain('vuln1') // US/MX/CA only
  })

  it('excludes already-seen species', () => {
    const seen = new Set(['vuln1'])
    const result = computeThreatenedSpecies(allSpecies, '', seen)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).not.toContain('vuln1')
    expect(codes).toContain('end1')
  })

  it('returns empty array when no threatened species exist', () => {
    const safe = [lcSpecies, ntSpecies]
    const result = computeThreatenedSpecies(safe, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('does not include NT or DD species', () => {
    const result = computeThreatenedSpecies(allSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).not.toContain('nt1')
    expect(codes).not.toContain('dd1')
  })
})

// ── computeNearThreatenedSpecies ──────────────────────────────────────

describe('computeNearThreatenedSpecies', () => {
  it('returns NT species', () => {
    const result = computeNearThreatenedSpecies(allSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toEqual(['nt1'])
  })

  it('filters by region', () => {
    const result = computeNearThreatenedSpecies(allSpecies, 'CU', emptySeenCodes)
    expect(result).toHaveLength(0) // nt1 only in US, CA, MX
  })

  it('excludes seen species', () => {
    const seen = new Set(['nt1'])
    const result = computeNearThreatenedSpecies(allSpecies, '', seen)
    expect(result).toHaveLength(0)
  })
})

// ── computeDataDeficientSpecies ───────────────────────────────────────

describe('computeDataDeficientSpecies', () => {
  it('returns DD species', () => {
    const result = computeDataDeficientSpecies(allSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toEqual(['dd1'])
  })

  it('filters by region', () => {
    const result = computeDataDeficientSpecies(allSpecies, 'US', emptySeenCodes)
    expect(result).toHaveLength(0) // dd1 only in MX, GT, BZ
  })

  it('returns species when region matches', () => {
    const result = computeDataDeficientSpecies(allSpecies, 'MX', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('dd1')
  })

  it('returns empty when no DD species exist', () => {
    const noDD = allSpecies.filter((s) => s.conservStatus !== 'Data Deficient')
    const result = computeDataDeficientSpecies(noDD, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })
})

// ── computeInvasiveSpecies ────────────────────────────────────────────

describe('computeInvasiveSpecies', () => {
  it('returns introduced species for a region', () => {
    const result = computeInvasiveSpecies(allSpecies, 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('inv1')
  })

  it('returns vagrant/accidental species for a region', () => {
    const result = computeInvasiveSpecies(allSpecies, 'MX', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('vag1')
  })

  it('returns empty when no region is provided', () => {
    const result = computeInvasiveSpecies(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('does not return native species', () => {
    const result = computeInvasiveSpecies(allSpecies, 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    // lcSpecies has no invasionStatus for US → native
    expect(codes).not.toContain('lc1')
  })

  it('excludes already-seen species', () => {
    const seen = new Set(['inv1'])
    const result = computeInvasiveSpecies(allSpecies, 'US', seen)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).not.toContain('inv1')
  })

  it('expands region groups for invasive check', () => {
    // invasiveUS has status for US and CA — neither are in Greater Antilles
    const result = computeInvasiveSpecies(allSpecies, 'Greater Antilles', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('returns species invasive in any code within a group', () => {
    const invasiveCU = makeSpecies({
      speciesCode: 'inv_cu',
      species_id: 30,
      invasionStatus: { 'CU': 'Introduced' },
      regions: ['CU'],
    })
    const result = computeInvasiveSpecies([...allSpecies, invasiveCU], 'Greater Antilles', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toContain('inv_cu')
  })
})

// ── computeRestrictedRangeSpecies ─────────────────────────────────────

describe('computeRestrictedRangeSpecies', () => {
  it('returns species with regions.length <= 2', () => {
    const result = computeRestrictedRangeSpecies(allSpecies, '', emptySeenCodes)
    // Only restrictedSpecies has <= 2 regions (1 region: CU)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('rr1')
  })

  it('includes species with exactly 2 regions', () => {
    const twoRegionSpecies = makeSpecies({
      speciesCode: 'two1',
      species_id: 50,
      regions: ['US', 'CA'],
    })
    const result = computeRestrictedRangeSpecies([...allSpecies, twoRegionSpecies], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('two1')
    expect(codes).toContain('rr1')
  })

  it('excludes species with 3+ regions', () => {
    const result = computeRestrictedRangeSpecies(allSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    // All other test species have 3 regions
    expect(codes).not.toContain('vuln1')
    expect(codes).not.toContain('end1')
    expect(codes).not.toContain('lc1')
  })

  it('excludes species with empty regions', () => {
    const noRegions = makeSpecies({
      speciesCode: 'noreg',
      species_id: 51,
      regions: [],
    })
    const result = computeRestrictedRangeSpecies([noRegions], '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('filters by region', () => {
    const result = computeRestrictedRangeSpecies(allSpecies, 'US', emptySeenCodes)
    expect(result).toHaveLength(0) // rr1 only in CU
  })

  it('returns species when region matches', () => {
    const result = computeRestrictedRangeSpecies(allSpecies, 'Greater Antilles', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('rr1')
  })

  it('excludes already-seen species', () => {
    const seen = new Set(['rr1'])
    const result = computeRestrictedRangeSpecies(allSpecies, '', seen)
    expect(result).toHaveLength(0)
  })

  it('returns empty when no restricted-range species exist', () => {
    // All species with 3+ regions
    const wideRange = allSpecies.filter((s) => (s.regions?.length ?? 0) > 2)
    const result = computeRestrictedRangeSpecies(wideRange, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })
})

// ── computeRegionalSpecialties ────────────────────────────────────────

describe('computeRegionalSpecialties', () => {
  it('returns empty when no region is specified', () => {
    const result = computeRegionalSpecialties(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('returns species present in the target region', () => {
    const result = computeRegionalSpecialties(allSpecies, 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    // All species with US in their regions array
    expect(codes).toContain('vuln1')
    expect(codes).toContain('end1')
    expect(codes).toContain('inv1')
    // Species NOT in US
    expect(codes).not.toContain('crit1') // CU/JM/HT only
    expect(codes).not.toContain('dd1') // MX/GT/BZ only
  })

  it('sorts by fewest total regions first (more endemic)', () => {
    // Add a species with only 1 region (US) to test sorting
    const endemic = makeSpecies({
      speciesCode: 'end_us',
      species_id: 60,
      regions: ['US'],
    })
    const result = computeRegionalSpecialties([...allSpecies, endemic], 'US', emptySeenCodes)
    // endemic has 1 region, others have 3
    const regionCounts = result.map((s) => (s.regions ?? []).length)
    for (let i = 1; i < regionCounts.length; i++) {
      expect(regionCounts[i]).toBeGreaterThanOrEqual(regionCounts[i - 1])
    }
    // The single-region species should come first
    expect(result[0].speciesCode).toBe('end_us')
  })

  it('caps results at 50', () => {
    // Create 60 species all in region US with 1 region each
    const manySpecies = Array.from({ length: 60 }, (_, i) =>
      makeSpecies({
        speciesCode: `bulk${i}`,
        species_id: 100 + i,
        regions: ['US'],
      })
    )
    const result = computeRegionalSpecialties(manySpecies, 'US', emptySeenCodes)
    expect(result).toHaveLength(50)
  })

  it('excludes already-seen species', () => {
    const seen = new Set(['end1', 'vuln1'])
    const result = computeRegionalSpecialties(allSpecies, 'US', seen)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).not.toContain('end1')
    expect(codes).not.toContain('vuln1')
  })
})

// ── computeEasySpecies ──────────────────────────────────────────────

describe('computeEasySpecies', () => {
  it('returns species with difficultyRating 1-3', () => {
    const easy = makeSpecies({ speciesCode: 'easy1', species_id: 70, difficultyRating: 2, regions: ['US'] })
    const medium = makeSpecies({ speciesCode: 'med1', species_id: 71, difficultyRating: 5, regions: ['US'] })
    const hard = makeSpecies({ speciesCode: 'hard1', species_id: 72, difficultyRating: 9, regions: ['US'] })
    const result = computeEasySpecies([easy, medium, hard], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('easy1')
    expect(codes).not.toContain('med1')
    expect(codes).not.toContain('hard1')
  })

  it('includes boundary values 1 and 3', () => {
    const r1 = makeSpecies({ speciesCode: 'r1', species_id: 73, difficultyRating: 1, regions: ['US'] })
    const r3 = makeSpecies({ speciesCode: 'r3', species_id: 74, difficultyRating: 3, regions: ['US'] })
    const r4 = makeSpecies({ speciesCode: 'r4', species_id: 75, difficultyRating: 4, regions: ['US'] })
    const result = computeEasySpecies([r1, r3, r4], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('r1')
    expect(codes).toContain('r3')
    expect(codes).not.toContain('r4')
  })

  it('sorts by difficulty ascending', () => {
    const s1 = makeSpecies({ speciesCode: 's1', species_id: 76, difficultyRating: 3, regions: ['US'] })
    const s2 = makeSpecies({ speciesCode: 's2', species_id: 77, difficultyRating: 1, regions: ['US'] })
    const s3 = makeSpecies({ speciesCode: 's3', species_id: 78, difficultyRating: 2, regions: ['US'] })
    const result = computeEasySpecies([s1, s2, s3], '', emptySeenCodes)
    expect(result.map((s) => s.difficultyRating)).toEqual([1, 2, 3])
  })

  it('filters by region', () => {
    const usEasy = makeSpecies({ speciesCode: 'use', species_id: 79, difficultyRating: 2, regions: ['US'] })
    const mxEasy = makeSpecies({ speciesCode: 'mxe', species_id: 80, difficultyRating: 2, regions: ['MX'] })
    const result = computeEasySpecies([usEasy, mxEasy], 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('use')
    expect(codes).not.toContain('mxe')
  })

  it('excludes seen species', () => {
    const easy = makeSpecies({ speciesCode: 'seen_easy', species_id: 81, difficultyRating: 2, regions: ['US'] })
    const seen = new Set(['seen_easy'])
    const result = computeEasySpecies([easy], '', seen)
    expect(result).toHaveLength(0)
  })
})

// ── computeHardestSpecies ──────────────────────────────────────────────

describe('computeHardestSpecies', () => {
  it('returns species with difficultyRating 8-10', () => {
    const easy = makeSpecies({ speciesCode: 'easy1', species_id: 70, difficultyRating: 2, regions: ['US'] })
    const hard = makeSpecies({ speciesCode: 'hard1', species_id: 72, difficultyRating: 9, regions: ['US'] })
    const hardest = makeSpecies({ speciesCode: 'hard2', species_id: 73, difficultyRating: 10, regions: ['US'] })
    const result = computeHardestSpecies([easy, hard, hardest], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('hard1')
    expect(codes).toContain('hard2')
    expect(codes).not.toContain('easy1')
  })

  it('includes boundary value 8 but not 7', () => {
    const r7 = makeSpecies({ speciesCode: 'r7', species_id: 74, difficultyRating: 7, regions: ['US'] })
    const r8 = makeSpecies({ speciesCode: 'r8', species_id: 75, difficultyRating: 8, regions: ['US'] })
    const result = computeHardestSpecies([r7, r8], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('r8')
    expect(codes).not.toContain('r7')
  })

  it('sorts by difficulty descending', () => {
    const s1 = makeSpecies({ speciesCode: 's1', species_id: 76, difficultyRating: 8, regions: ['US'] })
    const s2 = makeSpecies({ speciesCode: 's2', species_id: 77, difficultyRating: 10, regions: ['US'] })
    const s3 = makeSpecies({ speciesCode: 's3', species_id: 78, difficultyRating: 9, regions: ['US'] })
    const result = computeHardestSpecies([s1, s2, s3], '', emptySeenCodes)
    expect(result.map((s) => s.difficultyRating)).toEqual([10, 9, 8])
  })

  it('filters by region', () => {
    const usHard = makeSpecies({ speciesCode: 'ush', species_id: 79, difficultyRating: 9, regions: ['US'] })
    const mxHard = makeSpecies({ speciesCode: 'mxh', species_id: 80, difficultyRating: 9, regions: ['MX'] })
    const result = computeHardestSpecies([usHard, mxHard], 'US', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('ush')
    expect(codes).not.toContain('mxh')
  })

  it('excludes seen species', () => {
    const hard = makeSpecies({ speciesCode: 'seen_hard', species_id: 81, difficultyRating: 9, regions: ['US'] })
    const seen = new Set(['seen_hard'])
    const result = computeHardestSpecies([hard], '', seen)
    expect(result).toHaveLength(0)
  })
})

// ── computeForestSpecialists ──────────────────────────────────────────

describe('computeForestSpecialists', () => {
  it('returns species with forest habitat labels', () => {
    const forest = makeSpecies({ speciesCode: 'for1', species_id: 90, habitatLabels: ['Forest'], regions: ['US'] })
    const conifer = makeSpecies({ speciesCode: 'con1', species_id: 91, habitatLabels: ['Conifer Forest'], regions: ['US'] })
    const tropical = makeSpecies({ speciesCode: 'tro1', species_id: 92, habitatLabels: ['Tropical Forest'], regions: ['US'] })
    const deciduous = makeSpecies({ speciesCode: 'dec1', species_id: 93, habitatLabels: ['Deciduous Forest'], regions: ['US'] })
    const mixed = makeSpecies({ speciesCode: 'mix1', species_id: 94, habitatLabels: ['Mixed Forest'], regions: ['US'] })
    const ocean = makeSpecies({ speciesCode: 'oce1', species_id: 95, habitatLabels: ['Ocean'], regions: ['US'] })
    const result = computeForestSpecialists([forest, conifer, tropical, deciduous, mixed, ocean], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('for1')
    expect(codes).toContain('con1')
    expect(codes).toContain('tro1')
    expect(codes).toContain('dec1')
    expect(codes).toContain('mix1')
    expect(codes).not.toContain('oce1')
  })

  it('matches species with forest label among multiple habitat labels', () => {
    const multi = makeSpecies({ speciesCode: 'mul1', species_id: 96, habitatLabels: ['Grassland', 'Forest', 'Urban'], regions: ['US'] })
    const result = computeForestSpecialists([multi], '', emptySeenCodes)
    expect(result).toHaveLength(1)
  })

  it('returns empty for species without habitatLabels', () => {
    const result = computeForestSpecialists(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('filters by region', () => {
    const usForest = makeSpecies({ speciesCode: 'usf', species_id: 97, habitatLabels: ['Forest'], regions: ['US'] })
    const mxForest = makeSpecies({ speciesCode: 'mxf', species_id: 98, habitatLabels: ['Forest'], regions: ['MX'] })
    const result = computeForestSpecialists([usForest, mxForest], 'US', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toEqual(['usf'])
  })

  it('excludes seen species', () => {
    const forest = makeSpecies({ speciesCode: 'sf', species_id: 99, habitatLabels: ['Forest'], regions: ['US'] })
    const result = computeForestSpecialists([forest], '', new Set(['sf']))
    expect(result).toHaveLength(0)
  })
})

// ── computeOceanBirds ──────────────────────────────────────────────

describe('computeOceanBirds', () => {
  it('returns species with Ocean habitat label', () => {
    const ocean = makeSpecies({ speciesCode: 'oce1', species_id: 100, habitatLabels: ['Ocean'], regions: ['US'] })
    const forest = makeSpecies({ speciesCode: 'for1', species_id: 101, habitatLabels: ['Forest'], regions: ['US'] })
    const result = computeOceanBirds([ocean, forest], '', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('oce1')
  })

  it('matches species with Ocean among multiple labels', () => {
    const multi = makeSpecies({ speciesCode: 'mul1', species_id: 102, habitatLabels: ['Coastal', 'Ocean'], regions: ['US'] })
    const result = computeOceanBirds([multi], '', emptySeenCodes)
    expect(result).toHaveLength(1)
  })

  it('returns empty for species without Ocean label', () => {
    const result = computeOceanBirds(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('filters by region', () => {
    const usOcean = makeSpecies({ speciesCode: 'uso', species_id: 103, habitatLabels: ['Ocean'], regions: ['US'] })
    const mxOcean = makeSpecies({ speciesCode: 'mxo', species_id: 104, habitatLabels: ['Ocean'], regions: ['MX'] })
    const result = computeOceanBirds([usOcean, mxOcean], 'US', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toEqual(['uso'])
  })

  it('excludes seen species', () => {
    const ocean = makeSpecies({ speciesCode: 'so', species_id: 105, habitatLabels: ['Ocean'], regions: ['US'] })
    const result = computeOceanBirds([ocean], '', new Set(['so']))
    expect(result).toHaveLength(0)
  })
})

// ── computeWetlandBirds ──────────────────────────────────────────────

describe('computeWetlandBirds', () => {
  it('returns species with Freshwater habitat label', () => {
    const fw = makeSpecies({ speciesCode: 'fw1', species_id: 110, habitatLabels: ['Freshwater'], regions: ['US'] })
    const result = computeWetlandBirds([fw], '', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('fw1')
  })

  it('returns species with Wetland habitat label', () => {
    const wl = makeSpecies({ speciesCode: 'wl1', species_id: 111, habitatLabels: ['Wetland'], regions: ['US'] })
    const result = computeWetlandBirds([wl], '', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('wl1')
  })

  it('does not match non-wetland labels', () => {
    const forest = makeSpecies({ speciesCode: 'for1', species_id: 112, habitatLabels: ['Forest'], regions: ['US'] })
    const ocean = makeSpecies({ speciesCode: 'oce1', species_id: 113, habitatLabels: ['Ocean'], regions: ['US'] })
    const result = computeWetlandBirds([forest, ocean], '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('returns empty for species without habitatLabels', () => {
    const result = computeWetlandBirds(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(0)
  })

  it('filters by region', () => {
    const usWet = makeSpecies({ speciesCode: 'usw', species_id: 114, habitatLabels: ['Freshwater'], regions: ['US'] })
    const mxWet = makeSpecies({ speciesCode: 'mxw', species_id: 115, habitatLabels: ['Wetland'], regions: ['MX'] })
    const result = computeWetlandBirds([usWet, mxWet], 'US', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toEqual(['usw'])
  })

  it('excludes seen species', () => {
    const wet = makeSpecies({ speciesCode: 'sw', species_id: 116, habitatLabels: ['Wetland'], regions: ['US'] })
    const result = computeWetlandBirds([wet], '', new Set(['sw']))
    expect(result).toHaveLength(0)
  })
})

// ── Dispatch helpers ──────────────────────────────────────────────────

describe('computeConservationTemplate', () => {
  it('dispatches threatened type', () => {
    const result = computeConservationTemplate('threatened', allSpecies, '', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toContain('vuln1')
  })

  it('dispatches near-threatened type', () => {
    const result = computeConservationTemplate('near-threatened', allSpecies, '', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toEqual(['nt1'])
  })

  it('dispatches data-deficient type', () => {
    const result = computeConservationTemplate('data-deficient', allSpecies, '', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toEqual(['dd1'])
  })

  it('dispatches invasive type', () => {
    const result = computeConservationTemplate('invasive', allSpecies, 'US', emptySeenCodes)
    expect(result.map((s) => s.speciesCode)).toContain('inv1')
  })

  it('dispatches restricted-range type', () => {
    const result = computeConservationTemplate('restricted-range', allSpecies, '', emptySeenCodes)
    // Only restrictedSpecies (rr1) has <= 2 regions; all others have 3
    expect(result.map((s) => s.speciesCode)).toEqual(['rr1'])
  })
})

describe('computeDifficultyTemplate', () => {
  it('dispatches easy-lifers type', () => {
    const easy = makeSpecies({ speciesCode: 'easy1', species_id: 70, difficultyRating: 2, regions: ['US'] })
    const hard = makeSpecies({ speciesCode: 'hard1', species_id: 71, difficultyRating: 9, regions: ['US'] })
    const result = computeDifficultyTemplate('easy-lifers', [easy, hard], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('easy1')
    expect(codes).not.toContain('hard1')
  })

  it('dispatches hardest-birds type', () => {
    const easy = makeSpecies({ speciesCode: 'easy1', species_id: 70, difficultyRating: 2, regions: ['US'] })
    const hard = makeSpecies({ speciesCode: 'hard1', species_id: 71, difficultyRating: 9, regions: ['US'] })
    const result = computeDifficultyTemplate('hardest-birds', [easy, hard], '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('hard1')
    expect(codes).not.toContain('easy1')
  })
})

describe('computeHabitatTemplate', () => {
  const forestBird = makeSpecies({ speciesCode: 'for1', species_id: 90, habitatLabels: ['Forest'], regions: ['US'] })
  const oceanBird = makeSpecies({ speciesCode: 'oce1', species_id: 91, habitatLabels: ['Ocean'], regions: ['US'] })
  const wetlandBird = makeSpecies({ speciesCode: 'wet1', species_id: 92, habitatLabels: ['Freshwater'], regions: ['US'] })
  const habitatSpecies = [forestBird, oceanBird, wetlandBird]

  it('dispatches forest-specialists type', () => {
    const result = computeHabitatTemplate('forest-specialists', habitatSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('for1')
    expect(codes).not.toContain('oce1')
    expect(codes).not.toContain('wet1')
  })

  it('dispatches ocean-birds type', () => {
    const result = computeHabitatTemplate('ocean-birds', habitatSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('oce1')
    expect(codes).not.toContain('for1')
  })

  it('dispatches wetland-birds type', () => {
    const result = computeHabitatTemplate('wetland-birds', habitatSpecies, '', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('wet1')
    expect(codes).not.toContain('oce1')
  })
})

describe('computeRegionalTemplate', () => {
  it('dispatches regional-specialties type', () => {
    const result = computeRegionalTemplate('regional-specialties', allSpecies, 'US', emptySeenCodes)
    expect(result.length).toBeGreaterThan(0)
  })
})

// ── Template registries ──────────────────────────────────────────────

describe('CONSERVATION_TEMPLATES', () => {
  it('has 5 conservation template entries', () => {
    expect(CONSERVATION_TEMPLATES).toHaveLength(5)
  })

  it('each template has required fields', () => {
    for (const tmpl of CONSERVATION_TEMPLATES) {
      expect(tmpl.id).toBeTruthy()
      expect(tmpl.label).toBeTruthy()
      expect(tmpl.emoji).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(tmpl.color).toBeTruthy()
      expect(typeof tmpl.requiresRegion).toBe('boolean')
    }
  })

  it('invasive template requires region', () => {
    const invasive = CONSERVATION_TEMPLATES.find((t) => t.id === 'invasive')
    expect(invasive?.requiresRegion).toBe(true)
  })

  it('threatened template does not require region', () => {
    const threatened = CONSERVATION_TEMPLATES.find((t) => t.id === 'threatened')
    expect(threatened?.requiresRegion).toBe(false)
  })
})

describe('DIFFICULTY_TEMPLATES', () => {
  it('has 2 difficulty template entries', () => {
    expect(DIFFICULTY_TEMPLATES).toHaveLength(2)
  })

  it('each template has required fields', () => {
    for (const tmpl of DIFFICULTY_TEMPLATES) {
      expect(tmpl.id).toBeTruthy()
      expect(tmpl.label).toBeTruthy()
      expect(tmpl.emoji).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(tmpl.color).toBeTruthy()
      expect(typeof tmpl.requiresRegion).toBe('boolean')
    }
  })
})

describe('HABITAT_TEMPLATES', () => {
  it('has 3 habitat template entries', () => {
    expect(HABITAT_TEMPLATES).toHaveLength(3)
  })

  it('each template has required fields', () => {
    for (const tmpl of HABITAT_TEMPLATES) {
      expect(tmpl.id).toBeTruthy()
      expect(tmpl.label).toBeTruthy()
      expect(tmpl.emoji).toBeTruthy()
      expect(tmpl.description).toBeTruthy()
      expect(tmpl.color).toBeTruthy()
      expect(typeof tmpl.requiresRegion).toBe('boolean')
    }
  })
})

describe('REGIONAL_TEMPLATES', () => {
  it('has 1 regional template entry', () => {
    expect(REGIONAL_TEMPLATES).toHaveLength(1)
  })

  it('regional-specialties template has required fields', () => {
    const tmpl = REGIONAL_TEMPLATES[0]
    expect(tmpl.id).toBe('regional-specialties')
    expect(tmpl.label).toBeTruthy()
    expect(tmpl.emoji).toBeTruthy()
    expect(tmpl.description).toBeTruthy()
    expect(tmpl.color).toBeTruthy()
  })
})
