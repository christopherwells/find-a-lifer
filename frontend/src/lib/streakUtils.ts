import type { LifeListEntry } from '../contexts/LifeListContext'

export interface StreakInfo {
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null // ISO date string (YYYY-MM-DD)
}

export interface WeeklySummary {
  newLifers: number
  newFamiliesStarted: number
}

function toLocalDateStr(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDateDiffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((da.getTime() - db.getTime()) / (86400 * 1000))
}

export function computeStreak(entries: LifeListEntry[]): StreakInfo {
  // Only count manual entries (not imports)
  const manualEntries = entries.filter(e => e.source === 'manual')
  if (manualEntries.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastActiveDate: null }
  }

  // Get unique dates (sorted descending, most recent first)
  const dates = [...new Set(manualEntries.map(e => toLocalDateStr(e.dateAdded)))]
  dates.sort((a, b) => b.localeCompare(a))

  const today = toLocalDateStr(Date.now())

  // Current streak: count consecutive days from today (or yesterday) backwards
  let currentStreak = 0
  const mostRecent = dates[0]
  const daysSinceLast = getDateDiffDays(today, mostRecent)

  if (daysSinceLast <= 1) {
    // Active today or yesterday — count the streak
    currentStreak = 1
    for (let i = 1; i < dates.length; i++) {
      if (getDateDiffDays(dates[i - 1], dates[i]) === 1) {
        currentStreak++
      } else {
        break
      }
    }
  }

  // Longest streak: scan all dates
  let longestStreak = 1
  let runLength = 1
  for (let i = 1; i < dates.length; i++) {
    if (getDateDiffDays(dates[i - 1], dates[i]) === 1) {
      runLength++
      longestStreak = Math.max(longestStreak, runLength)
    } else {
      runLength = 1
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak)

  return {
    currentStreak,
    longestStreak,
    lastActiveDate: mostRecent,
  }
}

export function computeWeeklySummary(
  entries: LifeListEntry[],
  speciesFamilyMap?: Map<string, string> // speciesCode → familyGroup
): WeeklySummary {
  const now = new Date()
  // Start of current week (Monday)
  const dayOfWeek = now.getDay()
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - daysFromMonday)
  weekStart.setHours(0, 0, 0, 0)
  const weekStartMs = weekStart.getTime()

  // Filter to this week's manual entries
  const thisWeekManual = entries.filter(
    e => e.source === 'manual' && e.dateAdded >= weekStartMs
  )

  const newLifers = thisWeekManual.length

  // Count new families started this week
  let newFamiliesStarted = 0
  if (speciesFamilyMap) {
    const familiesThisWeek = new Set<string>()
    const familiesBefore = new Set<string>()

    for (const e of entries) {
      const family = speciesFamilyMap.get(e.speciesCode)
      if (!family) continue
      if (e.dateAdded < weekStartMs) {
        familiesBefore.add(family)
      } else if (e.source === 'manual') {
        familiesThisWeek.add(family)
      }
    }

    for (const f of familiesThisWeek) {
      if (!familiesBefore.has(f)) newFamiliesStarted++
    }
  }

  return { newLifers, newFamiliesStarted }
}
