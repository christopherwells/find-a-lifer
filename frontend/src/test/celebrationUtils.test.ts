import { describe, it, expect } from 'vitest'
import {
  getMilestoneInfo,
  getAddMessage,
  getRemoveMessage,
  getGroupCompleteMessage,
  getAlmostThereMessage,
} from '../lib/celebrationUtils'

describe('celebrationUtils', () => {
  // --- getMilestoneInfo ---
  describe('getMilestoneInfo', () => {
    it('returns null for non-milestone counts', () => {
      expect(getMilestoneInfo(0)).toBeNull()
      expect(getMilestoneInfo(1)).toBeNull()
      expect(getMilestoneInfo(3)).toBeNull()
      expect(getMilestoneInfo(7)).toBeNull()
      expect(getMilestoneInfo(15)).toBeNull()
      expect(getMilestoneInfo(42)).toBeNull()
      expect(getMilestoneInfo(99)).toBeNull()
      expect(getMilestoneInfo(101)).toBeNull()
      expect(getMilestoneInfo(999)).toBeNull()
    })

    it('returns null for negative counts', () => {
      expect(getMilestoneInfo(-5)).toBeNull()
      expect(getMilestoneInfo(-100)).toBeNull()
    })

    // Small milestones
    it('returns small tier for 5 species', () => {
      const info = getMilestoneInfo(5)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('small')
      expect(info!.message).toBe("You're off to a great start!")
      expect(info!.confetti).toBe(false)
    })

    it('returns small tier for 10 species', () => {
      const info = getMilestoneInfo(10)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('small')
      expect(info!.message).toBe('Double digits! Keep exploring!')
      expect(info!.confetti).toBe(false)
    })

    it('returns small tier for 25 species', () => {
      const info = getMilestoneInfo(25)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('small')
      expect(info!.message).toBe('A quarter century of species!')
      expect(info!.confetti).toBe(false)
    })

    // Medium milestones
    it('returns medium tier for 50 species with confetti', () => {
      const info = getMilestoneInfo(50)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('medium')
      expect(info!.message).toBe('Half a hundred! Impressive dedication.')
      expect(info!.confetti).toBe(true)
    })

    it('returns medium tier for 100 species with confetti', () => {
      const info = getMilestoneInfo(100)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('medium')
      expect(info!.message).toBe("Triple digits! You're a serious birder.")
      expect(info!.confetti).toBe(true)
    })

    it('returns medium tier for 250 species with confetti', () => {
      const info = getMilestoneInfo(250)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('medium')
      expect(info!.message).toBe('A massive milestone. Well done!')
      expect(info!.confetti).toBe(true)
    })

    // Large milestones
    it('returns large tier for 500 species with confetti', () => {
      const info = getMilestoneInfo(500)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('large')
      expect(info!.message).toBe('500 species! Incredible achievement.')
      expect(info!.confetti).toBe(true)
    })

    it('returns large tier for 750 species with confetti', () => {
      const info = getMilestoneInfo(750)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('large')
      expect(info!.message).toBe('750 species! Incredible achievement.')
      expect(info!.confetti).toBe(true)
    })

    it('returns large tier for 1000 species with confetti', () => {
      const info = getMilestoneInfo(1000)
      expect(info).not.toBeNull()
      expect(info!.tier).toBe('large')
      expect(info!.message).toBe('1000 species! Incredible achievement.')
      expect(info!.confetti).toBe(true)
    })

    it('returns large tier for higher milestones (1500, 2000, 2500, 3000)', () => {
      for (const count of [1500, 2000, 2500, 3000]) {
        const info = getMilestoneInfo(count)
        expect(info).not.toBeNull()
        expect(info!.tier).toBe('large')
        expect(info!.confetti).toBe(true)
        expect(info!.message).toBe(`${count} species! Incredible achievement.`)
      }
    })

    // Confetti: false for small, true for medium/large
    it('small milestones never have confetti', () => {
      for (const count of [5, 10, 25]) {
        expect(getMilestoneInfo(count)!.confetti).toBe(false)
      }
    })

    it('medium milestones always have confetti', () => {
      for (const count of [50, 100, 250]) {
        expect(getMilestoneInfo(count)!.confetti).toBe(true)
      }
    })

    it('large milestones always have confetti', () => {
      for (const count of [500, 750, 1000, 1500, 2000, 2500, 3000]) {
        expect(getMilestoneInfo(count)!.confetti).toBe(true)
      }
    })
  })

  // --- getAddMessage ---
  describe('getAddMessage', () => {
    it('formats add message with species name and count', () => {
      expect(getAddMessage('Bald Eagle', 42)).toBe(
        'Bald Eagle added to your life list! (#42)'
      )
    })

    it('formats correctly for count of 1', () => {
      expect(getAddMessage('House Sparrow', 1)).toBe(
        'House Sparrow added to your life list! (#1)'
      )
    })

    it('formats correctly for large counts', () => {
      expect(getAddMessage('Snowy Owl', 1000)).toBe(
        'Snowy Owl added to your life list! (#1000)'
      )
    })

    it('handles species names with special characters', () => {
      expect(getAddMessage("Chuck-will's-widow", 55)).toBe(
        "Chuck-will's-widow added to your life list! (#55)"
      )
    })
  })

  // --- getRemoveMessage ---
  describe('getRemoveMessage', () => {
    it('formats remove message with species name', () => {
      expect(getRemoveMessage('Bald Eagle')).toBe(
        'Bald Eagle removed from your life list'
      )
    })

    it('handles species names with hyphens', () => {
      expect(getRemoveMessage('Red-tailed Hawk')).toBe(
        'Red-tailed Hawk removed from your life list'
      )
    })
  })

  // --- getGroupCompleteMessage ---
  describe('getGroupCompleteMessage', () => {
    it('formats group complete message with name and total', () => {
      expect(getGroupCompleteMessage('Woodpeckers', 23)).toBe(
        'All 23 Woodpeckers seen!'
      )
    })

    it('formats correctly for single-species groups', () => {
      expect(getGroupCompleteMessage('Limpkin', 1)).toBe(
        'All 1 Limpkin seen!'
      )
    })

    it('formats correctly for large groups', () => {
      expect(getGroupCompleteMessage('Warblers', 56)).toBe(
        'All 56 Warblers seen!'
      )
    })
  })

  // --- getAlmostThereMessage ---
  describe('getAlmostThereMessage', () => {
    it('calculates remaining correctly', () => {
      expect(getAlmostThereMessage('Woodpeckers', 20, 23)).toBe(
        'Woodpeckers: 20 of 23 — just 3 to go!'
      )
    })

    it('handles one remaining', () => {
      expect(getAlmostThereMessage('Owls', 18, 19)).toBe(
        'Owls: 18 of 19 — just 1 to go!'
      )
    })

    it('handles large remaining count', () => {
      expect(getAlmostThereMessage('Warblers', 10, 56)).toBe(
        'Warblers: 10 of 56 — just 46 to go!'
      )
    })

    it('handles zero seen', () => {
      expect(getAlmostThereMessage('Hawks', 0, 15)).toBe(
        'Hawks: 0 of 15 — just 15 to go!'
      )
    })
  })
})
