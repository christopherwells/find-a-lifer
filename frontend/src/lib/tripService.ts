import {
  doc, setDoc, collection, query, where, getDocs, getDoc,
  serverTimestamp, writeBatch, deleteDoc, arrayUnion, arrayRemove, updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'

export interface Trip {
  id: string
  ownerUid: string
  name: string
  createdAt: string
  memberUids: string[]
}

export interface TripMember {
  uid: string
  displayName: string
  speciesCodes: string[]
  joinedAt: string
  lastSyncedAt: string
}

export interface TripInvite {
  id: string
  tripId: string
  tripName: string
  fromUid: string
  fromName: string
  toUid: string
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
}

const MAX_MEMBERS = 6

/** Create a new trip. Creator becomes first member. Returns tripId. */
export async function createTrip(
  uid: string, displayName: string, name: string, speciesCodes: string[]
): Promise<string> {
  const tripRef = doc(collection(db, 'trips'))
  const batch = writeBatch(db)

  batch.set(tripRef, {
    ownerUid: uid,
    name,
    createdAt: serverTimestamp(),
    memberUids: [uid],
  })

  batch.set(doc(db, 'trips', tripRef.id, 'members', uid), {
    displayName,
    speciesCodes,
    joinedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  })

  await batch.commit()
  return tripRef.id
}

/** Get a trip by ID */
export async function getTrip(tripId: string): Promise<Trip | null> {
  const snap = await getDoc(doc(db, 'trips', tripId))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    id: snap.id,
    ownerUid: d.ownerUid,
    name: d.name,
    createdAt: d.createdAt?.toDate?.()?.toISOString?.() ?? '',
    memberUids: d.memberUids || [],
  }
}

/** Get all trips for a user */
export async function getUserTrips(uid: string): Promise<Trip[]> {
  const q = query(collection(db, 'trips'), where('memberUids', 'array-contains', uid))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      ownerUid: data.ownerUid,
      name: data.name,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? '',
      memberUids: data.memberUids || [],
    }
  })
}

/** Get all members of a trip */
export async function getTripMembers(tripId: string): Promise<TripMember[]> {
  const snapshot = await getDocs(collection(db, 'trips', tripId, 'members'))
  return snapshot.docs.map(d => {
    const data = d.data()
    return {
      uid: d.id,
      displayName: data.displayName || 'Unknown',
      speciesCodes: data.speciesCodes || [],
      joinedAt: data.joinedAt || '',
      lastSyncedAt: data.lastSyncedAt || '',
    }
  })
}

/** Invite a friend to a trip */
export async function inviteToTrip(
  tripId: string, tripName: string, fromUid: string, fromName: string, toUid: string
): Promise<void> {
  // Check member cap
  const trip = await getTrip(tripId)
  if (!trip) throw new Error('Trip not found')
  if (trip.memberUids.length >= MAX_MEMBERS) throw new Error('Trip is full (max 6 members)')
  if (trip.memberUids.includes(toUid)) throw new Error('Already a member of this trip')

  // Check for existing pending invite (scoped to fromUid to satisfy security rules)
  const q = query(
    collection(db, 'tripInvites'),
    where('fromUid', '==', fromUid),
    where('tripId', '==', tripId),
    where('toUid', '==', toUid),
    where('status', '==', 'pending'),
  )
  const existing = await getDocs(q)
  if (!existing.empty) throw new Error('Invite already sent')

  const inviteRef = doc(collection(db, 'tripInvites'))
  await setDoc(inviteRef, {
    tripId,
    tripName,
    fromUid,
    fromName,
    toUid,
    status: 'pending',
    createdAt: serverTimestamp(),
  })
}

/** Get pending trip invites for a user */
export async function getPendingTripInvites(uid: string): Promise<TripInvite[]> {
  const q = query(
    collection(db, 'tripInvites'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() ?? '',
  })) as TripInvite[]
}

/** Accept a trip invite */
export async function acceptTripInvite(
  inviteId: string, tripId: string, uid: string, displayName: string, speciesCodes: string[]
): Promise<void> {
  // Verify trip exists and isn't full
  const trip = await getTrip(tripId)
  if (!trip) throw new Error('Trip not found')
  if (trip.memberUids.length >= MAX_MEMBERS) throw new Error('Trip is full')

  const batch = writeBatch(db)

  // Add member doc
  batch.set(doc(db, 'trips', tripId, 'members', uid), {
    displayName,
    speciesCodes,
    joinedAt: new Date().toISOString(),
    lastSyncedAt: new Date().toISOString(),
  })

  // Add uid to trip memberUids
  batch.update(doc(db, 'trips', tripId), {
    memberUids: arrayUnion(uid),
  })

  // Update invite status
  batch.update(doc(db, 'tripInvites', inviteId), {
    status: 'accepted',
  })

  await batch.commit()
}

/** Decline a trip invite */
export async function declineTripInvite(inviteId: string): Promise<void> {
  await updateDoc(doc(db, 'tripInvites', inviteId), { status: 'declined' })
}

/** Sync (update) a member's life list in a trip */
/** Rename a trip */
export async function renameTrip(tripId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'trips', tripId), { name })
}

export async function syncMemberList(
  tripId: string, uid: string, speciesCodes: string[]
): Promise<void> {
  await setDoc(doc(db, 'trips', tripId, 'members', uid), {
    speciesCodes,
    lastSyncedAt: new Date().toISOString(),
  }, { merge: true })
}

/** Leave a trip (non-owner) */
export async function leaveTrip(tripId: string, uid: string): Promise<void> {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'trips', tripId, 'members', uid))
  batch.update(doc(db, 'trips', tripId), {
    memberUids: arrayRemove(uid),
  })
  await batch.commit()
}

/** Remove a member from a trip (owner only) */
export async function removeTripMember(
  tripId: string, ownerUid: string, memberUid: string
): Promise<void> {
  const trip = await getTrip(tripId)
  if (!trip || trip.ownerUid !== ownerUid) throw new Error('Only the trip owner can remove members')

  const batch = writeBatch(db)
  batch.delete(doc(db, 'trips', tripId, 'members', memberUid))
  batch.update(doc(db, 'trips', tripId), {
    memberUids: arrayRemove(memberUid),
  })
  await batch.commit()
}

/** Delete a trip entirely (owner only) */
export async function deleteTrip(tripId: string, ownerUid: string): Promise<void> {
  const trip = await getTrip(tripId)
  if (!trip || trip.ownerUid !== ownerUid) throw new Error('Only the trip owner can delete the trip')

  // Delete all member docs first
  const membersSnap = await getDocs(collection(db, 'trips', tripId, 'members'))
  for (const memberDoc of membersSnap.docs) {
    await deleteDoc(memberDoc.ref)
  }

  // Delete the trip doc
  await deleteDoc(doc(db, 'trips', tripId))
}
