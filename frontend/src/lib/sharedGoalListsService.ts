import { doc, setDoc, collection, query, where, getDocs, deleteDoc, onSnapshot, serverTimestamp, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

export interface SharedGoalList {
  id: string
  name: string
  speciesCodes: string[]
  ownerUid: string
  ownerName: string
  sharedWith: string[] // UIDs
  createdAt: string
  updatedAt: string
}

/** Share a goal list with friends */
export async function shareGoalList(
  uid: string,
  displayName: string,
  listName: string,
  speciesCodes: string[],
  friendUids: string[]
): Promise<string> {
  const listRef = doc(collection(db, 'sharedGoalLists'))
  await setDoc(listRef, {
    name: listName,
    speciesCodes,
    ownerUid: uid,
    ownerName: displayName,
    sharedWith: [...friendUids, uid], // Include self for read access
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return listRef.id
}

/** Get all shared goal lists visible to a user */
export async function getSharedWithMe(uid: string): Promise<SharedGoalList[]> {
  const listsRef = collection(db, 'sharedGoalLists')
  const q = query(listsRef, where('sharedWith', 'array-contains', uid))
  const snapshot = await getDocs(q)
  return snapshot.docs
    .map(d => ({ id: d.id, ...(d.data() as Omit<SharedGoalList, 'id'>) }))
    .filter(list => list.ownerUid !== uid) // Exclude own shared lists
}

/** Subscribe to real-time updates for shared lists */
export function subscribeToSharedLists(uid: string, callback: (lists: SharedGoalList[]) => void): Unsubscribe {
  const listsRef = collection(db, 'sharedGoalLists')
  const q = query(listsRef, where('sharedWith', 'array-contains', uid))
  return onSnapshot(q, (snapshot) => {
    const lists = snapshot.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<SharedGoalList, 'id'>) }))
      .filter(list => list.ownerUid !== uid)
    callback(lists)
  })
}

/** Update a shared goal list (owner only) */
export async function updateSharedGoalList(
  listId: string,
  speciesCodes: string[]
): Promise<void> {
  const listRef = doc(db, 'sharedGoalLists', listId)
  await setDoc(listRef, { speciesCodes, updatedAt: serverTimestamp() }, { merge: true })
}

/** Delete a shared goal list */
export async function deleteSharedGoalList(listId: string): Promise<void> {
  await deleteDoc(doc(db, 'sharedGoalLists', listId))
}
