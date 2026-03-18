import { describe, it, expect, vi } from 'vitest'

// Mock the LifeListContext module so the type import in streakUtils resolves
vi.mock('../contexts/LifeListContext', () => ({}))

import { computeStreak, computeWeeklySummary } from '../lib/streakUtils'

// Inline type matching LifeListEntry for test data construction
interface TestEntry {
  speciesCode: string
  comName: string
  dateAdded: number
  source: 'manual' | 'import'
}

/** Create a timestamp for a given date string (local time midnight) */
function dateMs(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getTime()
}

/** Create a manual entry for a given date */
function manualEntry(code: string, date: string): TestEntry {
  return {
    speciesCode: code,
    comName: `Species ${code}`,
    dateAdded: dateMs(date),
    source: 'manual',
  }
}

/** Create an import entry for a given date */
function importEntry(code: string, date: string): TestEntry {
  return {
    speciesCode: code,
    comName: `Species ${code}`,
    dateAdded: dateMs(date),
    source: 'import',
  }
}

/** Get today's date as YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Get a date N days before today as YYYY-MM-DD */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('streakUtils', () => {
  // --- computeStreak ---
  describe('computeStreak', () => {
    it('returns 0 streak for empty entries', () => {
      const result = computeStreak([])
      expect(result.currentStreak).toBe(0)
      expect(result.longestStreak).toBe(0)
      expect(result.lastActiveDate).toBeNull()
    })

    it('returns 0 streak when all entries are imports (no manual)', () => {
      const entries = [
        importEntry('BAEA', todayStr()),
        importEntry('HOSP', daysAgo(1)),
        importEntry('RTHA', daysAgo(2)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(0)
      expect(result.longestStreak).toBe(0)
      expect(result.lastActiveDate).toBeNull()
    })

    it('returns 1-day streak for single manual entry today', () => {
      const entries = [manualEntry('BAEA', todayStr())]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(1)
      expect(result.lastActiveDate).toBe(todayStr())
    })

    it('returns 2-day streak for two consecutive days ending today', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', daysAgo(1)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(2)
      expect(result.longestStreak).toBe(2)
    })

    it('returns correct streak for three consecutive days ending today', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', daysAgo(1)),
        manualEntry('RTHA', daysAgo(2)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(3)
      expect(result.longestStreak).toBe(3)
    })

    it('gap in dates breaks the current streak', () => {
      // Today and 3 days ago (gap of 2 days)
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', daysAgo(3)),
        manualEntry('RTHA', daysAgo(4)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(1) // only today
      expect(result.longestStreak).toBe(2) // the 3-day-ago + 4-day-ago pair
    })

    it('yesterday entry still counts as active (grace period)', () => {
      // Entry yesterday but NOT today — should be 1 day current streak
      const entries = [manualEntry('BAEA', daysAgo(1))]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(1)
      expect(result.lastActiveDate).toBe(daysAgo(1))
    })

    it('entry from 2 days ago without today/yesterday gives 0 current streak', () => {
      const entries = [manualEntry('BAEA', daysAgo(2))]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(0)
      expect(result.longestStreak).toBe(1)
    })

    it('multiple entries on the same day count as one day', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
        manualEntry('RTHA', todayStr()),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(1)
      expect(result.longestStreak).toBe(1)
    })

    it('longest streak is computed across all dates, not just current', () => {
      // Long streak in the past, short current streak
      const entries = [
        manualEntry('A', todayStr()),
        // gap
        manualEntry('B', daysAgo(5)),
        manualEntry('C', daysAgo(6)),
        manualEntry('D', daysAgo(7)),
        manualEntry('E', daysAgo(8)),
        manualEntry('F', daysAgo(9)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(1) // only today
      expect(result.longestStreak).toBe(5) // the 5-day run in the past
    })

    it('ignores import entries even when interleaved with manual', () => {
      const entries = [
        manualEntry('BAEA', todayStr()),
        importEntry('IMPORT1', todayStr()),
        manualEntry('HOSP', daysAgo(1)),
        importEntry('IMPORT2', daysAgo(1)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(2)
      expect(result.longestStreak).toBe(2)
    })

    it('yesterday + today with gap before that yields 2-day streak', () => {
      const entries = [
        manualEntry('A', todayStr()),
        manualEntry('B', daysAgo(1)),
        // gap
        manualEntry('C', daysAgo(5)),
      ]
      const result = computeStreak(entries)
      expect(result.currentStreak).toBe(2)
      expect(result.longestStreak).toBe(2)
    })

    it('sets lastActiveDate to the most recent manual entry date', () => {
      const entries = [
        manualEntry('HOSP', daysAgo(3)),
        manualEntry('BAEA', daysAgo(1)),
      ]
      const result = computeStreak(entries)
      expect(result.lastActiveDate).toBe(daysAgo(1))
    })
  })

  // --- computeWeeklySummary ---
  describe('computeWeeklySummary', () => {
    it('returns 0 lifers and 0 families for empty entries', () => {
      const result = computeWeeklySummary([])
      expect(result.newLifers).toBe(0)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('counts manual entries from this week', () => {
      // Use today to ensure it falls within the current week
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
      // 14 days ago is always before this week's Monday
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

      // BAEA and HOSP added today (this week), no previous entries
      const entries = [
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
      ]

      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(2) // Hawks & Eagles + Old World Sparrows
    })

    it('does not count family as new if seen before this week', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['RTHA', 'Hawks & Eagles'],
        ['HOSP', 'Old World Sparrows'],
      ])

      // RTHA (Hawks & Eagles) was seen 14 days ago, BAEA (same family) today
      const entries = [
        { speciesCode: 'RTHA', comName: 'Red-tailed Hawk', dateAdded: dateMs(daysAgo(14)), source: 'manual' as const },
        manualEntry('BAEA', todayStr()),
        manualEntry('HOSP', todayStr()),
      ]

      const result = computeWeeklySummary(entries, familyMap)
      // Hawks & Eagles not new (RTHA before this week), Old World Sparrows is new
      expect(result.newFamiliesStarted).toBe(1)
    })

    it('returns 0 new families when no speciesFamilyMap provided', () => {
      const entries = [manualEntry('BAEA', todayStr())]
      const result = computeWeeklySummary(entries)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('returns 0 new families when speciesFamilyMap has no matching codes', () => {
      const familyMap = new Map<string, string>([
        ['UNKNOWN', 'Unknown Family'],
      ])
      const entries = [manualEntry('BAEA', todayStr())]
      const result = computeWeeklySummary(entries, familyMap)
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('import entries before this week count toward existing families', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['RTHA', 'Hawks & Eagles'],
      ])

      // An import from before this week establishes the family
      const entries = [
        importEntry('RTHA', daysAgo(14)),
        manualEntry('BAEA', todayStr()),
      ]

      const result = computeWeeklySummary(entries, familyMap)
      // Hawks & Eagles already seen via RTHA import before this week
      expect(result.newFamiliesStarted).toBe(0)
    })

    it('only manual entries in the current week count for new family detection', () => {
      const familyMap = new Map<string, string>([
        ['BAEA', 'Hawks & Eagles'],
        ['HOSP', 'Old World Sparrows'],
      ])

      // BAEA is manual this week, HOSP is import this week
      const entries = [
        manualEntry('BAEA', todayStr()),
        importEntry('HOSP', todayStr()),
      ]

      const result = computeWeeklySummary(entries, familyMap)
      // Only Hawks & Eagles is new (manual), Old World Sparrows is import so not counted
      expect(result.newFamiliesStarted).toBe(1)
    })
  })
})
