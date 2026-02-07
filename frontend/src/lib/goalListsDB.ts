// IndexedDB utility for managing goal bird lists

export interface GoalList {
  id: string // UUID
  name: string
  speciesCodes: string[] // Array of eBird species codes
  createdAt: string // ISO date string
  updatedAt: string // ISO date string
}

const DB_NAME = 'find-a-lifer-db'
const DB_VERSION = 1
const STORE_NAME = 'goalLists'

// Open or create the database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      reject(new Error('Failed to open database'))
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        objectStore.createIndex('name', 'name', { unique: false })
        objectStore.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }
  })
}

// Get all goal lists
export async function getAllLists(): Promise<GoalList[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onerror = () => {
      reject(new Error('Failed to get goal lists'))
    }

    request.onsuccess = () => {
      resolve(request.result as GoalList[])
    }
  })
}

// Get a single goal list by ID
export async function getList(id: string): Promise<GoalList | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)

    request.onerror = () => {
      reject(new Error('Failed to get goal list'))
    }

    request.onsuccess = () => {
      resolve(request.result as GoalList | undefined)
    }
  })
}

// Save or update a goal list
export async function saveList(list: GoalList): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(list)

    request.onerror = () => {
      reject(new Error('Failed to save goal list'))
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

// Delete a goal list
export async function deleteList(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)

    request.onerror = () => {
      reject(new Error('Failed to delete goal list'))
    }

    request.onsuccess = () => {
      resolve()
    }
  })
}

// Add a species to a goal list
export async function addSpeciesToList(listId: string, speciesCode: string): Promise<void> {
  const list = await getList(listId)
  if (!list) {
    throw new Error('Goal list not found')
  }

  if (!list.speciesCodes.includes(speciesCode)) {
    list.speciesCodes.push(speciesCode)
    list.updatedAt = new Date().toISOString()
    await saveList(list)
  }
}

// Remove a species from a goal list
export async function removeSpeciesFromList(listId: string, speciesCode: string): Promise<void> {
  const list = await getList(listId)
  if (!list) {
    throw new Error('Goal list not found')
  }

  list.speciesCodes = list.speciesCodes.filter((code) => code !== speciesCode)
  list.updatedAt = new Date().toISOString()
  await saveList(list)
}

// Export all functions as a namespace
export const goalListsDB = {
  getAllLists,
  getList,
  saveList,
  deleteList,
  addSpeciesToList,
  removeSpeciesFromList
}
