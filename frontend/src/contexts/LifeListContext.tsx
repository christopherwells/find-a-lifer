import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { YearList } from '../components/types'

export interface LifeListEntry {
  speciesCode: string
  comName: string
  dateAdded: number
  source: 'manual' | 'import'
}

export type ListMode = 'me' | 'partner' | 'both'

interface LifeListDB extends DBSchema {
  lifeList: {
    key: string
    value: LifeListEntry
  }
  goalLists: {
    key: string
    value: {
      id: string
      name: string
      speciesCodes: string[]
      createdAt: string
      updatedAt: string
    }
    indexes: {
      'name': string
      'createdAt': string
    }
  }
  partnerList: {
    key: string
    value: LifeListEntry
  }
  yearLists: {
    key: string
    value: {
      id: string
      year: number
      speciesCodes: string[]
      importedAt: string
    }
  }
}

interface LifeListContextValue {
  seenSpecies: Set<string>
  isSpeciesSeen: (speciesCode: string) => boolean
  toggleSpecies: (speciesCode: string, comName: string) => Promise<void>
  markSpeciesSeen: (speciesCode: string, comName: string, source?: 'manual' | 'import') => Promise<void>
  markSpeciesUnseen: (speciesCode: string) => Promise<void>
  clearAllSpecies: () => Promise<void>
  importSpeciesList: (speciesCodes: string[], comNames: string[]) => Promise<{newCount: number, existingCount: number}>
  getTotalSeen: () => number
  getLifeListEntries: () => Promise<LifeListEntry[]>
  // Partner list
  partnerSeenSpecies: Set<string>
  importPartnerList: (speciesCodes: string[], comNames: string[]) => Promise<{newCount: number, existingCount: number}>
  clearPartnerList: () => Promise<void>
  hasPartnerList: boolean
  activeListMode: ListMode
  setActiveListMode: (mode: ListMode) => void
  effectiveSeenSpecies: Set<string>
  // Year lists
  yearLists: YearList[]
  activeYearListId: string | null
  setActiveYearListId: (id: string | null) => void
  importYearList: (year: number, speciesCodes: string[]) => Promise<YearList>
  deleteYearList: (id: string) => Promise<void>
  yearSeenSpecies: Set<string>
  listScope: 'lifetime' | 'year'
  setListScope: (scope: 'lifetime' | 'year') => void
}

const LifeListContext = createContext<LifeListContextValue | undefined>(undefined)

const DB_NAME = 'find-a-lifer-db'
const DB_VERSION = 3 // v3: added partnerList + yearLists stores
const STORE_NAME = 'lifeList'
const PARTNER_STORE = 'partnerList'

let dbInstance: IDBPDatabase<LifeListDB> | null = null

async function getDB(): Promise<IDBPDatabase<LifeListDB>> {
  if (dbInstance) {
    return dbInstance
  }

  dbInstance = await openDB<LifeListDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Create the lifeList object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'speciesCode' })
      }
      // Create the goalLists object store if it doesn't exist (added in v2)
      if (!db.objectStoreNames.contains('goalLists')) {
        const goalStore = db.createObjectStore('goalLists', { keyPath: 'id' })
        goalStore.createIndex('name', 'name', { unique: false })
        goalStore.createIndex('createdAt', 'createdAt', { unique: false })
      }
      // Create the partnerList object store if it doesn't exist (added in v3)
      if (!db.objectStoreNames.contains(PARTNER_STORE)) {
        db.createObjectStore(PARTNER_STORE, { keyPath: 'speciesCode' })
      }
      // Create the yearLists object store if it doesn't exist (added in v3)
      if (!db.objectStoreNames.contains('yearLists')) {
        db.createObjectStore('yearLists', { keyPath: 'id' })
      }
    },
  })

  return dbInstance
}

