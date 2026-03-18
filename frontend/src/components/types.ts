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
  difficultyRating: number  // 1-10 evenly distributed
  difficultyLabel: string
  isRestrictedRange: boolean
  ebirdUrl: string
  photoUrl: string
  photoAttribution?: string
  photoLicense?: string
  seasonalityScore: number
  peakWeek: number
  rangeShiftScore: number
  regions?: string[]
  habitatLabels?: string[]
  preferredElevation?: { mean: number; min: number; max: number }
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
  beginnerMode?: boolean
  onBeginnerModeChange?: (value: boolean) => void
}

export interface SpeciesFilters {
  family: string           // '' = all (display group name)
  region: string           // '' = all (region code)
  conservStatus: string    // '' = all
  invasionStatus: string   // '' = all
  difficulty: string       // '' = all
}

export interface SpeciesTabProps {
  selectedRegion?: string | null
  speciesFilters?: SpeciesFilters
  onSpeciesFiltersChange?: (filters: SpeciesFilters) => void
}

export interface CompareLocations {
  locationA: SelectedLocation | null
  locationB: SelectedLocation | null
}

export interface TripPlanTabProps {
  selectedLocation?: SelectedLocation | null
  currentWeek?: number
  onWeekChange?: (week: number) => void
  onLocationSelect?: (location: SelectedLocation | null) => void
  selectedRegion?: string | null
  onCompareLocationsChange?: (locations: CompareLocations | null) => void
  goalLists?: GoalList[]
  activeGoalListId?: string | null
  goalSpeciesCodes?: Set<string>
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

export interface YearList {
  id: string
  year: number
  speciesCodes: string[]
  importedAt: string
}

export interface CellCovariates {
  needleleaf: number        // coniferous forest
  evergreen_broadleaf: number  // tropical/subtropical forest
  deciduous_broadleaf: number  // temperate deciduous forest
  mixed_forest: number      // mixed forest
  shrub: number
  herb: number              // grassland
  cultivated: number        // cropland
  urban: number
  water: number             // freshwater (inland lakes, rivers — from EarthEnv)
  flooded: number           // wetland
  ocean: number             // ocean fraction (from Natural Earth coastline polygons)
  elev_mean: number
  elev_std: number
  // Legacy compat: 'trees' may exist in older data (sum of all forest types)
  trees?: number
}

export interface GoalWindowResult {
  week: number
  cellId: number
  cellName: string
  coordinates: [number, number]
  targetCount: number         // how many goal species present above threshold
  totalGoalSpecies: number    // total unseen species in goal list
  combinedFreq: number        // P = 1 - ∏(1 - freq_i) for present goal species
  speciesPresent: Array<{ speciesId: number; speciesCode: string; comName: string; freq: number }>
}
