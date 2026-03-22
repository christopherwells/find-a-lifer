import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface LifeListEntry {
  speciesCode: string
  comName: string
  dateAdded: number
  source: 'manual' | 'import'
}

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
  effectiveSeenSpecies: Set<string>
  tripUnion: Set<string> | null
  setTripUnion: (union: Set<string> | null) => void
  activeTripName: string | null
  setActiveTripName: (name: string | null) => void
  activeTripMemberCount: number
  setActiveTripMemberCount: (count: number) => void
  tripMemberLists: Array<{ name: string; codes: Set<string> }> | null
  setTripMemberLists: (lists: Array<{ name: string; codes: Set<string> }> | null) => void
}

const LifeListContext = createContext<LifeListContextValue | undefined>(undefined)

const DB_NAME = 'find-a-lifer-db'
const DB_VERSION = 3 // v3: yearLists store (+ partnerList store kept for DB compat)
const STORE_NAME = 'lifeList'

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
      // NOTE: Store kept for backward compatibility with existing databases
      if (!db.objectStoreNames.contains('partnerList')) {
        db.createObjectStore('partnerList', { keyPath: 'speciesCode' })
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
  const [loading, setLoading] = useState(true)
  const [tripUnion, setTripUnion] = useState<Set<string> | null>(null)
  const [activeTripName, setActiveTripName] = useState<string | null>(null)
  const [activeTripMemberCount, setActiveTripMemberCount] = useState(0)
  const [tripMemberLists, setTripMemberLists] = useState<Array<{ name: string; codes: Set<string> }> | null>(null)

  // Load life list from IndexedDB on mount
  useEffect(() => {
    const loadLists = async () => {
      try {
        const db = await getDB()

        // Load main life list
        const allEntries = await db.getAll(STORE_NAME)
        const codes = new Set(allEntries.map(entry => entry.speciesCode))
        setSeenSpecies(codes)
      } catch (error) {
        console.error('Error loading life list from IndexedDB:', error)
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
    } catch (error) {
      console.error('Error clearing life list:', error)
      throw error
    }
  }

  const importSpeciesList = async (speciesCodes: string[], comNames: string[]): Promise<{newCount: number, existingCount: number}> => {
    try {
      const db = await getDB()
      const existingCodes = new Set(seenSpecies)

      const tx = db.transaction(STORE_NAME, 'readwrite')
      // Fire all puts without awaiting each — much faster for bulk imports
      for (let i = 0; i < speciesCodes.length; i++) {
        tx.store.put({
          speciesCode: speciesCodes[i],
          comName: comNames[i],
          dateAdded: Date.now(),
          source: 'import' as const,
        })
      }
      await tx.done

      const allEntries = await db.getAll(STORE_NAME)
      const codes = new Set(allEntries.map(entry => entry.speciesCode))
      setSeenSpecies(codes)

      let newCount = 0
      let existingCount = 0
      for (const code of speciesCodes) {
        if (existingCodes.has(code)) {
          existingCount++
        } else {
          newCount++
        }
      }
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
    effectiveSeenSpecies: tripUnion ?? seenSpecies,
    tripUnion,
    setTripUnion,
    activeTripName,
    setActiveTripName,
    activeTripMemberCount,
    setActiveTripMemberCount,
    tripMemberLists,
    setTripMemberLists,
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
