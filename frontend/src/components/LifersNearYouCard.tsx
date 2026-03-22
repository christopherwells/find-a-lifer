import { useState, useEffect, useRef } from 'react'
import type { Species } from './types'
import { getLifersNearLocation, type NearbyLifer } from '../lib/dataCache'

interface LifersNearYouCardProps {
  week: number
  seenSpecies: Set<string>
  resolution?: number
  onSpeciesClick?: (species: Species) => void
  onCellClick?: (cellId: number) => void
  compact?: boolean // mobile mode
}

export default function LifersNearYouCard({
  week,
  seenSpecies,
  resolution,
  onSpeciesClick,
  onCellClick,
  compact = false,
}: LifersNearYouCardProps) {
  const [lifers, setLifers] = useState<NearbyLifer[]>([])
  const [loading, setLoading] = useState(false)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const fetchedRef = useRef<string>('')

  // Get user location from localStorage mapPosition or geolocation
  useEffect(() => {
    const stored = localStorage.getItem('mapPosition')
    if (stored) {
      try {
        const pos = JSON.parse(stored)
        if (pos.center) {
          setUserLocation([pos.center.lng ?? pos.center[0], pos.center.lat ?? pos.center[1]])
          return
        }
      } catch { /* ignore */ }
    }
    // Fallback: try geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
        () => { /* denied — no location available */ },
        { timeout: 5000 }
      )
    }
  }, [])

  // Fetch lifers when location/week/seenSpecies change
  useEffect(() => {
    if (!userLocation) return
    const key = `${userLocation[0].toFixed(2)},${userLocation[1].toFixed(2)}-${week}-${seenSpecies.size}`
    if (key === fetchedRef.current) return
    fetchedRef.current = key

    setLoading(true)
    getLifersNearLocation(userLocation[0], userLocation[1], week, seenSpecies, compact ? 3 : 5, resolution)
      .then(setLifers)
      .catch(() => setLifers([]))
      .finally(() => setLoading(false))
  }, [userLocation, week, seenSpecies, resolution, compact])

  if (!userLocation || (lifers.length === 0 && !loading)) return null

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--color-brand)] border-t-transparent" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Finding lifers near you...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-gradient-to-r from-[var(--color-brand)]/10 to-transparent">
        <h4 className="text-xs font-semibold text-[var(--color-brand-text)] flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-[var(--color-brand)]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          Lifers Near You This Week
        </h4>
      </div>
      <div className={compact ? 'space-y-1 px-2 py-1.5' : 'space-y-1.5 px-3 py-2'}>
        {lifers.map((lifer) => (
          <div
            key={lifer.speciesCode}
            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-1.5 transition-colors min-h-[44px]"
            onClick={() => {
              if (onSpeciesClick) {
                // Create a minimal Species object for the info card
                onSpeciesClick({ speciesCode: lifer.speciesCode, comName: lifer.comName } as Species)
              }
            }}
          >
            {lifer.photoUrl && !compact && (
              <img
                src={lifer.photoUrl}
                alt=""
                className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                loading="lazy"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                {lifer.comName}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                <span>{Math.round(lifer.freq * 100)}% of trips</span>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <button
                  className="text-[var(--color-brand)] hover:underline"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCellClick?.(lifer.cellId)
                  }}
                >
                  {lifer.cellName}
                </button>
              </p>
            </div>
            <span className={`flex-shrink-0 text-xs font-bold px-1.5 py-0.5 rounded ${
              lifer.difficultyRating <= 3
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : lifer.difficultyRating <= 6
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
            }`}>
              {lifer.difficultyRating}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
