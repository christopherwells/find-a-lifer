import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import type { Species } from './types'
import { ProgressSkeleton } from './Skeleton'

export default function ProgressTab() {
  const { isSpeciesSeen, getTotalSeen } = useLifeList()
  const [allSpecies, setAllSpecies] = useState<Species[]>([])
  const [loading, setLoading] = useState(true)

  // Load species metadata on mount
  useEffect(() => {
    const loadSpecies = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/species')
        if (!response.ok) throw new Error('Failed to fetch species data')
        const data = await response.json() as Species[]
        setAllSpecies(data)
      } catch (error) {
        console.error('ProgressTab: failed to load species', error)
      } finally {
        setLoading(false)
      }
    }
    loadSpecies()
  }, [])

  if (loading) {
    return <ProgressSkeleton />
  }

  const totalSpecies = allSpecies.length
  const totalSeen = getTotalSeen()
  const percentComplete = totalSpecies > 0 ? (totalSeen / totalSpecies) * 100 : 0

  // Calculate family breakdown
  const familyStats: { [familyName: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    const family = species.familyComName
    if (!familyStats[family]) {
      familyStats[family] = { total: 0, seen: 0 }
    }
    familyStats[family].total++
    if (isSpeciesSeen(species.speciesCode)) {
      familyStats[family].seen++
    }
  })

  // Sort families by total species count (descending)
  const sortedFamilies = Object.entries(familyStats).sort((a, b) => b[1].total - a[1].total)

  // Calculate quick stats
  const familiesStarted = Object.values(familyStats).filter(s => s.seen > 0).length
  const familiesCompleted = Object.values(familyStats).filter(s => s.seen === s.total && s.total > 0).length

  // Top 5 families to target (most unseen species)
  const topFamiliesToTarget = Object.entries(familyStats)
    .map(([name, stats]) => ({ name, unseen: stats.total - stats.seen, total: stats.total, seen: stats.seen }))
    .filter(f => f.unseen > 0)
    .sort((a, b) => b.unseen - a.unseen)
    .slice(0, 5)

  // Milestones
  const milestoneValues = [100, 250, 500, 750, 1000, 1500, 2000, 2490]
  const milestones = milestoneValues.map(target => ({
    target,
    reached: totalSeen >= target,
  }))
  const nextMilestone = milestones.find(m => !m.reached)

  return (
    <div className="space-y-4" data-testid="progress-tab">
      <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100">My Progress</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Track your birding progress with stats and visual breakdowns by family.
      </p>

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-2 gap-3" data-testid="quick-stats">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="families-started-count">{familiesStarted}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Families Started</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-[#27AE60] dark:text-green-400" data-testid="families-completed-count">{familiesCompleted}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Families Completed</p>
        </div>
      </div>

      {/* Overall Progress Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Overall Progress</h4>
          <span className="text-2xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="progress-percentage">
            {percentComplete.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden" data-testid="progress-bar-container">
          <div
            className="bg-[#27AE60] h-full rounded-full transition-all duration-300"
            style={{ width: `${percentComplete}%` }}
            data-testid="progress-bar-fill"
          />
        </div>

        {/* Species count */}
        <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="progress-species-count">
          <span className="font-semibold text-[#2C3E7B] dark:text-blue-400">{totalSeen}</span> of{' '}
          <span className="font-semibold">{totalSpecies}</span> species seen
        </p>
      </div>

      {/* Milestones Section */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3" data-testid="milestones-section">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Milestones</h4>
        <div className="space-y-2">
          {milestones.map(({ target, reached }) => {
            const isNext = nextMilestone?.target === target
            const progressToNext = isNext ? (totalSeen / target) * 100 : 0
            return (
              <div key={target} className="flex items-center gap-2" data-testid={`milestone-${target}`}>
                <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs ${
                  reached
                    ? 'bg-[#27AE60] text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }`}>
                  {reached ? '\u2713' : ''}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-medium ${reached ? 'text-[#27AE60] dark:text-green-400' : isNext ? 'text-[#2C3E7B] dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                      {target.toLocaleString()} species
                    </span>
                    {isNext && (
                      <span className="text-[#2C3E7B] dark:text-blue-400 font-medium">
                        {totalSeen}/{target}
                      </span>
                    )}
                  </div>
                  {isNext && (
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden mt-1">
                      <div
                        className="bg-[#2C3E7B] h-full rounded-full transition-all duration-300"
                        style={{ width: `${progressToNext}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Family Breakdown */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Progress by Family</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Showing top families by total species count
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="family-breakdown-list">
          {sortedFamilies.map(([familyName, stats]) => {
            const familyPercent = stats.total > 0 ? (stats.seen / stats.total) * 100 : 0
            return (
              <div key={familyName} className="space-y-1" data-testid={`family-${familyName.replace(/\s+/g, '-').toLowerCase()}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{familyName}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {stats.seen}/{stats.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#2C3E7B] h-full rounded-full transition-all duration-200"
                    style={{ width: `${familyPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top Families to Target (replaces What's Left) */}
      {totalSeen > 0 && totalSeen < totalSpecies && topFamiliesToTarget.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3" data-testid="top-families-to-target">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Top Families to Target</h4>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            These families have the most species left to find
          </p>
          <div className="space-y-2">
            {topFamiliesToTarget.map((family) => {
              const familyPercent = family.total > 0 ? (family.seen / family.total) * 100 : 0
              return (
                <div key={family.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{family.name}</span>
                    <span className="text-[#2C3E7B] dark:text-blue-400 font-medium">
                      {family.unseen} unseen
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#2C3E7B] h-full rounded-full transition-all duration-200"
                      style={{ width: `${familyPercent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Completion Message */}
      {totalSeen === totalSpecies && totalSpecies > 0 && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h4 className="text-sm font-bold text-green-800 dark:text-green-300 mb-1">Congratulations!</h4>
          <p className="text-xs text-green-700 dark:text-green-400">
            You've seen all {totalSpecies} species!
          </p>
        </div>
      )}

      {/* Empty State */}
      {totalSeen === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <span className="font-medium">Get started:</span> Visit the Species tab to mark birds you've seen, or import your eBird life list from the Profile tab.
          </p>
        </div>
      )}
    </div>
  )
}
