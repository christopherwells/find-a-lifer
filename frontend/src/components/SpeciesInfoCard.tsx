import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Species } from './types'
import Badge from './Badge'
import Sparkline from './Sparkline'
import { getDisplayGroup } from '../lib/familyGroups'
import { getSpeciesFrequencyProfile, getSpeciesBestLocations } from '../lib/dataCache'

interface SpeciesInfoCardProps {
  species: Species
  onClose: () => void
  currentWeek?: number
  onCellClick?: (cellId: number, coordinates: [number, number]) => void
}

// SpeciesInfoCard - popup modal showing species details, sparkline, best locations, habitat
export default function SpeciesInfoCard({
  species,
  onClose,
  currentWeek,
  onCellClick,
}: SpeciesInfoCardProps) {
  const [freqProfile, setFreqProfile] = useState<number[] | null>(null)
  const [bestLocations, setBestLocations] = useState<Array<{ cellId: number; coordinates: [number, number]; name: string; freq: number }> | null>(null)
  const [loadingLocations, setLoadingLocations] = useState(false)

  const week = currentWeek ?? (() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), 0, 1)
    const diff = now.getTime() - start.getTime()
    return Math.min(52, Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))))
  })()

  // Load frequency profile
  useEffect(() => {
    let cancelled = false
    getSpeciesFrequencyProfile(species.speciesCode).then(profile => {
      if (!cancelled) setFreqProfile(profile)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [species.speciesCode])

  // Load best locations for current week
  useEffect(() => {
    let cancelled = false
    setLoadingLocations(true)
    getSpeciesBestLocations(species.speciesCode, week).then(locs => {
      if (!cancelled) {
        setBestLocations(locs)
        setLoadingLocations(false)
      }
    }).catch(() => {
      if (!cancelled) setLoadingLocations(false)
    })
    return () => { cancelled = true }
  }, [species.speciesCode, week])

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
      >
        {/* Photo area */}
        <div className="relative bg-gray-100 dark:bg-gray-800 h-36 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {species.photoUrl ? (
            <img
              src={species.photoUrl}
              alt={species.comName}
              className="w-full h-full object-cover"
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
            onClick={onClose}
            className="absolute top-2 right-2 bg-white dark:bg-gray-800 bg-opacity-90 dark:bg-opacity-90 rounded-full p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white shadow transition-colors"
            data-testid="species-info-card-close"
            aria-label="Close species info"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
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

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5" data-testid="species-info-badges">
            <Badge variant="conservation" value={species.conservStatus} size="pill" />
            <Badge variant="difficulty" value={species.difficultyLabel} size="pill" />
            {species.isRestrictedRange && (
              <Badge variant="restricted-range" value="Restricted Range" size="pill" />
            )}
            {/* Invasion status badge if not native everywhere */}
            {(() => {
              const nonNativeRegions = Object.entries(species.invasionStatus || {})
                .filter(([, s]) => s !== 'Native')
              if (nonNativeRegions.length === 0) return null
              const isNativeAnywhere = Object.values(species.invasionStatus || {}).includes('Native')
              const hasIntroduced = nonNativeRegions.some(([, s]) => s === 'Introduced')
              const primaryStatus = hasIntroduced ? 'Introduced' : nonNativeRegions[0][1]
              const regionsForStatus = nonNativeRegions.filter(([, s]) => s === primaryStatus)
              const label = isNativeAnywhere
                ? `${primaryStatus} (${regionsForStatus.map(([r]) => r).join(', ')})`
                : primaryStatus
              return <Badge variant="invasion" value={label} size="pill" />
            })()}
          </div>

          {/* Habitat badges */}
          {species.habitatLabels && species.habitatLabels.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Habitat</p>
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
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Seasonality</p>
              <Sparkline data={freqProfile} currentWeek={week} />
            </div>
          )}

          {/* Best locations for current week */}
          {(bestLocations || loadingLocations) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Best Locations (Week {week})
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
                        {(loc.freq * 100).toFixed(0)}%
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">Not recorded this week</p>
              )}
            </div>
          )}

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
