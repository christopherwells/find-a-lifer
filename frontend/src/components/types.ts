import type { GoalList } from '../lib/goalListsDB'

export type MapViewMode = 'density' | 'probability' | 'species' | 'goal-birds'

export interface SelectedLocation {
  cellId: number
  coordinates: [number, number] // [lng, lat]
  name?: string
}

export interface SpeciesMeta {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
}

export interface Species {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  taxonOrder: number
  invasionStatus: Record<string, string>
  conservStatus: string
  difficultyScore: number
  difficultyLabel: string
  isRestrictedRange: boolean
  ebirdUrl: string
  photoUrl: string
  seasonalityScore: number
  peakWeek: number
  rangeShiftScore: number
  regions?: string[]
}

export interface SpeciesByFamily {
  [familyName: string]: Species[]
}

export interface ExploreTabProps {
  currentWeek?: number
  onWeekChange?: (week: number) => void
  viewMode?: MapViewMode
  onViewModeChange?: (mode: MapViewMode) => void
  goalBirdsOnlyFilter?: boolean
  onGoalBirdsOnlyFilterChange?: (value: boolean) => void
  selectedSpecies?: string | null
  onSelectedSpeciesChange?: (speciesCode: string | null) => void
  goalSpeciesCodes?: Set<string>
  goalLists?: GoalList[]
  activeGoalListId?: string | null
  onActiveGoalListIdChange?: (id: string | null) => void
  selectedRegion?: string | null
  onSelectedRegionChange?: (regionId: string | null) => void
  heatmapOpacity?: number
  onHeatmapOpacityChange?: (opacity: number) => void
  liferCountRange?: [number, number]
  onLiferCountRangeChange?: (range: [number, number]) => void
  dataRange?: [number, number]
  showTotalRichness?: boolean
  onShowTotalRichnessChange?: (value: boolean) => void
}

export interface SpeciesTabProps {
  selectedRegion?: string | null
}

export interface TripPlanTabProps {
  selectedLocation?: SelectedLocation | null
  currentWeek?: number
  onWeekChange?: (week: number) => void
  onLocationSelect?: (location: SelectedLocation | null) => void
  selectedRegion?: string | null
}

export interface TripLifer {
  species_id: number
  speciesCode: string
  comName: string
  sciName: string
  familyComName: string
  probability: number
  difficultyLabel: string
}

export interface HotspotLocation {
  cellId: number
  coordinates: [number, number]
  liferCount: number
  rank: number
}

export interface WeekOpportunity {
  week: number
  avgProbability: number
  topLocations: Array<{
    cellId: number
    coordinates: [number, number]
    probability: number
  }>
}
