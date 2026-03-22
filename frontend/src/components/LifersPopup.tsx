import Badge from './Badge'
import { getDisplayGroup } from '../lib/familyGroups'
import { detectSubRegionForCell } from '../lib/subRegions'
import type { Species, CellCovariates } from './types'
import type { LiferInCell, SpeciesMeta } from '../lib/mapHelpers'
import type { NotableBird } from '../lib/recommendationEngine'
import type { GoalList } from '../lib/goalListsDB'

export interface LifersPopupData {
  cellId: number
  coordinates: [number, number]
  lifers: LiferInCell[]
  totalSpecies: number
  filteredTotal: number  // species matching active filters (before seen check)
  hasActiveFilter: boolean
  nChecklists?: number
  label?: string
  estimated?: boolean
}

interface LifersPopupProps {
  popup: LifersPopupData
  notableBirds: NotableBird[]
  speciesByIdCache: Map<number, SpeciesMeta> | null
  seenSpecies: Set<string>
  popupShowAll: boolean
  popupShowAllSpecies: boolean
  popupCovariates: CellCovariates | null
  popupGoalLists: GoalList[]
  popupGoalAddFeedback: { speciesCode: string; listName: string; status: 'added' | 'already' } | null
  onClose: () => void
  onSpeciesCardOpen: (species: Species) => void
  onRegionContextChange: (ctx: { subRegionId: string; cellLng: number; cellLat: number } | null) => void
  onShowAllToggle: () => void
  onShowAllSpeciesToggle: () => void
  onNotableAddToGoal: (speciesCode: string) => void
}

