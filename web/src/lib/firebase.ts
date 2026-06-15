import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  connectAuthEmulator,
  type Auth,
  type User,
} from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function validateConfig(): void {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length > 0) {
    console.warn(
      `Firebase: Missing config values: ${missing.join(', ')}. ` +
      'Set them in .env or .env.local. Auth features will not work.'
    )
  }
}

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    validateConfig()
    app = initializeApp(firebaseConfig)
  }
  return app
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp())

    // Connect to Firebase Auth emulator in development
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    }
  }
  return auth
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())

    // Connect to Firestore emulator in development
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      connectFirestoreEmulator(db, 'localhost', 8080)
    }
  }
  return db
}

// Re-export commonly used types
export type { User }
