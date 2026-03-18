import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Badge from '../components/Badge'

/**
 * Tests for the habitat variant of the Badge component.
 * Each habitat type has a specific emoji and color scheme.
 */

const KNOWN_HABITATS = [
  { name: 'Forest',         emoji: '\u{1F332}',       bgClass: 'bg-emerald-100' },
  { name: 'Aquatic',        emoji: '\u{1F4A7}',       bgClass: 'bg-sky-100' },
  { name: 'Wetland',        emoji: '\u{1F3DE}\u{FE0F}', bgClass: 'bg-teal-100' },
  { name: 'Grassland',      emoji: '\u{1F33F}',       bgClass: 'bg-lime-100' },
  { name: 'Agricultural',   emoji: '\u{1F33E}',       bgClass: 'bg-yellow-100' },
  { name: 'Urban-tolerant', emoji: '\u{1F3D9}\u{FE0F}', bgClass: 'bg-stone-100' },
  { name: 'Scrubland',      emoji: '\u{1FAB4}',       bgClass: 'bg-amber-100' },
]

describe('Badge habitat variant', () => {
  // --- Pill size (default) ---
  describe('pill size', () => {
    it.each(KNOWN_HABITATS)(
      'renders $name habitat pill with correct background',
      ({ name, bgClass }) => {
        render(<Badge variant="habitat" value={name} />)
        const badge = screen.getByTestId('badge-habitat-pill')
        expect(badge).toBeInTheDocument()
        expect(badge.className).toContain(bgClass)
        // Label should be the habitat name
        expect(badge.textContent).toContain(name)
      }
    )

    it.each(KNOWN_HABITATS)(
      'renders $name habitat pill with correct emoji',
      ({ name, emoji }) => {
        render(<Badge variant="habitat" value={name} />)
        const badge = screen.getByTestId('badge-habitat-pill')
        expect(badge.textContent).toContain(emoji)
      }
    )

    it('falls back to gray for unknown habitat value', () => {
      render(<Badge variant="habitat" value="Tundra" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      expect(badge.className).toContain('bg-gray-100')
    })

    it('uses globe emoji for unknown habitat', () => {
      render(<Badge variant="habitat" value="Unknown Habitat" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      // Fallback emoji is globe: \u{1F30D}
      expect(badge.textContent).toContain('\u{1F30D}')
    })

    it('displays the habitat name as label text', () => {
      render(<Badge variant="habitat" value="Forest" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      expect(badge.textContent).toContain('Forest')
    })
  })

  // --- Dot size ---
  describe('dot size', () => {
    it('renders dot for habitat variant', () => {
      render(<Badge variant="habitat" value="Forest" size="dot" />)
      const badge = screen.getByTestId('badge-habitat-dot')
      expect(badge).toBeInTheDocument()
      expect(badge.getAttribute('title')).toBe('Forest')
    })

    it('dot has correct background for known habitat', () => {
      render(<Badge variant="habitat" value="Aquatic" size="dot" />)
      const badge = screen.getByTestId('badge-habitat-dot')
      expect(badge.className).toContain('bg-sky-100')
    })

    it('dot falls back to gray for unknown habitat', () => {
      render(<Badge variant="habitat" value="Desert" size="dot" />)
      const badge = screen.getByTestId('badge-habitat-dot')
      expect(badge.className).toContain('bg-gray-100')
    })
  })

  // --- Icon size ---
  describe('icon size', () => {
    it('returns null for habitat icon (no char defined)', () => {
      // Habitat entries in HABITAT_STYLE don't have a 'char' property,
      // so getStyle returns an object without char → icon badge returns null
      const { container } = render(<Badge variant="habitat" value="Forest" size="icon" />)
      expect(container.innerHTML).toBe('')
    })
  })

  // --- Dark mode ---
  describe('dark mode classes', () => {
    it('includes dark mode variants for Forest', () => {
      render(<Badge variant="habitat" value="Forest" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      expect(badge.className).toContain('dark:bg-emerald-900/40')
      expect(badge.className).toContain('dark:text-emerald-300')
    })

    it('includes dark mode variants for Aquatic', () => {
      render(<Badge variant="habitat" value="Aquatic" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      expect(badge.className).toContain('dark:bg-sky-900/40')
      expect(badge.className).toContain('dark:text-sky-300')
    })

    it('includes dark mode variants for unknown habitat fallback', () => {
      render(<Badge variant="habitat" value="Alpine" />)
      const badge = screen.getByTestId('badge-habitat-pill')
      expect(badge.className).toContain('dark:bg-gray-700')
    })
  })

  // --- Custom className ---
  it('passes through custom className', () => {
    render(<Badge variant="habitat" value="Forest" className="ml-4" />)
    const badge = screen.getByTestId('badge-habitat-pill')
    expect(badge.className).toContain('ml-4')
  })
})
