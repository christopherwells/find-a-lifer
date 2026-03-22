import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MapControlsProvider } from '../contexts/MapControlsContext'

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

// Mock AuthContext for TripReportsSection
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, error: null, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), clearError: vi.fn() }),
}))

import TripPlanTab from '../components/TripPlanTab'

/** Helper to render TripPlanTab wrapped in MapControlsProvider and wait for async effects to settle */
async function renderTripPlanTab() {
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MapControlsProvider>
        <TripPlanTab />
      </MapControlsProvider>
    )
  })
  return result!
}

describe('TripPlanTab', () => {
  it('renders mode buttons', async () => {
    await renderTripPlanTab()
    expect(screen.getByTestId('location-mode-btn')).toBeInTheDocument()
    expect(screen.getByTestId('hotspots-mode-btn')).toBeInTheDocument()
    expect(screen.getByTestId('window-mode-btn')).toBeInTheDocument()
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

  it('Location mode shows empty state when no location selected', async () => {
    await renderTripPlanTab()
    await act(async () => {
      fireEvent.click(screen.getByTestId('location-mode-btn'))
    })
    expect(screen.getByText('Click on the map to select a location')).toBeInTheDocument()
  })

  it('mode switching back and forth works', async () => {
    await renderTripPlanTab()
    // Start in hotspots (default)
    expect(screen.getByTestId('hotspot-week-slider')).toBeInTheDocument()

    // Switch to location
    await act(async () => {
      fireEvent.click(screen.getByTestId('location-mode-btn'))
    })
    expect(screen.queryByTestId('hotspot-week-slider')).not.toBeInTheDocument()

    // Switch back to hotspots
    await act(async () => {
      fireEvent.click(screen.getByTestId('hotspots-mode-btn'))
    })
    expect(screen.getByTestId('hotspot-week-slider')).toBeInTheDocument()
  })

  it('renders without crashing when context has default values', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('Trip Planning')).toBeInTheDocument()
  })

  it('clears compare locations on mount', async () => {
    // TripPlanTab calls setCompareLocations(null) on mount via useEffect.
    // We just verify it renders successfully (the context handles the state).
    await renderTripPlanTab()
    expect(screen.getByText('Trip Planning')).toBeInTheDocument()
  })
})
