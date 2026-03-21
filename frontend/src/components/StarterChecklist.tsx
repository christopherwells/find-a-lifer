import { useState, useEffect, useMemo } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { fetchSpecies } from '../lib/dataCache'
import { getStarterSpecies } from '../lib/starterSpecies'
import { getDisplayGroup, getGroupSortKey } from '../lib/familyGroups'
import type { Species } from './types'

interface StarterChecklistProps {
  onDismiss: () => void
}

/**
 * Quick-start checklist for users without an eBird life list.
 * Shows the 25 most common species across all regions with checkboxes.
 * Checking species and clicking "Done" adds them to the life list.
 */
export default function StarterChecklist({ onDismiss }: StarterChecklistProps) {
  const { seenSpecies, toggleSpecies } = useLifeList()
  const [starterSpecies, setStarterSpecies] = useState<Species[]>([])
  const [checkedCodes, setCheckedCodes] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    fetchSpecies()
      .then((data) => {
        const starters = getStarterSpecies(data as Species[], seenSpecies)
        setStarterSpecies(starters)
        setIsLoading(false)
      })
      .catch((err) => {
        console.error('StarterChecklist: failed to load species', err)
        setIsLoading(false)
      })
  // Only run on mount — don't re-fetch when seenSpecies changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = (code: string) => {
    setCheckedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const handleDone = () => {
    // Add all checked species to the life list
    checkedCodes.forEach((code) => {
      const species = starterSpecies.find((s) => s.speciesCode === code)
      if (species && !seenSpecies.has(code)) {
        toggleSpecies(code, species.comName)
      }
    })
    setIsDone(true)
  }

  const handleDismiss = () => {
    localStorage.setItem('starterChecklistDismissed', 'true')
    onDismiss()
  }

  // Group species by display group in ecological order
  const groupedSpecies = useMemo(() => {
    const groupMap = new Map<string, Species[]>()
    const groupMinOrder = new Map<string, number>()
    for (const sp of starterSpecies) {
      const group = getDisplayGroup(sp.familyComName ?? '')
      if (!groupMap.has(group)) groupMap.set(group, [])
      groupMap.get(group)!.push(sp)
      const order = sp.taxonOrder ?? 99999
      const cur = groupMinOrder.get(group) ?? 99999
      if (order < cur) groupMinOrder.set(group, order)
    }
    return Array.from(groupMap.entries()).sort(
      (a, b) => getGroupSortKey(a[0], groupMinOrder.get(a[0]) ?? 99999) - getGroupSortKey(b[0], groupMinOrder.get(b[0]) ?? 99999)
    )
  }, [starterSpecies])

  if (isLoading) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="text-sm text-blue-700 dark:text-blue-300 text-center">
          <div className="animate-spin inline-block rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent mr-2" />
          Loading common species...
        </div>
      </div>
    )
  }

  if (isDone) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center" data-testid="starter-checklist-done">
        <div className="text-2xl mb-2">🎉</div>
        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
          {checkedCodes.size > 0
            ? `Great start! You've identified ${checkedCodes.size} species.`
            : 'No worries — you can always add species from the Species tab!'}
        </p>
        <button
          onClick={handleDismiss}
          className="mt-3 text-xs text-green-700 dark:text-green-400 hover:underline font-medium"
          data-testid="starter-checklist-close"
        >
          Got it
        </button>
      </div>
    )
  }

  if (starterSpecies.length === 0) {
    return null
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden" data-testid="starter-checklist">
      {/* Header */}
      <div className="px-3 py-2 border-b border-blue-200 dark:border-blue-800">
        <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200">
          Check off species you've seen
        </h3>
        <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
          Tap "Done" when finished to start your life list.
        </p>
      </div>

      {/* Species list — grouped by display group with thumbnails */}
      <div className="max-h-64 overflow-y-auto">
        {groupedSpecies.map(([group, species]) => (
          <div key={group}>
            <div className="px-3 py-0.5 bg-blue-100/70 dark:bg-blue-800/30 border-b border-blue-200/50 dark:border-blue-700/50 sticky top-0">
              <span className="text-[11px] lg:text-xs font-bold text-blue-800/70 dark:text-blue-300/70 uppercase tracking-wider">{group}</span>
            </div>
            {species.map((sp) => (
              <label
                key={sp.speciesCode}
                className="flex items-center gap-2 px-3 py-1 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 cursor-pointer"
                data-testid={`starter-species-${sp.speciesCode}`}
              >
                <input
                  type="checkbox"
                  checked={checkedCodes.has(sp.speciesCode)}
                  onChange={() => handleToggle(sp.speciesCode)}
                  className="h-3.5 w-3.5 rounded border-blue-300 text-[#2C3E7B] focus:ring-[#2C3E7B] flex-shrink-0"
                />
                <span className="text-[13px] text-gray-800 dark:text-gray-200 truncate flex-1">
                  {sp.comName}
                </span>
                {sp.photoUrl && (
                  <img
                    src={sp.photoUrl}
                    alt=""
                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                    loading="lazy"
                  />
                )}
              </label>
            ))}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-blue-200 dark:border-blue-800 flex items-center justify-between">
        <span className="text-[11px] text-blue-700 dark:text-blue-400 font-medium">
          {checkedCodes.size} selected
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-500 dark:text-gray-400 hover:underline"
            data-testid="starter-checklist-skip"
          >
            Skip
          </button>
          <button
            onClick={handleDone}
            disabled={checkedCodes.size === 0}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              checkedCodes.size > 0
                ? 'bg-[#2C3E7B] text-white hover:bg-[#243267]'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
            data-testid="starter-checklist-done-btn"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
