import type { TripLifer } from './types'
import Badge from './Badge'
import { getDisplayGroup } from '../lib/familyGroups'
import { formatProbability, getProbabilityColor } from './tripPlanUtils'

interface TripSpeciesItemProps {
  lifer: TripLifer
  index: number
  showProbability?: boolean
  colorClass?: string
  onClick?: () => void
}

export default function TripSpeciesItem({ lifer, index, showProbability = true, colorClass, onClick }: TripSpeciesItemProps) {
  const bgClass = colorClass
    ? `bg-${colorClass}-50 dark:bg-${colorClass}-900/30 border border-${colorClass}-100 dark:border-${colorClass}-800`
    : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30'

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${bgClass} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <div className="text-xs text-gray-400 dark:text-gray-500 w-6 text-right font-mono">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {lifer.conservStatus && lifer.conservStatus !== 'Least Concern' && (
            <Badge variant="conservation" value={lifer.conservStatus} size="dot" />
          )}
          <span className={`text-sm font-medium truncate ${colorClass ? `text-${colorClass}-900 dark:text-${colorClass}-200` : 'text-[#2C3E50] dark:text-gray-200'}`}>
            {lifer.comName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs lg:text-xs text-gray-400 dark:text-gray-500 truncate">
            {getDisplayGroup(lifer.familyComName)}
          </span>
          {lifer.difficultyRating != null && lifer.difficultyRating >= 7 && (
            <span className="text-xs lg:text-xs font-medium text-orange-600 dark:text-orange-400">
              {lifer.difficultyRating}/10
            </span>
          )}
        </div>
      </div>
      {showProbability && (
        <div className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${getProbabilityColor(lifer.probability)}`}>
          {formatProbability(lifer.probability)}
        </div>
      )}
    </div>
  )
}
