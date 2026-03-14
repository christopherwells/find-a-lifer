import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopBar from '../components/TopBar'

describe('TopBar', () => {
  beforeEach(() => {
    // Mock fetch for health check
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    )
  })

  it('renders the app title', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} />)
    expect(screen.getByText('Find-A-Lifer')).toBeInTheDocument()
  })

  it('renders dark mode toggle button', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} />)
    const button = screen.getByRole('button', { name: /switch to dark mode/i })
    expect(button).toBeInTheDocument()
  })

  it('calls onToggleDarkMode when toggle is clicked', () => {
    const mockToggle = vi.fn()
    render(<TopBar darkMode={false} onToggleDarkMode={mockToggle} />)
    const button = screen.getByRole('button', { name: /switch to dark mode/i })
    fireEvent.click(button)
    expect(mockToggle).toHaveBeenCalledOnce()
  })

  it('shows sun icon in dark mode', () => {
    render(<TopBar darkMode={true} onToggleDarkMode={() => {}} />)
    const button = screen.getByRole('button', { name: /switch to light mode/i })
    expect(button).toBeInTheDocument()
  })

  it('shows server status indicator', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} />)
    // Status dot should be present (connecting initially)
    const statusDot = screen.getByTitle(/connecting/i)
    expect(statusDot).toBeInTheDocument()
  })
})
