import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProfileTab from '../components/ProfileTab'

// --- Mocks ---
const mockGetTotalSeen = vi.fn(() => 42)
const mockIsSpeciesSeen = vi.fn(() => false)
const mockImportSpeciesList = vi.fn()
const mockClearAllSpecies = vi.fn()

vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    isSpeciesSeen: mockIsSpeciesSeen,
    importSpeciesList: mockImportSpeciesList,
    clearAllSpecies: mockClearAllSpecies,
    getTotalSeen: mockGetTotalSeen,
    seenSpecies: new Set<string>(),
    // Partner list
    partnerSeenSpecies: new Set<string>(),
    importPartnerList: vi.fn(),
    clearPartnerList: vi.fn(),
    hasPartnerList: false,
    activeListMode: 'me' as const,
    setActiveListMode: vi.fn(),
    // Year lists
    yearLists: [],
    importYearList: vi.fn(),
    deleteYearList: vi.fn(),
    listScope: 'lifetime' as const,
    setListScope: vi.fn(),
    setActiveYearListId: vi.fn(),
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

  it('renders the import CSV button', () => {
    render(<ProfileTab />)
    expect(screen.getByTestId('import-csv-button')).toBeInTheDocument()
    expect(screen.getByText('Import CSV')).toBeInTheDocument()
  })

  it('renders the export button when species are seen', () => {
    render(<ProfileTab />)
    expect(screen.getByTestId('export-csv-button')).toBeInTheDocument()
    expect(screen.getByText('Export Life List as CSV')).toBeInTheDocument()
  })

  it('hides the export button when no species are seen', () => {
    mockGetTotalSeen.mockReturnValue(0)
    render(<ProfileTab />)
    expect(screen.queryByTestId('export-csv-button')).not.toBeInTheDocument()
  })

  it('renders life list stats with total seen count', () => {
    render(<ProfileTab />)
    const countEl = screen.getByTestId('total-seen-count')
    expect(countEl).toBeInTheDocument()
    expect(countEl.textContent).toBe('42 species')
  })

  it('renders the Clear All Species button', () => {
    render(<ProfileTab />)
    expect(screen.getByTestId('clear-all-button')).toBeInTheDocument()
    expect(screen.getByText('Clear All Species')).toBeInTheDocument()
  })

  it('renders the Check for Updates button', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Check for Updates')).toBeInTheDocument()
  })

  it('displays the Profile & Data heading', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Profile & Data')).toBeInTheDocument()
  })

  it('displays section headings', () => {
    render(<ProfileTab />)
    expect(screen.getByText('Import eBird Life List')).toBeInTheDocument()
    expect(screen.getByText('Your Life List')).toBeInTheDocument()
    expect(screen.getByText('Partner Life List')).toBeInTheDocument()
    expect(screen.getByText('Year Lists')).toBeInTheDocument()
    expect(screen.getByText('App Updates')).toBeInTheDocument()
    expect(screen.getByText('Reset')).toBeInTheDocument()
  })
})
