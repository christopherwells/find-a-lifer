import { describe, it, expect } from 'vitest'
import { getDisplayGroup, getGroupSortKey } from '../familyGroups'

describe('getDisplayGroup', () => {
  it('maps Anatidae-family ducks correctly', () => {
    // Ducks, Geese, and Waterfowl is not in FAMILY_TO_GROUP, so it passes through
    expect(getDisplayGroup('Ducks, Geese, and Waterfowl')).toBe('Ducks, Geese, and Waterfowl')
  })

  it('maps Hawks, Eagles, and Kites to Vultures, Hawks, and Allies', () => {
    expect(getDisplayGroup('Hawks, Eagles, and Kites')).toBe('Vultures, Hawks, and Allies')
  })

  it('maps Tits, Chickadees, and Titmice to Chickadees, Nuthatches, and Allies', () => {
    expect(getDisplayGroup('Tits, Chickadees, and Titmice')).toBe('Chickadees, Nuthatches, and Allies')
  })

  it('maps Sandpipers and Allies to Shorebirds', () => {
    expect(getDisplayGroup('Sandpipers and Allies')).toBe('Shorebirds')
  })

  it('maps New World Warblers to Warblers', () => {
    expect(getDisplayGroup('New World Warblers')).toBe('Warblers')
  })

  it('maps Barn-Owls to Owls', () => {
    expect(getDisplayGroup('Barn-Owls')).toBe('Owls')
  })

  it('maps Falcons and Caracaras to Falcons', () => {
    expect(getDisplayGroup('Falcons and Caracaras')).toBe('Falcons')
  })

  it('returns the original family name as fallback for unmapped families', () => {
    expect(getDisplayGroup('Ducks, Geese, and Waterfowl')).toBe('Ducks, Geese, and Waterfowl')
    expect(getDisplayGroup('Woodpeckers')).toBe('Woodpeckers')
    expect(getDisplayGroup('Tyrant Flycatchers')).toBe('Tyrant Flycatchers')
  })

  it('returns the input string for a completely unknown family', () => {
    expect(getDisplayGroup('Imaginary Birds')).toBe('Imaginary Birds')
  })
})

describe('getGroupSortKey', () => {
  // ECOLOGICAL_GROUP_ORDER has 41 entries (indices 0-40).
  // Known groups return their index; unknown groups return >= 41.

  it('returns a value < 41 for all known ecological groups', () => {
    const knownGroups = [
      'Ducks, Geese, and Waterfowl',
      'Flamingos, Grebes, and Loons',
      'Gulls, Terns, and Skuas',
      'Shorebirds',
      'Vultures, Hawks, and Allies',
      'Owls',
      'Warblers',
      'Sparrows and Allies',
      'Blackbirds and Orioles',
    ]
    for (const group of knownGroups) {
      expect(
        getGroupSortKey(group, 0),
        `${group} should have sort key < 41`
      ).toBeLessThan(41)
    }
  })

  it('returns different values for different groups', () => {
    const keys = new Set([
      getGroupSortKey('Ducks, Geese, and Waterfowl', 0),
      getGroupSortKey('Shorebirds', 0),
      getGroupSortKey('Warblers', 0),
      getGroupSortKey('Owls', 0),
      getGroupSortKey('Blackbirds and Orioles', 0),
    ])
    expect(keys.size).toBe(5)
  })

  it('sorts water birds before land birds', () => {
    const ducks = getGroupSortKey('Ducks, Geese, and Waterfowl', 0)
    const shorebirds = getGroupSortKey('Shorebirds', 0)
    const owls = getGroupSortKey('Owls', 0)
    const warblers = getGroupSortKey('Warblers', 0)

    expect(ducks).toBeLessThan(owls)
    expect(ducks).toBeLessThan(warblers)
    expect(shorebirds).toBeLessThan(owls)
    expect(shorebirds).toBeLessThan(warblers)
  })

  it('sorts raptors together: Hawks before Falcons before Owls', () => {
    const hawks = getGroupSortKey('Vultures, Hawks, and Allies', 0)
    const falcons = getGroupSortKey('Falcons', 0)
    const owls = getGroupSortKey('Owls', 0)

    expect(hawks).toBeLessThan(falcons)
    expect(falcons).toBeLessThan(owls)
  })

  it('sorts Swifts adjacent to Swallows', () => {
    const swifts = getGroupSortKey('Swifts', 0)
    const swallows = getGroupSortKey('Swallows', 0)

    expect(Math.abs(swifts - swallows)).toBe(1)
  })

  it('returns value >= 41 for unknown groups', () => {
    expect(getGroupSortKey('Unknown Bird Family', 0)).toBeGreaterThanOrEqual(41)
  })

  it('uses fallbackTaxonOrder to differentiate unknown groups', () => {
    const unknown1 = getGroupSortKey('Unknown A', 100)
    const unknown2 = getGroupSortKey('Unknown B', 200)

    expect(unknown1).toBeLessThan(unknown2)
    // Both should be >= 41
    expect(unknown1).toBeGreaterThanOrEqual(41)
    expect(unknown2).toBeGreaterThanOrEqual(41)
  })

  it('the ecological order list has exactly 41 entries', () => {
    // Verify by checking that index 40 is a valid known group
    // and index 41 would be the boundary for unknowns.
    // Blackbirds and Orioles is the last entry (index 40).
    const lastGroup = getGroupSortKey('Blackbirds and Orioles', 0)
    expect(lastGroup).toBe(40)

    // First group is Ducks at index 0
    const firstGroup = getGroupSortKey('Ducks, Geese, and Waterfowl', 0)
    expect(firstGroup).toBe(0)
  })
})
