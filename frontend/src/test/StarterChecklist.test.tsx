import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StarterChecklist from '../components/StarterChecklist'

// --- Mocks ---
const mockToggleSpecies = vi.fn()
const mockSeenSpecies = new Set<string>()

vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    seenSpecies: mockSeenSpecies,
    toggleSpecies: mockToggleSpecies,
  }),
}))

const mockSpecies = [
  {
    species_id: 1,
    speciesCode: 'amerob',
    comName: 'American Robin',
    sciName: 'Turdus migratorius',
    familyComName: 'Thrushes and Allies',
    taxonOrder: 1,
    invasionStatus: {},
    conservStatus: 'Least Concern',
    difficultyScore: 1,
    difficultyLabel: 'Easy',
    isRestrictedRange: false,
    ebirdUrl: '',
    photoUrl: 'https://example.com/robin.jpg',
    seasonalityScore: 0,
    peakWeek: 20,
    rangeShiftScore: 0,
    regions: ['US-ME', 'US-CA', 'CA-ON'],
  },
  {
    species_id: 2,
    speciesCode: 'bkcchi',
    comName: 'Black-capped Chickadee',
    sciName: 'Poecile atricapillus',
    familyComName: 'Tits, Chickadees, and Titmice',
    taxonOrder: 2,
    invasionStatus: {},
    conservStatus: 'Least Concern',
    difficultyScore: 1,
    difficultyLabel: 'Easy',
    isRestrictedRange: false,
    ebirdUrl: '',
    photoUrl: '',
    seasonalityScore: 0,
    peakWeek: 20,
    rangeShiftScore: 0,
    regions: ['US-ME', 'US-CA'],
  },
]

vi.mock('../lib/dataCache', () => ({
  fetchSpecies: vi.fn(() => Promise.resolve(mockSpecies)),
}))

// Mock starterSpecies to return our mock species
vi.mock('../lib/starterSpecies', () => ({
  getStarterSpecies: vi.fn(() => mockSpecies),
}))

describe('StarterChecklist', () => {
  const onDismiss = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSeenSpecies.clear()
    localStorage.clear()
  })

  it('shows loading state initially', () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    expect(screen.getByText('Loading common species...')).toBeInTheDocument()
  })

  it('renders species list after loading', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    expect(screen.getByText('American Robin')).toBeInTheDocument()
    expect(screen.getByText('Black-capped Chickadee')).toBeInTheDocument()
  })

  it('groups species by display group and shows photo thumbnails', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    // Display group headers should appear (not raw family names)
    expect(screen.getByText(/THRUSHES, MOCKINGBIRDS, AND ALLIES/i)).toBeInTheDocument()
    expect(screen.getByText(/CHICKADEES, NUTHATCHES, AND ALLIES/i)).toBeInTheDocument()
    // Raw eBird family names should NOT appear as headers
    expect(screen.queryByText(/Thrushes and Allies/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Tits, Chickadees, and Titmice/)).not.toBeInTheDocument()
    // Photo thumbnails should appear when species has photoUrl
    const images = document.querySelectorAll('img[src="https://example.com/robin.jpg"]')
    expect(images.length).toBe(1)
  })

  it('shows 0 selected count initially', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByText('0 selected')).toBeInTheDocument()
    })
  })

  it('updates selected count when species are checked', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    // Check the first species
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('Done button is disabled when nothing is checked', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist-done-btn')).toBeInTheDocument()
    })
    const doneBtn = screen.getByTestId('starter-checklist-done-btn')
    expect(doneBtn).toBeDisabled()
  })

  it('Done button is enabled after checking species', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    const doneBtn = screen.getByTestId('starter-checklist-done-btn')
    expect(doneBtn).not.toBeDisabled()
  })

  it('calls toggleSpecies for each checked species when Done is clicked', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.click(screen.getByTestId('starter-checklist-done-btn'))
    expect(mockToggleSpecies).toHaveBeenCalledTimes(2)
    expect(mockToggleSpecies).toHaveBeenCalledWith('amerob', 'American Robin')
    expect(mockToggleSpecies).toHaveBeenCalledWith('bkcchi', 'Black-capped Chickadee')
  })

  it('shows done/celebration state after clicking Done', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(screen.getByTestId('starter-checklist-done-btn'))
    expect(screen.getByTestId('starter-checklist-done')).toBeInTheDocument()
    expect(screen.getByText(/Great start/)).toBeInTheDocument()
  })

  it('Skip button sets localStorage and calls onDismiss', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist-skip')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('starter-checklist-skip'))
    expect(localStorage.getItem('starterChecklistDismissed')).toBe('true')
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('Got it button on done state sets localStorage and calls onDismiss', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByTestId('starter-checklist')).toBeInTheDocument()
    })
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(screen.getByTestId('starter-checklist-done-btn'))
    fireEvent.click(screen.getByTestId('starter-checklist-close'))
    expect(localStorage.getItem('starterChecklistDismissed')).toBe('true')
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('shows header with instructions', async () => {
    render(<StarterChecklist onDismiss={onDismiss} />)
    await waitFor(() => {
      expect(screen.getByText(/Check off species you've seen/)).toBeInTheDocument()
    })
    expect(screen.getByText(/start your life list/)).toBeInTheDocument()
  })
})
