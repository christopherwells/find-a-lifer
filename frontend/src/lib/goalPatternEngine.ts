/**
 * Goal Pattern Engine v2 — suggests species based on trait overlap with the
 * user's existing goal list. Analyzes habitat, difficulty, family, region,
 * seasonality, and conservation patterns to find species the user would
 * likely want to add.
 *
 * Stateless: takes species data + goal codes, returns ranked suggestions.
 */

import type { Species } from '../components/types'
import { getDisplayGroup } from './familyGroups'

export interface PatternSuggestion {
  species: Species
  reason: string
  score: number
  reasons: string[]
}

const DISMISSED_KEY = 'dismissedGoalSuggestions'

/** Get the set of dismissed suggestion species codes */
export function getDismissedSuggestions(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* ignore */ }
  return new Set()
}

/** Dismiss a suggestion so it won't appear again */
export function dismissSuggestion(speciesCode: string): void {
  const dismissed = getDismissedSuggestions()
  dismissed.add(speciesCode)
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]))
  } catch { /* ignore */ }
}

/** Clear all dismissed suggestions */
export function clearDismissedSuggestions(): void {
  localStorage.removeItem(DISMISSED_KEY)
}

/**
 * Analyze the user's goal list to find trait patterns, then suggest species
 * that match those patterns but aren't already in the list or seen.
 *
 * v2 additions: regional affinity, seasonal clustering, conservation pattern,
 * dismissal memory, richer explanations with reference species.
 */
