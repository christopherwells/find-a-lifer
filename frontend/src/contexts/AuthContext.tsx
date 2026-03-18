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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)

      // Ensure user document exists in Firestore (handles cases where signup
      // occurred before Firestore rules were deployed, or doc creation failed)
      if (firebaseUser) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(userRef)
          if (!snap.exists()) {
            await setDoc(userRef, {
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Birder',
              email: firebaseUser.email,
              createdAt: serverTimestamp(),
              friendCode: generateFriendCode(),
              stats: { speciesCount: 0, groupsCompleted: 0, groupsStarted: 0, currentStreak: 0, longestStreak: 0 },
              lastSyncedAt: serverTimestamp(),
            })
            console.log('Created missing Firestore user document')
          }
        } catch (err) {
          console.warn('Could not ensure user document:', err)
        }
      }
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

