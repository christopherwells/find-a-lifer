/**
 * Goal Pattern Engine — suggests species based on trait overlap with the user's
 * existing goal list. Analyzes habitat, difficulty, and family patterns to find
 * species the user would likely want to add.
 *
 * Stateless: takes species data + goal codes, returns ranked suggestions.
 */

import type { Species } from '../components/types'
import { getDisplayGroup } from './familyGroups'

interface PatternSuggestion {
  species: Species
  reason: string
  score: number
}

/**
 * Analyze the user's goal list to find trait patterns, then suggest species
 * that match those patterns but aren't already in the list or seen.
 *
 * @param allSpecies - full species list
 * @param goalCodes - species codes in the active goal list
 * @param seenCodes - user's life list
 * @param maxResults - max suggestions to return (default 10)
 */
export function getPatternSuggestions(
  allSpecies: Species[],
  goalCodes: Set<string>,
  seenCodes: Set<string>,
  maxResults = 10,
): PatternSuggestion[] {
  if (goalCodes.size < 2) return [] // need at least 2 to detect patterns

  // Build profile of the goal list
  const goalSpecies = allSpecies.filter(s => goalCodes.has(s.speciesCode))

  // Count habitat labels
  const habitatCounts: Record<string, number> = {}
  for (const s of goalSpecies) {
    for (const h of s.habitatLabels ?? []) {
      habitatCounts[h] = (habitatCounts[h] || 0) + 1
    }
  }

  // Count display groups (families)
  const familyCounts: Record<string, number> = {}
  for (const s of goalSpecies) {
    const g = getDisplayGroup(s.familyComName)
    familyCounts[g] = (familyCounts[g] || 0) + 1
  }

  // Average difficulty
  const avgDifficulty = goalSpecies.reduce((sum, s) => sum + (s.difficultyRating || 5), 0) / goalSpecies.length

  // Find dominant patterns (>= 30% of goal list)
  const threshold = goalCodes.size * 0.3
  const dominantHabitats = Object.entries(habitatCounts)
    .filter(([, count]) => count >= threshold)
    .map(([habitat]) => habitat)
  const dominantFamilies = Object.entries(familyCounts)
    .filter(([, count]) => count >= 2) // at least 2 from same family
    .map(([family]) => family)

  // Score candidates
  const candidates: PatternSuggestion[] = []

  for (const sp of allSpecies) {
    if (goalCodes.has(sp.speciesCode)) continue
    if (seenCodes.has(sp.speciesCode)) continue
    if (!sp.difficultyRating) continue

    // Minimum 1% reporting frequency somewhere (not ultra-rare)
    let score = 0
    const reasons: string[] = []

    // Habitat overlap
    const spHabitats = sp.habitatLabels ?? []
    const habitatMatch = dominantHabitats.filter(h => spHabitats.includes(h))
    if (habitatMatch.length > 0) {
      score += habitatMatch.length * 3
      reasons.push(`${habitatMatch[0]} habitat`)
    }

    // Family overlap
    const spFamily = getDisplayGroup(sp.familyComName)
    if (dominantFamilies.includes(spFamily)) {
      score += 4
      reasons.push(`same group (${spFamily})`)
    }

    // Difficulty similarity (within ±2 of average)
    const diffDist = Math.abs(sp.difficultyRating - avgDifficulty)
    if (diffDist <= 2) {
      score += 2
      reasons.push('similar difficulty')
    }

    // Bonus: conservation interest species
    if (sp.conservStatus && sp.conservStatus !== 'Least Concern' && sp.conservStatus !== 'Data Deficient') {
      score += 1
    }

    if (score >= 4 && reasons.length >= 2) {
      candidates.push({
        species: sp,
        reason: reasons.slice(0, 2).join(', '),
        score,
      })
    }
  }

  // Sort by score descending, take top N
  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, maxResults)
}
