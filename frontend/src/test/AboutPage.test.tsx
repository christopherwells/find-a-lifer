import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AboutPage from '../components/AboutPage'

describe('AboutPage', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the overlay and about page', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByTestId('about-page-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('about-page')).toBeInTheDocument()
  })

  it('shows the title', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('About Find-A-Lifer')).toBeInTheDocument()
  })

  it('shows Responsible Birding section', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('Responsible Birding')).toBeInTheDocument()
    expect(screen.getByText(/Do not trespass/)).toBeInTheDocument()
  })

  it('shows ABA Code of Birding Ethics link', () => {
    render(<AboutPage onClose={onClose} />)
    const link = screen.getByTestId('about-aba-link')
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('https://www.aba.org/aba-code-of-birding-ethics/')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('shows What is Find-A-Lifer section', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('What is Find-A-Lifer?')).toBeInTheDocument()
  })

  it('shows How the Data Works section', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('How the Data Works')).toBeInTheDocument()
  })

  it('shows Credits section with data sources', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('Credits')).toBeInTheDocument()
    expect(screen.getByText('eBird')).toBeInTheDocument()
    expect(screen.getByText('IUCN Red List')).toBeInTheDocument()
    expect(screen.getByText('MapLibre GL JS')).toBeInTheDocument()
  })

  it('shows version in footer', () => {
    render(<AboutPage onClose={onClose} />)
    expect(screen.getByText('v0.1 Beta')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<AboutPage onClose={onClose} />)
    fireEvent.click(screen.getByTestId('about-page-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when backdrop is clicked', () => {
    render(<AboutPage onClose={onClose} />)
    fireEvent.click(screen.getByTestId('about-page-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when card content is clicked', () => {
    render(<AboutPage onClose={onClose} />)
    fireEvent.click(screen.getByTestId('about-page'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    render(<AboutPage onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders via portal in document.body', () => {
    render(<AboutPage onClose={onClose} />)
    const overlay = screen.getByTestId('about-page-overlay')
    expect(overlay.parentElement).toBe(document.body)
  })
})
