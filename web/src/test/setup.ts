import '@testing-library/jest-dom'
import { vi } from 'vitest'

const mockUser = {
  uid: 'test-uid',
  email: 'test@example.com',
  displayName: 'Test User',
  getIdToken: vi.fn().mockResolvedValue('mock-token'),
}

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
    cb(null)
    return vi.fn()
  }),
  signInWithEmailAndPassword: vi.fn().mockResolvedValue({ user: mockUser }),
  createUserWithEmailAndPassword: vi.fn().mockResolvedValue({ user: mockUser }),
  signOut: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  signInWithPopup: vi.fn().mockResolvedValue({ user: mockUser }),
  fetchSignInMethodsForEmail: vi.fn().mockResolvedValue([]),
  GoogleAuthProvider: vi.fn().mockImplementation(() => ({
    setCustomParameters: vi.fn(),
  })),
  GithubAuthProvider: vi.fn().mockImplementation(() => ({
    setCustomParameters: vi.fn(),
  })),
  getAuth: vi.fn().mockReturnValue({ currentUser: null }),
  connectAuthEmulator: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({
  getFirebaseAuth: vi.fn(() => ({
    currentUser: null,
  })),
  getFirebaseDb: vi.fn(() => ({})),
}))
