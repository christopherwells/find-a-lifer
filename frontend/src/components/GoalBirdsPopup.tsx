import Badge from './Badge'
import { detectSubRegionForCell } from '../lib/subRegions'
import type { Species } from './types'
import type { GoalBirdInCell, SpeciesMeta } from '../lib/mapHelpers'
import type { NotableBird } from '../lib/recommendationEngine'

export interface GoalBirdsPopupData {
  cellId: number
  coordinates: [number, number]
  birds: GoalBirdInCell[]
  nChecklists?: number
  label?: string
}

interface GoalBirdsPopupProps {
  popup: GoalBirdsPopupData
  notableBirds: NotableBird[]
  speciesByIdCache: Map<number, SpeciesMeta> | null
  onClose: () => void
  onSpeciesCardOpen: (species: Species) => void
  onRegionContextChange: (ctx: { subRegionId: string; cellLng: number; cellLat: number } | null) => void
}

export default function GoalBirdsPopup({
  popup,
  notableBirds,
  speciesByIdCache,
  onClose,
  onSpeciesCardOpen,
  onRegionContextChange,
}: GoalBirdsPopupProps) {
  return (
    <div
      data-testid="goal-birds-popup"
      className="fixed inset-0 top-[44px] bottom-[calc(52px+env(safe-area-inset-bottom,0px))] bg-white dark:bg-gray-900 flex flex-col z-40 animate-sheet-up md:animate-none md:absolute md:inset-auto md:top-4 md:right-4 md:w-72 md:max-h-96 md:z-10 md:rounded-lg md:shadow-xl md:border md:border-amber-200"
      style={{ maxHeight: window.innerWidth >= 768 ? '80%' : undefined }}
    >
      {/* Popup header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200 rounded-t-lg">
        <div>
          <div className="text-sm font-semibold text-amber-900">{'\u{1F3AF}'} Goal Birds in Area</div>
          <div className="text-xs text-amber-700">
            {popup.birds.length === 0
              ? 'No goal birds here this week'
              : `${popup.birds.length} goal bird${popup.birds.length !== 1 ? 's' : ''} · ${popup.label || `Cell ${popup.cellId}`}`}
          </div>
        </div>
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-amber-600 hover:text-amber-900 transition-colors rounded-lg md:min-h-0 md:min-w-0 md:p-1"
          aria-label="Close popup"
          data-testid="goal-birds-popup-close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Low data warning */}
      {popup.nChecklists != null && popup.nChecklists < 10 && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 flex items-center gap-1.5">
          <span className="text-amber-500 text-xs">{'\u26A0'}</span>
          <span className="text-[11px] lg:text-xs text-amber-700">
            Limited data ({popup.nChecklists} checklist{popup.nChecklists !== 1 ? 's' : ''}) — frequencies may be unreliable
          </span>
        </div>
      )}

      {/* Bird list */}
      <div className="overflow-y-auto flex-1">
        {/* Notable Birds section */}
        {notableBirds.length > 0 && (
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-600">
            <div className="text-[11px] lg:text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Notable Birds Here</div>
            {notableBirds.map(({ species, tag, frequency }) => (
              <div key={species.speciesCode} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1"
                onClick={() => {
                  onSpeciesCardOpen(species)
                  const [lng, lat] = popup.coordinates
                  const region = detectSubRegionForCell(popup.cellId)
                  onRegionContextChange(region ? { subRegionId: region.id, cellLng: lng, cellLat: lat } : null)
                }}
              >
                {species.photoUrl ? (
                  <img src={species.photoUrl} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-lg">{'\u{1F426}'}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate dark:text-gray-200">{species.comName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{tag} · Found on {Math.round(frequency * 100)}% of birding trips</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {popup.birds.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-500">
            <div className="text-2xl mb-2">{'\u{1F50D}'}</div>
            <p>None of your goal birds occur in this cell during this week.</p>
            <p className="text-xs text-gray-400 mt-1">Try a different cell or adjust the week.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {popup.birds.map((bird) => (
              <li
                key={bird.speciesCode}
                data-testid={`goal-bird-item-${bird.speciesCode}`}
                className={`px-3 py-2 flex items-center justify-between ${bird.isSeen ? 'opacity-50' : ''}`}
              >
                <div className="min-w-0 flex-1 mr-2">
                  <button
                    className={`text-sm font-medium text-left ${bird.isSeen ? 'line-through text-gray-400' : 'text-gray-800 hover:text-[#2C3E7B]'} cursor-pointer`}
                    onClick={() => {
                      const meta = speciesByIdCache?.get(bird.species_id)
                      if (meta) {
                        onSpeciesCardOpen(meta as unknown as Species)
                        const [lng, lat] = popup.coordinates
                        const region = detectSubRegionForCell(popup.cellId)
                        onRegionContextChange(region ? { subRegionId: region.id, cellLng: lng, cellLat: lat } : null)
                      }
                    }}
                  >
                    {bird.comName}
                  </button>
                  <div
                    className={`text-xs ${bird.isSeen ? 'line-through text-gray-300' : 'text-gray-500'}`}
                  >
                    {bird.sciName}
                  </div>
                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {bird.conservStatus && bird.conservStatus !== 'Unknown' && (
                      <Badge variant="conservation" value={bird.conservStatus} size="icon" />
                    )}
                    {bird.difficultyLabel && (
                      <Badge variant="difficulty" value={bird.difficultyLabel} size="icon" />
                    )}
                    {bird.isRestrictedRange && (
                      <Badge variant="restricted-range" value="Restricted Range" size="icon" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {bird.isSeen && (
                    <span className="text-xs text-green-600 font-medium" title="Already seen">{'\u2713'}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 rounded-b-lg">
        <p className="text-xs text-gray-400 text-center">
          Click another cell to update · Sorted by abundance
        </p>
      </div>
    </div>
  )
}
