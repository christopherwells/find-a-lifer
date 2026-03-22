/**
 * Recommendation engine for Goal Birds app-wide integration.
 * Computes notable birds, weekly highlights, and smart goal suggestions
 * from species metadata, life list, goal lists, and weekly frequency data.
 *
 * All functions are pure — no side effects, no state mutation.
 * Designed to be called from components with memoization.
 */

import type { Species } from '../components/types'

// ── Types ────────────────────────────────────────────────────────────────

export interface NotableBird {
  species: Species
  /** Why this bird is notable in this context */
  tag: 'Goal bird' | 'Rare find' | 'Easy win' | 'Almost there' | 'New arrival'
  /** Reporting frequency 0-1 in the current cell/week */
  frequency: number
}

export interface WeeklyHighlight {
  species: Species
  /** Category of highlight */
  category: 'new-arrival' | 'best-chance' | 'rare-visitor' | 'peak-season'
  /** Human-readable explanation */
  reason: string
  /** Frequency this week (0-1) */
  frequency: number
}

export interface SmartGoalSpecies {
  species: Species
  /** Why this species is suggested */
  reason: string
  /** Priority score (higher = more relevant) */
  priority: number
}

// ── Notable Birds for Cell Popup ─────────────────────────────────────────

/**
 * Select 3-5 notable birds from a cell's species list for the map popup.
 * Prioritizes: goal birds > rare finds > easy wins.
 *
 * @param cellSpecies - species present in the cell this week with frequencies
 * @param seenCodes - user's life list species codes
 * @param goalCodes - species codes in any active goal list
 * @param maxResults - maximum notable birds to return (default 5)
 */
export function getNotableBirds(
  cellSpecies: Array<{ species: Species; frequency: number }>,
  seenCodes: Set<string>,
  goalCodes: Set<string>,
  maxResults = 5
): NotableBird[] {
  const candidates: NotableBird[] = []

  for (const { species, frequency } of cellSpecies) {
    // Skip species the user has already seen or with <1% reporting frequency
    if (seenCodes.has(species.speciesCode)) continue
    if (frequency < 0.01) continue

    if (goalCodes.has(species.speciesCode)) {
      candidates.push({ species, tag: 'Goal bird', frequency })
    } else if (species.difficultyRating >= 8) {
      candidates.push({ species, tag: 'Rare find', frequency })
    } else if (species.difficultyRating <= 3 && frequency > 0.1) {
      candidates.push({ species, tag: 'Easy win', frequency })
    }
  }

  // Sort: goal birds first, then by difficulty descending (rarest first), then by frequency
  candidates.sort((a, b) => {
    const tagOrder = { 'Goal bird': 0, 'Rare find': 1, 'Easy win': 2, 'Almost there': 3, 'New arrival': 4 }
    const aOrder = tagOrder[a.tag] ?? 99
    const bOrder = tagOrder[b.tag] ?? 99
    if (aOrder !== bOrder) return aOrder - bOrder
    return b.species.difficultyRating - a.species.difficultyRating
  })

  return candidates.slice(0, maxResults)
}

// ── Weekly Highlights for Explore Tab ────────────────────────────────────

/**
 * Compute this week's highlights for the Explore tab.
 * Shows new arrivals, best chances for goal birds, and rare visitors.
 *
 * @param allSpecies - full species list
 * @param currentWeek - current week number (1-52)
 * @param weekFrequencies - species code → average frequency this week (0-1)
 * @param prevWeekFrequencies - species code → average frequency last week (for arrival detection)
 * @param seenCodes - user's life list
 * @param goalCodes - species in any active goal list
 * @param maxResults - max highlights to return (default 4)
 */
export function getWeeklyHighlights(
  allSpecies: Species[],
  currentWeek: number,
  weekFrequencies: Map<string, number>,
  prevWeekFrequencies: Map<string, number>,
  seenCodes: Set<string>,
  goalCodes: Set<string>,
  maxResults = 4
): WeeklyHighlight[] {
  const highlights: WeeklyHighlight[] = []

  for (const sp of allSpecies) {
    if (seenCodes.has(sp.speciesCode)) continue

    const freq = weekFrequencies.get(sp.speciesCode) ?? 0
    const prevFreq = prevWeekFrequencies.get(sp.speciesCode) ?? 0
    if (freq <= 0) continue

    // New arrival: frequency jumped significantly from previous week
    if (freq > 0.05 && prevFreq < 0.02 && freq > prevFreq * 3) {
      highlights.push({
        species: sp,
        category: 'new-arrival',
        reason: `Just arrived for week ${currentWeek}`,
        frequency: freq,
      })
    }

    // Best chance: goal species with peak frequency this week
    if (goalCodes.has(sp.speciesCode) && freq > 0.1) {
      highlights.push({
        species: sp,
        category: 'best-chance',
        reason: `Goal bird — ${Math.round(freq * 100)}% reporting rate`,
        frequency: freq,
      })
    }

    // Rare visitor: low-frequency species present this week
    if (sp.difficultyRating >= 7 && freq > 0 && freq < 0.05) {
      highlights.push({
        species: sp,
        category: 'rare-visitor',
        reason: `Rare — only ${Math.round(freq * 100)}% of checklists`,
        frequency: freq,
      })
    }

    // Peak season: species at its highest frequency right now
    if (sp.peakWeek === currentWeek && freq > 0.1) {
      highlights.push({
        species: sp,
        category: 'peak-season',
        reason: `Peak season this week`,
        frequency: freq,
      })
    }
  }

  // Deduplicate (species can match multiple categories — keep highest priority)
  const seen = new Set<string>()
  const deduped: WeeklyHighlight[] = []
  const categoryOrder = { 'best-chance': 0, 'new-arrival': 1, 'peak-season': 2, 'rare-visitor': 3 }
  highlights.sort((a, b) => (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99))
  for (const h of highlights) {
    if (!seen.has(h.species.speciesCode)) {
      seen.add(h.species.speciesCode)
      deduped.push(h)
    }
  }

  return deduped.slice(0, maxResults)
}