export function LifeListProvider({ children }: { children: ReactNode }) {
  const [seenSpecies, setSeenSpecies] = useState<Set<string>>(new Set())
  const [partnerSeenSpecies, setPartnerSeenSpecies] = useState<Set<string>>(new Set())
  const [activeListMode, setActiveListMode] = useState<ListMode>('me')
  const [yearLists, setYearLists] = useState<YearList[]>([])
  const [activeYearListId, setActiveYearListId] = useState<string | null>(null)
  const [listScope, setListScope] = useState<'lifetime' | 'year'>('lifetime')
  const [loading, setLoading] = useState(true)

  // Load life list + partner list from IndexedDB on mount
  useEffect(() => {
    const loadLists = async () => {
      try {
        const db = await getDB()

        // Load main life list
        const allEntries = await db.getAll(STORE_NAME)
        const codes = new Set(allEntries.map(entry => entry.speciesCode))
        setSeenSpecies(codes)
        console.log(`Loaded ${codes.size} species from IndexedDB life list`)

        // Load partner list
        const partnerEntries = await db.getAll(PARTNER_STORE)
        const partnerCodes = new Set(partnerEntries.map(entry => entry.speciesCode))
        setPartnerSeenSpecies(partnerCodes)
        if (partnerCodes.size > 0) {
          console.log(`Loaded ${partnerCodes.size} species from partner life list`)
        }

        // Load year lists
        const yearListEntries = await db.getAll('yearLists')
        const loadedYearLists: YearList[] = yearListEntries.map(entry => ({
          id: entry.id,
          year: entry.year,
          speciesCodes: entry.speciesCodes,
          importedAt: entry.importedAt,
        }))
        setYearLists(loadedYearLists)
        if (loadedYearLists.length > 0) {
          console.log(`Loaded ${loadedYearLists.length} year lists`)
        }
      } catch (error) {
        console.error('Error loading life lists from IndexedDB:', error)
      } finally {
        setLoading(false)
      }
    }

    loadLists()
  }, [])

  const isSpeciesSeen = (speciesCode: string): boolean => {
    return seenSpecies.has(speciesCode)
  }

  const markSpeciesSeen = async (speciesCode: string, comName: string, source: 'manual' | 'import' = 'manual') => {
    try {
      const db = await getDB()
      const entry: LifeListEntry = {
        speciesCode,
        comName,
        dateAdded: Date.now(),
        source
      }
      await db.put(STORE_NAME, entry)
      setSeenSpecies(prev => new Set(prev).add(speciesCode))
      console.log(`Marked ${comName} (${speciesCode}) as seen`)
    } catch (error) {
      console.error('Error marking species as seen:', error)
      throw error
    }
  }

  const markSpeciesUnseen = async (speciesCode: string) => {
    try {
      const db = await getDB()
      await db.delete(STORE_NAME, speciesCode)
      setSeenSpecies(prev => {
        const next = new Set(prev)
        next.delete(speciesCode)
        return next
      })
      console.log(`Marked ${speciesCode} as unseen`)
    } catch (error) {
      console.error('Error marking species as unseen:', error)
      throw error
    }
  }

  const toggleSpecies = async (speciesCode: string, comName: string) => {
    if (isSpeciesSeen(speciesCode)) {
      await markSpeciesUnseen(speciesCode)
    } else {
      await markSpeciesSeen(speciesCode, comName, 'manual')
    }
  }

  const clearAllSpecies = async () => {
    try {
      const db = await getDB()
      await db.clear(STORE_NAME)
      setSeenSpecies(new Set())
      console.log('Cleared all species from life list')
    } catch (error) {
      console.error('Error clearing life list:', error)
      throw error
    }
  }

  const importSpeciesList = async (speciesCodes: string[], comNames: string[]): Promise<{newCount: number, existingCount: number}> => {
    try {
      const db = await getDB()

      // Snapshot existing species before import to determine new vs existing
      const existingCodes = new Set(seenSpecies)

      const tx = db.transaction(STORE_NAME, 'readwrite')

      for (let i = 0; i < speciesCodes.length; i++) {
        const entry: LifeListEntry = {
          speciesCode: speciesCodes[i],
          comName: comNames[i],
          dateAdded: Date.now(),
          source: 'import'
        }
        await tx.store.put(entry)
      }

      await tx.done

      const allEntries = await db.getAll(STORE_NAME)
      const codes = new Set(allEntries.map(entry => entry.speciesCode))
      setSeenSpecies(codes)

      // Count new vs existing from the imported list
      let newCount = 0
      let existingCount = 0
      for (const code of speciesCodes) {
        if (existingCodes.has(code)) {
          existingCount++
        } else {
          newCount++
        }
      }

      console.log(`Imported ${speciesCodes.length} species (${newCount} new, ${existingCount} already existed)`)
      return { newCount, existingCount }
    } catch (error) {
      console.error('Error importing species list:', error)
      throw error
    }
  }

  const getTotalSeen = (): number => {
    return seenSpecies.size
  }

  const getLifeListEntries = async (): Promise<LifeListEntry[]> => {
    const db = await getDB()
    return db.getAll(STORE_NAME)
  }

  // ── Partner list methods ──────────────────────────────────────────────

  const importPartnerList = async (speciesCodes: string[], comNames: string[]): Promise<{newCount: number, existingCount: number}> => {
    try {
      const db = await getDB()
      const existingCodes = new Set(partnerSeenSpecies)

      const tx = db.transaction(PARTNER_STORE, 'readwrite')
      for (let i = 0; i < speciesCodes.length; i++) {
        const entry: LifeListEntry = {
          speciesCode: speciesCodes[i],
          comName: comNames[i],
          dateAdded: Date.now(),
          source: 'import'
        }
        await tx.store.put(entry)
      }
      await tx.done

      const allEntries = await db.getAll(PARTNER_STORE)
      const codes = new Set(allEntries.map(entry => entry.speciesCode))
      setPartnerSeenSpecies(codes)

      let newCount = 0
      let existingCount = 0
      for (const code of speciesCodes) {
        if (existingCodes.has(code)) {
          existingCount++
        } else {
          newCount++
        }
      }

      console.log(`Imported ${speciesCodes.length} partner species (${newCount} new, ${existingCount} already existed)`)
      return { newCount, existingCount }
    } catch (error) {
      console.error('Error importing partner list:', error)
      throw error
    }
  }

  const clearPartnerList = async () => {
    try {
      const db = await getDB()
      await db.clear(PARTNER_STORE)
      setPartnerSeenSpecies(new Set())
      setActiveListMode('me')
      console.log('Cleared partner life list')
    } catch (error) {
      console.error('Error clearing partner list:', error)
      throw error
    }
  }

  const hasPartnerList = partnerSeenSpecies.size > 0

  // ── Year list methods ─────────────────────────────────────────────────

  const importYearList = useCallback(async (year: number, speciesCodes: string[]): Promise<YearList> => {
    try {
      const db = await getDB()
      const newList: YearList = {
        id: crypto.randomUUID(),
        year,
        speciesCodes,
        importedAt: new Date().toISOString(),
      }
      await db.put('yearLists', { id: newList.id, year: newList.year, speciesCodes: newList.speciesCodes, importedAt: newList.importedAt })
      setYearLists(prev => [...prev, newList])
      setActiveYearListId(newList.id)
      console.log(`Imported year list for ${year} with ${speciesCodes.length} species`)
      return newList
    } catch (error) {
      console.error('Error importing year list:', error)
      throw error
    }
  }, [])

  const deleteYearList = useCallback(async (id: string) => {
    try {
      const db = await getDB()
      await db.delete('yearLists', id)
      setYearLists(prev => prev.filter(l => l.id !== id))
      if (activeYearListId === id) {
        setActiveYearListId(null)
        setListScope('lifetime')
      }
      console.log(`Deleted year list: ${id}`)
    } catch (error) {
      console.error('Error deleting year list:', error)
      throw error
    }
  }, [activeYearListId])

  // Year seen species — derived from active year list
  const yearSeenSpecies = useMemo(() => {
    if (!activeYearListId) return new Set<string>()
    const activeList = yearLists.find(l => l.id === activeYearListId)
    return activeList ? new Set(activeList.speciesCodes) : new Set<string>()
  }, [activeYearListId, yearLists])

  // ── Effective seen species (computed from mode + scope) ───────────────

  const effectiveSeenSpecies = useMemo(() => {
    // If in year scope, use year list instead of lifetime
    const baseSeen = listScope === 'year' && yearSeenSpecies.size > 0
      ? yearSeenSpecies
      : seenSpecies

    switch (activeListMode) {
      case 'me':
        return baseSeen
      case 'partner':
        return partnerSeenSpecies
      case 'both':
        return new Set([...baseSeen, ...partnerSeenSpecies])
    }
  }, [activeListMode, seenSpecies, partnerSeenSpecies, listScope, yearSeenSpecies])

  const value: LifeListContextValue = {
    seenSpecies,
    isSpeciesSeen,
    toggleSpecies,
    markSpeciesSeen,
    markSpeciesUnseen,
    clearAllSpecies,
    importSpeciesList,
    getTotalSeen,
    getLifeListEntries,
    // Partner list
    partnerSeenSpecies,
    importPartnerList,
    clearPartnerList,
    hasPartnerList,
    activeListMode,
    setActiveListMode,
    effectiveSeenSpecies,
    // Year lists
    yearLists,
    activeYearListId,
    setActiveYearListId,
    importYearList,
    deleteYearList,
    yearSeenSpecies,
    listScope,
    setListScope,
  }

  // Don't render children until life list is loaded
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2C3E7B]"></div>
      </div>
    )
  }

  return (
    <LifeListContext.Provider value={value}>
      {children}
    </LifeListContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook must co-locate with its Provider
export function useLifeList() {
  const context = useContext(LifeListContext)
  if (context === undefined) {
    throw new Error('useLifeList must be used within a LifeListProvider')
  }
  return context
}
