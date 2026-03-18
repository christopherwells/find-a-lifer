import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyAiAafT4pSkblLR6m0K5bKLuS6K3QvaySA',
  authDomain: 'find-a-lifer.firebaseapp.com',
  projectId: 'find-a-lifer',
  storageBucket: 'find-a-lifer.firebasestorage.app',
  messagingSenderId: '1085486899544',
  appId: '1:1085486899544:web:ea3580f54b82312529c52d',
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
