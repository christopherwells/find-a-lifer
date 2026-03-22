import { createContext, useContext, useReducer, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { goalListsDB, type GoalList } from '../lib/goalListsDB'
import { trackEvent } from '../lib/analytics'
import type { MapViewMode, LiferMetric, SelectedLocation, SpeciesFilters } from '../components/types'

// ── State ──────────────────────────────────────────────────────────────────────

export interface MapControlsState {
  currentWeek: number
  viewMode: MapViewMode
  liferMetric: LiferMetric
  heatmapOpacity: number
  goalBirdsOnlyFilter: boolean
  showTotalRichness: boolean
  liferCountRange: [number, number]
  dataRange: [number, number]
  selectedSpecies: string | null
  selectedSpeciesMulti: string[]
  selectedRegion: string | null
  selectedLocation: SelectedLocation | null
  speciesFilters: SpeciesFilters
  seenFilter: '' | 'seen' | 'unseen' | 'lifers'
  goalLists: GoalList[]
  activeGoalListId: string | null
}

function getInitialWeek(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now.getTime() - start.getTime()
  const oneWeek = 7 * 24 * 60 * 60 * 1000
  return Math.min(52, Math.max(1, Math.ceil(diff / oneWeek)))
}

const initialState: MapControlsState = {
  currentWeek: getInitialWeek(),
  viewMode: 'density',
  liferMetric: 'expected',
  heatmapOpacity: 0.8,
  goalBirdsOnlyFilter: false,
  showTotalRichness: false,
  liferCountRange: [0, 9999],
  dataRange: [0, 0],
  selectedSpecies: null,
  selectedSpeciesMulti: [],
  selectedRegion: null,
  selectedLocation: null,
  speciesFilters: { habitat: '', region: '', conservStatus: '', invasionStatus: '', difficulty: '' },
  seenFilter: '',
  goalLists: [],
  activeGoalListId: null,
}

// ── Actions ────────────────────────────────────────────────────────────────────

type MapControlsAction =
  | { type: 'SET_CURRENT_WEEK'; week: number }
  | { type: 'SET_VIEW_MODE'; mode: MapViewMode }
  | { type: 'SET_LIFER_METRIC'; metric: LiferMetric }
  | { type: 'SET_SEEN_FILTER'; value: '' | 'seen' | 'unseen' | 'lifers' }
  | { type: 'SET_HEATMAP_OPACITY'; opacity: number }
  | { type: 'SET_GOAL_BIRDS_ONLY_FILTER'; value: boolean }
  | { type: 'SET_SHOW_TOTAL_RICHNESS'; value: boolean }
  | { type: 'SET_LIFER_COUNT_RANGE'; range: [number, number] }
  | { type: 'SET_DATA_RANGE'; range: [number, number] }
  | { type: 'SET_SELECTED_SPECIES'; code: string | null }
  | { type: 'SET_SELECTED_SPECIES_MULTI'; codes: string[] }
  | { type: 'SET_SELECTED_REGION'; regionId: string | null }
  | { type: 'SET_SELECTED_LOCATION'; location: SelectedLocation | null }
  | { type: 'SET_SPECIES_FILTERS'; filters: SpeciesFilters }
  | { type: 'SET_GOAL_LISTS'; lists: GoalList[] }
  | { type: 'SET_ACTIVE_GOAL_LIST_ID'; id: string | null }

// ── Reducer ────────────────────────────────────────────────────────────────────

function mapControlsReducer(state: MapControlsState, action: MapControlsAction): MapControlsState {
  switch (action.type) {
    case 'SET_CURRENT_WEEK':
      return { ...state, currentWeek: action.week }

    case 'SET_VIEW_MODE': {
      // Reset filters appropriately when switching view modes
      const mode = action.mode
      const updates: Partial<MapControlsState> = { viewMode: mode }
      if (mode !== 'density' && mode !== 'probability' && mode !== 'species') {
        updates.goalBirdsOnlyFilter = false
      }
      if (mode !== 'species') {
        updates.selectedSpecies = null
        updates.selectedSpeciesMulti = []
      }
      return { ...state, ...updates }
    }

    case 'SET_LIFER_METRIC':
      return { ...state, liferMetric: action.metric }

    case 'SET_SEEN_FILTER':
      return { ...state, seenFilter: action.value }

    case 'SET_HEATMAP_OPACITY':
      return { ...state, heatmapOpacity: action.opacity }

    case 'SET_GOAL_BIRDS_ONLY_FILTER':
      return { ...state, goalBirdsOnlyFilter: action.value }

    case 'SET_SHOW_TOTAL_RICHNESS':
      return { ...state, showTotalRichness: action.value }

    case 'SET_LIFER_COUNT_RANGE':
      return { ...state, liferCountRange: action.range }

    case 'SET_DATA_RANGE':
      return { ...state, dataRange: action.range }

    case 'SET_SELECTED_SPECIES':
      return { ...state, selectedSpecies: action.code }

    case 'SET_SELECTED_SPECIES_MULTI':
      return { ...state, selectedSpeciesMulti: action.codes }

    case 'SET_SELECTED_REGION':
      return { ...state, selectedRegion: action.regionId }

    case 'SET_SELECTED_LOCATION':
      return { ...state, selectedLocation: action.location }

    case 'SET_SPECIES_FILTERS':
      return { ...state, speciesFilters: action.filters }

    case 'SET_GOAL_LISTS':
      return { ...state, goalLists: action.lists }

    case 'SET_ACTIVE_GOAL_LIST_ID': {
      // Persist to localStorage
      if (action.id) localStorage.setItem('activeGoalListId', action.id)
      else localStorage.removeItem('activeGoalListId')
      return { ...state, activeGoalListId: action.id }
    }

    default:
      return state
  }
}

// ── Context value ──────────────────────────────────────────────────────────────

interface MapControlsContextValue {
  // Full state
  state: MapControlsState

  // Derived
  goalSpeciesCodes: Set<string>

  // Convenience setters (stable callbacks wrapping dispatch)
  setCurrentWeek: (week: number) => void
  setViewMode: (mode: MapViewMode) => void
  setLiferMetric: (metric: LiferMetric) => void
  setSeenFilter: (value: '' | 'seen' | 'unseen' | 'lifers') => void
  setHeatmapOpacity: (opacity: number) => void
  setGoalBirdsOnlyFilter: (value: boolean) => void
  setShowTotalRichness: (value: boolean) => void
  setLiferCountRange: (range: [number, number]) => void
  setDataRange: (range: [number, number]) => void
  setSelectedSpecies: (code: string | null) => void
  setSelectedSpeciesMulti: (codes: string[]) => void
  setSelectedRegion: (regionId: string | null) => void
  setSelectedLocation: (location: SelectedLocation | null) => void
  setSpeciesFilters: (filters: SpeciesFilters) => void
  setGoalLists: (lists: GoalList[]) => void
  setActiveGoalListId: (id: string | null) => void
}

const MapControlsContext = createContext<MapControlsContextValue | undefined>(undefined)

// ── Provider ───────────────────────────────────────────────────────────────────

export function MapControlsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(mapControlsReducer, initialState)

  // Load goal lists on startup
  useEffect(() => {
    const loadGoalLists = async () => {
      try {
        const lists = await goalListsDB.getAllLists()
        dispatch({ type: 'SET_GOAL_LISTS', lists })

        // Restore saved active list from localStorage
        const savedActiveListId = localStorage.getItem('activeGoalListId')
        const validSavedId = savedActiveListId && lists.some((l) => l.id === savedActiveListId)
        const resolvedActiveId = validSavedId ? savedActiveListId : (lists.length > 0 ? lists[0].id : null)

        // Only set if we don't already have a valid active list
        dispatch({ type: 'SET_ACTIVE_GOAL_LIST_ID', id: resolvedActiveId })
      } catch (error) {
        console.error('MapControlsProvider: failed to load goal lists', error)
      }
    }

    loadGoalLists()
  }, [])

  // Listen for shared URL state
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      if (detail.viewMode) dispatch({ type: 'SET_VIEW_MODE', mode: detail.viewMode })
      if (detail.week) dispatch({ type: 'SET_CURRENT_WEEK', week: detail.week })
      if (detail.liferMetric) dispatch({ type: 'SET_LIFER_METRIC', metric: detail.liferMetric })
      if (detail.selectedSpecies) dispatch({ type: 'SET_SELECTED_SPECIES', code: detail.selectedSpecies })
    }
    window.addEventListener('shareState', handler)
    return () => window.removeEventListener('shareState', handler)
  }, [])

  // Derived: goal species codes from the active list
  const goalSpeciesCodes = useMemo(() => {
    if (!state.activeGoalListId) return new Set<string>()
    const activeList = state.goalLists.find((l) => l.id === state.activeGoalListId)
    if (!activeList) return new Set<string>()
    return new Set<string>(activeList.speciesCodes)
  }, [state.activeGoalListId, state.goalLists])

  // Stable setter callbacks
  const setCurrentWeek = useCallback((week: number) => {
    dispatch({ type: 'SET_CURRENT_WEEK', week })
  }, [])

  const setViewMode = useCallback((mode: MapViewMode) => {
    trackEvent('view_mode_change', { mode })
    dispatch({ type: 'SET_VIEW_MODE', mode })
  }, [])

  const setLiferMetric = useCallback((metric: LiferMetric) => {
    dispatch({ type: 'SET_LIFER_METRIC', metric })
  }, [])

  const setSeenFilter = useCallback((value: '' | 'seen' | 'unseen' | 'lifers') => {
    dispatch({ type: 'SET_SEEN_FILTER', value })
  }, [])

  const setHeatmapOpacity = useCallback((opacity: number) => {
    dispatch({ type: 'SET_HEATMAP_OPACITY', opacity })
  }, [])

  const setGoalBirdsOnlyFilter = useCallback((value: boolean) => {
    dispatch({ type: 'SET_GOAL_BIRDS_ONLY_FILTER', value })
  }, [])

  const setShowTotalRichness = useCallback((value: boolean) => {
    dispatch({ type: 'SET_SHOW_TOTAL_RICHNESS', value })
  }, [])

  const setLiferCountRange = useCallback((range: [number, number]) => {
    dispatch({ type: 'SET_LIFER_COUNT_RANGE', range })
  }, [])

  const setDataRange = useCallback((range: [number, number]) => {
    dispatch({ type: 'SET_DATA_RANGE', range })
  }, [])

  const setSelectedSpecies = useCallback((code: string | null) => {
    dispatch({ type: 'SET_SELECTED_SPECIES', code })
  }, [])

  const setSelectedSpeciesMulti = useCallback((codes: string[]) => {
    dispatch({ type: 'SET_SELECTED_SPECIES_MULTI', codes })
  }, [])

  const setSelectedRegion = useCallback((regionId: string | null) => {
    dispatch({ type: 'SET_SELECTED_REGION', regionId })
  }, [])

  const setSelectedLocation = useCallback((location: SelectedLocation | null) => {
    dispatch({ type: 'SET_SELECTED_LOCATION', location })
  }, [])

  const setSpeciesFilters = useCallback((filters: SpeciesFilters) => {
    dispatch({ type: 'SET_SPECIES_FILTERS', filters })
  }, [])

  const setGoalLists = useCallback((lists: GoalList[]) => {
    dispatch({ type: 'SET_GOAL_LISTS', lists })
  }, [])

  const setActiveGoalListId = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_GOAL_LIST_ID', id })
  }, [])


  const value = useMemo<MapControlsContextValue>(() => ({
    state,
    goalSpeciesCodes,
    setCurrentWeek,
    setViewMode,
    setLiferMetric,
    setSeenFilter,
    setHeatmapOpacity,
    setGoalBirdsOnlyFilter,
    setShowTotalRichness,
    setLiferCountRange,
    setDataRange,
    setSelectedSpecies,
    setSelectedSpeciesMulti,
    setSelectedRegion,
    setSelectedLocation,
    setSpeciesFilters,
    setGoalLists,
    setActiveGoalListId,
  }), [
    state,
    goalSpeciesCodes,
    setCurrentWeek,
    setViewMode,
    setLiferMetric,
    setSeenFilter,
    setHeatmapOpacity,
    setGoalBirdsOnlyFilter,
    setShowTotalRichness,
    setLiferCountRange,
    setDataRange,
    setSelectedSpecies,
    setSelectedSpeciesMulti,
    setSelectedRegion,
    setSelectedLocation,
    setSpeciesFilters,
    setGoalLists,
    setActiveGoalListId,
  ])

  return (
    <MapControlsContext.Provider value={value}>
      {children}
    </MapControlsContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- hook must co-locate with Provider
export function useMapControls(): MapControlsContextValue {
  const ctx = useContext(MapControlsContext)
  if (!ctx) {
    throw new Error('useMapControls must be used within a MapControlsProvider')
  }
  return ctx
}
