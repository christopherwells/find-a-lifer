import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExploreTab from '../components/ExploreTab'

describe('ExploreTab', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    )
  })

  it('renders region selector', () => {
    render(<ExploreTab />)
    expect(screen.getByLabelText('Select geographic region')).toBeInTheDocument()
  })

  it('renders view mode buttons', () => {
    render(<ExploreTab />)
    expect(screen.getByText('Richness')).toBeInTheDocument()
    expect(screen.getByText('Range')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('renders week slider', () => {
    render(<ExploreTab currentWeek={10} />)
    const slider = screen.getByTestId('week-slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveValue('10')
  })

  it('renders opacity slider', () => {
    render(<ExploreTab heatmapOpacity={0.6} />)
    const slider = screen.getByTestId('opacity-slider')
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveValue('60')
  })

  it('calls onWeekChange when slider moves', () => {
    const mockChange = vi.fn()
    render(<ExploreTab currentWeek={10} onWeekChange={mockChange} />)
    const slider = screen.getByTestId('week-slider')
    fireEvent.change(slider, { target: { value: '20' } })
    expect(mockChange).toHaveBeenCalledWith(20)
  })

  it('calls onViewModeChange when clicking view mode button', () => {
    const mockChange = vi.fn()
    render(<ExploreTab viewMode="density" onViewModeChange={mockChange} />)
    fireEvent.click(screen.getByText('Goals'))
    expect(mockChange).toHaveBeenCalledWith('goal-birds')
  })

  it('shows animation play button', () => {
    render(<ExploreTab />)
    expect(screen.getByText('Animate Migration')).toBeInTheDocument()
  })

  it('displays week label', () => {
    render(<ExploreTab currentWeek={1} />)
    // Week 1 should show approximately early January
    expect(screen.getByText(/Week 1/)).toBeInTheDocument()
  })

  it('shows lifer range filter in density mode when data is available', () => {
    render(<ExploreTab viewMode="density" dataRange={[0, 100]} />)
    expect(screen.getByText('Lifer Range')).toBeInTheDocument()
  })

  it('hides lifer range filter when goalBirdsOnly is active', () => {
    render(<ExploreTab viewMode="density" goalBirdsOnlyFilter={true} dataRange={[0, 100]} />)
    expect(screen.queryByText('Lifer Range')).not.toBeInTheDocument()
  })
})
