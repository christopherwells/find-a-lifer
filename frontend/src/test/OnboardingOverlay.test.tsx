import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import OnboardingOverlay from '../components/OnboardingOverlay'

// --- Mocks ---
vi.mock('../contexts/LifeListContext', () => ({
  useLifeList: () => ({
    importSpeciesList: vi.fn(() => Promise.resolve({ newCount: 0, existingCount: 0 })),
    seenSpecies: new Set<string>(),
    toggleSpecies: vi.fn(),
  }),
}))

vi.mock('../lib/dataCache', () => ({
  fetchSpecies: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../lib/csvImport', () => ({
  openFilePicker: vi.fn(() => Promise.resolve(null)),
  processCSVFile: vi.fn(() => Promise.resolve({ matched: 0, unmatched: 0, total: 0, newCount: 0, existingCount: 0 })),
}))

// Mock StarterChecklist to avoid its async data loading
vi.mock('../components/StarterChecklist', () => ({
  default: ({ onDismiss }: { onDismiss: () => void }) => (
    <div data-testid="starter-checklist-mock">
      <button onClick={onDismiss} data-testid="mock-dismiss">Done</button>
    </div>
  ),
}))

describe('OnboardingOverlay', () => {
  const onComplete = vi.fn<() => void>()

  beforeEach(() => {
    onComplete.mockClear()
    localStorage.clear()
  })

  const renderOverlay = () =>
    render(<OnboardingOverlay onComplete={onComplete} />)

  it('renders the overlay', () => {
    renderOverlay()
    expect(screen.getByTestId('onboarding-overlay')).toBeInTheDocument()
  })

  it('shows first slide on mount', () => {
    renderOverlay()
    expect(screen.getByText('Welcome to Find-A-Lifer!')).toBeInTheDocument()
  })

  it('advances to second slide on Next click', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText('Explore the Map')).toBeInTheDocument()
  })

  it('navigates through all 3 slides with Next', () => {
    renderOverlay()
    expect(screen.getByText('Welcome to Find-A-Lifer!')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText('Explore the Map')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByText('Get Started')).toBeInTheDocument()
    expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument()
  })

  it('shows Quick Start, Import, and Just Explore buttons on last slide', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByTestId('onboarding-quick-start')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-import-life-list')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-just-explore')).toBeInTheDocument()
  })

  it('switches to quickstart mode when Quick Start is clicked', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2')) // jump to slide 3
    fireEvent.click(screen.getByTestId('onboarding-quick-start'))
    expect(screen.getByText('Quick Start')).toBeInTheDocument()
    expect(screen.getByTestId('starter-checklist-mock')).toBeInTheDocument()
  })

  it('switches to import mode when Import from eBird is clicked', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    fireEvent.click(screen.getByTestId('onboarding-import-life-list'))
    expect(screen.getByText('Import from eBird')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-ebird-link')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-import-csv')).toBeInTheDocument()
  })

  it('shows eBird download instructions in import mode', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    fireEvent.click(screen.getByTestId('onboarding-import-life-list'))
    expect(screen.getByText(/How to download your life list/)).toBeInTheDocument()
    expect(screen.getByText(/Download \(CSV\)/)).toBeInTheDocument()
  })

  it('has a back button in quickstart mode that returns to slides', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    fireEvent.click(screen.getByTestId('onboarding-quick-start'))
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  it('has a back button in import mode that returns to slides', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    fireEvent.click(screen.getByTestId('onboarding-import-life-list'))
    fireEvent.click(screen.getByTestId('onboarding-back'))
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  it('calls onComplete when Just Explore is clicked', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-just-explore'))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('calls onComplete when Skip is clicked from any slide', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-skip'))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('calls onComplete on Escape key', () => {
    renderOverlay()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('calls onComplete when clicking the backdrop', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-overlay'))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('does not dismiss when clicking the card content', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-card'))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows 3 dot indicators', () => {
    renderOverlay()
    expect(screen.getByTestId('onboarding-dot-0')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-dot-1')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-dot-2')).toBeInTheDocument()
  })

  it('navigates to a slide when dot indicator is clicked', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  it('renders via portal in document.body', () => {
    renderOverlay()
    const overlay = screen.getByTestId('onboarding-overlay')
    expect(overlay.parentElement).toBe(document.body)
  })

  it('calls onComplete when StarterChecklist dismisses in quickstart mode', () => {
    renderOverlay()
    fireEvent.click(screen.getByTestId('onboarding-dot-2'))
    fireEvent.click(screen.getByTestId('onboarding-quick-start'))
    fireEvent.click(screen.getByTestId('mock-dismiss'))
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
