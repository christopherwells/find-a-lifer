import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Badge from '../components/Badge'
import { getConservationDotColor, getRestrictedRangeDotColor } from '../lib/badgeUtils'

describe('Badge', () => {
  // --- Pill size (default) ---
  describe('pill size', () => {
    it('renders conservation pill with correct text', () => {
      render(<Badge variant="conservation" value="Vulnerable" />)
      const badge = screen.getByTestId('badge-conservation-pill')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('Vulnerable')
    })

    it('renders difficulty pill', () => {
      render(<Badge variant="difficulty" value="Hard" />)
      const badge = screen.getByTestId('badge-difficulty-pill')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('Hard')
    })

    it('renders restricted-range pill with "Restricted Range" label', () => {
      render(<Badge variant="restricted-range" value="yes" />)
      const badge = screen.getByTestId('badge-restricted-range-pill')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('Restricted Range')
    })

    it('renders invasion pill for Introduced status', () => {
      render(<Badge variant="invasion" value="Introduced (US-FL)" />)
      const badge = screen.getByTestId('badge-invasion-pill')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('Introduced (US-FL)')
    })

    it('renders invasion pill for Vagrant/Accidental status', () => {
      render(<Badge variant="invasion" value="Vagrant/Accidental" />)
      const badge = screen.getByTestId('badge-invasion-pill')
      expect(badge.textContent).toContain('Vagrant/Accidental')
    })

    it('applies orange background for Vulnerable conservation', () => {
      render(<Badge variant="conservation" value="Vulnerable" />)
      const badge = screen.getByTestId('badge-conservation-pill')
      expect(badge.className).toContain('bg-orange-100')
    })

    it('applies red background for Endangered conservation', () => {
      render(<Badge variant="conservation" value="Endangered" />)
      const badge = screen.getByTestId('badge-conservation-pill')
      expect(badge.className).toContain('bg-red-100')
    })

    it('falls back to gray for unknown conservation status', () => {
      render(<Badge variant="conservation" value="Unknown Status" />)
      const badge = screen.getByTestId('badge-conservation-pill')
      expect(badge.className).toContain('bg-gray-100')
    })
  })

  // --- Icon size ---
  describe('icon size', () => {
    it('renders icon for Endangered (char "!")', () => {
      render(<Badge variant="conservation" value="Endangered" size="icon" />)
      const badge = screen.getByTestId('badge-conservation-icon')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toBe('!')
    })

    it('renders nothing for Least Concern icon (empty char)', () => {
      const { container } = render(<Badge variant="conservation" value="Least Concern" size="icon" />)
      expect(container.innerHTML).toBe('')
    })

    it('renders nothing for Easy difficulty icon (empty char)', () => {
      const { container } = render(<Badge variant="difficulty" value="Easy" size="icon" />)
      expect(container.innerHTML).toBe('')
    })

    it('renders "H" for Hard difficulty icon', () => {
      render(<Badge variant="difficulty" value="Hard" size="icon" />)
      const badge = screen.getByTestId('badge-difficulty-icon')
      expect(badge.textContent).toBe('H')
    })

    it('renders "R" for restricted-range icon', () => {
      render(<Badge variant="restricted-range" value="yes" size="icon" />)
      const badge = screen.getByTestId('badge-restricted-range-icon')
      expect(badge.textContent).toBe('R')
    })
  })

  // --- Dot size ---
  describe('dot size', () => {
    it('renders a dot with title attribute', () => {
      render(<Badge variant="conservation" value="Vulnerable" size="dot" />)
      const badge = screen.getByTestId('badge-conservation-dot')
      expect(badge).toBeInTheDocument()
      expect(badge.getAttribute('title')).toBe('Vulnerable')
    })

    it('dot has correct width/height classes', () => {
      render(<Badge variant="difficulty" value="Hard" size="dot" />)
      const badge = screen.getByTestId('badge-difficulty-dot')
      expect(badge.className).toContain('w-1.5')
      expect(badge.className).toContain('h-1.5')
    })
  })

  // --- Dark mode classes ---
  describe('dark mode support', () => {
    it('includes dark: class variants in conservation pill', () => {
      render(<Badge variant="conservation" value="Vulnerable" />)
      const badge = screen.getByTestId('badge-conservation-pill')
      expect(badge.className).toContain('dark:bg-orange-900/40')
      expect(badge.className).toContain('dark:text-orange-300')
    })

    it('includes dark: class variants in restricted-range pill', () => {
      render(<Badge variant="restricted-range" value="yes" />)
      const badge = screen.getByTestId('badge-restricted-range-pill')
      expect(badge.className).toContain('dark:bg-blue-900/40')
    })
  })

  // --- Custom className ---
  it('passes through custom className', () => {
    render(<Badge variant="conservation" value="Vulnerable" className="mt-2" />)
    const badge = screen.getByTestId('badge-conservation-pill')
    expect(badge.className).toContain('mt-2')
  })

  // --- Utility functions ---
  describe('getConservationDotColor', () => {
    it('returns yellow for Near Threatened', () => {
      expect(getConservationDotColor('Near Threatened')).toContain('yellow')
    })
    it('returns orange for Vulnerable', () => {
      expect(getConservationDotColor('Vulnerable')).toContain('orange')
    })
    it('returns red for Endangered', () => {
      expect(getConservationDotColor('Endangered')).toContain('red')
    })
    it('returns red-700 for Critically Endangered', () => {
      expect(getConservationDotColor('Critically Endangered')).toContain('red-700')
    })
    it('returns empty string for unknown status', () => {
      expect(getConservationDotColor('Least Concern')).toBe('')
    })
  })

  describe('getRestrictedRangeDotColor', () => {
    it('returns blue color class', () => {
      expect(getRestrictedRangeDotColor()).toContain('blue')
    })
  })
})
