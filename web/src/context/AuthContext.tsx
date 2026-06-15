import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setState({ user, loading: false, error: null })
      },
      (error) => {
        setState({ user: null, loading: false, error: error.message })
      }
    )
    return unsubscribe
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const auth = getFirebaseAuth()
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'Login failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [])

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const auth = getFirebaseAuth()
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        )
        await updateProfile(credential.user, { displayName: name })
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? mapFirebaseError(err.message)
            : 'Registration failed'
        setState((prev) => ({ ...prev, error: message, loading: false }))
        throw new Error(message)
      }
    },
    []
  )

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth()
    await signOut(auth)
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const auth = getFirebaseAuth()
    try {
      await sendPasswordResetEmail(auth, email)
    } catch (err: unknown) {
      const message = err instanceof Error
        ? mapFirebaseError(err.message)
        : 'Failed to send reset email'
      throw new Error(message)
    }
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        resetPassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

function mapFirebaseError(message: string): string {
  if (message.includes('auth/user-not-found')) return 'No account found with this email'
  if (message.includes('auth/wrong-password')) return 'Incorrect password'
  if (message.includes('auth/invalid-credential')) return 'Invalid email or password'
  if (message.includes('auth/email-already-in-use')) return 'An account with this email already exists'
  if (message.includes('auth/weak-password')) return 'Password must be at least 6 characters'
  if (message.includes('auth/invalid-email')) return 'Invalid email address'
  if (message.includes('auth/too-many-requests')) return 'Too many attempts. Please try again later'
  if (message.includes('auth/network-request-failed')) return 'Network error. Check your connection'
  if (message.includes('auth/user-disabled')) return 'This account has been disabled'
  return message.replace(/^Firebase: /, '').replace(/ \(auth\/.*\)\.?$/, '')
}
