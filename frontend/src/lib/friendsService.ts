import { doc, setDoc, collection, query, where, getDocs, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

export interface Friend {
  uid: string
  displayName: string
  since: string // ISO date
}

export interface FriendRequest {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

/** Get all friends for a user */
export async function getFriends(uid: string): Promise<Friend[]> {
  const friendsRef = collection(db, 'users', uid, 'friends')
  const snapshot = await getDocs(friendsRef)
  return snapshot.docs.map(d => ({
    uid: d.id,
    displayName: d.data().displayName || 'Unknown',
    since: d.data().since || '',
  }))
}

/** Get pending friend requests (incoming) */
export async function getPendingRequests(uid: string): Promise<FriendRequest[]> {
  const reqRef = collection(db, 'friendRequests')
  const q = query(reqRef, where('toUid', '==', uid), where('status', '==', 'pending'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
  })) as FriendRequest[]
}

/** Send a friend request */
export async function sendFriendRequest(fromUid: string, fromName: string, toUid: string): Promise<void> {
  // Check if already friends
  const existingFriend = await getDoc(doc(db, 'users', fromUid, 'friends', toUid))
  if (existingFriend.exists()) {
    throw new Error('Already friends with this user')
  }

  // Check for existing pending request
  const reqRef = collection(db, 'friendRequests')
  const q = query(reqRef, where('fromUid', '==', fromUid), where('toUid', '==', toUid), where('status', '==', 'pending'))
  const existing = await getDocs(q)
  if (!existing.empty) {
    throw new Error('Friend request already sent')
  }

  // Check for reverse pending request (they already sent us one)
  const reverseQ = query(reqRef, where('fromUid', '==', toUid), where('toUid', '==', fromUid), where('status', '==', 'pending'))
  const reverseExisting = await getDocs(reverseQ)
  if (!reverseExisting.empty) {
    // Auto-accept
    await acceptRequest(reverseExisting.docs[0].id, fromUid, fromName)
    return
  }

  const newReqRef = doc(collection(db, 'friendRequests'))
  await setDoc(newReqRef, {
    fromUid,
    fromName,
    toUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

/** Accept a friend request */
export async function acceptRequest(requestId: string, myUid: string, myName: string): Promise<void> {
  const reqRef = doc(db, 'friendRequests', requestId)
  const reqSnap = await getDoc(reqRef)
  if (!reqSnap.exists()) throw new Error('Request not found')

  const data = reqSnap.data()
  const now = new Date().toISOString()

  const batch = writeBatch(db)

  // Add friend to both users
  batch.set(doc(db, 'users', myUid, 'friends', data.fromUid), {
    displayName: data.fromName,
    since: now,
  })
  batch.set(doc(db, 'users', data.fromUid, 'friends', myUid), {
    displayName: myName,
    since: now,
  })

  // Update request status
  batch.update(reqRef, { status: 'accepted' })

  await batch.commit()
}

/** Reject a friend request */
export async function rejectRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, 'friendRequests', requestId)
  await setDoc(reqRef, { status: 'rejected' }, { merge: true })
}

/** Remove a friend */
export async function removeFriend(myUid: string, friendUid: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'users', myUid, 'friends', friendUid))
  batch.delete(doc(db, 'users', friendUid, 'friends', myUid))
  await batch.commit()
}
