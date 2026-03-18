import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim())
      throw err
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    setError(null)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(credential.user, { displayName })

      // Create user document in Firestore
      const userRef = doc(db, 'users', credential.user.uid)
      await setDoc(userRef, {
        displayName,
        email,
        createdAt: serverTimestamp(),
        friendCode: generateFriendCode(),
        stats: {
          speciesCount: 0,
          groupsCompleted: 0,
          groupsStarted: 0,
          currentStreak: 0,
          longestStreak: 0,
        },
        lastSyncedAt: serverTimestamp(),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign up failed'
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)/, '').trim())
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    await firebaseSignOut(auth)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signUp, signOut, clearError }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook must co-locate with Provider
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/** Generate a short 6-character friend code (uppercase alphanumeric) */
function generateFriendCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude ambiguous: 0/O, 1/I
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

/** Look up a user by friend code */
export async function findUserByFriendCode(code: string): Promise<{ uid: string; displayName: string } | null> {
  // Note: This requires a Firestore query. For now, we'll use a simple collection scan.
  // In production, you'd create a friendCodes collection for O(1) lookup.
  const { collection, query, where, getDocs } = await import('firebase/firestore')
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
