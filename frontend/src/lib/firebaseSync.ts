import { doc, setDoc, getDoc, collection, query, where, getDocs, orderBy, limit as firestoreLimit, serverTimestamp, getCountFromServer } from 'firebase/firestore'
import { db } from './firebase'

export interface UserStats {
  speciesCount: number
  groupsCompleted: number
  groupsStarted: number
  currentStreak: number
  longestStreak: number
}

export interface LeaderboardEntry {
  uid: string
  displayName: string
  stats: UserStats
}

/** Sync aggregate stats to Firestore (does NOT sync the full life list) */
export async function syncUserStats(uid: string, stats: UserStats): Promise<void> {
  const userRef = doc(db, 'users', uid)
  await setDoc(userRef, {
    stats,
    lastSyncedAt: serverTimestamp(),
  }, { merge: true })
}

/** Get the global leaderboard (top N users by species count) */
export async function fetchLeaderboard(topN: number = 10): Promise<LeaderboardEntry[]> {
  const usersRef = collection(db, 'users')
  const q = query(usersRef, orderBy('stats.speciesCount', 'desc'), firestoreLimit(topN))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(docSnap => ({
    uid: docSnap.id,
    displayName: docSnap.data().displayName || 'Anonymous',
    stats: docSnap.data().stats || { speciesCount: 0, groupsCompleted: 0, groupsStarted: 0, currentStreak: 0, longestStreak: 0 },
  }))
}

/** Get leaderboard for specific friend UIDs */
export async function fetchFriendLeaderboard(friendUids: string[]): Promise<LeaderboardEntry[]> {
  if (friendUids.length === 0) return []

  // Firestore 'in' queries support up to 30 values
  const batches: string[][] = []
  for (let i = 0; i < friendUids.length; i += 30) {
    batches.push(friendUids.slice(i, i + 30))
  }

  const results: LeaderboardEntry[] = []
  for (const batch of batches) {
    const usersRef = collection(db, 'users')
    const q = query(usersRef, where('__name__', 'in', batch))
    const snapshot = await getDocs(q)
    for (const docSnap of snapshot.docs) {
      results.push({
        uid: docSnap.id,
        displayName: docSnap.data().displayName || 'Anonymous',
        stats: docSnap.data().stats || { speciesCount: 0, groupsCompleted: 0, groupsStarted: 0, currentStreak: 0, longestStreak: 0 },
      })
    }
  }

  return results.sort((a, b) => b.stats.speciesCount - a.stats.speciesCount)
}

/** Get the user's global rank and total user count */
export async function fetchGlobalRank(userSpeciesCount: number): Promise<{ rank: number; total: number }> {
  const usersRef = collection(db, 'users')
  // Count users with more species than the current user
  const aheadQuery = query(usersRef, where('stats.speciesCount', '>', userSpeciesCount))
  const [aheadSnap, totalSnap] = await Promise.all([
    getCountFromServer(aheadQuery),
    getCountFromServer(query(usersRef)),
  ])
  return {
    rank: aheadSnap.data().count + 1,
    total: totalSnap.data().count,
  }
}

/** Get a single user's profile */
export async function fetchUserProfile(uid: string): Promise<{ displayName: string; stats: UserStats; friendCode: string } | null> {
  const userRef = doc(db, 'users', uid)
  const snap = await getDoc(userRef)
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    displayName: data.displayName || 'Anonymous',
    stats: data.stats || { speciesCount: 0, groupsCompleted: 0, groupsStarted: 0, currentStreak: 0, longestStreak: 0 },
    friendCode: data.friendCode || '',
  }
}

/** Look up a user by friend code */
export async function findUserByFriendCode(code: string): Promise<{ uid: string; displayName: string } | null> {
  const usersRef = collection(db, 'users')
  const q = query(usersRef, where('friendCode', '==', code.toUpperCase()))
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  const docSnap = snapshot.docs[0]
  return { uid: docSnap.id, displayName: docSnap.data().displayName }
}

/** Get current user's friend code from Firestore */
export async function getFriendCode(uid: string): Promise<string | null> {
  const userRef = doc(db, 'users', uid)
  const snap = await getDoc(userRef)
  return snap.exists() ? snap.data().friendCode : null
}