// ── Lightweight Weekly Highlights (peakWeek-based) ──────────────────────

/**
 * Lightweight weekly highlights using peakWeek data from Species.
 * Designed for MapControls overlay where full frequency data isn't available.
 * Uses peakWeek proximity + difficulty + goal membership to pick highlights.
 *
 * @param allSpecies - full species list
 * @param currentWeek - current week number (1-52)
 * @param seenCodes - user's life list
 * @param goalCodes - species in any active goal list
 * @param maxResults - max highlights to return (default 4)
 */
export function getWeeklyHighlightsLite(
  allSpecies: Species[],
  currentWeek: number,
  seenCodes: Set<string>,
  goalCodes: Set<string>,
  maxResults = 4,
  regionId?: string | null,
): WeeklyHighlight[] {
  const highlights: WeeklyHighlight[] = []

  for (const sp of allSpecies) {
    if (seenCodes.has(sp.speciesCode)) continue
    if (!sp.peakWeek || sp.peakWeek < 1) continue

    // Region filter: species must be present AND not a vagrant (difficulty < 8)
    let effectiveDifficulty = sp.difficultyRating ?? 5
    if (regionId) {
      const rd = sp.regionalDifficulty ?? {}
      const superToSubs: Record<string, string[]> = {
        'northern': ['ca-west', 'ca-central', 'ca-east'],
        'continental-us': ['us-ne', 'us-se', 'us-mw', 'us-sw', 'us-west', 'us-rockies'],
        'hawaii': ['us-hi'],
        'mex-central': ['mx-north', 'mx-south', 'ca-c-north', 'ca-c-south'],
        'caribbean': ['caribbean-greater', 'caribbean-lesser', 'atlantic-west'],
      }
      const memberSubs = superToSubs[regionId]

      // Find best (lowest) regional difficulty across matching sub-regions
      let bestRegionalDiff = 99
      if (rd[regionId] !== undefined) bestRegionalDiff = rd[regionId]
      else if (memberSubs) {
        for (const sub of memberSubs) {
          if (rd[sub] !== undefined && rd[sub] < bestRegionalDiff) bestRegionalDiff = rd[sub]
        }
      }

      if (bestRegionalDiff === 99) continue // not in this region
      if (bestRegionalDiff >= 8) continue   // vagrant — skip
      effectiveDifficulty = bestRegionalDiff
    }

    const distFromPeak = Math.min(
      Math.abs(sp.peakWeek - currentWeek),
      52 - Math.abs(sp.peakWeek - currentWeek)
    )
    const weeksUntilPeak = ((sp.peakWeek - currentWeek + 52) % 52)

    // Best chance: goal bird near its peak (highest priority)
    if (goalCodes.has(sp.speciesCode) && distFromPeak <= 2) {
      highlights.push({
        species: sp,
        category: 'best-chance',
        reason: distFromPeak === 0
          ? 'Goal bird at peak this week'
          : `Goal bird — peak in ${distFromPeak} week${distFromPeak > 1 ? 's' : ''}`,
        frequency: 0,
      })
      continue
    }

    // New arrival: moderately difficult species arriving soon (peak 1-3 weeks away)
    if (weeksUntilPeak >= 1 && weeksUntilPeak <= 3 && effectiveDifficulty >= 4) {
      highlights.push({
        species: sp,
        category: 'new-arrival',
        reason: `Arriving — peaks in ${weeksUntilPeak} week${weeksUntilPeak > 1 ? 's' : ''}`,
        frequency: 0,
      })
      continue
    }

    // Peak season: easy-to-moderate species peaking this exact week
    if (sp.peakWeek === currentWeek && effectiveDifficulty <= 5) {
      highlights.push({
        species: sp,
        category: 'peak-season',
        reason: 'Peak season this week',
        frequency: 0,
      })
      continue
    }

    // Rare visitor: difficult species at or near peak
    if (effectiveDifficulty >= 7 && distFromPeak <= 1) {
      highlights.push({
        species: sp,
        category: 'rare-visitor',
        reason: 'Rare — at peak now',
        frequency: 0,
      })
    }
  }

  // Sort by category priority, then by difficulty (rarer first within category)
  const categoryOrder = { 'best-chance': 0, 'new-arrival': 1, 'peak-season': 2, 'rare-visitor': 3 }
  highlights.sort((a, b) => {
    const catDiff = (categoryOrder[a.category] ?? 99) - (categoryOrder[b.category] ?? 99)
    if (catDiff !== 0) return catDiff
    return b.species.difficultyRating - a.species.difficultyRating
  })

  // Deduplicate by species code
  const seen = new Set<string>()
  const deduped: WeeklyHighlight[] = []
  for (const h of highlights) {
    if (!seen.has(h.species.speciesCode)) {
      seen.add(h.species.speciesCode)
      deduped.push(h)
    }
  }

  return deduped.slice(0, maxResults)
}

