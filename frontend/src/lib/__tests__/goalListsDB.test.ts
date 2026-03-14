import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

import type {
  GoalList,
} from '../goalListsDB'

// We need to re-import the module each test to reset the cached dbInstance
let getAllLists: () => Promise<GoalList[]>
let getList: (id: string) => Promise<GoalList | undefined>
let saveList: (list: GoalList) => Promise<void>
let deleteList: (id: string) => Promise<void>
let addSpeciesToList: (listId: string, speciesCode: string) => Promise<boolean>
let removeSpeciesFromList: (listId: string, speciesCode: string) => Promise<void>
let renameList: (id: string, newName: string) => Promise<GoalList>

beforeEach(async () => {
  // Delete the database
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('find-a-lifer-db')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
  })

  // Reset module to clear cached dbInstance
  vi.resetModules()
  const mod = await import('../goalListsDB')
  getAllLists = mod.getAllLists
  getList = mod.getList
  saveList = mod.saveList
  deleteList = mod.deleteList
  addSpeciesToList = mod.addSpeciesToList
  removeSpeciesFromList = mod.removeSpeciesFromList
  renameList = mod.renameList
})

function makeList(overrides?: Partial<GoalList>): GoalList {
  return {
    id: 'test-list-1',
    name: 'Test List',
    speciesCodes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('goalListsDB', () => {
  describe('saveList and getList', () => {
    it('saves and retrieves a goal list', async () => {
      const list = makeList()
      await saveList(list)

      const retrieved = await getList('test-list-1')
      expect(retrieved).toBeDefined()
      expect(retrieved!.name).toBe('Test List')
      expect(retrieved!.id).toBe('test-list-1')
    })

    it('returns undefined for nonexistent list', async () => {
      const result = await getList('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('getAllLists', () => {
    it('returns empty array when no lists exist', async () => {
      const lists = await getAllLists()
      expect(lists).toEqual([])
    })

    it('returns all saved lists', async () => {
      await saveList(makeList({ id: 'list-1', name: 'List 1' }))
      await saveList(makeList({ id: 'list-2', name: 'List 2' }))

      const lists = await getAllLists()
      expect(lists).toHaveLength(2)
      const names = lists.map((l) => l.name).sort()
      expect(names).toEqual(['List 1', 'List 2'])
    })
  })

  describe('deleteList', () => {
    it('deletes an existing list', async () => {
      await saveList(makeList())
      await deleteList('test-list-1')

      const result = await getList('test-list-1')
      expect(result).toBeUndefined()
    })

    it('does not throw when deleting nonexistent list', async () => {
      await expect(deleteList('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('addSpeciesToList', () => {
    it('adds a species to a list and returns true', async () => {
      await saveList(makeList())
      const added = await addSpeciesToList('test-list-1', 'amerob')
      expect(added).toBe(true)

      const list = await getList('test-list-1')
      expect(list!.speciesCodes).toContain('amerob')
    })

    it('returns false when species already in list (no duplicate)', async () => {
      await saveList(makeList({ speciesCodes: ['amerob'] }))
      const added = await addSpeciesToList('test-list-1', 'amerob')
      expect(added).toBe(false)

      const list = await getList('test-list-1')
      expect(list!.speciesCodes.filter((c) => c === 'amerob')).toHaveLength(1)
    })

    it('throws when list does not exist', async () => {
      await expect(addSpeciesToList('nonexistent', 'amerob')).rejects.toThrow(
        'Goal list not found'
      )
    })

    it('updates the updatedAt timestamp', async () => {
      const oldDate = '2020-01-01T00:00:00.000Z'
      await saveList(makeList({ updatedAt: oldDate }))
      await addSpeciesToList('test-list-1', 'amerob')

      const list = await getList('test-list-1')
      expect(list!.updatedAt).not.toBe(oldDate)
    })
  })

  describe('removeSpeciesFromList', () => {
    it('removes a species from a list', async () => {
      await saveList(makeList({ speciesCodes: ['amerob', 'houspa'] }))
      await removeSpeciesFromList('test-list-1', 'amerob')

      const list = await getList('test-list-1')
      expect(list!.speciesCodes).toEqual(['houspa'])
    })

    it('throws when list does not exist', async () => {
      await expect(
        removeSpeciesFromList('nonexistent', 'amerob')
      ).rejects.toThrow('Goal list not found')
    })
  })

  describe('renameList', () => {
    it('renames a list and returns updated list', async () => {
      await saveList(makeList())
      const updated = await renameList('test-list-1', '  New Name  ')

      expect(updated.name).toBe('New Name') // trimmed
      const list = await getList('test-list-1')
      expect(list!.name).toBe('New Name')
    })

    it('throws when list does not exist', async () => {
      await expect(renameList('nonexistent', 'Name')).rejects.toThrow(
        'Goal list not found'
      )
    })
  })
})
