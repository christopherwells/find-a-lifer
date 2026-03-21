import { describe, it, expect, vi } from 'vitest'

// Mock the LifeListContext module so the type import in streakUtils resolves
vi.mock('../contexts/LifeListContext', () => ({}))

import { computeWeeklySummary } from '../lib/streakUtils'

// Inline type matching LifeListEntry for test data construction
interface TestEntry {
  speciesCode: string
  comName: string
  dateAdded: number
  source: 'manual' | 'import'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateMs(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getTime()
}

function manualEntry(code: string, dateStr: string): TestEntry {
  return { speciesCode: code, comName: code, dateAdded: dateMs(dateStr), source: 'manual' }
}

function importEntry(code: string, dateStr: string): TestEntry {
  return { speciesCode: code, comName: code, dateAdded: dateMs(dateStr), source: 'import' }
}

describe('streakUtils', () => {
  describe('computeWeeklySummary', () => {
    it('returns 0 lifers and 0 families for empty entries', () => {
      const result = computeWeeklySummary([])
      expect(result.newLifers).toBe(0)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('counts manual entries from this week', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
      ]
      const result = computeWeeklySummary(entries)
      expect(result.newLifers).toBe(2)
    })

    it('excludes import entries from lifer count', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        importEntry('HOSP', todayStr()),
        importEntry('RTHA', todayStr()),
      ]
      const result = computeWeeklySummary(entries)
      expect(result.newLifers).toBe(1)
    })

    it('excludes entries from before this week', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('OLD', daysAgo(14)),
      ]
      const result = computeWeeklySummary(entries)
      expect(result.newLifers).toBe(1)
    })

    it('detects new families started this week', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['HOSP', 'Old World Sparrows'],
        ['RTHA', 'Hawks & Eagles'],
      ])
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
      ]
      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(2)
    })

    it('does not count family as new if seen before this week', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['RTHA', 'Hawks & Eagles'],
        ['HOSP', 'Old World Sparrows'],
      ])
      const entries = [
        { speciesCode: 'RTHA', comName: 'Red-tailed Hawk', dateAdded: dateMs(daysAgo(14)), source: 'manual' as const },
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
      ]
      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(1)
    })

    it('returns 0 new families when no speciesFamilyMap provided', () => {
      const entries = [manualEntry('BAEA', todayStr())]
      const result = computeWeeklySummary(entries)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('import entries before this week count toward existing families', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['RTHA', 'Hawks & Eagles'],
      ])
      const entries = [
        importEntry('RTHA', daysAgo(14)),
        manualEntry('BAEA', todayStr()),
      ]
      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('only manual entries in the current week count for new family detection', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['HOSP', 'Old World Sparrows'],
      ])
      const entries = [
        manualEntry('BAEA', todayStr()),
        importEntry('HOSP', todayStr()),
      ]
      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(1)
    })
  })
})
