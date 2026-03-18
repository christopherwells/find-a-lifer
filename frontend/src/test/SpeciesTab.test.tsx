import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SpeciesTab from '../components/SpeciesTab'
import type { Species } from '../components/types'

// --- Mock data ---
const mockSpecies: Species[] = [
  {
    species_id: 1,
    speciesCode: 'norcar',
    comName: 'Northern Cardinal',
    sciName: 'Cardinalis cardinalis',
    familyComName: 'Cardinals and Allies',
    taxonOrder: 100,
    invasionStatus: { 'US-ME': 'Native' },
    conservStatus: 'Least Concern',
    difficultyScore: 10,
    difficultyRating: 1,
    difficultyLabel: 'Easy',
    isRestrictedRange: false,
    ebirdUrl: 'https://ebird.org/species/norcar',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 20,
    rangeShiftScore: 0,
    regions: ['US-ME'],
  },
  {
    species_id: 2,
    speciesCode: 'mallar3',
    comName: 'Mallard',
    sciName: 'Anas platyrhynchos',
    familyComName: 'Ducks, Geese, and Waterfowl',
    taxonOrder: 5,
    invasionStatus: { 'US-ME': 'Native' },
    conservStatus: 'Least Concern',
    difficultyScore: 5,
    difficultyRating: 1,
    difficultyLabel: 'Easy',
    isRestrictedRange: false,
    ebirdUrl: 'https://ebird.org/species/mallar3',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 10,
    rangeShiftScore: 0,
    regions: ['US-ME'],
  },
  {
    species_id: 3,
    speciesCode: 'pilwoo',
    comName: 'Pileated Woodpecker',
    sciName: 'Dryocopus pileatus',
    familyComName: 'Woodpeckers',
    taxonOrder: 50,
    invasionStatus: { 'US-ME': 'Native' },
    conservStatus: 'Least Concern',
    difficultyScore: 40,
    difficultyRating: 4,
    difficultyLabel: 'Moderate',
    isRestrictedRange: false,
    ebirdUrl: 'https://ebird.org/species/pilwoo',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 15,
    rangeShiftScore: 0,
    regions: ['US-ME'],
  },
]

// --- Mocks ---
vi.mock('../lib/dataCache', () => ({
  fetchSpecies: vi.fn(() => Promise.resolve(mockSpecies)),
  fetchRegionNames: vi.fn(() => Promise.resolve({ 'US-ME': 'Maine' })),
  fetchRegions: vi.fn(() => Promise.resolve({ features: [] })),
}))

vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    isSpeciesSeen: vi.fn(() => false),
    toggleSpecies: vi.fn(),
    getTotalSeen: () => 0,
    seenSpecies: new Set<string>(),
  }),
}))

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    currentToast: null,
    showToast: vi.fn(),
    dismissToast: vi.fn(),
    celebrationsEnabled: true,
    setCelebrationsEnabled: vi.fn(),
  }),
}))

vi.mock('../lib/goalListsDB', () => ({
  goalListsDB: {
    getAllLists: vi.fn(() => Promise.resolve([])),
    addSpeciesToList: vi.fn(),
  },
}))

describe('SpeciesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders family group headers after loading', async () => {
    render(<SpeciesTab />)

    // Groups start collapsed, so group headers are visible but individual species are not
    await waitFor(() => {
      expect(screen.getByText('Cardinals and Allies')).toBeInTheDocument()
    })
    expect(screen.getByText('Ducks, Geese, and Waterfowl')).toBeInTheDocument()
    expect(screen.getByText('Woodpeckers')).toBeInTheDocument()
  })

  it('shows species names after expanding a group', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      expect(screen.getByText('Cardinals and Allies')).toBeInTheDocument()
    })

    // Click the group header to expand it
    fireEvent.click(screen.getByText('Cardinals and Allies'))

    // Now the species within should be visible
    expect(screen.getByText('Northern Cardinal')).toBeInTheDocument()
  })

  it('shows the search bar', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      expect(screen.getByTestId('species-search-input')).toBeInTheDocument()
    })

    const input = screen.getByTestId('species-search-input')
    expect(input).toHaveAttribute('placeholder', 'Search species...')
  })

  it('shows the filter toggle button', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-btn')).toBeInTheDocument()
    })
  })

  it('shows filter badge when filters are active', async () => {
    const filters = { family: 'Ducks and Geese', region: '', conservStatus: '', invasionStatus: '', difficulty: '' }
    render(<SpeciesTab speciesFilters={filters} onSpeciesFiltersChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-btn')).toBeInTheDocument()
    })

    // Active filter count badge should show "1"
    const badge = screen.getByTestId('filter-toggle-btn')
    expect(badge.textContent).toContain('1')
  })

  it('renders filter dropdowns when filter toggle is clicked', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('filter-toggle-btn'))

    // After clicking, the filter dropdowns should appear
    expect(screen.getByTestId('seen-filter')).toBeInTheDocument()
    expect(screen.getByTestId('family-filter')).toBeInTheDocument()
    expect(screen.getByTestId('conservation-filter')).toBeInTheDocument()
    expect(screen.getByTestId('invasion-filter')).toBeInTheDocument()
    expect(screen.getByTestId('difficulty-filter')).toBeInTheDocument()
  })

  it('shows clear filters button when filters are active', async () => {
    const filters = { family: '', region: '', conservStatus: 'Vulnerable', invasionStatus: '', difficulty: '' }
    render(<SpeciesTab speciesFilters={filters} onSpeciesFiltersChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByTestId('filter-toggle-btn')).toBeInTheDocument()
    })

    // Open filters panel
    fireEvent.click(screen.getByTestId('filter-toggle-btn'))

    // Clear filters button should be visible
    expect(screen.getByTestId('clear-filters-btn')).toBeInTheDocument()
    expect(screen.getByText('Clear all filters')).toBeInTheDocument()
  })

  it('displays species count and seen count in the header', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      // Total species count from mock data is 3
      expect(screen.getByText('3 species')).toBeInTheDocument()
    })
  })

  it('shows Species Checklist heading', async () => {
    render(<SpeciesTab />)

    await waitFor(() => {
      expect(screen.getByText('Species Checklist')).toBeInTheDocument()
    })
  })
})
