import { doc, setDoc, getDoc, collection, query, where, getDocs, orderBy, limit, serverTimestamp } from 'firebase/firestore'
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
  const q = query(usersRef, orderBy('stats.speciesCount', 'desc'), limit(topN))
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
