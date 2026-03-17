import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ProgressTab from '../components/ProgressTab'

// Mock dataCache
vi.mock('../lib/dataCache', () => ({
  fetchSpecies: vi.fn(),
  fetchRegionNames: vi.fn(),
}))

// Mock LifeListContext
const mockIsSpeciesSeen = vi.fn()
const mockGetTotalSeen = vi.fn()
vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    isSpeciesSeen: mockIsSpeciesSeen,
    getTotalSeen: mockGetTotalSeen,
    seenSpecies: new Set<string>(),
  }),
}))

// Use real regionGroups exports (not mocked)

import { fetchSpecies, fetchRegionNames } from '../lib/dataCache'
import type { Species } from '../components/types'

const mockFetchSpecies = fetchSpecies as ReturnType<typeof vi.fn>
const mockFetchRegionNames = fetchRegionNames as ReturnType<typeof vi.fn>

function makeSpecies(overrides: Partial<Species> & { speciesCode: string; comName: string; familyComName: string }): Species {
  return {
    species_id: 1,
    sciName: 'Testus testus',
    taxonOrder: 1,
    invasionStatus: {},
    conservStatus: 'LC',
    difficultyScore: 1,
    difficultyLabel: 'Easy',
    isRestrictedRange: false,
    ebirdUrl: '',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 26,
    rangeShiftScore: 0,
    regions: ['US'],
    ...overrides,
  }
}

const testSpecies: Species[] = [
  makeSpecies({ species_id: 1, speciesCode: 'mallar3', comName: 'Mallard', familyComName: 'Ducks, Geese, and Waterfowl', regions: ['US', 'CA'] }),
  makeSpecies({ species_id: 2, speciesCode: 'baleag', comName: 'Bald Eagle', familyComName: 'Hawks, Eagles, and Kites', regions: ['US', 'CA'] }),
  makeSpecies({ species_id: 3, speciesCode: 'norcar', comName: 'Northern Cardinal', familyComName: 'Cardinals and Allies', regions: ['US'] }),
  makeSpecies({ species_id: 4, speciesCode: 'amecro', comName: 'American Crow', familyComName: 'Crows, Jays, and Magpies', regions: ['US', 'CA'] }),
  makeSpecies({ species_id: 5, speciesCode: 'rebwoo', comName: 'Red-bellied Woodpecker', familyComName: 'Woodpeckers', regions: ['US'] }),
]

describe('ProgressTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchSpecies.mockResolvedValue(testSpecies)
    mockFetchRegionNames.mockResolvedValue({ US: 'United States', CA: 'Canada' })
    mockIsSpeciesSeen.mockReturnValue(false)
    mockGetTotalSeen.mockReturnValue(0)
  })

  it('renders loading skeleton initially', () => {
    // Make fetchSpecies never resolve to keep loading state
    mockFetchSpecies.mockReturnValue(new Promise(() => {}))
    render(<ProgressTab />)
    // The ProgressSkeleton renders animated pulse divs; it won't have the progress-tab testid yet
    expect(screen.queryByTestId('progress-tab')).not.toBeInTheDocument()
  })

  it('shows content after data loads', async () => {
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('progress-tab')).toBeInTheDocument()
    })
    expect(screen.getByText('My Progress')).toBeInTheDocument()
  })

  it('shows overall progress card with correct species count', async () => {
    mockGetTotalSeen.mockReturnValue(2)
    mockIsSpeciesSeen.mockImplementation((code: string) =>
      ['mallar3', 'baleag'].includes(code)
    )
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('progress-species-count')).toBeInTheDocument()
    })
    // "2 of 5 species seen"
    expect(screen.getByTestId('progress-species-count')).toHaveTextContent('2')
    expect(screen.getByTestId('progress-species-count')).toHaveTextContent('5')
    // Percentage: 40.0%
    expect(screen.getByTestId('progress-percentage')).toHaveTextContent('40.0%')
  })

  it('shows "Progress by Group" section', async () => {
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByText('Progress by Group')).toBeInTheDocument()
    })
    expect(screen.getByTestId('group-breakdown-list')).toBeInTheDocument()
  })

  it('shows "Progress by Region" section', async () => {
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByText('Progress by Region')).toBeInTheDocument()
    })
    expect(screen.getByTestId('region-breakdown-list')).toBeInTheDocument()
  })

  it('shows milestones section', async () => {
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('milestones-section')).toBeInTheDocument()
    })
    expect(screen.getByText('Milestones')).toBeInTheDocument()
  })

  it('shows "Top Groups to Target" when some but not all species seen', async () => {
    mockGetTotalSeen.mockReturnValue(2)
    mockIsSpeciesSeen.mockImplementation((code: string) =>
      ['mallar3', 'baleag'].includes(code)
    )
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('top-groups-to-target')).toBeInTheDocument()
    })
    expect(screen.getByText('Top Groups to Target')).toBeInTheDocument()
  })

  it('shows empty state when no species are seen', async () => {
    mockGetTotalSeen.mockReturnValue(0)
    mockIsSpeciesSeen.mockReturnValue(false)
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('progress-tab')).toBeInTheDocument()
    })
    expect(screen.getByText(/Get started/)).toBeInTheDocument()
    // Top Groups to Target should not appear when totalSeen is 0
    expect(screen.queryByTestId('top-groups-to-target')).not.toBeInTheDocument()
  })

  it('shows quick stats cards', async () => {
    mockGetTotalSeen.mockReturnValue(2)
    mockIsSpeciesSeen.mockImplementation((code: string) =>
      ['mallar3', 'baleag'].includes(code)
    )
    render(<ProgressTab />)
    await waitFor(() => {
      expect(screen.getByTestId('quick-stats')).toBeInTheDocument()
    })
    // With 2 species seen across 2 different groups (Ducks and Hawks), groups started = 2
    expect(screen.getByTestId('groups-started-count')).toHaveTextContent('2')
  })
})
