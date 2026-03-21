import type { LifeListEntry } from '../contexts/LifeListContext'

export interface WeeklySummary {
  newLifers: number
  newFamiliesStarted: number
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
