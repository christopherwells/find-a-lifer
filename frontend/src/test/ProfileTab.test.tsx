import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProfileTab from '../components/ProfileTab'

// --- Mocks ---
const mockGetTotalSeen = vi.fn(() => 42)
const mockIsSpeciesSeen = vi.fn(() => false)
const mockClearAllSpecies = vi.fn()

vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    isSpeciesSeen: mockIsSpeciesSeen,
    clearAllSpecies: mockClearAllSpecies,
    getTotalSeen: mockGetTotalSeen,
    seenSpecies: new Set<string>(),
    effectiveSeenSpecies: new Set<string>(),
  }),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    clearError: vi.fn(),
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

vi.mock('../lib/dataCache', () => ({
  fetchSpecies: vi.fn(() => Promise.resolve([])),
}))

describe('ProfileTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTotalSeen.mockReturnValue(42)
  })

  it('renders life list stats with total seen count', () => {
    render(<ProfileTab />)
    const countEl = screen.getByTestId('total-seen-count')
    expect(countEl).toBeInTheDocument()
    expect(countEl.textContent).toBe('42 species')
  })

  it('renders the export button when species are seen', () => {
    render(<ProfileTab />)
    expect(screen.getByTestId('export-csv-button')).toBeInTheDocument()
  })

  it('hides the export button when no species are seen', () => {
    mockGetTotalSeen.mockReturnValue(0)
    render(<ProfileTab />)
    expect(screen.queryByTestId('export-csv-button')).not.toBeInTheDocument()
  })

  it('renders the Clear All Species button', () => {
    render(<ProfileTab />)
    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument()
  })

  it('renders the Check for Updates button', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Check for Updates')).toBeInTheDocument()
  })

  it('displays the Profile & Data heading', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Profile & Data')).toBeInTheDocument()
  })

  it('does not show import section (moved to kebab menu)', () => {
    render(<ProfileTab />)
    expect(screen.queryByText('Import eBird Life List')).not.toBeInTheDocument()
    expect(screen.queryByTestId('import-csv-button')).not.toBeInTheDocument()
  })
})
