import { useState, useEffect, useMemo } from 'react'
import { useLifeList } from '../contexts/LifeListContext'
import { useAuth } from '../contexts/AuthContext'
import { useSpecies } from '../hooks/useSpecies'
import type { LifeListEntry } from '../contexts/LifeListContext'
import { ProgressSkeleton } from './Skeleton'
import { fetchRegionNames } from '../lib/dataCache'
import { getDisplayGroup } from '../lib/familyGroups'
import { GROUPED_CODES } from '../lib/regionGroups'
import { SUB_REGIONS } from '../lib/subRegions'
import { computeWeeklySummary } from '../lib/streakUtils'
import { syncUserStats, fetchLeaderboard, fetchFriendLeaderboard, type LeaderboardEntry } from '../lib/firebaseSync'
import { getFriends } from '../lib/friendsService'

const GROUP_EMOJI: Record<string, string> = {
  'Ducks, Geese, and Waterfowl': '\u{1F986}',   // duck
  'Flamingos, Grebes, and Loons': '\u{1F9A9}',   // flamingo
  'Gulls, Terns, and Skuas': '\u{1F30A}',           // ocean wave
  'Auks': '\u{1F427}',                            // penguin (closest)
  'Tubenoses': '\u{1F4A8}',                       // wind/breeze (ocean wanderers)
  'Pelicans, Cormorants, and Allies': '\u{1F41F}', // fish (fish-eaters)
  'Herons and Allies': '\u{1F4A7}',                // droplet (wading in water)
  'Shorebirds': '\u{1F3D6}\u{FE0F}',             // beach
  'Rails, Cranes, and Allies': '\u{1F9A4}',       // dodo (closest to crane)
  'Game Birds': '\u{1F983}',                       // turkey
  'Pigeons and Doves': '\u{1F54A}\u{FE0F}',      // dove
  'Cuckoos and Allies': '\u{23F0}',               // alarm clock (cuckoo clock)
  'Hummingbirds': '\u{1F48E}',                    // gem (iridescent)
  'Nightjars and Allies': '\u{1F319}',            // crescent moon
  'Vultures, Hawks, and Allies': '\u{1F985}',     // eagle
  'Falcons': '\u{1F3AF}',                         // target (precision hunters)
  'Owls': '\u{1F989}',                            // owl
  'Trogons': '\u{1F308}',                         // rainbow (colorful)
  'Kingfishers, Motmots, and Allies': '\u{1F451}', // crown (king-fishers)
  'Toucans, Barbets, and Allies': '\u{1F34C}',    // banana (tropical bill)
  'Woodpeckers': '\u{1FAB5}',                     // wood
  'Parrots': '\u{1F99C}',                         // parrot
  'Antbirds and Allies': '\u{1F41C}',             // ant
  'Ovenbirds and Woodcreepers': '\u{1F333}',      // tree (bark creepers)
  'Flycatchers': '\u{1FAB0}',                     // fly
  'Cotingas, Manakins, and Allies': '\u{1F483}',  // dancer (manakin dances)
  'Shrikes and Vireos': '\u{1F3AD}',              // masks (impaler)
  'Crows and Jays': '\u{1F5A4}',                  // black heart
  'Swifts and Swallows': '\u{2708}\u{FE0F}',     // airplane (aerial)
  'Chickadees, Nuthatches, and Allies': '\u{1F330}', // chestnut (seed eaters)
  'Wrens and Gnatcatchers': '\u{1FAB9}',            // empty nest (wrens nest in odd spots)
  'Waxwings, Dippers, and Allies': '\u{1FAB6}',   // feather
  'Warblers': '\u{1F49B}',                          // yellow heart
  'Pipits and Larks': '\u{1F3B6}',                  // music notes (larks sing in flight)
  'Sparrows and Allies': '\u{1F33E}',             // rice/grain
  'Finches and Allies': '\u{1F33B}',              // sunflower (seed eaters)
  'Tanagers and Allies': '\u{1F525}',             // fire (brilliant colors)
  'Thrushes, Mockingbirds, and Allies': '\u{1F3B5}', // music note (famous songsters)
  'Cardinals and Allies': '\u{2764}\u{FE0F}\u{200D}\u{1F525}', // heart on fire (passionate red)
  'Blackbirds and Orioles': '\u{1F34A}',          // orange (oriole color)
}

