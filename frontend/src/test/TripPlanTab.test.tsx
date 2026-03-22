import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MapControlsProvider } from '../contexts/MapControlsContext'

const stableSeenSpecies = new Set<string>()

vi.mock('../lib/dataCache', () => ({
  __esModule: true,
  fetchSpecies: vi.fn().mockResolvedValue([]),
  fetchGrid: vi.fn().mockResolvedValue({ type: 'FeatureCollection', features: [] }),
  fetchWeekCells: vi.fn().mockResolvedValue(new Map()),
  computePlannerResults: vi.fn().mockResolvedValue([]),
}))

vi.mock('../contexts/LifeListContext', () => ({
  __esModule: true,
  useLifeList: () => ({
    seenSpecies: stableSeenSpecies,
    effectiveSeenSpecies: stableSeenSpecies,
    isSpeciesSeen: () => false,
    getTotalSeen: () => 0,
    tripUnion: null,
    setTripUnion: vi.fn(),
    activeTripName: null,
    setActiveTripName: vi.fn(),
    activeTripMemberCount: 0,
    setActiveTripMemberCount: vi.fn(),
  }),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false, error: null, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), clearError: vi.fn() }),
}))

vi.mock('../lib/subRegions', () => ({
  loadCellStates: vi.fn().mockResolvedValue({}),
  isCellInRegion: vi.fn().mockReturnValue(true),
}))

import TripPlanTab from '../components/TripPlanTab'

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
  it('renders the unified planner with By Location / By Week toggle', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('By Location')).toBeInTheDocument()
    expect(screen.getByText('By Week')).toBeInTheDocument()
  })

  it('renders region filter dropdown', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('All Regions')).toBeInTheDocument()
  })

  it('renders species filter with All Lifers default', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('All Lifers')).toBeInTheDocument()
  })

  it('shows import prompt when no life list', async () => {
    await renderTripPlanTab()
    expect(screen.getByText('Import your life list to see trip planning results')).toBeInTheDocument()
  })

  it('renders Group Trip section for authenticated users', async () => {
    await renderTripPlanTab()
    // TripGroupSection shows sign-in prompt when not authenticated
    expect(screen.getByText('Sign in to plan group trips with friends')).toBeInTheDocument()
  })
})
