import type { Species } from './types'

interface SuggestionSectionProps {
  id: string
  emoji: string
  title: string
  species: Species[]
  activeListCodes: Set<string>
  isExpanded: boolean
  onToggle: () => void
  onAddSpecies: (species: Species) => void
  onSpeciesClick?: (species: Species) => void
  colorTheme: {
    bg: string       // e.g. 'bg-amber-50'
    border: string   // e.g. 'border-amber-200'
    hover: string    // e.g. 'hover:bg-amber-100'
    icon: string     // e.g. 'text-amber-600'
    title: string    // e.g. 'text-amber-800'
    badge: string    // e.g. 'bg-amber-200 text-amber-800'
    tag?: string     // optional per-species tag style e.g. 'bg-amber-100 text-amber-700'
  }
  tagText?: string   // optional per-species tag e.g. '📍 Rare'
}

export default function SuggestionSection({
  id,
  emoji,
  title,
  species,
  activeListCodes,
  isExpanded,
  onToggle,
  onAddSpecies,
  onSpeciesClick,
  colorTheme,
  tagText,
}: SuggestionSectionProps) {
  if (species.length === 0) return null

  return (
    <div className="mt-4" data-testid={`suggestions-section-${id}`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between py-2.5 px-3 ${colorTheme.bg} border ${colorTheme.border} rounded-lg ${colorTheme.hover} transition-colors`}
        data-testid={`${id}-suggestions-toggle`}
        aria-expanded={isExpanded}
        aria-controls={`section-${id}`}
      >
        <div className="flex items-center gap-2">
          <span className={`${colorTheme.icon} font-bold text-sm`}>{emoji}</span>
          <span className={`text-sm font-semibold ${colorTheme.title}`}>{title}</span>
          <span className={`text-xs ${colorTheme.badge} px-1.5 py-0.5 rounded-full font-medium`}>
            {species.length}
          </span>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 ${colorTheme.icon} transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-1 space-y-1" id={`section-${id}`} role="region" aria-label={title} data-testid={`${id}-suggestions-list`}>
          {species.map((sp) => {
            const alreadyInList = activeListCodes.has(sp.speciesCode)
            return (
              <div
                key={sp.speciesCode}
                className={`flex items-center justify-between px-2 py-2.5 rounded ${
                  alreadyInList
                    ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onSpeciesClick?.(sp)}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-[#2C3E50] dark:text-gray-200 truncate">
                      {sp.comName}
                    </span>
                    {tagText && colorTheme.tag && (
                      <span className={`text-[11px] lg:text-xs ${colorTheme.tag} px-1 rounded-full font-medium whitespace-nowrap flex-shrink-0`}>
                        {tagText}
                      </span>
                    )}
                    {alreadyInList && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                        ✓ In list
                      </span>
                    )}
                  </div>
                </div>

                {alreadyInList ? (
                  <div className="ml-2 flex-shrink-0 p-1.5 text-blue-400 cursor-default" title="Already in this goal list">
                    ✓
                  </div>
                ) : (
                  <button
                    onClick={() => onAddSpecies(sp)}
                    className="ml-2 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-[11px] font-medium text-[#2C3E7B] border border-[#2C3E7B]/30 rounded hover:bg-[#2C3E7B] hover:text-white transition-colors"
                    title={`Add ${sp.comName} to goal list`}
                    aria-label={`Add ${sp.comName} to goal list`}
                  >
                    +
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
