import { describe, it, expect } from 'vitest'
import type { Species } from '../../components/types'
import {
  computeThreatenedSpecies,
  computeInvasiveSpecies,
  computeRestrictedRangeSpecies,
  computeNearThreatenedSpecies,
  computeDataDeficientSpecies,
  computeRegionalSpecialties,
  computeConservationTemplate,
  computeRegionalTemplate,
  CONSERVATION_TEMPLATES,
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
  conservStatus: 'VU',
  regions: ['US', 'MX'],
})

const endSpecies = makeSpecies({
  speciesCode: 'end1',
  species_id: 11,
  comName: 'Endangered Sparrow',
  conservStatus: 'EN',
  regions: ['US'],
})

const critSpecies = makeSpecies({
  speciesCode: 'crit1',
  species_id: 12,
  comName: 'Critical Crane',
  conservStatus: 'CR',
  regions: ['CU'],
})

const ntSpecies = makeSpecies({
  speciesCode: 'nt1',
  species_id: 13,
  comName: 'Near Threatened Finch',
  conservStatus: 'NT',
  regions: ['US', 'CA'],
})

const ddSpecies = makeSpecies({
  speciesCode: 'dd1',
  species_id: 14,
  comName: 'Data Deficient Owl',
  conservStatus: 'DD',
  regions: ['MX'],
})

const lcSpecies = makeSpecies({
  speciesCode: 'lc1',
  species_id: 15,
  comName: 'Least Concern Robin',
  conservStatus: 'LC',
  regions: ['US', 'CA', 'MX'],
})

const restrictedSpecies = makeSpecies({
  speciesCode: 'rr1',
  species_id: 16,
  comName: 'Island Endemic',
  isRestrictedRange: true,
  conservStatus: 'LC',
  regions: ['CU'],
})

const invasiveUS = makeSpecies({
  speciesCode: 'inv1',
  species_id: 17,
  comName: 'House Sparrow',
  conservStatus: 'LC',
  invasionStatus: { 'US': 'Introduced', 'CA': 'Introduced' },
  regions: ['US', 'CA'],
})

const vagrantMX = makeSpecies({
  speciesCode: 'vag1',
  species_id: 18,
  comName: 'Vagrant Starling',
  conservStatus: 'LC',
  invasionStatus: { 'MX': 'Vagrant/Accidental' },
  regions: ['MX'],
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
    expect(codes).not.toContain('crit1') // crit1 only in CU
  })

  it('expands region groups (Greater Antilles includes CU)', () => {
    const result = computeThreatenedSpecies(allSpecies, 'Greater Antilles', emptySeenCodes)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).toContain('crit1') // CU is in Greater Antilles
    expect(codes).not.toContain('vuln1') // US/MX only
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
    const result = computeNearThreatenedSpecies(allSpecies, 'MX', emptySeenCodes)
    expect(result).toHaveLength(0) // nt1 only in US, CA
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
    expect(result).toHaveLength(0) // dd1 only in MX
  })

  it('returns species when region matches', () => {
    const result = computeDataDeficientSpecies(allSpecies, 'MX', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('dd1')
  })

  it('returns empty when no DD species exist', () => {
    const noDD = allSpecies.filter((s) => s.conservStatus !== 'DD')
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
  it('returns species with isRestrictedRange=true', () => {
    const result = computeRestrictedRangeSpecies(allSpecies, '', emptySeenCodes)
    expect(result).toHaveLength(1)
    expect(result[0].speciesCode).toBe('rr1')
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
    const noRestricted = allSpecies.filter((s) => !s.isRestrictedRange)
    const result = computeRestrictedRangeSpecies(noRestricted, '', emptySeenCodes)
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
    expect(codes).not.toContain('crit1') // CU only
    expect(codes).not.toContain('dd1') // MX only
  })

  it('sorts by fewest total regions first (more endemic)', () => {
    const result = computeRegionalSpecialties(allSpecies, 'US', emptySeenCodes)
    // endSpecies has 1 region (US), vulnSpecies has 2 (US, MX), lcSpecies has 3
    const regionCounts = result.map((s) => (s.regions ?? []).length)
    for (let i = 1; i < regionCounts.length; i++) {
      expect(regionCounts[i]).toBeGreaterThanOrEqual(regionCounts[i - 1])
    }
  })

  it('caps results at 30', () => {
    // Create 40 species all in region US with 1 region each
    const manySpecies = Array.from({ length: 40 }, (_, i) =>
      makeSpecies({
        speciesCode: `bulk${i}`,
        species_id: 100 + i,
        regions: ['US'],
      })
    )
    const result = computeRegionalSpecialties(manySpecies, 'US', emptySeenCodes)
    expect(result).toHaveLength(30)
  })

  it('excludes already-seen species', () => {
    const seen = new Set(['end1', 'vuln1'])
    const result = computeRegionalSpecialties(allSpecies, 'US', seen)
    const codes = result.map((s) => s.speciesCode)
    expect(codes).not.toContain('end1')
    expect(codes).not.toContain('vuln1')
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
    expect(result.map((s) => s.speciesCode)).toEqual(['rr1'])
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
