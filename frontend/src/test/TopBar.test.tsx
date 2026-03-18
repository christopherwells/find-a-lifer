import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopBar from '../components/TopBar'

describe('TopBar', () => {
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

  it('renders a menu button instead of separate help/about buttons', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} onShowAbout={() => {}} onShowOnboarding={() => {}} />)
    expect(screen.getByTestId('topbar-menu-button')).toBeInTheDocument()
    // Menu items are hidden until clicked
    expect(screen.queryByTestId('topbar-menu')).not.toBeInTheDocument()
  })

  it('opens dropdown with Tutorial and About when menu is clicked', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} onShowAbout={() => {}} onShowOnboarding={() => {}} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    expect(screen.getByTestId('topbar-menu')).toBeInTheDocument()
    expect(screen.getByText('Tutorial')).toBeInTheDocument()
    expect(screen.getByText('About Find-A-Lifer')).toBeInTheDocument()
  })

  it('calls onShowOnboarding when Tutorial is clicked', () => {
    const onShowOnboarding = vi.fn()
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} onShowOnboarding={onShowOnboarding} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    fireEvent.click(screen.getByTestId('topbar-help-button'))
    expect(onShowOnboarding).toHaveBeenCalledOnce()
  })

  it('calls onShowAbout when About is clicked', () => {
    const onShowAbout = vi.fn()
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} onShowAbout={onShowAbout} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    fireEvent.click(screen.getByTestId('topbar-about-button'))
    expect(onShowAbout).toHaveBeenCalledOnce()
  })

  it('closes menu after selecting an item', () => {
    render(<TopBar darkMode={false} onToggleDarkMode={() => {}} onShowAbout={() => {}} onShowOnboarding={() => {}} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    expect(screen.getByTestId('topbar-menu')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('topbar-help-button'))
    expect(screen.queryByTestId('topbar-menu')).not.toBeInTheDocument()
  })
})