// ── Smart Goal Suggestions ───────────────────────────────────────────────

/**
 * Generate "Suggested for You" auto-goal list.
 * Picks 10-20 species the user is most likely to want to find.
 *
 * @param allSpecies - full species list
 * @param seenCodes - user's life list
 * @param goalCodes - species already in any goal list (deprioritize)
 * @param familyProgress - map of displayGroup → { total, seen } for almost-complete detection
 * @param currentWeek - for seasonal relevance
 * @param weekFrequencies - species code → avg frequency this week
 */
export function getSmartGoalSuggestions(
  allSpecies: Species[],
  seenCodes: Set<string>,
  goalCodes: Set<string>,
  familyProgress: Map<string, { total: number; seen: number }>,
  _currentWeek: number,
  weekFrequencies: Map<string, number>,
  maxResults = 15
): SmartGoalSpecies[] {
  const suggestions: SmartGoalSpecies[] = []

  for (const sp of allSpecies) {
    if (seenCodes.has(sp.speciesCode)) continue

    const freq = weekFrequencies.get(sp.speciesCode) ?? 0
    let priority = 0
    let reason = ''

    // Highest priority: completes an almost-done family
    const group = sp.familyComName // TODO: use getDisplayGroup if needed
    const progress = familyProgress.get(group)
    if (progress && progress.total >= 3) {
      const pct = progress.seen / progress.total
      if (pct >= 0.8) {
        priority = 100 + pct * 10
        const remaining = progress.total - progress.seen
        reason = `Complete ${group} — ${remaining} left`
      }
    }

    // High priority: easy lifer in season this week
    if (sp.difficultyRating <= 3 && freq > 0.15) {
      const easyPriority = 80 + freq * 20
      if (easyPriority > priority) {
        priority = easyPriority
        reason = `Easy win — ${Math.round(freq * 100)}% this week`
      }
    }

    // Medium priority: goal species peaking now
    if (goalCodes.has(sp.speciesCode) && freq > 0.1) {
      const goalPriority = 60 + freq * 30
      if (goalPriority > priority) {
        priority = goalPriority
        reason = `Goal bird peaking — ${Math.round(freq * 100)}% this week`
      }
    }

    // Lower priority: moderate difficulty in season
    if (sp.difficultyRating >= 4 && sp.difficultyRating <= 6 && freq > 0.05) {
      const modPriority = 40 + freq * 20
      if (modPriority > priority) {
        priority = modPriority
        reason = `Moderate challenge — ${sp.difficultyRating}/10`
      }
    }

    if (priority > 0) {
      suggestions.push({ species: sp, reason, priority })
    }
  }

  suggestions.sort((a, b) => b.priority - a.priority)
  return suggestions.slice(0, maxResults)
}

// ── Smart Recommendation Selection ───────────────────────────────────────

export type RecommendedSection =
  | 'easy-wins'
  | 'almost-complete'
  | 'rarest'
  | 'hardest'
  | 'migrants'
  | 'seasonal'
  | 'colorful'
  | 'owls'
  | 'raptors'
  | 'lbjs'
  | 'regional-icons'

/**
 * Pick the 3-4 most relevant suggestion sections for this user.
 * Based on life list size, family completion, and browsing context.
 */
export function getRecommendedSections(
  seenCount: number,
  familyProgress: Map<string, { total: number; seen: number }>,
): RecommendedSection[] {
  const sections: RecommendedSection[] = []

  // Always show Easy Wins for newer birders
  if (seenCount < 500) {
    sections.push('easy-wins')
  }

  // Show Almost Complete for birders with substantial lists
  const almostComplete = [...familyProgress.values()].filter(
    p => p.total >= 3 && p.seen / p.total >= 0.7 && p.seen < p.total
  )
  if (almostComplete.length > 0) {
    sections.push('almost-complete')
  }

  // Show Rarest for experienced birders
  if (seenCount >= 200) {
    sections.push('rarest')
  }

  // Show Seasonal if there are seasonal species the user hasn't seen
  if (seenCount >= 50) {
    sections.push('seasonal')
  }

  // Cap at 4 sections
  return sections.slice(0, 4)
}