export function getPatternSuggestions(
  allSpecies: Species[],
  goalCodes: Set<string>,
  seenCodes: Set<string>,
  maxResults = 10,
): PatternSuggestion[] {
  if (goalCodes.size < 2) return [] // need at least 2 to detect patterns

  const dismissed = getDismissedSuggestions()
  const goalSpecies = allSpecies.filter(s => goalCodes.has(s.speciesCode))

  // ── Pattern analysis ──────────────────────────────────────────────

  // 1. Habitat labels
  const habitatCounts: Record<string, number> = {}
  for (const s of goalSpecies) {
    for (const h of s.habitatLabels ?? []) {
      habitatCounts[h] = (habitatCounts[h] || 0) + 1
    }
  }

  // 2. Display groups (families)
  const familyCounts: Record<string, number> = {}
  const familyExamples: Record<string, string> = {} // family → example species name
  for (const s of goalSpecies) {
    const g = getDisplayGroup(s.familyComName)
    familyCounts[g] = (familyCounts[g] || 0) + 1
    if (!familyExamples[g]) familyExamples[g] = s.comName
  }

  // 3. Average difficulty
  const avgDifficulty = goalSpecies.reduce((sum, s) => sum + (s.difficultyRating || 5), 0) / goalSpecies.length

  // 4. Regional affinity — which sub-regions appear most in goal species
  const regionCounts: Record<string, number> = {}
  for (const s of goalSpecies) {
    for (const r of Object.keys(s.regionalDifficulty ?? {})) {
      regionCounts[r] = (regionCounts[r] || 0) + 1
    }
  }

  // 5. Seasonal clustering — detect if goal species peak in a narrow window
  const peakWeeks = goalSpecies.map(s => s.peakWeek).filter((w): w is number => w != null && w > 0)
  let seasonalCenter: number | null = null
  let seasonalSpread = Infinity
  if (peakWeeks.length >= 3) {
    // Circular mean for weeks (handle Dec/Jan wrap)
    const radians = peakWeeks.map(w => (w / 52) * 2 * Math.PI)
    const sinSum = radians.reduce((s, r) => s + Math.sin(r), 0)
    const cosSum = radians.reduce((s, r) => s + Math.cos(r), 0)
    const meanAngle = Math.atan2(sinSum / peakWeeks.length, cosSum / peakWeeks.length)
    seasonalCenter = Math.round(((meanAngle / (2 * Math.PI)) * 52 + 52) % 52) || 52
    // Circular spread (R-bar): 0 = uniform, 1 = concentrated
    const rBar = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / peakWeeks.length
    seasonalSpread = 1 - rBar // lower = more concentrated
  }

  // 6. Conservation interest — proportion of threatened species in goals
  const threatenedCount = goalSpecies.filter(s =>
    s.conservStatus && !['Least Concern', 'Data Deficient', 'LC', 'DD'].includes(s.conservStatus)
  ).length
  const conservationFocus = threatenedCount / goalSpecies.length

  // ── Thresholds ────────────────────────────────────────────────────

  const threshold = goalCodes.size * 0.3
  const dominantHabitats = Object.entries(habitatCounts)
    .filter(([, count]) => count >= threshold)
    .map(([habitat]) => habitat)
  const dominantFamilies = Object.entries(familyCounts)
    .filter(([, count]) => count >= 2)
    .map(([family]) => family)
  const dominantRegions = Object.entries(regionCounts)
    .filter(([, count]) => count >= Math.max(2, threshold))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([region]) => region)

  // ── Score candidates ──────────────────────────────────────────────

  const candidates: PatternSuggestion[] = []

  for (const sp of allSpecies) {
    if (goalCodes.has(sp.speciesCode)) continue
    if (seenCodes.has(sp.speciesCode)) continue
    if (dismissed.has(sp.speciesCode)) continue
    if (!sp.difficultyRating) continue

    let score = 0
    const reasons: string[] = []

    // Habitat overlap
    const spHabitats = sp.habitatLabels ?? []
    const habitatMatch = dominantHabitats.filter(h => spHabitats.includes(h))
    if (habitatMatch.length > 0) {
      score += habitatMatch.length * 3
      reasons.push(`${habitatMatch[0]} habitat`)
    }

    // Family overlap — with reference species
    const spFamily = getDisplayGroup(sp.familyComName)
    if (dominantFamilies.includes(spFamily)) {
      score += 4
      const example = familyExamples[spFamily]
      reasons.push(example ? `same group as ${example}` : `${spFamily} group`)
    }

    // Difficulty similarity (within ±2 of average)
    const diffDist = Math.abs(sp.difficultyRating - avgDifficulty)
    if (diffDist <= 2) {
      score += 2
      reasons.push('similar difficulty')
    }

    // Regional affinity — species present in the same sub-regions as goals
    const spRegions = Object.keys(sp.regionalDifficulty ?? {})
    const regionOverlap = dominantRegions.filter(r => spRegions.includes(r))
    if (regionOverlap.length >= 2) {
      score += 3
      reasons.push('same region as your goals')
    } else if (regionOverlap.length === 1) {
      score += 1
    }

    // Seasonal clustering — species peaks near the goal cluster
    if (seasonalCenter && seasonalSpread < 0.5 && sp.peakWeek) {
      const weekDist = Math.min(
        Math.abs(sp.peakWeek - seasonalCenter),
        52 - Math.abs(sp.peakWeek - seasonalCenter)
      )
      if (weekDist <= 6) {
        score += 2
        const seasonName = seasonalCenter <= 13 ? 'winter' : seasonalCenter <= 26 ? 'spring' : seasonalCenter <= 39 ? 'summer' : 'fall'
        reasons.push(`peaks in ${seasonName}`)
      }
    }

    // Conservation interest — if user targets threatened species, suggest more
    if (conservationFocus >= 0.2) {
      if (sp.conservStatus && !['Least Concern', 'Data Deficient', 'LC', 'DD'].includes(sp.conservStatus)) {
        score += 2
        reasons.push(`${sp.conservStatus}`)
      }
    } else {
      // Minor bonus even without conservation focus
      if (sp.conservStatus && !['Least Concern', 'Data Deficient', 'LC', 'DD'].includes(sp.conservStatus)) {
        score += 1
      }
    }

    if (score >= 4 && reasons.length >= 2) {
      candidates.push({
        species: sp,
        reason: reasons.slice(0, 3).join(' · '),
        reasons,
        score,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, maxResults)
}