export default function ProgressTab() {
  const {
    isSpeciesSeen, getTotalSeen, getLifeListEntries,
    seenSpecies,
  } = useLifeList()
  const { user } = useAuth()
  const { species: allSpecies, loading } = useSpecies()
  const [regionNames, setRegionNames] = useState<Record<string, string>>({})
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [friendLeaderboard, setFriendLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardMode, setLeaderboardMode] = useState<'friends' | 'global'>('friends')
  const [weeklySummary, setWeeklySummary] = useState<{ newLifers: number; newFamiliesStarted: number } | null>(null)

  // Load region names on mount
  useEffect(() => {
    fetchRegionNames()
      .then(names => setRegionNames(names))
      .catch(err => console.error('ProgressTab: failed to load region names', err))
  }, [])

  // Load weekly summary data
  useEffect(() => {
    const loadActivity = async () => {
      try {
        const entries: LifeListEntry[] = await getLifeListEntries()

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
      currentStreak: 0,
      longestStreak: 0,
    }).catch(err => console.error('Failed to sync stats:', err))
  }, [user, loading, seenSpecies, allSpecies])

  const totalSpecies = allSpecies.length
  const totalSeen = getTotalSeen()
  const percentComplete = totalSpecies > 0 ? (totalSeen / totalSpecies) * 100 : 0

  // Calculate group breakdown (using display groups, not raw families)
  const groupStats: { [groupName: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    const group = getDisplayGroup(species.familyComName)
    if (!groupStats[group]) {
      groupStats[group] = { total: 0, seen: 0 }
    }
    groupStats[group].total++
    if (isSpeciesSeen(species.speciesCode)) {
      groupStats[group].seen++
    }
  })

  // Trophy tiers: copper (>=10%), silver (>=25%), gold (>=50%), diamond (>=75%), emerald (100%)
  type TrophyLevel = 'emerald' | 'diamond' | 'gold' | 'silver' | 'copper' | null
  const getTrophyLevel = (seen: number, total: number): TrophyLevel => {
    if (total === 0 || seen === 0) return null
    const ratio = seen / total
    if (ratio >= 1) return 'emerald'
    if (ratio >= 0.75) return 'diamond'
    if (ratio >= 0.5) return 'gold'
    if (ratio >= 0.25) return 'silver'
    if (ratio >= 0.1) return 'copper'
    return null
  }

  // All groups with earned trophies (seen > 0), sorted: gold first, then silver, copper, then by completion %
  // Groups with seen > 0 but below copper threshold still show as "started" cards
  const earnedGroups = Object.entries(groupStats)
    .filter(([, stats]) => stats.seen > 0)
    .map(([name, stats]) => ({ name, ...stats, level: getTrophyLevel(stats.seen, stats.total) }))
    .sort((a, b) => {
      const order = { emerald: 0, diamond: 1, gold: 2, silver: 3, copper: 4, none: 5 }
      const aOrder = a.level ? order[a.level] : order.none
      const bOrder = b.level ? order[b.level] : order.none
      const levelDiff = aOrder - bOrder
      if (levelDiff !== 0) return levelDiff
      return (b.seen / b.total) - (a.seen / a.total)
    })

  // Almost-there groups (1-3 remaining, must have ≥5 species and ≥1 already seen
  // to exclude nonsensical groups like Cassowaries and Emu in North America)
  // Build sub-region ID → display name lookup
  const subRegionIdToName: Record<string, string> = {}
  SUB_REGIONS.forEach(sr => {
    // Central America sub-regions roll up to single 'Central America' group
    if (sr.id === 'ca-c-north' || sr.id === 'ca-c-south') {
      subRegionIdToName[sr.id] = 'Central America'
    } else {
      subRegionIdToName[sr.id] = sr.name
    }
  })

  // Calculate region breakdown using regionalDifficulty for sub-region presence
  const regionStats: { [key: string]: { total: number; seen: number } } = {}
  allSpecies.forEach((species) => {
    const seen = isSpeciesSeen(species.speciesCode)
    const countedRegions = new Set<string>()

    // Use regionalDifficulty keys as sub-region presence indicators
    if (species.regionalDifficulty) {
      for (const subRegionId of Object.keys(species.regionalDifficulty)) {
        const displayName = subRegionIdToName[subRegionId]
        if (!displayName || countedRegions.has(displayName)) continue
        countedRegions.add(displayName)
        if (!regionStats[displayName]) regionStats[displayName] = { total: 0, seen: 0 }
        regionStats[displayName].total++
        if (seen) regionStats[displayName].seen++
      }
    }

    // Also include non-grouped country codes from regions (e.g., GL, PM)
    if (species.regions) {
      for (const regionCode of species.regions) {
        if (GROUPED_CODES.has(regionCode)) continue // Handled by regionalDifficulty
        if (countedRegions.has(regionCode)) continue
        countedRegions.add(regionCode)
        if (!regionStats[regionCode]) regionStats[regionCode] = { total: 0, seen: 0 }
        regionStats[regionCode].total++
        if (seen) regionStats[regionCode].seen++
      }
    }
  })

  // Sort regions geographically (north to south, west to east)
  const REGION_ORDER: Record<string, number> = {
    // Canada
    'Western Canada & Alaska': 1,
    'Central Canada': 2,
    'Eastern Canada & North Atlantic Islands': 3,
    // US
    'Western US': 10,
    'US Rockies': 11,
    'Southwestern US': 12,
    'Midwestern US': 13,
    'Northeastern US': 14,
    'Southeastern US': 15,
    'Hawaii': 16,
    // Mexico
    'Northern Mexico': 20,
    'Southern Mexico': 21,
    // Central America
    'Upper Central America': 30,
    'Costa Rica & Panama': 31,
    // Caribbean
    'Greater Antilles': 40,
    'Lesser Antilles': 41,
    'Western Atlantic Islands': 42,
  }
  const sortedRegions = Object.entries(regionStats).sort((a, b) => {
    const orderA = REGION_ORDER[a[0]] ?? 99
    const orderB = REGION_ORDER[b[0]] ?? 99
    if (orderA !== orderB) return orderA - orderB
    return b[1].total - a[1].total // fallback: species count
  })

  // Get display name for a region key (sub-region name or country code)
  const getRegionDisplayName = (key: string): string => {
    // Sub-region names are already display-ready
    if (subRegionIdToName[key] || Object.values(subRegionIdToName).includes(key)) return key
    // Otherwise look up from regionNames
    return regionNames[key] || key
  }

  // Meaningful milestones — ecological achievements, not arbitrary round numbers
  const milestones = useMemo(() => {
    if (allSpecies.length === 0) return []
    const seen = seenSpecies
    const seenSpeciesList = allSpecies.filter(s => seen.has(s.speciesCode))

    // Count unique habitats seen
    const habitatsSeen = new Set<string>()
    for (const s of seenSpeciesList) {
      for (const h of s.habitatLabels ?? []) {
        if (h !== 'Habitat Generalist' && h !== 'Urban-tolerant') habitatsSeen.add(h)
      }
    }

    // Count unique sub-regions with sightings
    const regionsSeen = new Set<string>()
    for (const s of seenSpeciesList) {
      for (const r of Object.keys(s.regionalDifficulty ?? {})) regionsSeen.add(r)
    }

    // Count conservation status species seen
    const threatenedSeen = seenSpeciesList.filter(s =>
      s.conservStatus === 'Vulnerable' || s.conservStatus === 'Endangered' || s.conservStatus === 'Critically Endangered'
    ).length

    // Count hard species (difficulty 7+)
    const hardSeen = seenSpeciesList.filter(s => (s.difficultyRating ?? 0) >= 7).length

    // Count families started
    const familiesSeen = new Set(seenSpeciesList.map(s => getDisplayGroup(s.familyComName)))

    // Helper: find the next tier target for a value
    const nextTier = (value: number, tiers: number[]) => tiers.find(t => value < t) ?? tiers[tiers.length - 1]

    const items: Array<{ label: string; description: string; progress: number; target: number; reached: boolean }> = []

    // Habitat explorer — tiers: 3, 5, 8, 10
    const habitatTarget = nextTier(habitatsSeen.size, [3, 5, 8, 10])
    items.push({
      label: 'Habitat Explorer',
      description: `Birds in ${habitatsSeen.size} habitat types`,
      progress: habitatsSeen.size,
      target: habitatTarget,
      reached: habitatsSeen.size >= 10,
    })

    // Region collector — tiers: 3, 6, 10, 14, 17
    const regionTarget = nextTier(regionsSeen.size, [3, 6, 10, 14, 17])
    items.push({
      label: 'Region Collector',
      description: `Species across ${regionsSeen.size} sub-regions`,
      progress: regionsSeen.size,
      target: regionTarget,
      reached: regionsSeen.size >= 17,
    })

    // Taxonomic breadth — tiers: 10, 20, 30, all
    const totalFamilies = new Set(allSpecies.map(s => getDisplayGroup(s.familyComName))).size
    const familyTarget = nextTier(familiesSeen.size, [10, 20, 30, totalFamilies])
    items.push({
      label: 'Taxonomic Breadth',
      description: `${familiesSeen.size} of ${totalFamilies} bird groups`,
      progress: familiesSeen.size,
      target: familyTarget,
      reached: familiesSeen.size >= totalFamilies,
    })

    // Conservation champion — tiers: 5, 15, 30, 50, 75
    const totalThreatened = allSpecies.filter(s =>
      s.conservStatus === 'Vulnerable' || s.conservStatus === 'Endangered' || s.conservStatus === 'Critically Endangered'
    ).length
    if (totalThreatened > 0) {
      const conservTarget = nextTier(threatenedSeen, [5, 15, 30, 50, 75])
      items.push({
        label: 'Conservation Champion',
        description: `${threatenedSeen} threatened species observed`,
        progress: threatenedSeen,
        target: conservTarget,
        reached: threatenedSeen >= 75,
      })
    }

    // Rarity hunter — tiers: 10, 25, 50, 100, 150
    const rarityTarget = nextTier(hardSeen, [10, 25, 50, 100, 150])
    items.push({
      label: 'Rarity Hunter',
      description: `${hardSeen} hard-to-find species (difficulty 7+)`,
      progress: hardSeen,
      target: rarityTarget,
      reached: hardSeen >= 150,
    })

    return items
  }, [allSpecies, seenSpecies, totalSeen, totalSpecies])

  if (loading) {
    return <ProgressSkeleton />
  }

  return (
    <div className="space-y-3" data-testid="progress-tab">
      <h3 className="text-lg font-semibold text-[#2C3E50] dark:text-gray-100">My Progress</h3>

      {/* Overall Progress Card */}
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

      {/* 3. Quick Stats — tier breakdown */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3" data-testid="quick-stats">
        <div className="flex items-center justify-around">
          {([
            { label: '\u{1F7E2}', name: 'Emerald', tier: 'emerald' as const, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: '\u{1F4A0}', name: 'Diamond', tier: 'diamond' as const, color: 'text-sky-500 dark:text-sky-400' },
            { label: '\u{1F947}', name: 'Gold', tier: 'gold' as const, color: 'text-yellow-500 dark:text-yellow-400' },
            { label: '\u{1FA99}', name: 'Silver', tier: 'silver' as const, color: 'text-gray-400 dark:text-gray-300' },
            { label: '\u{1F7E4}', name: 'Copper', tier: 'copper' as const, color: 'text-amber-700 dark:text-amber-500' },
            { label: '\u{1F331}', name: 'Started', tier: null, color: 'text-gray-500 dark:text-gray-400' },
          ] as const).filter(({ tier }) => {
            // Always show emerald
            if (tier === 'emerald') return true
            // Hide a tier only when ALL groups have surpassed it
            // Diamond hides only if ALL groups are emerald
            // Gold hides only if ALL groups are diamond or emerald
            // etc.
            const tierRank = { 'emerald': 5, 'diamond': 4, 'gold': 3, 'silver': 2, 'copper': 1 }
            const thisRank = tier ? tierRank[tier] : 0
            const allGroupRanks = Object.values(groupStats).map(s => {
              const level = getTrophyLevel(s.seen, s.total)
              return level ? tierRank[level] : s.seen > 0 ? 0 : -1
            })
            // Show this tier if ANY group is NOT above it
            return allGroupRanks.some(rank => rank <= thisRank)
          }).map(({ label, name, tier, color }, i) => (
            <div key={i} className="text-center">
              <p className={`text-xl font-bold ${color}`}>
                {tier ? earnedGroups.filter(g => g.level === tier).length : earnedGroups.filter(g => g.level === null).length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label} {name}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Activity */}
      {weeklySummary && weeklySummary.newLifers > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="activity-section">
          <h4 className="text-base font-medium text-[#2C3E50] dark:text-gray-100">Activity</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            This week: <span className="font-medium text-[#2C3E7B] dark:text-blue-400">+{weeklySummary.newLifers} lifers</span>
            {weeklySummary.newFamiliesStarted > 0 && (
              <>, <span className="font-medium text-[#27AE60] dark:text-green-400">{weeklySummary.newFamiliesStarted} new {weeklySummary.newFamiliesStarted === 1 ? 'group' : 'groups'}</span></>
            )}
          </p>
        </div>
      )}

      {/* 5. Trophy Case — 5-tier display: copper/silver/gold/diamond/emerald */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="trophy-case">
        <h4 className="text-base font-medium text-[#2C3E50] dark:text-gray-100">{'\uD83C\uDFC6'} Trophy Case</h4>
        {earnedGroups.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {earnedGroups.map((g) => {
              const tierClass = g.level === 'emerald'
                ? 'trophy-emerald bg-emerald-600 text-emerald-50'
                : g.level === 'diamond'
                ? 'trophy-diamond bg-sky-200 text-sky-900'
                : g.level === 'gold'
                ? 'trophy-gold bg-yellow-400 text-yellow-900'
                : g.level === 'silver'
                ? 'trophy-silver bg-gray-300 text-gray-800 dark:bg-gray-400 dark:text-gray-900'
                : g.level === 'copper'
                ? 'trophy-copper bg-[#8B4531] text-amber-100'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              const animClass = g.level === 'emerald'
                ? 'trophy-sheen trophy-glow trophy-sparkle trophy-pulse trophy-prismatic'
                : g.level === 'diamond'
                ? 'trophy-sheen trophy-glow trophy-sparkle trophy-pulse'
                : g.level === 'gold'
                ? 'trophy-sheen trophy-glow trophy-sparkle'
                : g.level === 'silver'
                ? 'trophy-sheen trophy-glow'
                : g.level
                ? 'trophy-sheen'
                : ''
              const emoji = GROUP_EMOJI[g.name] || '\u{1F3C6}'
              // Random animation delay so plaques don't all shine at once
              const delay = ((g.name.length * 7 + g.seen * 13) % 20) * 0.5
              return (
                <div
                  key={g.name}
                  className={`relative flex flex-col items-center p-2.5 rounded-lg shadow-sm overflow-hidden ${tierClass} ${animClass}`}
                  style={{ animationDelay: `${delay}s` }}
                  data-testid={`trophy-${g.name.replace(/\s+/g, '-').toLowerCase()}`}
                  title={`${g.name}: ${g.seen}/${g.total}`}
                >
                  <span className="text-3xl">{emoji}</span>
                  <p className="text-xs font-semibold text-center leading-tight mt-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>{g.name}</p>
                  <p className="text-sm font-medium mt-0.5">{g.seen}/{g.total}</p>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            Start seeing species in a group to earn your first trophy!
          </p>
        )}
      </div>


      {/* 7. Achievements */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="milestones-section">
        <h4 className="text-base font-medium text-[#2C3E50] dark:text-gray-100">Achievements</h4>
        <div className="space-y-2.5">
          {milestones.map(m => {
            const pct = Math.min(100, (m.progress / m.target) * 100)
            return (
              <div key={m.label} data-testid={`milestone-${m.label}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-xs font-semibold ${m.reached ? 'text-[#27AE60] dark:text-green-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    {m.reached ? '\u2713 ' : ''}{m.label}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {m.progress}/{m.target}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${m.reached ? 'bg-[#27AE60]' : 'bg-[#2C3E7B]'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 8. Leaderboard */}
      {user && (leaderboard.length > 0 || friendLeaderboard.length > 0) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2" data-testid="leaderboard-section">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-[#2C3E50] dark:text-gray-100">Leaderboard</h4>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setLeaderboardMode('friends')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  leaderboardMode === 'friends'
                    ? 'bg-white dark:bg-gray-600 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >Friends</button>
              <button
                onClick={() => setLeaderboardMode('global')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  leaderboardMode === 'global'
                    ? 'bg-white dark:bg-gray-600 text-[#2C3E7B] dark:text-blue-400 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >Global</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {(leaderboardMode === 'friends' ? friendLeaderboard : leaderboard).map((entry, i) => (
              <div key={entry.uid} className={`flex items-center gap-2 text-sm ${entry.uid === user.uid ? 'font-bold' : ''}`}>
                <span className="w-6 text-right text-gray-500 dark:text-gray-400 text-xs">#{i + 1}</span>
                <span className="flex-1 text-gray-800 dark:text-gray-200 truncate">
                  {entry.displayName}{entry.uid === user.uid ? ' (you)' : ''}
                </span>
                <span className="text-[#2C3E7B] dark:text-blue-400 font-medium">{entry.stats.speciesCount}</span>
              </div>
            ))}
            {(leaderboardMode === 'friends' ? friendLeaderboard : leaderboard).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                {leaderboardMode === 'friends' ? 'Add friends to see their progress' : 'No data yet'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 9. Progress by Region */}
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
            <span className="font-medium">Get started:</span> Visit the Species tab to mark birds you've seen, or import your eBird life list from the menu (<strong>⋮</strong>).
          </p>
        </div>
      )}
    </div>
  )
}
