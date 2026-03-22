import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Species } from './types'
import Badge from './Badge'
import Sparkline from './Sparkline'
import { getDisplayGroup } from '../lib/familyGroups'
import { getSpeciesFrequencyProfile, getSpeciesBestLocations, fetchSpeciesWeeks } from '../lib/dataCache'
import { SUB_REGIONS, getSpeciesSubRegions } from '../lib/subRegions'
import type { SubRegion } from '../lib/subRegions'
import { getAllLists, addSpeciesToList } from '../lib/goalListsDB'
import type { GoalList } from '../lib/goalListsDB'

interface SpeciesInfoCardProps {
  species: Species
  onClose: () => void
  currentWeek?: number
  onCellClick?: (cellId: number, coordinates: [number, number]) => void
  onShowOnMap?: () => void
  regionContext?: { subRegionId: string; cellLng: number; cellLat: number }
}

// SpeciesInfoCard - popup modal showing species details, sparkline, best locations, habitat
export default function SpeciesInfoCard({
  species,
  onClose,
  currentWeek,
  onCellClick,
  onShowOnMap,
  regionContext,
}: SpeciesInfoCardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus close button on open and handle Escape key
  useEffect(() => {
    // Focus the close button when the card opens
    closeButtonRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const [freqProfile, setFreqProfile] = useState<number[] | null>(null)
  const [bestLocations, setBestLocations] = useState<Array<{ cellId: number; coordinates: [number, number]; name: string; freq: number }> | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(false)

  // Goal list state
  const [goalLists, setGoalLists] = useState<GoalList[]>([])
  const [selectedGoalListId, setSelectedGoalListId] = useState<string>('')
  const [goalAddStatus, setGoalAddStatus] = useState<'idle' | 'added' | 'already' | 'error'>('idle')
  const [goalAddListName, setGoalAddListName] = useState('')

  // Load goal lists on mount
  useEffect(() => {
    let cancelled = false
    getAllLists().then(lists => {
      if (!cancelled) {
        setGoalLists(lists)
        // Auto-select if exactly one list
        if (lists.length === 1) setSelectedGoalListId(lists[0].id)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Check if species is already in any loaded list (for pre-checking)
  const speciesInLists = new Set(
    goalLists.filter(l => l.speciesCodes.includes(species.speciesCode)).map(l => l.id)
  )

  const handleAddToGoalList = useCallback(async (listId: string) => {
    const list = goalLists.find(l => l.id === listId)
    if (!list) return
    try {
      const added = await addSpeciesToList(listId, species.speciesCode)
      setGoalAddListName(list.name)
      if (added) {
        setGoalAddStatus('added')
        // Update local state to reflect the addition
        setGoalLists(prev => prev.map(l =>
          l.id === listId ? { ...l, speciesCodes: [...l.speciesCodes, species.speciesCode] } : l
        ))
      } else {
        setGoalAddStatus('already')
      }
      setTimeout(() => setGoalAddStatus('idle'), 2500)
    } catch {
      setGoalAddStatus('error')
      setTimeout(() => setGoalAddStatus('idle'), 2500)
    }
  }, [goalLists, species.speciesCode])

  // Region state
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(
    regionContext?.subRegionId ?? null
  )
  const [availableRegions, setAvailableRegions] = useState<SubRegion[]>([])
  const [showGlobalLocations, setShowGlobalLocations] = useState(false)

  const week = currentWeek ?? (() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const diff = now.getTime() - start.getTime()
    return Math.min(52, Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))))
  })()

  // Resolve selected region object and bbox
  const selectedRegion = selectedRegionId
    ? SUB_REGIONS.find(r => r.id === selectedRegionId) ?? null
    : null
  const regionStateCodes: string[] | undefined = selectedRegion?.stateCodes

  // Load available sub-regions for this species
  useEffect(() => {
    let cancelled = false
    async function loadRegions() {
      try {
        const weeksData = await fetchSpeciesWeeks(species.speciesCode)
        // Collect unique cell IDs across all weeks
        const cellIds = new Set<number>()
        for (const weekKey of Object.keys(weeksData)) {
          for (const [cellId] of weeksData[weekKey]) {
            cellIds.add(cellId)
          }
        }
        // Get sub-regions for this species using cell IDs
        const regions = getSpeciesSubRegions(Array.from(cellIds))
        if (!cancelled) setAvailableRegions(regions)
      } catch {
        // Species may not have data
      }
    }
    loadRegions()
    return () => { cancelled = true }
  }, [species.speciesCode])

  // Load frequency profile (region-aware)
  useEffect(() => {
    let cancelled = false
    getSpeciesFrequencyProfile(species.speciesCode, undefined, regionStateCodes).then(profile => {
      if (!cancelled) setFreqProfile(profile)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [species.speciesCode, regionStateCodes])

  // Load best locations for current week (region-aware)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoadingLocations(true)
    const useRegion = showGlobalLocations ? undefined : regionStateCodes
    getSpeciesBestLocations(species.speciesCode, week, undefined, 5, useRegion).then(locs => {
      if (!cancelled) {
        setBestLocations(locs)
        setLoadingLocations(false)
      }
    }).catch(() => {
      if (!cancelled) setLoadingLocations(false)
    })
    return () => { cancelled = true }
  }, [species.speciesCode, week, regionStateCodes, showGlobalLocations])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Compute difficulty display (regional if available)
  const difficultyRating = selectedRegionId && species.regionalDifficulty?.[selectedRegionId]
    ? species.regionalDifficulty[selectedRegionId]
    : species.difficultyRating

  // Derive label from the ACTUAL rating (not the global label)
  function ratingToLabel(r: number): string {
    if (r <= 2) return 'Easy'
    if (r <= 4) return 'Moderate'
    if (r <= 6) return 'Hard'
    if (r <= 8) return 'Very Hard'
    return 'Extremely Hard'
  }
  const difficultyLabel = difficultyRating > 0
    ? `${ratingToLabel(difficultyRating)} (${difficultyRating}/10)`
    : ''
  const difficultyRegionNote = selectedRegionId && species.regionalDifficulty?.[selectedRegionId] && selectedRegion
    ? ` in ${selectedRegion.name}`
    : ''

  // Compute invasion status badge (region-filtered)
  // Priority: Native > Introduced > Vagrant/Accidental
  // If native anywhere in scope, species is considered native (no badge shown).
  const invasionBadge = (() => {
    const invasionData = species.invasionStatus || {}
    let entries = Object.entries(invasionData)

    // If a region is selected, filter to only country codes that match the sub-region's state codes
    if (selectedRegion) {
      const countryCodes = new Set(selectedRegion.stateCodes.map(sc => sc.split('-')[0]))
      entries = entries.filter(([code]) => countryCodes.has(code))
    }

    if (entries.length === 0) return null

    // Native wins: if native in any region in scope, no invasion badge
    if (entries.some(([, s]) => s === 'Native')) return null

    // Not native anywhere in scope — show highest-priority non-native status
    // Introduced > Vagrant/Accidental
    const hasIntroduced = entries.some(([, s]) => s === 'Introduced')
    const label = hasIntroduced ? 'Introduced' : 'Vagrant/Accidental'
    return <Badge variant="invasion" value={label} size="pill" />
  })()

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="species-info-card-overlay"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        data-testid="species-info-card"
        role="dialog"
        aria-modal="true"
        aria-label={species.comName}
      >
        {/* Photo area */}
        <div className="relative bg-gray-100 dark:bg-gray-800 h-44 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {species.photoUrl ? (
            <img
              src={species.photoUrl}
              alt={species.comName}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">No photo available</span>
            </div>
          )}
          {/* Close button */}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="absolute top-2 right-2 min-h-[44px] min-w-[44px] flex items-center justify-center bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white shadow transition-colors"
            data-testid="species-info-card-close"
            aria-label="Close species info"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          {onShowOnMap && (
            <button
              onClick={onShowOnMap}
              className="absolute top-2 right-14 min-h-[44px] px-3 flex items-center gap-1 bg-[#2C3E7B] text-white text-xs font-medium rounded-full shadow hover:bg-[#1e2d5b] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Show on Map
            </button>
          )}
        </div>

        {/* Scrollable info body */}
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {/* Names */}
          <div>
            <h3 className="text-lg font-bold text-[#2C3E50] dark:text-gray-100 leading-tight" data-testid="species-info-common-name">
              {species.comName}
            </h3>
            <p className="text-sm italic text-gray-500 dark:text-gray-400" data-testid="species-info-sci-name">
              {species.sciName}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{getDisplayGroup(species.familyComName ?? '')}</p>
          </div>

          {/* Region dropdown */}
          {availableRegions.length > 0 && (
            <select
              value={selectedRegionId || 'global'}
              onChange={(e) => { setSelectedRegionId(e.target.value === 'global' ? null : e.target.value); setShowGlobalLocations(false) }}
              className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              data-testid="species-info-region-select"
            >
              <option value="global">Global</option>
              {availableRegions.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5" data-testid="species-info-badges">
            <Badge variant="conservation" value={species.conservStatus} size="pill" />
            {difficultyRating > 0 && (
              <Badge variant="difficulty" value={`${difficultyLabel}${difficultyRegionNote}`} size="pill" />
            )}
            {species.isRestrictedRange && (
              <Badge variant="restricted-range" value="Restricted Range" size="pill" />
            )}
            {invasionBadge}
          </div>

          {/* Habitat badges */}
          {species.habitatLabels && species.habitatLabels.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs lg:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Habitat</p>
              <div className="flex flex-wrap gap-1.5" data-testid="species-info-habitat">
                {species.habitatLabels.map((label) => (
                  <Badge key={label} variant="habitat" value={label} size="pill" />
                ))}
              </div>
              {species.preferredElevation && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Elevation: ~{species.preferredElevation.mean.toLocaleString()}m
                  {species.preferredElevation.min !== species.preferredElevation.max && (
                    <span className="text-gray-400 dark:text-gray-500">
                      {' '}({species.preferredElevation.min.toLocaleString()}–{species.preferredElevation.max.toLocaleString()}m)
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Sparkline — 52-week frequency chart */}
          {freqProfile && (
            <div className="space-y-1">
              <p className="text-xs lg:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Seasonality{selectedRegion ? ` — ${selectedRegion.name}` : ''}
              </p>
              <Sparkline data={freqProfile} currentWeek={week} />
            </div>
          )}

          {/* Best locations for current week */}
          {(bestLocations || loadingLocations) && (
            <div className="space-y-1.5">
              <p className="text-xs lg:text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Best Locations (Week {week}){selectedRegion && !showGlobalLocations ? ` — ${selectedRegion.name}` : ''}
              </p>
              {loadingLocations ? (
                <p className="text-xs text-gray-400">Loading...</p>
              ) : bestLocations && bestLocations.length > 0 ? (
                <div className="space-y-1">
                  {bestLocations.map((loc) => (
                    <button
                      key={loc.cellId}
                      onClick={() => onCellClick?.(loc.cellId, loc.coordinates)}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      data-testid={`best-loc-${loc.cellId}`}
                    >
                      <span className="text-gray-700 dark:text-gray-300 truncate flex-1 mr-2">{loc.name}</span>
                      <span className="text-[#2C3E7B] dark:text-blue-400 font-medium flex-shrink-0">
                        {(loc.freq * 100).toFixed(0)}% of trips
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">Not recorded this week</p>
              )}
              {/* Show global toggle when region is selected */}
              {selectedRegionId && (
                <button
                  onClick={() => setShowGlobalLocations(prev => !prev)}
                  className="text-xs lg:text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline"
                  data-testid="species-info-toggle-global"
                >
                  {showGlobalLocations ? 'Show regional' : 'Show global'}
                </button>
              )}
            </div>
          )}

          {/* Add to Goal List */}
          <div className="space-y-1.5" data-testid="species-info-goal-list">
            {goalLists.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Create a goal list in the Goals tab to add species
              </p>
            ) : goalAddStatus !== 'idle' ? (
              <div className={`text-xs text-center py-2 rounded-lg font-medium ${
                goalAddStatus === 'added'
                  ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : goalAddStatus === 'already'
                    ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`} data-testid="species-info-goal-status">
                {goalAddStatus === 'added' ? `Added to ${goalAddListName}`
                  : goalAddStatus === 'already' ? `Already in ${goalAddListName}`
                  : 'Error adding to list'}
              </div>
            ) : goalLists.length === 1 ? (
              <button
                onClick={() => handleAddToGoalList(goalLists[0].id)}
                disabled={speciesInLists.has(goalLists[0].id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors w-full justify-center ${
                  speciesInLists.has(goalLists[0].id)
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
                data-testid="species-info-add-goal"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                {speciesInLists.has(goalLists[0].id) ? `In ${goalLists[0].name}` : `Add to ${goalLists[0].name}`}
              </button>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={selectedGoalListId}
                  onChange={(e) => setSelectedGoalListId(e.target.value)}
                  className="flex-1 text-xs px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  data-testid="species-info-goal-select"
                >
                  <option value="">Select goal list...</option>
                  {goalLists.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}{speciesInLists.has(l.id) ? ' (already added)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => selectedGoalListId && handleAddToGoalList(selectedGoalListId)}
                  disabled={!selectedGoalListId || speciesInLists.has(selectedGoalListId)}
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex-shrink-0 ${
                    !selectedGoalListId || speciesInLists.has(selectedGoalListId)
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                  data-testid="species-info-add-goal-btn"
                >
                  {speciesInLists.has(selectedGoalListId) ? 'Added' : '+ Add'}
                </button>
              </div>
            )}
          </div>

          {/* eBird link */}
          <a
            href={`https://ebird.org/species/${species.speciesCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-[#2C3E7B] hover:bg-[#1f2d5a] text-white text-sm font-medium rounded-lg transition-colors w-full justify-center"
            data-testid="species-info-ebird-link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
            View on eBird
          </a>
        </div>
      </div>
    </div>,
    document.body
  )
}
