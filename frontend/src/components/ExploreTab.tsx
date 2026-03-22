import { useState, useEffect, useMemo } from 'react'
import type { SpeciesMeta, Species } from './types'
import { fetchSpecies } from '../lib/dataCache'
import { useLifeList } from '../contexts/LifeListContext'
import { useMapControls } from '../contexts/MapControlsContext'
import { useWeekAnimation } from '../lib/useWeekAnimation'
import { getWeekLabel } from './tripPlanUtils'
import Tooltip from './Tooltip'
import { TOOLTIPS } from '../lib/tooltipContent'

interface LightweightHighlight {
  species: Species
  reason: string
}

export default function ExploreTab() {
  const {
    state: {
      currentWeek,
      viewMode,
      goalBirdsOnlyFilter,
      selectedSpecies,
      selectedSpeciesMulti,
      goalLists,
      activeGoalListId,
      heatmapOpacity,
      liferCountRange,
      dataRange,
      showTotalRichness,
    },
    goalSpeciesCodes,
    setCurrentWeek,
    setViewMode,
    setSelectedSpecies,
    setSelectedSpeciesMulti,
    setActiveGoalListId,
    setHeatmapOpacity,
    setLiferCountRange,
    setShowTotalRichness,
  } = useMapControls()
  // Species picker state for Species Range view
  const [allSpecies, setAllSpecies] = useState<SpeciesMeta[]>([])
  const [speciesSearch, setSpeciesSearch] = useState('')
  const [isLoadingSpecies, setIsLoadingSpecies] = useState(false)

  // Multi-species compare mode
  const [compareMode, setCompareMode] = useState(false)

  // This Week's Highlights
  const [fullSpecies, setFullSpecies] = useState<Species[]>([])
  const [showHighlights, setShowHighlights] = useState(true)
  const { effectiveSeenSpecies } = useLifeList()

  // Week animation
  const { isAnimating, showWrapIndicator, startAnimation, stopAnimation } = useWeekAnimation(currentWeek, setCurrentWeek)

  // Load full species data for highlights (cached, shared with MapView)
  useEffect(() => {
    if (fullSpecies.length > 0) return
    fetchSpecies()
      .then((data) => {
        setFullSpecies(data as Species[])
      })
      .catch((err) => {
        console.error('ExploreTab: failed to load full species for highlights', err)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Compute lightweight highlights from species metadata (no expensive frequency lookup)
  const highlights: LightweightHighlight[] = useMemo(() => {
    if (fullSpecies.length === 0 || effectiveSeenSpecies.size === 0) return []
    const homeRegion = localStorage.getItem('homeRegion') || ''
    // Super-region to sub-region mapping for filtering
    const superToSubs: Record<string, string[]> = {
      'northern': ['ca-west', 'ca-central', 'ca-east'],
      'continental-us': ['us-ne', 'us-se', 'us-mw', 'us-sw', 'us-west', 'us-rockies'],
      'hawaii': ['us-hi'],
      'mex-central': ['mx-north', 'mx-south', 'ca-c-north', 'ca-c-south'],
      'caribbean': ['caribbean-greater', 'caribbean-lesser', 'atlantic-west'],
    }
    const result: LightweightHighlight[] = []
    const seen = new Set<string>()

    for (const sp of fullSpecies) {
      if (effectiveSeenSpecies.has(sp.speciesCode)) continue
      if (!sp.photoUrl) continue

      // Region filter
      if (homeRegion) {
        const subKeys = Object.keys(sp.regionalDifficulty ?? {})
        const inSub = subKeys.includes(homeRegion)
        const memberSubs = superToSubs[homeRegion]
        const inSuper = memberSubs ? subKeys.some(k => memberSubs.includes(k)) : false
        if (!inSub && !inSuper) continue
      }

      // Goal birds peaking this week
      if (goalSpeciesCodes.has(sp.speciesCode) && sp.peakWeek === currentWeek) {
        if (!seen.has(sp.speciesCode)) {
          result.push({ species: sp, reason: 'Goal bird at peak season' })
          seen.add(sp.speciesCode)
        }
      }

      // Peak season species (peakWeek matches current week, high seasonality)
      if (sp.peakWeek === currentWeek && sp.seasonalityScore > 0.5 && !seen.has(sp.speciesCode)) {
        result.push({ species: sp, reason: 'Peak season this week' })
        seen.add(sp.speciesCode)
      }

      // Easy wins in season (low difficulty, peak close to current week)
      if (sp.difficultyRating <= 3 && Math.abs(sp.peakWeek - currentWeek) <= 2 && !seen.has(sp.speciesCode)) {
        result.push({ species: sp, reason: `Easy lifer — difficulty ${sp.difficultyRating}/10` })
        seen.add(sp.speciesCode)
      }

      // Seasonal specialty (very high seasonality, within 3 weeks of peak)
      if (sp.seasonalityScore > 0.7 && Math.abs(sp.peakWeek - currentWeek) <= 3 && !seen.has(sp.speciesCode)) {
        result.push({ species: sp, reason: 'Seasonal specialty' })
        seen.add(sp.speciesCode)
      }

      if (result.length >= 8) break // limit candidates
    }

    // Sort: goal birds first, then by seasonality score
    result.sort((a, b) => {
      const aGoal = goalSpeciesCodes.has(a.species.speciesCode) ? 0 : 1
      const bGoal = goalSpeciesCodes.has(b.species.speciesCode) ? 0 : 1
      if (aGoal !== bGoal) return aGoal - bGoal
      return b.species.seasonalityScore - a.species.seasonalityScore
    })

    return result.slice(0, 6)
  }, [fullSpecies, currentWeek, effectiveSeenSpecies, goalSpeciesCodes])

  // Load species metadata when switching to species view
  useEffect(() => {
    if (viewMode !== 'species') return
    if (allSpecies.length > 0) return // already loaded
    setIsLoadingSpecies(true)
    fetchSpecies()
      .then((data: SpeciesMeta[]) => {
        setAllSpecies(data)
        setIsLoadingSpecies(false)
      })
      .catch((err) => {
        console.error('ExploreTab: failed to load species', err)
        setIsLoadingSpecies(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // Build filtered species list for picker
  const filteredSpecies = (() => {
    let list = allSpecies
    // When Goal Birds Only is active, filter to goal list species
    if (goalBirdsOnlyFilter && goalSpeciesCodes.size > 0) {
      list = list.filter((s) => goalSpeciesCodes.has(s.speciesCode))
    }
    // Apply text search
    if (speciesSearch.trim()) {
      const q = speciesSearch.toLowerCase()
      list = list.filter(
        (s) =>
          s.comName.toLowerCase().includes(q) ||
          s.sciName.toLowerCase().includes(q)
      )
    }
    return list
  })()

  // Selected species display name
  const selectedSpeciesMeta = allSpecies.find((s) => s.speciesCode === selectedSpecies)

  return (
    <div className="space-y-5">
      {/* View Mode Toggle */}
      <div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex gap-1">
          {[
            { mode: 'density' as const, label: 'Count' },
            { mode: 'probability' as const, label: 'Chance' },
            { mode: 'species' as const, label: 'Range' },
            { mode: 'goal-birds' as const, label: 'Goals' },
          ].map(({ mode, label }) => (
            <button
              key={mode}
              data-testid={`view-mode-${mode}`}
              onClick={() => setViewMode(mode)}
              title={label}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg text-center transition-all ${
                viewMode === mode
                  ? 'bg-white dark:bg-gray-700 text-[#2C3E7B] dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:bg-gray-200 dark:active:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 mt-1">
          <Tooltip content={TOOLTIPS[viewMode === 'density' ? 'richness' : viewMode === 'probability' ? 'frequency' : viewMode === 'species' ? 'range' : 'goals']} />
          <span className="text-xs lg:text-xs text-gray-500 dark:text-gray-400">
            {viewMode === 'density' ? 'New birds in each area' : viewMode === 'probability' ? 'Chance of finding a lifer' : viewMode === 'species' ? (compareMode && selectedSpeciesMulti.length > 1 ? 'Where multiple species overlap' : 'Where this species is found') : 'Goal birds in each area'}
          </span>
        </div>
      </div>

      {/* Active Goal List Selector */}
      {(viewMode === 'goal-birds' || ((viewMode === 'density' || viewMode === 'probability' || viewMode === 'species') && goalBirdsOnlyFilter)) && (
        <div>
          <label className="block text-xs lg:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Active Goal List
          </label>
          {goalLists.length === 0 ? (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                No goal lists yet. Create one in the Goals tab.
              </p>
            </div>
          ) : (
            <select
              value={activeGoalListId || ''}
              onChange={(e) => setActiveGoalListId(e.target.value || null)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2C3E7B]/30 focus:border-[#2C3E7B] bg-white dark:bg-gray-800 dark:text-gray-200"
              data-testid="active-goal-list-selector"
              aria-label="Select active goal list for map"
            >
              {goalLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.speciesCodes.length} birds)
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Show All Species toggle — in density mode, shows total richness instead of lifer density */}
      {viewMode === 'density' && (
        <button
          onClick={() => setShowTotalRichness(!showTotalRichness)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border transition-all text-sm font-medium ${
            showTotalRichness
              ? 'bg-[#2C3E7B] border-[#2C3E7B] text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
          aria-pressed={showTotalRichness}
          title={showTotalRichness ? 'Showing all species including seen ones' : 'Show all species including ones you have seen'}
        >
          <span className="flex items-center gap-1">Include Seen Species <Tooltip content={TOOLTIPS.totalRichness} /></span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              showTotalRichness ? 'bg-white/30' : 'bg-gray-200 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                showTotalRichness ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
      )}

      {/* This Week's Highlights */}
      {showHighlights && highlights.length > 0 && (
        <div className="mb-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">This Week's Highlights</h3>
            <button onClick={() => setShowHighlights(false)} className="text-xs lg:text-xs text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Hide</button>
          </div>
          <div className="grid grid-cols-3 gap-2 pb-2">
            {highlights.map(h => (
              <div
                key={h.species.speciesCode}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-2 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  setViewMode('species')
                  setSelectedSpecies(h.species.speciesCode)
                }}
              >
                {h.species.photoUrl && (
                  <img src={h.species.photoUrl} alt="" className="w-full h-20 rounded object-cover mb-1" loading="lazy" />
                )}
                <div className="text-xs font-medium truncate dark:text-gray-200">{h.species.comName}</div>
                <div className="text-xs lg:text-xs text-gray-500 dark:text-gray-400 truncate">{h.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Species Picker — shown in Species Range view */}
      {viewMode === 'species' && (
        <div>
          <label className="block text-xs lg:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            {compareMode ? 'Compare Species (up to 4)' : 'Select Species'}
          </label>
          {/* Search input */}
          <input
            type="text"
            placeholder="Search species..."
            value={speciesSearch}
            onChange={(e) => setSpeciesSearch(e.target.value)}
            data-testid="species-range-search"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2C3E7B]/30 focus:border-[#2C3E7B] bg-white dark:bg-gray-800 dark:text-gray-200 dark:placeholder-gray-500"
          />

          {/* Multi-species chip row */}
          {compareMode && selectedSpeciesMulti.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2" data-testid="multi-species-chips">
              {selectedSpeciesMulti.map((code, idx) => {
                const MULTI_COLORS = ['#4A90D9', '#E74C3C', '#27AE60', '#8E44AD']
                const meta = allSpecies.find((s) => s.speciesCode === code)
                return (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-white shadow-sm"
                    style={{ backgroundColor: MULTI_COLORS[idx] || '#666' }}
                    data-testid={`multi-chip-${code}`}
                  >
                    <span className="truncate max-w-[120px]">{meta?.comName || code}</span>
                    <button
                      onClick={() => {
                        const next = selectedSpeciesMulti.filter((c) => c !== code)
                        setSelectedSpeciesMulti(next)
                        // If removing leaves 1 or 0, sync selectedSpecies
                        if (next.length <= 1) {
                          setSelectedSpecies(next[0] || null)
                          if (next.length === 0) setCompareMode(false)
                        } else {
                          setSelectedSpecies(next[0])
                        }
                      }}
                      className="hover:bg-white/30 rounded p-0.5 transition-colors"
                      aria-label={`Remove ${meta?.comName || code}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {/* Compare species button / Clear comparison */}
          {selectedSpecies && !compareMode && (
            <button
              onClick={() => {
                setCompareMode(true)
                // Seed multi list with the currently selected species
                if (selectedSpecies && !selectedSpeciesMulti.includes(selectedSpecies)) {
                  setSelectedSpeciesMulti([selectedSpecies])
                }
              }}
              className="w-full mt-2 px-3 py-2 text-xs font-medium text-[#2C3E7B] dark:text-blue-400 border border-dashed border-[#2C3E7B]/30 dark:border-blue-400/30 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors"
              data-testid="compare-species-btn"
            >
              + Compare species
            </button>
          )}
          {compareMode && selectedSpeciesMulti.length >= 2 && (
            <button
              onClick={() => {
                setCompareMode(false)
                setSelectedSpeciesMulti([])
                // Keep the first species as selectedSpecies
              }}
              className="w-full mt-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-medium transition-colors"
              data-testid="clear-comparison-btn"
            >
              Clear comparison
            </button>
          )}

          {/* Selected species display (single mode only) */}
          {!compareMode && selectedSpecies && selectedSpeciesMeta && (
            <div className="flex items-center justify-between bg-[#2C3E7B] text-white px-3 py-2.5 rounded-xl text-sm mt-2 shadow-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{selectedSpeciesMeta.comName}</div>
                <div className="text-xs text-blue-200 italic truncate">{selectedSpeciesMeta.sciName}</div>
              </div>
              <button
                onClick={() => setSelectedSpecies(null)}
                className="ml-2 text-blue-200 hover:text-white transition-colors flex-shrink-0 p-1"
                aria-label="Clear selected species"
                data-testid="clear-selected-species"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          {/* Species list */}
          {isLoadingSpecies ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              <div className="animate-spin inline-block rounded-full h-5 w-5 border-2 border-[#2C3E7B] border-t-transparent mr-2"></div>
              Loading species...
            </div>
          ) : (
            <div
              data-testid="species-range-list"
              className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-xl mt-2 divide-y divide-gray-100 dark:divide-gray-700"
            >
              {filteredSpecies.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                  {goalBirdsOnlyFilter && goalSpeciesCodes.size === 0
                    ? 'No goal birds in your list. Add some in the Goals tab.'
                    : 'No species found.'}
                </div>
              ) : (
                filteredSpecies.slice(0, 100).map((s) => (
                  <button
                    key={s.speciesCode}
                    data-testid={`species-range-item-${s.speciesCode}`}
                    onClick={() => {
                      if (compareMode) {
                        // In compare mode, add to multi list (up to 4, no duplicates)
                        if (selectedSpeciesMulti.includes(s.speciesCode)) return
                        if (selectedSpeciesMulti.length >= 4) return
                        const next = [...selectedSpeciesMulti, s.speciesCode]
                        setSelectedSpeciesMulti(next)
                        setSelectedSpecies(next[0]) // Keep first as primary
                      } else {
                        setSelectedSpecies(s.speciesCode)
                      }
                      setSpeciesSearch('')
                    }}
                    className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-blue-50 dark:hover:bg-gray-700 ${
                      selectedSpecies === s.speciesCode || selectedSpeciesMulti.includes(s.speciesCode) ? 'bg-blue-50 dark:bg-gray-700 font-medium' : ''
                    } ${compareMode && selectedSpeciesMulti.length >= 4 && !selectedSpeciesMulti.includes(s.speciesCode) ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={compareMode && selectedSpeciesMulti.length >= 4 && !selectedSpeciesMulti.includes(s.speciesCode)}
                  >
                    <div className="font-medium text-gray-800 dark:text-gray-200">{s.comName}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 italic">{s.sciName}</div>
                  </button>
                ))
              )}
              {filteredSpecies.length > 100 && (
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Showing first 100 of {filteredSpecies.length} — type to search
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Week Slider */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="week-slider" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Week
          </label>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm transition-colors duration-300 ${
            showWrapIndicator
              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40'
              : 'text-[#2C3E7B] dark:text-blue-400 bg-white dark:bg-gray-700'
          }`}>
            Wk {currentWeek} · {getWeekLabel(currentWeek)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            id="week-slider"
            type="range"
            min="1"
            max="52"
            value={currentWeek}
            onChange={(e) => setCurrentWeek(parseInt(e.target.value, 10))}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="week-slider"
            title={`Week ${currentWeek}`}
          />
          <button
            onClick={isAnimating ? stopAnimation : startAnimation}
            data-testid={isAnimating ? 'animation-pause-button' : 'animation-play-button'}
            className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all shadow-sm ${
              isAnimating
                ? 'bg-gray-500 hover:bg-gray-600 text-white'
                : 'bg-[#2C3E7B] hover:bg-[#243267] text-white'
            }`}
            aria-label={isAnimating ? 'Pause migration animation' : 'Play migration animation'}
            title={isAnimating ? 'Pause animation' : 'Play migration animation'}
          >
            {isAnimating ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Advanced Controls — hidden in beginner mode behind details/summary */}
      {/* Opacity Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="opacity-slider" className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                Opacity <Tooltip content={TOOLTIPS.opacity} />
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                {Math.round(heatmapOpacity * 100)}%
              </span>
            </div>
            <input
              id="opacity-slider"
              type="range"
              min="0"
              max="100"
              value={Math.round(heatmapOpacity * 100)}
              onChange={(e) => setHeatmapOpacity(parseInt(e.target.value, 10) / 100)}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
              data-testid="opacity-slider"
              aria-label="Adjust heatmap opacity"
              title={`Opacity: ${Math.round(heatmapOpacity * 100)}%`}
            />
          </div>
      {/* Lifer Count Range Filter */}
      {viewMode === 'density' && !goalBirdsOnlyFilter && dataRange[1] > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
              Minimum Lifers <Tooltip content={TOOLTIPS.liferRange} />
            </label>
            <span className="text-xs font-semibold text-[#2C3E7B] dark:text-blue-400 tabular-nums">
              {liferCountRange[0]}+
            </span>
          </div>
          <input
            type="range"
            min={dataRange[0]}
            max={dataRange[1]}
            value={liferCountRange[0]}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              setLiferCountRange([val, 9999])
            }}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#2C3E7B]"
            data-testid="lifer-range-min-slider"
            aria-label="Minimum lifer count"
            title={`Minimum lifers: ${liferCountRange[0]}`}
          />
          <div className="flex justify-between text-xs lg:text-xs text-gray-500 dark:text-gray-400">
            <span>{dataRange[0]}</span>
            <span>{dataRange[1]}</span>
          </div>
          {liferCountRange[0] > dataRange[0] && (
            <button
              onClick={() => setLiferCountRange([dataRange[0], 9999])}
              className="w-full text-xs text-[#2C3E7B] dark:text-blue-400 hover:underline font-medium"
              data-testid="reset-lifer-range"
            >
              Reset minimum
            </button>
          )}
        </div>
      )}

      {/* Responsible birding footer */}
      <p className="text-xs lg:text-xs text-gray-500 dark:text-gray-400 text-center mt-4 px-2">
        Please bird responsibly.{' '}
        <a
          href="https://www.aba.org/aba-code-of-birding-ethics/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600 dark:hover:text-gray-400"
        >
          ABA Code of Birding Ethics
        </a>
      </p>
    </div>
  )
}
