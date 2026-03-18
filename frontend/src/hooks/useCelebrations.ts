import { useCallback, useRef } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useToast } from '../contexts/ToastContext'
import { getMilestoneInfo, getAddMessage, getRemoveMessage, getGroupCompleteMessage } from '../lib/celebrationUtils'
import { getDisplayGroup } from '../lib/familyGroups'
import type { Species } from '../components/types'

/**
 * Hook that wraps species toggle with celebration logic (toasts, milestones, group completion).
 * Use `celebrateToggle` instead of raw `toggleSpecies` in UI components.
 */
export function useCelebrations(allSpecies?: Species[]) {
  const { toggleSpecies, isSpeciesSeen, seenSpecies, getTotalSeen } = useLifeList()
  const { showToast, celebrationsEnabled } = useToast()
  const suppressRef = useRef(false)

  /** Suppress celebrations temporarily (e.g., during bulk import) */
  const suppressCelebrations = useCallback(() => {
    suppressRef.current = true
  }, [])

  const resumeCelebrations = useCallback(() => {
    suppressRef.current = false
  }, [])

  const celebrateToggle = useCallback(async (speciesCode: string, comName: string) => {
    const wasSeen = isSpeciesSeen(speciesCode)
    await toggleSpecies(speciesCode, comName)

    if (!celebrationsEnabled || suppressRef.current) return

    if (wasSeen) {
      // Removed
      showToast({
        type: 'muted',
        message: getRemoveMessage(comName),
        duration: 2000,
      })
    } else {
      // Added
      const newTotal = getTotalSeen() + 1 // +1 because state may not have updated yet
      showToast({
        type: 'success',
        message: getAddMessage(comName, newTotal),
      })

      // Check milestone
      const milestone = getMilestoneInfo(newTotal)
      if (milestone) {
        // Schedule milestone toast after the success toast
        setTimeout(() => {
          showToast({
            type: 'milestone',
            message: `${newTotal} Species Milestone!`,
            detail: milestone.message,
            confetti: milestone.confetti,
            duration: milestone.tier === 'large' ? 5000 : 4000,
            shareData: milestone.tier !== 'small' ? {
              count: newTotal,
              milestone: newTotal,
              percentComplete: allSpecies ? (newTotal / allSpecies.length) * 100 : 0,
            } : undefined,
          })
        }, 500)
      }

      // Check group completion
      if (allSpecies) {
        const species = allSpecies.find(s => s.speciesCode === speciesCode)
        if (species) {
          const groupName = getDisplayGroup(species.familyComName)
          const groupSpecies = allSpecies.filter(s => getDisplayGroup(s.familyComName) === groupName)
          const groupTotal = groupSpecies.length
          // Count seen including the one we just added
          const groupSeen = groupSpecies.filter(s =>
            s.speciesCode === speciesCode || seenSpecies.has(s.speciesCode)
          ).length

          if (groupSeen === groupTotal && groupTotal > 0) {
            setTimeout(() => {
              showToast({
                type: 'group-complete',
                message: getGroupCompleteMessage(groupName, groupTotal),
                confetti: true,
                duration: 4000,
              })
            }, 1000)
          }
        }
      }
    }
  }, [toggleSpecies, isSpeciesSeen, getTotalSeen, seenSpecies, showToast, celebrationsEnabled, allSpecies])

  return {
    celebrateToggle,
    suppressCelebrations,
    resumeCelebrations,
  }
}
