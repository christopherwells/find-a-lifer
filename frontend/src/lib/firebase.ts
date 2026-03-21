import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyAiAafT4pSkblLR6m0K5bKLuS6K3QvaySA',
  authDomain: 'find-a-lifer.firebaseapp.com',
  projectId: 'find-a-lifer',
  storageBucket: 'find-a-lifer.firebasestorage.app',
  messagingSenderId: '1085486899544',
  appId: '1:1085486899544:web:ea3580f54b82312529c52d',
  measurementId: 'G-PLACEHOLDER', // TODO: replace with actual measurement ID from Firebase console
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

// Analytics — initialized lazily, only in supported environments
let analyticsInstance: Analytics | null = null

export async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (analyticsInstance) return analyticsInstance
  try {
    const supported = await isSupported()
    if (supported) {
      analyticsInstance = getAnalytics(app)
    }
  } catch {
    // Analytics not available (ad blockers, dev environment, etc.)
  }
  return analyticsInstance
}
