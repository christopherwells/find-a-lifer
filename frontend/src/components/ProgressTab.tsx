import { useState, useEffect } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useAuth } from '../contexts/AuthContext'
import { useSpecies } from '../hooks/useSpecies'
import type { LifeListEntry } from '../contexts/LifeListContext'
import { ProgressSkeleton } from './Skeleton'
import { fetchRegionNames } from '../lib/dataCache'
import { getDisplayGroup } from '../lib/familyGroups'
import { REGION_GROUPS, GROUPED_CODES } from '../lib/regionGroups'
import { computeStreak, computeWeeklySummary } from '../lib/streakUtils'
import { syncUserStats, fetchLeaderboard, fetchFriendLeaderboard, type LeaderboardEntry } from '../lib/firebaseSync'
import { getFriends } from '../lib/friendsService'

const GROUP_EMOJI: Record<string, string> = {
  'Owls': '\u{1F989}',
  'Hummingbirds': '\u{1F48E}',
  'Ducks, Geese, and Waterfowl': '\u{1F986}',
  'Vultures, Hawks, and Allies': '\u{1F985}',
  'Woodpeckers': '\u{1FAB6}',
  'Parrots': '\u{1F99C}',
  'Kingfishers and Motmots': '\u{1F451}',
  'Toucans, Barbets, and Allies': '\u{1F308}',
  'Falcons': '\u{1F985}',
  'Pigeons and Doves': '\u{1F54A}\u{FE0F}',
  'Gulls, Terns, and Skuas': '\u{1F30A}',
  'Flamingos, Grebes, and Loons': '\u{1F9A9}',
}

