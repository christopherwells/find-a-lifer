import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import type { Species } from './types'

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
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-[#2C3E50]">My Progress</h3>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2C3E7B]"></div>
        </div>
      </div>
    )
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

  return (
    <div className="space-y-4" data-testid="progress-tab">
      <h3 className="text-lg font-semibold text-[#2C3E50]">My Progress</h3>
      <p className="text-sm text-gray-600">
        Track your birding progress with stats and visual breakdowns by family.
      </p>

      {/* Overall Progress Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-[#2C3E50]">Overall Progress</h4>
          <span className="text-2xl font-bold text-[#2C3E7B]" data-testid="progress-percentage">
            {percentComplete.toFixed(1)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden" data-testid="progress-bar-container">
          <div
            className="bg-[#27AE60] h-full rounded-full transition-all duration-300"
            style={{ width: `${percentComplete}%` }}
            data-testid="progress-bar-fill"
          />
        </div>

        {/* Species count */}
        <p className="text-sm text-gray-600" data-testid="progress-species-count">
          <span className="font-semibold text-[#2C3E7B]">{totalSeen}</span> of{' '}
          <span className="font-semibold">{totalSpecies}</span> species seen
        </p>
      </div>

      {/* Family Breakdown */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-[#2C3E50]">Progress by Family</h4>
        <p className="text-xs text-gray-600">
          Showing top families by total species count
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="family-breakdown-list">
          {sortedFamilies.map(([familyName, stats]) => {
            const familyPercent = stats.total > 0 ? (stats.seen / stats.total) * 100 : 0
            return (
              <div key={familyName} className="space-y-1" data-testid={`family-${familyName.replace(/\s+/g, '-').toLowerCase()}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{familyName}</span>
                  <span className="text-gray-500">
                    {stats.seen}/{stats.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
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

      {/* What's Left Section */}
      {totalSeen > 0 && totalSeen < totalSpecies && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-800 mb-2">🎯 What's Left</h4>
          <p className="text-xs text-blue-700">
            You have <span className="font-semibold">{totalSpecies - totalSeen}</span> species remaining to complete your life list.
          </p>
        </div>
      )}

      {/* Completion Message */}
      {totalSeen === totalSpecies && totalSpecies > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h4 className="text-sm font-bold text-green-800 mb-1">Congratulations!</h4>
          <p className="text-xs text-green-700">
            You've seen all {totalSpecies} species!
          </p>
        </div>
      )}

      {/* Empty State */}
      {totalSeen === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-700">
            <span className="font-medium">Get started:</span> Visit the Species tab to mark birds you've seen, or import your eBird life list from the Profile tab.
          </p>
        </div>
      )}
    </div>
  )
}
