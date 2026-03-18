import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Tooltip from '../components/Tooltip'

describe('Tooltip', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the trigger button with "i" text', () => {
    render(<Tooltip content="Test tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    expect(trigger).toBeInTheDocument()
    expect(trigger.textContent).toBe('i')
  })

  it('does not show tooltip content by default', () => {
    render(<Tooltip content="Test tooltip" />)
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
  })

  it('shows tooltip on click', () => {
    render(<Tooltip content="Test tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.click(trigger)
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    expect(screen.getByText('Test tooltip')).toBeInTheDocument()
  })

  it('hides tooltip on second click (toggle)', () => {
    render(<Tooltip content="Test tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.click(trigger)
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
  })

  it('shows tooltip on mouse enter after delay', () => {
    vi.useFakeTimers()
    render(<Tooltip content="Hover tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.mouseEnter(trigger)
    // Tooltip should not appear immediately
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
    // Advance timer past 200ms delay
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides tooltip on mouse leave', () => {
    vi.useFakeTimers()
    render(<Tooltip content="Hover tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.mouseEnter(trigger)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    fireEvent.mouseLeave(trigger)
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('dismisses on outside click', () => {
    render(<Tooltip content="Test tooltip" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.click(trigger)
    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument()
    // Click outside
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('tooltip-content')).not.toBeInTheDocument()
  })

  it('renders tooltip via portal (in document.body)', () => {
    render(<Tooltip content="Portal test" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.click(trigger)
    const tooltip = screen.getByTestId('tooltip-content')
    expect(tooltip.parentElement).toBe(document.body)
  })

  it('applies custom className to trigger', () => {
    render(<Tooltip content="Test" className="ml-2" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    expect(trigger.className).toContain('ml-2')
  })

  it('has role="tooltip" on the tooltip element', () => {
    render(<Tooltip content="Accessible" />)
    const trigger = screen.getByTestId('tooltip-trigger')
    fireEvent.click(trigger)
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toBeInTheDocument()
  })
})