export default function LifersPopup({
  popup,
  notableBirds,
  speciesByIdCache,
  seenSpecies,
  popupShowAll,
  popupShowAllSpecies,
  popupCovariates,
  popupGoalLists,
  popupGoalAddFeedback,
  onClose,
  onSpeciesCardOpen,
  onRegionContextChange,
  onShowAllToggle,
  onShowAllSpeciesToggle,
  onNotableAddToGoal,
}: LifersPopupProps) {
  return (
    <div
      data-testid="lifers-popup"
      role="dialog"
      aria-modal="true"
      aria-label="Species in selected cell"
      className="fixed inset-0 top-[44px] bottom-[calc(52px+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-900 flex flex-col z-40 animate-sheet-up md:animate-none md:absolute md:inset-auto md:top-4 md:right-4 md:w-72 md:max-h-96 md:z-10 md:rounded-lg md:shadow-xl md:border md:border-teal-200"
      style={{ maxHeight: window.innerWidth >= 768 ? '80%' : undefined }}
    >
      {/* Popup header */}
      <div className="flex items-center justify-between px-3 py-2 bg-teal-50 dark:bg-teal-900/40 border-b border-teal-200 dark:border-teal-700 rounded-t-lg">
        <div>
          <div className="text-sm font-semibold text-teal-900 dark:text-teal-100">
            {popupShowAllSpecies
              ? '\u{1F52D} All Species'
              : seenSpecies.size === 0 ? '\u{1F52D} Species in Area' : '\u{1F52D} Lifers in Area'}
          </div>
          <div className="text-xs text-teal-700 dark:text-teal-300">
            {(() => {
              const label = popup.label || `Cell ${popup.cellId}`
              if (popupShowAllSpecies) {
                const unseenCount = popup.lifers.filter(l => !l.isSeen).length
                const seenCount = popup.lifers.filter(l => l.isSeen).length
                return `${popup.lifers.length} species (${unseenCount} unseen, ${seenCount} seen) · ${label}`
              }
              if (seenSpecies.size === 0) {
                return popup.hasActiveFilter
                  ? `${popup.filteredTotal} of ${popup.totalSpecies} match filter · ${label}`
                  : `${popup.totalSpecies} species · ${label}`
              }
              if (popup.lifers.length === 0) {
                return popup.hasActiveFilter
                  ? `No lifers match filter / ${popup.filteredTotal} species · ${label}`
                  : popup.totalSpecies === 0
                    ? `No species data · ${label}`
                    : `No lifers to find / ${popup.totalSpecies} species · ${label}`
              }
              return popup.hasActiveFilter
                ? `${popup.lifers.length} lifer${popup.lifers.length !== 1 ? 's' : ''} match filter / ${popup.filteredTotal} species · ${label}`
                : `${popup.lifers.length} lifer${popup.lifers.length !== 1 ? 's' : ''} to find / ${popup.totalSpecies} species · ${label}`
            })()}
          </div>
        </div>
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-teal-600 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-200 transition-colors rounded-lg md:min-h-0 md:min-w-0 md:p-1"
          aria-label="Close popup"
          data-testid="lifers-popup-close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {/* Show all species toggle (only when user has a life list) */}
      {seenSpecies.size > 0 && (
        <button
          onClick={onShowAllSpeciesToggle}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-xs border-b transition-colors ${
            popupShowAllSpecies
              ? 'bg-teal-100 dark:bg-teal-900/50 border-teal-200 dark:border-teal-700 text-teal-800 dark:text-teal-200'
              : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-750'
          }`}
          data-testid="popup-show-all-species-toggle"
        >
          <span>{popupShowAllSpecies ? 'Showing all species' : 'Show all species (with \u2713)'}</span>
          <span
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              popupShowAllSpecies ? 'bg-teal-500' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                popupShowAllSpecies ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      )}

      {/* Estimated cell warning */}
      {popup.estimated && (
        <div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 flex items-center gap-1.5">
          <span className="text-red-500 text-xs">{'\u26A0'}</span>
          <span className="text-xs lg:text-xs text-red-700 dark:text-red-400">
            No checklist data — species estimated from neighboring cells
          </span>
        </div>
      )}
      {/* Low data warning */}
      {!popup.estimated && popup.nChecklists != null && popup.nChecklists < 10 && (
        <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border-b border-teal-200 dark:border-teal-800 flex items-center gap-1.5">
          <span className="text-amber-500 text-xs">{'\u26A0'}</span>
          <span className="text-xs lg:text-xs text-amber-700 dark:text-amber-400">
            Limited data ({popup.nChecklists} checklist{popup.nChecklists !== 1 ? 's' : ''}) — frequencies may be unreliable
          </span>
        </div>
      )}

      {/* Import prompt when no life list (only show when no filter is active) */}
      {seenSpecies.size === 0 && popup.lifers.length > 0 && !popup.hasActiveFilter && (
        <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-teal-200 dark:border-teal-800 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Import your life list from the menu (<strong>⋮</strong>) to see which are lifers</p>
        </div>
      )}
      {/* Filter active indicator */}
      {popup.hasActiveFilter && (
        <div className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 border-b border-teal-200 dark:border-teal-800 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
          </svg>
          <span className="text-xs lg:text-xs text-blue-700 dark:text-blue-400">
            Filtered — {popup.filteredTotal} of {popup.totalSpecies} species match
          </span>
        </div>
      )}
      {/* Habitat bar */}
      {popupCovariates && (
        <div className="px-3 py-2 border-b border-teal-200 dark:border-teal-800 space-y-1" data-testid="habitat-bar">
          <p className="text-xs lg:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Habitat</p>
          {(() => {
            const cov = popupCovariates as unknown as Record<string, number>
            const ocean = cov.ocean || 0
            // Support both split forest types (new) and combined 'trees' (legacy)
            const hasForestSplit = 'needleleaf' in cov || 'evergreen_broadleaf' in cov
            const landCovKeys = hasForestSplit
              ? ['needleleaf', 'evergreen_broadleaf', 'deciduous_broadleaf', 'mixed_forest', 'shrub', 'herb', 'cultivated', 'urban', 'water', 'flooded']
              : ['trees', 'shrub', 'herb', 'cultivated', 'urban', 'water', 'flooded']
            const landSum = landCovKeys.reduce((s, k) => s + (cov[k] || 0), 0)
            const barren = Math.max(0, 1 - ocean - landSum)

            // 12-bin categories with simple, friendly names and emojis
            const categories = hasForestSplit ? [
              { key: 'ocean', val: ocean, color: '#1B4F72', label: 'Ocean', icon: '\u{1F30A}' },
              { key: 'needleleaf', val: cov.needleleaf || 0, color: '#1B5E20', label: 'Conifer', icon: '\u{1F332}' },
              { key: 'evergreen_broadleaf', val: cov.evergreen_broadleaf || 0, color: '#2E7D32', label: 'Tropical', icon: '\u{1F334}' },
              { key: 'deciduous_broadleaf', val: cov.deciduous_broadleaf || 0, color: '#558B2F', label: 'Deciduous', icon: '\u{1F333}' },
              { key: 'mixed_forest', val: cov.mixed_forest || 0, color: '#33691E', label: 'Mixed', icon: '\u{1F343}' },
              { key: 'shrub', val: cov.shrub || 0, color: '#8B6914', label: 'Scrub', icon: '\u{1F335}' },
              { key: 'herb', val: cov.herb || 0, color: '#A8D08D', label: 'Grassland', icon: '\u{1F33F}' },
              { key: 'cultivated', val: cov.cultivated || 0, color: '#D4A843', label: 'Farmland', icon: '\u{1F33E}' },
              { key: 'urban', val: cov.urban || 0, color: '#888', label: 'Developed', icon: '\u{1F3D8}' },
              { key: 'water', val: Math.max(0, (cov.water || 0) - ocean), color: '#4A90D9', label: 'Freshwater', icon: '\u{1F4A7}' },
              { key: 'flooded', val: cov.flooded || 0, color: '#6B8E9B', label: 'Wetland', icon: '\u{1F3DE}' },
              { key: 'barren', val: barren, color: '#C4A882', label: 'Barren', icon: '\u{1F3DC}' },
            ] : [
              // Legacy fallback (combined trees)
              { key: 'ocean', val: ocean, color: '#1B4F72', label: 'Ocean', icon: '\u{1F30A}' },
              { key: 'trees', val: cov.trees || 0, color: '#22763F', label: 'Forest', icon: '\u{1F332}' },
              { key: 'shrub', val: cov.shrub || 0, color: '#8B6914', label: 'Scrub', icon: '\u{1F335}' },
              { key: 'herb', val: cov.herb || 0, color: '#A8D08D', label: 'Grassland', icon: '\u{1F33F}' },
              { key: 'cultivated', val: cov.cultivated || 0, color: '#D4A843', label: 'Farmland', icon: '\u{1F33E}' },
              { key: 'urban', val: cov.urban || 0, color: '#888', label: 'Developed', icon: '\u{1F3D8}' },
              { key: 'water', val: Math.max(0, (cov.water || 0) - ocean), color: '#4A90D9', label: 'Freshwater', icon: '\u{1F4A7}' },
              { key: 'flooded', val: cov.flooded || 0, color: '#6B8E9B', label: 'Wetland', icon: '\u{1F3DE}' },
              { key: 'barren', val: barren, color: '#C4A882', label: 'Barren', icon: '\u{1F3DC}' },
            ]
            const total = categories.reduce((s, c) => s + c.val, 0)
            const scale = total > 0 ? 100 / total : 0

            return (
              <>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700">
                  {categories.map(({ key, val, color }) => {
                    const pct = val * scale
                    if (pct < 1.5) return null
                    return (
                      <div
                        key={key}
                        style={{ width: `${pct}%`, backgroundColor: color }}
                        title={`${key}: ${(val * 100).toFixed(0)}%`}
                      />
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0">
                  {categories.map(({ key, val, icon, label }) => {
                    if (val < 0.03) return null
                    return (
                      <span key={key} className="text-xs lg:text-xs text-gray-500 dark:text-gray-400">
                        {icon} {label} {(val * 100).toFixed(0)}%
                      </span>
                    )
                  })}
                  {popupCovariates.elev_mean > 0 && (
                    <span className="text-xs lg:text-xs text-gray-500 dark:text-gray-400">
                      {'\u26F0'} {Math.round(popupCovariates.elev_mean)}m
                    </span>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}
      {/* Lifer list */}
      <div className="overflow-y-auto flex-1">
        {/* Notable Birds section removed — recommendations live in highlights */}
        {popup.lifers.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            {popup.hasActiveFilter ? (
              popup.filteredTotal === 0 ? (
                <>
                  <p>No species matching your filter were recorded in this cell this week.</p>
                  <p className="text-xs text-gray-400 mt-1">Try a different cell, week, or clear the filter.</p>
                </>
              ) : (
                <>
                  <div className="text-2xl mb-2">{'\u{1F389}'}</div>
                  <p>You've seen all {popup.filteredTotal} matching species in this cell!</p>
                  <p className="text-xs text-gray-400 mt-1">Try a different cell or week to find more lifers.</p>
                </>
              )
            ) : seenSpecies.size === 0 ? (
              <>
                <p>Import your life list from the menu (<strong>⋮</strong>) to see which are lifers.</p>
                {popup.totalSpecies > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{popup.totalSpecies} species recorded here this week.</p>
                )}
              </>
            ) : popup.totalSpecies === 0 ? (
              <>
                <p>No species data for this cell this week.</p>
                <p className="text-xs text-gray-400 mt-1">Try a different cell or week.</p>
              </>
            ) : (
              <>
                <div className="text-2xl mb-2">{'\u{1F389}'}</div>
                <p>You've seen all {popup.totalSpecies} species in this cell!</p>
                <p className="text-xs text-gray-400 mt-1">Try a different cell or week to find more lifers.</p>
              </>
            )}
          </div>
        ) : (
          <div>
            {(() => {
              // Group lifers by display group in ecological order
              const familyMap = new Map<string, LiferInCell[]>()
              const familyMinOrder = new Map<string, number>()
              popup.lifers.forEach((lifer) => {
                const family = getDisplayGroup(lifer.familyComName || 'Other')
                if (!familyMap.has(family)) familyMap.set(family, [])
                familyMap.get(family)!.push(lifer)
                const order = lifer.taxonOrder ?? 99999
                const cur = familyMinOrder.get(family) ?? 99999
                if (order < cur) familyMinOrder.set(family, order)
              })
              // Sort families by taxonomic order, species within by taxonOrder too
              const families = Array.from(familyMap.entries()).sort(
                (a, b) => (familyMinOrder.get(a[0]) ?? 99999) - (familyMinOrder.get(b[0]) ?? 99999)
              )
              families.forEach(([, lifers]) => lifers.sort((a, b) => (a.taxonOrder ?? 99999) - (b.taxonOrder ?? 99999)))
              // Pagination: flatten to count total, then paginate within families
              const allLifers = families.flatMap(([, lifers]) => lifers)
              const POPUP_PAGE_SIZE = window.innerWidth < 768 ? 12 : 20
              const totalCount = allLifers.length
              const displayLimit = popupShowAll ? totalCount : POPUP_PAGE_SIZE
              let displayedCount = 0

              return (
                <>
                  {families.map(([family, lifers]) => {
                    // Skip families entirely if we've hit the limit
                    if (!popupShowAll && displayedCount >= displayLimit) return null
                    const remainingSlots = displayLimit - displayedCount
                    const visibleLifers = popupShowAll ? lifers : lifers.slice(0, remainingSlots)
                    displayedCount += visibleLifers.length
                    return (
                      <div key={family}>
                        <div className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0">
                          <span className="text-xs lg:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{family}</span>
                        </div>
                        {visibleLifers.map((lifer) => (
                          <div
                            key={lifer.speciesCode}
                            data-testid={`lifer-item-${lifer.speciesCode}`}
                            className={`px-2 py-0.5 flex items-center border-b border-gray-50 dark:border-gray-800 leading-tight ${
                              lifer.isSeen ? 'opacity-60' : ''
                            }`}
                          >
                            {/* Seen checkmark */}
                            {lifer.isSeen && (
                              <span className="text-green-500 dark:text-green-400 text-xs mr-1 flex-shrink-0" title="Already seen">{'\u2713'}</span>
                            )}
                            <button
                              className={`text-xs truncate flex-1 text-left cursor-pointer ${
                                lifer.isSeen
                                  ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                  : 'text-gray-800 dark:text-gray-200 hover:text-[#2C3E7B] dark:hover:text-blue-400'
                              }`}
                              onClick={() => {
                                const meta = speciesByIdCache?.get(lifer.species_id)
                                if (meta) {
                                  onSpeciesCardOpen(meta as unknown as Species)
                                  const [lng, lat] = popup.coordinates
                                  const region = detectSubRegionForCell(popup.cellId)
                                  onRegionContextChange(region ? { subRegionId: region.id, cellLng: lng, cellLat: lat } : null)
                                }
                              }}
                            >
                              {lifer.comName}
                            </button>
                            <div className="flex items-center gap-px flex-shrink-0 ml-1">
                              {lifer.conservStatus && lifer.conservStatus !== 'Unknown' && lifer.conservStatus !== 'Least Concern' && (
                                <Badge variant="conservation" value={lifer.conservStatus} size="icon" />
                              )}
                              {lifer.difficultyRating != null && lifer.difficultyRating >= 5 && (
                                <span
                                  className={`inline-flex items-center justify-center min-w-[1.1rem] h-4 px-0.5 rounded text-xs lg:text-xs font-bold flex-shrink-0 ${
                                    lifer.difficultyRating >= 10 ? 'bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200'
                                    : lifer.difficultyRating >= 9 ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300'
                                    : lifer.difficultyRating >= 8 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300'
                                    : lifer.difficultyRating >= 7 ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                    : lifer.difficultyRating >= 6 ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300'
                                    : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                                  }`}
                                  title={`Difficulty: ${lifer.difficultyRating}/10`}
                                >
                                  {lifer.difficultyRating}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                  {!popupShowAll && totalCount > POPUP_PAGE_SIZE && (
                    <button
                      className="w-full px-3 py-2 text-xs text-[#2C3E7B] dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium text-center"
                      onClick={onShowAllToggle}
                      data-testid="popup-show-all"
                    >
                      Show all {totalCount} species
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 rounded-b-lg">
        <button
          onClick={onClose}
          className="w-full py-2 text-sm font-medium text-[#2C3E7B] dark:text-blue-400 md:hidden"
        >
          Back to Map
        </button>
        <p className="text-xs text-gray-400 text-center hidden md:block">
          Click species name for details · Click cell to update
        </p>
      </div>
    </div>
  )
}