export default function ProgressTab() {
  const {
    isSpeciesSeen, getTotalSeen, getLifeListEntries,
    yearLists, activeYearListId, setActiveYearListId, yearSeenSpecies,
    listScope, setListScope, seenSpecies,
  } = useLifeList()
  const { user } = useAuth()
  const { species: allSpecies, loading } = useSpecies()
  const [regionNames, setRegionNames] = useState<Record<string, string>>({})
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendLeaderboard, setFriendLeaderboard] = useState<LeaderboardEntry[]>([])
  const [streakInfo, setStreakInfo] = useState<{ currentStreak: number; longestStreak: number; lastActiveDate: string | null } | null>(null)
  const [weeklySummary, setWeeklySummary] = useState<{ newLifers: number; newFamiliesStarted: number } | null>(null)

  // Load region names on mount
  useEffect(() => {
    fetchRegionNames()
      .then(names => setRegionNames(names))
      .catch(err => console.error('ProgressTab: failed to load region names', err))
  }, [])

  // Load streak & weekly summary data
  useEffect(() => {
    const loadActivity = async () => {
      try {
        const entries: LifeListEntry[] = await getLifeListEntries()
        setStreakInfo(computeStreak(entries))

        // Build species→family map for weekly summary
        if (allSpecies.length > 0) {
          const familyMap = new Map<string, string>()
          allSpecies.forEach(s => familyMap.set(s.speciesCode, getDisplayGroup(s.familyComName)))
          setWeeklySummary(computeWeeklySummary(entries, familyMap))
        }
      } catch (error) {
        console.error('ProgressTab: failed to load activity data', error)
      }
    }
    if (!loading) loadActivity()
  }, [loading, seenSpecies.size, getLifeListEntries, allSpecies])

  // Leaderboard + stats sync
  useEffect(() => {
    if (!user || loading) return
    const loadLeaderboards = async () => {
      try {
        const [global, friends] = await Promise.all([
          fetchLeaderboard(10),
          getFriends(user.uid).then(f => f.length > 0
            ? fetchFriendLeaderboard([...f.map(fr => fr.uid), user.uid])
            : []
          ),
        ])
        setLeaderboard(global)
        setFriendLeaderboard(friends)
      } catch (err) {
        console.error('Failed to load leaderboards:', err)
      }
    }
    loadLeaderboards()
  }, [user, loading])

  // Sync stats to Firebase when species count changes
  useEffect(() => {
    if (!user || loading || allSpecies.length === 0) return
    const groupStats: Record<string, { total: number; seen: number }> = {}
    allSpecies.forEach(s => {
      const g = getDisplayGroup(s.familyComName)
      if (!groupStats[g]) groupStats[g] = { total: 0, seen: 0 }
      groupStats[g].total++
      if (seenSpecies.has(s.speciesCode)) groupStats[g].seen++
    })
    const started = Object.values(groupStats).filter(s => s.seen > 0).length
    const completed = Object.values(groupStats).filter(s => s.seen === s.total && s.total > 0).length

    syncUserStats(user.uid, {
      speciesCount: seenSpecies.size,
      groupsCompleted: completed,
      groupsStarted: started,
      currentStreak: streakInfo?.currentStreak ?? 0,
      longestStreak: streakInfo?.longestStreak ?? 0,
    }).catch(err => console.error('Failed to sync stats:', err))
  }, [user, loading, seenSpecies, allSpecies, streakInfo])

  if (loading) {
    return <ProgressSkeleton />
  }

  // Determine scope: year vs lifetime
  const isYearScope = listScope === 'year' && activeYearListId != null && yearSeenSpecies.size > 0
  const activeYearList = isYearScope ? yearLists.find(l => l.id === activeYearListId) : null

  // Species "seen" check respects scope
  const isSeen = (speciesCode: string): boolean => {
    return isYearScope ? yearSeenSpecies.has(speciesCode) : isSpeciesSeen(speciesCode)
  }

  const totalSpecies = allSpecies.length
  const totalSeen = isYearScope ? yearSeenSpecies.size : getTotalSeen()
  const percentComplete = totalSpecies > 0 ? (totalSeen / totalSpecies) * 100 : 0

  // Pace tracking for year scope
  const paceProjection = (() => {
    if (!isYearScope || !activeYearList) return null
    const now = new Date()
    const yearStart = new Date(activeYearList.year, 0, 1)
    const yearEnd = new Date(activeYearList.year, 11, 31)
    const isCurrentYear = activeYearList.year === now.getFullYear()
    if (!isCurrentYear) return null // Only show pace for current year
    const dayOfYear = Math.floor((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const totalDays = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const rate = totalSeen / dayOfYear
    const projected = Math.round(rate * totalDays)
    return { dayOfYear, totalDays, rate, projected }
  })()

  // Calculate group breakdown (using display groups, not raw families)
  const groupStats: { [groupName: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    const group = getDisplayGroup(species.familyComName)
    if (!groupStats[group]) {
      groupStats[group] = { total: 0, seen: 0 }
    }
    groupStats[group].total++
    if (isSeen(species.speciesCode)) {
      groupStats[group].seen++
    }
  })

  // Sort groups by total species count (descending)
  const sortedGroups = Object.entries(groupStats).sort((a, b) => b[1].total - a[1].total)

  // Calculate quick stats
  const groupsStarted = Object.values(groupStats).filter(s => s.seen > 0).length
  const groupsCompleted = Object.values(groupStats).filter(s => s.seen === s.total && s.total > 0).length

  // Completed groups for Trophy Case
  const completedGroups = Object.entries(groupStats)
    .filter(([, s]) => s.seen === s.total && s.total > 0)
    .sort((a, b) => b[1].total - a[1].total)

  // Almost-there groups (1-3 remaining)
  const almostThereGroups = Object.entries(groupStats)
    .map(([name, stats]) => ({ name, remaining: stats.total - stats.seen, seen: stats.seen, total: stats.total }))
    .filter(g => g.remaining > 0 && g.remaining <= 3)
    .sort((a, b) => a.remaining - b.remaining)

  // Build reverse lookup: region code → group name
  const codeToGroup: Record<string, string> = {}
  for (const [groupName, codes] of Object.entries(REGION_GROUPS)) {
    for (const code of codes) {
      codeToGroup[code] = groupName
    }
  }

  // Calculate region breakdown
  const regionStats: { [key: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    if (!species.regions) return
    const seen = isSeen(species.speciesCode)
    // Track which groups have already been counted for this species
    const countedGroups = new Set<string>()
    for (const regionCode of species.regions) {
      let key: string
      if (GROUPED_CODES.has(regionCode)) {
        // Roll up into group
        key = codeToGroup[regionCode]
        if (countedGroups.has(key)) continue
        countedGroups.add(key)
      } else {
        key = regionCode
      }
      if (!regionStats[key]) {
        regionStats[key] = { total: 0, seen: 0 }
      }
      regionStats[key].total++
      if (seen) {
        regionStats[key].seen++
      }
    }
  })

  // Sort regions by total species count descending
  const sortedRegions = Object.entries(regionStats).sort((a, b) => b[1].total - a[1].total)

  // Get display name for a region key (group name or region code)
  const getRegionDisplayName = (key: string): string => {
    // If it's a group name (exists in REGION_GROUPS), use it directly
    if (REGION_GROUPS[key]) return key
    // Otherwise look up from regionNames
    return regionNames[key] || key
  }

  // Milestones
  // Dynamic milestones: round numbers up to total species count
  const milestoneValues = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000].filter(m => m <= totalSpecies)
  const milestones = milestoneValues.map(target => ({
    target,
    reached: totalSeen >= target,
  }))
  const nextMilestone = milestones.find(m => !m.reached)

  return (
    <div className="space-y-3" data-testid="progress-tab">
      {/* 1. Heading + Scope Toggle */}
      <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100">My Progress</h3>

      {yearLists.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5" data-testid="progress-scope-toggle">
              <button
                onClick={() => setListScope('lifetime')}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !isYearScope
                    ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                data-testid="progress-scope-lifetime"
              >
                Lifetime
              </button>
              <button
                onClick={() => {
                  setListScope('year')
                  if (!activeYearListId && yearLists.length > 0) {
                    setActiveYearListId(yearLists[0].id)
                  }
                }}
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isYearScope
                    ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                data-testid="progress-scope-year"
              >
                Year
              </button>
            </div>
          </div>

          {isYearScope && yearLists.length > 1 && (
            <select
              value={activeYearListId || ''}
              onChange={(e) => setActiveYearListId(e.target.value || null)}
              className="w-full px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              data-testid="progress-year-selector"
            >
              {yearLists
                .sort((a, b) => b.year - a.year)
                .map((yl) => (
                <option key={yl.id} value={yl.id}>{yl.year} ({yl.speciesCodes.length} species)</option>
              ))}
            </select>
          )}

          {paceProjection && (
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3" data-testid="pace-tracking">
              <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                {totalSeen} species in {paceProjection.dayOfYear} days
              </p>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                On pace for ~{paceProjection.projected} by Dec 31
                {' '}({paceProjection.rate.toFixed(1)} species/day)
              </p>
            </div>
          )}
        </div>
      )}

      {/* 2. Overall Progress Card */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Overall Progress</h4>
          <span className="text-2xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="progress-percentage">
            {percentComplete.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden" data-testid="progress-bar-container">
          <div
            className="bg-[#27AE60] h-full rounded-full transition-all duration-300"
            style={{ width: `${percentComplete}%` }}
            data-testid="progress-bar-fill"
          />
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="progress-species-count">
          <span className="font-semibold text-[#2C3E7B] dark:text-blue-400">{totalSeen}</span> of{' '}
          <span className="font-semibold">{totalSpecies}</span> species seen
        </p>
      </div>

      {/* 3. Quick Stats — compact single row */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3" data-testid="quick-stats">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-xl font-bold text-[#2C3E7B] dark:text-blue-400" data-testid="groups-started-count">{groupsStarted}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Groups Started</p>
          </div>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
          <div className="text-center">
            <p className="text-xl font-bold text-[#27AE60] dark:text-green-400" data-testid="groups-completed-count">{groupsCompleted}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Completed</p>
          </div>
        </div>
      </div>

      {/* 4. Activity & Streaks */}
      {streakInfo && (streakInfo.currentStreak > 0 || streakInfo.longestStreak > 0 || (weeklySummary && weeklySummary.newLifers > 0)) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="activity-section">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Activity</h4>
          <div className="grid grid-cols-2 gap-2">
            {streakInfo.currentStreak > 0 && (
              <div className="text-center">
                <p className="text-xl font-bold text-orange-500">{'\uD83D\uDD25'} {streakInfo.currentStreak}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Day streak</p>
              </div>
            )}
            {streakInfo.longestStreak > 0 && (
              <div className="text-center">
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{streakInfo.longestStreak}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Best streak</p>
              </div>
            )}
          </div>
          {weeklySummary && weeklySummary.newLifers > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-400 text-center pt-1 border-t border-gray-100 dark:border-gray-700">
              This week: <span className="font-medium text-[#2C3E7B] dark:text-blue-400">+{weeklySummary.newLifers} lifers</span>
              {weeklySummary.newFamiliesStarted > 0 && (
                <>, <span className="font-medium text-[#27AE60] dark:text-green-400">{weeklySummary.newFamiliesStarted} new {weeklySummary.newFamiliesStarted === 1 ? 'group' : 'groups'}</span></>
              )}
            </p>
          )}
        </div>
      )}

      {/* 5. Trophy Case — grid layout with emojis */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="trophy-case">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">{'\uD83C\uDFC6'} Trophy Case</h4>
        {completedGroups.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {completedGroups.map(([name, stats]) => (
              <div
                key={name}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 shadow-sm"
              >
                <span className="text-lg flex-shrink-0">{GROUP_EMOJI[name] || '\uD83C\uDFC6'}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 truncate">{name}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{stats.total} species</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            Complete a group to earn your first trophy!
          </p>
        )}
      </div>

      {/* 6. Almost There */}
      {almostThereGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="almost-there">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Almost There!</h4>
          <div className="space-y-1.5">
            {almostThereGroups.map((g) => (
              <p key={g.name} className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-800 dark:text-gray-200">{g.name}:</span>{' '}
                {g.seen} of {g.total} — just <span className="font-bold text-[#2C3E7B] dark:text-blue-400">{g.remaining}</span> to go!
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 7. Milestones */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="milestones-section">
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

      {/* 8. Leaderboard */}
      {user && (leaderboard.length > 0 || friendLeaderboard.length > 0) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="leaderboard-section">
          <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Leaderboard</h4>
          {friendLeaderboard.length > 0 && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Friends</p>
              <div className="space-y-1.5">
                {friendLeaderboard.map((entry, i) => (
                  <div key={entry.uid} className={`flex items-center gap-2 text-xs ${entry.uid === user.uid ? 'font-bold' : ''}`}>
                    <span className="w-5 text-right text-gray-400">#{i + 1}</span>
                    <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">
                      {entry.displayName}{entry.uid === user.uid ? ' (you)' : ''}
                    </span>
                    <span className="text-[#2C3E7B] dark:text-blue-400 font-medium">{entry.stats.speciesCount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {leaderboard.length > 0 && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">Global Top 10</p>
              <div className="space-y-1.5">
                {leaderboard.map((entry, i) => (
                  <div key={entry.uid} className={`flex items-center gap-2 text-xs ${entry.uid === user.uid ? 'font-bold' : ''}`}>
                    <span className="w-5 text-right text-gray-400">#{i + 1}</span>
                    <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">
                      {entry.displayName}{entry.uid === user.uid ? ' (you)' : ''}
                    </span>
                    <span className="text-[#2C3E7B] dark:text-blue-400 font-medium">{entry.stats.speciesCount}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 9. Progress by Group */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Progress by Group</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          All {sortedGroups.length} groups by total species count
        </p>
        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="group-breakdown-list">
          {sortedGroups.map(([groupName, stats]) => {
            const groupPercent = stats.total > 0 ? (stats.seen / stats.total) * 100 : 0
            return (
              <div key={groupName} className="space-y-1" data-testid={`group-${groupName.replace(/\s+/g, '-').toLowerCase()}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{groupName}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {stats.seen}/{stats.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#2C3E7B] h-full rounded-full transition-all duration-200"
                    style={{ width: `${groupPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 10. Progress by Region */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
        <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Progress by Region</h4>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          All {sortedRegions.length} regions by total species count
        </p>
        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="region-breakdown-list">
          {sortedRegions.map(([regionKey, stats]) => {
            const regionPercent = stats.total > 0 ? (stats.seen / stats.total) * 100 : 0
            return (
              <div key={regionKey} className="space-y-1" data-testid={`region-${regionKey.replace(/\s+/g, '-').toLowerCase()}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{getRegionDisplayName(regionKey)}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {stats.seen}/{stats.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#2C3E7B] h-full rounded-full transition-all duration-200"
                    style={{ width: `${regionPercent}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Completion Message */}
      {totalSeen === totalSpecies && totalSpecies > 0 && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-3 text-center">
          <div className="text-3xl mb-1">{'\uD83C\uDF89'}</div>
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
