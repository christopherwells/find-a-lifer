import { createPortal } from 'react-dom'
import type { Species } from './types'

// SpeciesInfoCard - popup modal showing species details (photo, badges, eBird link)
export default function SpeciesInfoCard({
  species,
  onClose,
}: {
  species: Species
  onClose: () => void
}) {
  const conservationColors: Record<string, { bg: string; text: string; label: string }> = {
    'Least Concern': { bg: 'bg-green-100', text: 'text-green-800', label: 'Least Concern' },
    'Near Threatened': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Near Threatened' },
    'Vulnerable': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Vulnerable' },
    'Endangered': { bg: 'bg-red-100', text: 'text-red-800', label: 'Endangered' },
    'Critically Endangered': { bg: 'bg-red-200', text: 'text-red-900', label: 'Critically Endangered' },
    'Unknown': { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Unknown' },
  }
  const difficultyColors: Record<string, { bg: string; text: string }> = {
    'Easy': { bg: 'bg-green-100', text: 'text-green-800' },
    'Moderate': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'Hard': { bg: 'bg-orange-100', text: 'text-orange-800' },
    'Very Hard': { bg: 'bg-red-100', text: 'text-red-800' },
    'Extremely Hard': { bg: 'bg-purple-100', text: 'text-purple-800' },
  }
  const conservStyle = conservationColors[species.conservStatus] ?? conservationColors['Unknown']
  const diffStyle = difficultyColors[species.difficultyLabel] ?? { bg: 'bg-gray-100', text: 'text-gray-600' }

  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      data-testid="species-info-card-overlay"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="species-info-card"
      >
        {/* Photo area */}
        <div className="relative bg-gray-100 h-36 flex items-center justify-center overflow-hidden">
          {species.photoUrl ? (
            <img
              src={species.photoUrl}
              alt={species.comName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs">No photo available</span>
            </div>
          )}
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-full p-1.5 text-gray-600 hover:text-gray-900 shadow transition-colors"
            data-testid="species-info-card-close"
            aria-label="Close species info"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Info body */}
        <div className="p-4 space-y-3">
          {/* Names */}
          <div>
            <h3 className="text-lg font-bold text-[#2C3E50] leading-tight" data-testid="species-info-common-name">
              {species.comName}
            </h3>
            <p className="text-sm italic text-gray-500" data-testid="species-info-sci-name">
              {species.sciName}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{species.familyComName}</p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2" data-testid="species-info-badges">
            {/* Conservation status badge */}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${conservStyle.bg} ${conservStyle.text}`}
              data-testid="species-info-conservation-badge"
            >
              🌿 {conservStyle.label}
            </span>
            {/* Difficulty badge */}
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${diffStyle.bg} ${diffStyle.text}`}
              data-testid="species-info-difficulty-badge"
            >
              🔭 {species.difficultyLabel}
            </span>
            {/* Restricted range badge */}
            {species.isRestrictedRange && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                data-testid="species-info-restricted-badge"
              >
                📍 Restricted Range
              </span>
            )}
            {/* Invasion status badge if not empty/native */}
            {species.invasionStatus && species.invasionStatus !== '' && species.invasionStatus !== 'Native' && (
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                data-testid="species-info-invasion-badge"
              >
                ⚠️ {species.invasionStatus}
              </span>
            )}
          </div>

          {/* eBird link */}
          <a
            href={species.ebirdUrl}
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
