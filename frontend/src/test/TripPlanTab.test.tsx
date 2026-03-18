import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// Stable reference for seenSpecies to avoid infinite re-render loops
// (TripPlanTab's hotspots useEffect has seenSpecies in its dependency array;
// a new Set reference on each render would trigger the effect infinitely)
const stableSeenSpecies = new Set<string>()

// Mock dataCache
vi.mock('../lib/dataCache', () => ({
  __esModule: true,
  fetchSpecies: vi.fn().mockResolvedValue([]),
  fetchGrid: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
  fetchWeekCells: vi.fn().mockResolvedValue(new Map()),
  fetchSpeciesWeeks: vi.fn().mockResolvedValue({}),
  getCellLabels: vi.fn().mockResolvedValue(new Map()),
  computeLiferSummary: vi.fn().mockReturnValue(new Map()),
  computeGoalWindowOpportunities: vi.fn().mockResolvedValue([]),
}))

// Mock LifeListContext with a stable seenSpecies reference
vi.mock('../contexts/LifeListContext', () => ({
  __esModule: true,
  useLifeList: () => ({
    seenSpecies: stableSeenSpecies,
    isSpeciesSeen: () => false,
    getTotalSeen: () => 0,
  }),
}))

import TripPlanTab from '../components/TripPlanTab'

/** Helper to render TripPlanTab and wait for async effects to settle */
async function renderTripPlanTab(props: Parameters<typeof TripPlanTab>[0] = {}) {
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(<TripPlanTab {...props} />)
  })
  return result!
}

describe('TripPlanTab', () => {
  it('renders mode buttons', async () => {
    await renderTripPlanTab()
    expect(screen.getByTestId('location-mode-btn')).toBeInTheDocument()
    expect(screen.getByTestId('hotspots-mode-btn')).toBeInTheDocument()
    expect(screen.getByTestId('window-mode-btn')).toBeInTheDocument()
    expect(screen.getByTestId('compare-mode-btn')).toBeInTheDocument()
  })

  it('renders Trip Planning header', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('Trip Planning')).toBeInTheDocument()
  })

  it('renders Reset button', async () => {
    await renderTripPlanTab()
    expect(screen.getByTestId('clear-trip-plan-btn')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })

  it('defaults to Hotspots mode and shows hotspot week slider', async () => {
    await renderTripPlanTab()
    expect(screen.getByTestId('hotspot-week-slider')).toBeInTheDocument()
    expect(screen.getByText('Select Week')).toBeInTheDocument()
  })

  it('switches to Location mode and shows empty state', async () => {
    await renderTripPlanTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('location-mode-btn'))
    })
    expect(screen.getByText('Click on the map to select a location')).toBeInTheDocument()
    expect(screen.getByText('Selected Location')).toBeInTheDocument()
  })

  it('switches to Window mode and shows species search', async () => {
    await renderTripPlanTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('window-mode-btn'))
    })
    expect(screen.getByText('Select Target Species')).toBeInTheDocument()
    expect(screen.getByTestId('species-search-input')).toBeInTheDocument()
  })

  it('switches to Compare mode and shows Location A and Location B sections', async () => {
    await renderTripPlanTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('compare-mode-btn'))
    })
    expect(screen.getByText('Location A')).toBeInTheDocument()
    expect(screen.getByText('Location B')).toBeInTheDocument()
    expect(screen.getByText('Click on the map to select Location A')).toBeInTheDocument()
    expect(screen.getByText('Click on the map to select Location B')).toBeInTheDocument()
  })

  it('Compare mode shows date range sliders', async () => {
    await renderTripPlanTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('compare-mode-btn'))
    })
    expect(screen.getByTestId('compare-start-week-slider')).toBeInTheDocument()
    expect(screen.getByTestId('compare-end-week-slider')).toBeInTheDocument()
  })

  it('Location mode shows location when selectedLocation is provided', async () => {
    await renderTripPlanTab({
      selectedLocation: {
        cellId: 42,
        coordinates: [-73.5, 40.7],
        name: 'Central Park',
      },
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('location-mode-btn'))
    })
    expect(screen.getByText('Central Park')).toBeInTheDocument()
  })

  it('mode switching back and forth works', async () => {
    await renderTripPlanTab()
    // Start in hotspots (default)
    expect(screen.getByTestId('hotspot-week-slider')).toBeInTheDocument()

    // Switch to compare
    await act(async () => {
      fireEvent.click(screen.getByTestId('compare-mode-btn'))
    })
    expect(screen.getByText('Location A')).toBeInTheDocument()
    expect(screen.queryByTestId('hotspot-week-slider')).not.toBeInTheDocument()

    // Switch back to hotspots
    await act(async () => {
      fireEvent.click(screen.getByTestId('hotspots-mode-btn'))
    })
    expect(screen.getByTestId('hotspot-week-slider')).toBeInTheDocument()
    expect(screen.queryByText('Location A')).not.toBeInTheDocument()
  })

  it('renders without crashing when all optional props are omitted', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('Trip Planning')).toBeInTheDocument()
  })

  it('calls onCompareLocationsChange with null when not in compare mode', async () => {
    const mockChange = vi.fn()
    await renderTripPlanTab({ onCompareLocationsChange: mockChange })
    // Default mode is hotspots, so it should call with null
    await waitFor(() => {
      expect(mockChange).toHaveBeenCalledWith(null)
    })
  })
})
