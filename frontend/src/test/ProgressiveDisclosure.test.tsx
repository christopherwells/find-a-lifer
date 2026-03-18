import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExploreTab from '../components/ExploreTab'

describe('Progressive Disclosure (Beginner Mode)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )
    localStorage.clear()
  })

  it('shows only Richness view mode button in beginner mode', () => {
    render(<ExploreTab beginnerMode={true} />)
    expect(screen.getByText('Richness')).toBeInTheDocument()
    expect(screen.queryByText('Frequency')).not.toBeInTheDocument()
    expect(screen.queryByText('Range')).not.toBeInTheDocument()
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
  })

  it('shows all view mode buttons when beginner mode is off', () => {
    render(<ExploreTab beginnerMode={false} />)
    expect(screen.getByText('Richness')).toBeInTheDocument()
    expect(screen.getByText('Frequency')).toBeInTheDocument()
    expect(screen.getByText('Range')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('wraps opacity slider inside Advanced Controls accordion in beginner mode', () => {
    render(<ExploreTab beginnerMode={true} heatmapOpacity={0.8} />)
    // The opacity slider is inside a <details> element (collapsed by default)
    const details = screen.getByTestId('opacity-slider').closest('details')
    expect(details).toBeInTheDocument()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('reveals opacity slider when Advanced Controls is opened', () => {
    render(<ExploreTab beginnerMode={true} heatmapOpacity={0.8} />)
    // Open the details accordion
    const summary = screen.getByText(/Advanced Controls/)
    fireEvent.click(summary)
    const details = screen.getByTestId('opacity-slider').closest('details')
    expect(details?.hasAttribute('open')).toBe(true)
  })

  it('shows opacity slider directly when beginner mode is off', () => {
    render(<ExploreTab beginnerMode={false} heatmapOpacity={0.8} />)
    expect(screen.getByTestId('opacity-slider')).toBeInTheDocument()
  })

  it('calls onBeginnerModeChange when "Show all controls permanently" is clicked', () => {
    const mockChange = vi.fn()
    render(<ExploreTab beginnerMode={true} heatmapOpacity={0.8} onBeginnerModeChange={mockChange} />)
    const summary = screen.getByText(/Advanced Controls/)
    fireEvent.click(summary)
    const showAllBtn = screen.getByText(/Show all controls permanently/)
    fireEvent.click(showAllBtn)
    expect(mockChange).toHaveBeenCalledWith(false)
  })

  it('hides lifer range filter completely in beginner mode', () => {
    render(<ExploreTab beginnerMode={true} viewMode="density" dataRange={[0, 100]} />)
    expect(screen.queryByText('Lifer Range')).not.toBeInTheDocument()
  })
})
