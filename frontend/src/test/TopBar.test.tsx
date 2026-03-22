import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopBar from '../components/TopBar'

// Mock AuthContext
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))

const defaultProps = {
  darkMode: false,
  onToggleDarkMode: vi.fn(),
  onShowAbout: vi.fn(),
  onShowOnboarding: vi.fn(),
  onImportClick: vi.fn(),
  onShowProfile: vi.fn(),
}

describe('TopBar', () => {
  it('renders the app title', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByText('Find-A-Lifer')).toBeInTheDocument()
  })

  it('renders kebab menu button', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByTestId('topbar-menu-button')).toBeInTheDocument()
    expect(screen.queryByTestId('topbar-menu')).not.toBeInTheDocument()
  })

  it('opens dropdown with menu items when clicked', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    expect(screen.getByTestId('topbar-menu')).toBeInTheDocument()
    expect(screen.getByText('Import Life List')).toBeInTheDocument()
    expect(screen.getByText('Tutorial')).toBeInTheDocument()
    expect(screen.getByText('About Find-A-Lifer')).toBeInTheDocument()
  })

  it('calls onImportClick when Import Life List is clicked', () => {
    const onImportClick = vi.fn()
    render(<TopBar {...defaultProps} onImportClick={onImportClick} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    fireEvent.click(screen.getByTestId('topbar-import-button'))
    expect(onImportClick).toHaveBeenCalledOnce()
  })

  it('calls onShowProfile when Account is clicked', () => {
    const onShowProfile = vi.fn()
    render(<TopBar {...defaultProps} onShowProfile={onShowProfile} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    fireEvent.click(screen.getByTestId('topbar-account-button'))
    expect(onShowProfile).toHaveBeenCalledOnce()
  })

  it('calls onShowOnboarding when Tutorial is clicked', () => {
    const onShowOnboarding = vi.fn()
    render(<TopBar {...defaultProps} onShowOnboarding={onShowOnboarding} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    fireEvent.click(screen.getByTestId('topbar-help-button'))
    expect(onShowOnboarding).toHaveBeenCalledOnce()
  })

  it('closes menu after selecting an item', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('topbar-menu-button'))
    expect(screen.getByTestId('topbar-menu')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('topbar-help-button'))
    expect(screen.queryByTestId('topbar-menu')).not.toBeInTheDocument()
  })
})
