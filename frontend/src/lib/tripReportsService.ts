import { doc, setDoc, deleteDoc, collection, query, where, getDocs, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

export interface TripReport {
  id: string
  title: string
  date: string // ISO date
  location: { name: string; coordinates?: [number, number] }
  speciesCodes: string[]
  highlights: string
  isPublic: boolean
  createdAt: string
  ownerUid: string
  ownerName: string
}

/** Create a new trip report */
export async function createTripReport(
  uid: string,
  displayName: string,
  data: Omit<TripReport, 'id' | 'createdAt' | 'ownerUid' | 'ownerName'>
): Promise<string> {
  const reportRef = doc(collection(db, 'users', uid, 'tripReports'))
  await setDoc(reportRef, {
    ...data,
    ownerUid: uid,
    ownerName: displayName,
    createdAt: serverTimestamp(),
  })
  return reportRef.id
}

/** Get all trip reports for a user */
export async function getMyReports(uid: string): Promise<TripReport[]> {
  const reportsRef = collection(db, 'users', uid, 'tripReports')
  const q = query(reportsRef, orderBy('date', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<TripReport, 'id'>),
  }))
}

/** Get a friend's public trip reports */
export async function getFriendReports(friendUid: string): Promise<TripReport[]> {
  const reportsRef = collection(db, 'users', friendUid, 'tripReports')
  const q = query(reportsRef, where('isPublic', '==', true), orderBy('date', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<TripReport, 'id'>),
  }))
}

/** Delete a trip report */
export async function deleteTripReport(uid: string, reportId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'tripReports', reportId))
}
