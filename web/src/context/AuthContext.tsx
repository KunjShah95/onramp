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
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  fetchSignInMethodsForEmail,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'
import { authRegister, authMe, setAuthToken, listTeams } from '../lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /** The auth provider used by this account (from backend) */
  authMethod: 'password' | 'google.com' | 'github.com' | null
  role: 'owner' | 'senior' | 'member' | null
  activeTeamId: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  registerWithGoogle: () => Promise<void>
  loginWithGithub: () => Promise<void>
  registerWithGithub: () => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
  getIdToken: () => Promise<string | null>
  switchTeam: (teamId: string) => Promise<void>
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROVIDER_MISMATCH = 'account-exists-with-different-credential'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    authMethod: null,
    role: null,
    activeTeamId: null,
  })

  /** Register the Firebase user in the backend storage */
  const syncToBackend = useCallback(async (provider: 'google.com' | 'github.com' | 'password') => {
    const auth = getFirebaseAuth()
    const currentUser = auth.currentUser
    if (!currentUser) return

    const idToken = await currentUser.getIdToken()
    try {
      const resp = await authRegister(idToken, provider)
      setState((prev) => ({ ...prev, authMethod: resp.provider as 'google.com' | 'github.com' | 'password' }))
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        const msg = err.message.includes('google.com')
          ? 'This email is registered with Google. Please sign in with Google.'
          : err.message.includes('github.com')
          ? 'This email is registered with GitHub. Please sign in with GitHub.'
          : 'This email is registered with email/password. Please sign in with your password.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        // Sign out the Firebase user to prevent partial state
        await signOut(auth)
        throw new Error(msg)
      }
    }
  }, [])

  useEffect(() => {
    const auth = getFirebaseAuth()
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (user) {
          // Set the ID token in api.ts for all subsequent API calls.
          // Firebase auto-refreshes tokens; onAuthStateChanged fires on refresh.
          const idToken = await user.getIdToken()
          setAuthToken(idToken)

          setState((prev) => ({
            ...prev,
            user,
            loading: true,
            error: null,
            authMethod: null,
            role: null,
            activeTeamId: null,
          }))

          // Silently sync to backend in background
          try {
            const me = await authMe(idToken)
            let resolvedRole: 'owner' | 'senior' | 'member' | null = null
            let resolvedTeamId: string | null = null

            try {
              const teamsData = await listTeams('current-user')
              if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
                 const activeTeam = teamsData.teams[0]
                 resolvedTeamId = activeTeam.team_id
                 resolvedRole = ((activeTeam as any).role as 'owner' | 'senior' | 'member') || 'member'
              }
            } catch {
              // Failed to load teams, fallback to member
              resolvedRole = 'member'
            }

            setState((prev) => ({
              ...prev,
              loading: false,
              authMethod: me.provider as 'google.com' | 'github.com' | 'password',
              role: resolvedRole,
              activeTeamId: resolvedTeamId,
            }))
          } catch {
            // Backend may not be reachable — that's OK for offline dev
            setState((prev) => ({
              ...prev,
              loading: false,
              role: 'member',
            }))
          }
        } else {
          setAuthToken(null)
          setState({
            user: null,
            loading: false,
            error: null,
            authMethod: null,
            role: null,
            activeTeamId: null,
          })
        }
      },
      (error) => {
        setState({
          user: null,
          loading: false,
          error: error.message,
          authMethod: null,
          role: null,
          activeTeamId: null,
        })
      }
    )
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Email/Password Login ───────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      // Check provider before attempting login
      const auth = getFirebaseAuth()
      const methods = await fetchSignInMethodsForEmail(auth, email)

      if (methods.length > 0 && methods.includes('google.com') && !methods.includes('password')) {
        const msg = 'This email uses Google sign-in. Please use "Continue with Google" instead.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }

      await signInWithEmailAndPassword(auth, email, password)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes(PROVIDER_MISMATCH)) {
        const msg = 'This email is registered with Google. Please use "Continue with Google".'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'Login failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [])

  // ─── Email/Password Register ────────────────────────────────────────────

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const auth = getFirebaseAuth()
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(credential.user, { displayName: name })
        await syncToBackend('password')
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? mapFirebaseError(err.message)
            : 'Registration failed'
        setState((prev) => ({ ...prev, error: message, loading: false }))
        throw new Error(message)
      }
    },
    [syncToBackend]
  )

  // ─── Google OAuth ───────────────────────────────────────────────────────

  const loginWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const auth = getFirebaseAuth()
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
      await syncToBackend('google.com')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes(PROVIDER_MISMATCH)) {
        const msg = 'This email is registered with email/password. Please sign in with your password.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'Google sign-in failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  const registerWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const auth = getFirebaseAuth()
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
      await syncToBackend('google.com')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes(PROVIDER_MISMATCH)) {
        const msg = 'This email is registered with email/password. Please sign in with your password.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'Google sign-up failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  // ─── GitHub OAuth ───────────────────────────────────────────────────────

  const loginWithGithub = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const auth = getFirebaseAuth()
      const provider = new GithubAuthProvider()
      provider.setCustomParameters({ allow_signup: 'false' })
      await signInWithPopup(auth, provider)
      await syncToBackend('github.com')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes(PROVIDER_MISMATCH)) {
        const msg = 'This email is registered with a different sign-in method. Please use that method instead.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'GitHub sign-in failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  const registerWithGithub = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const auth = getFirebaseAuth()
      const provider = new GithubAuthProvider()
      await signInWithPopup(auth, provider)
      await syncToBackend('github.com')
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes(PROVIDER_MISMATCH)) {
        const msg = 'This email is registered with a different sign-in method. Please use that method instead.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        throw new Error(msg)
      }
      const message =
        err instanceof Error ? mapFirebaseError(err.message) : 'GitHub sign-up failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  // ─── Logout ─────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    const auth = getFirebaseAuth()
    await signOut(auth)
    setState({
      user: null,
      loading: false,
      error: null,
      authMethod: null,
      role: null,
      activeTeamId: null,
    })
  }, [])

  const switchTeam = useCallback(async (teamId: string) => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      const teamsData = await listTeams('current-user')
      const targetTeam = teamsData.teams.find(
        (t) => t.team_id === teamId
      )
      if (targetTeam) {
        setState((prev) => ({
          ...prev,
          loading: false,
          activeTeamId: teamId,
          role: ((targetTeam as any).role as 'owner' | 'senior' | 'member') || 'member',
        }))
      } else {
        setState((prev) => ({ ...prev, loading: false }))
      }
    } catch (err: any) {
      setState((prev) => ({ ...prev, loading: false, error: err.message || 'Failed to switch team' }))
    }
  }, [])

  const refreshRole = useCallback(async () => {
    try {
      const teamsData = await listTeams('current-user')
      setState((prev) => {
        if (prev.activeTeamId) {
          const targetTeam = teamsData.teams.find(
            (t) => t.team_id === prev.activeTeamId
          )
          if (targetTeam) {
            return {
              ...prev,
              role: ((targetTeam as any).role as 'owner' | 'senior' | 'member') || 'member',
            }
          }
        }
        if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
          const activeTeam = teamsData.teams[0]
          return {
            ...prev,
            activeTeamId: activeTeam.team_id,
            role: ((activeTeam as any).role as 'owner' | 'senior' | 'member') || 'member',
          }
        }
        return {
          ...prev,
          role: null,
          activeTeamId: null,
        }
      })
    } catch {
      // Ignore
    }
  }, [])

  // ─── Password Reset ─────────────────────────────────────────────────────

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

  // ─── Helpers ────────────────────────────────────────────────────────────

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  const getIdToken = useCallback(async (): Promise<string | null> => {
    const auth = getFirebaseAuth()
    const user = auth.currentUser
    if (!user) return null
    try {
      return await user.getIdToken()
    } catch {
      return null
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        loginWithGoogle,
        registerWithGoogle,
        loginWithGithub,
        registerWithGithub,
        logout,
        resetPassword,
        clearError,
        getIdToken,
        switchTeam,
        refreshRole,
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
  if (message.includes('auth/popup-closed-by-user')) return 'Sign-in popup was closed'
  if (message.includes('auth/cancelled-popup-request')) return 'Sign-in was cancelled'
  if (message.includes('auth/popup-blocked')) return 'Pop-up was blocked by your browser'
  return message.replace(/^Firebase: /, '').replace(/ \(auth\/.*\)\.?$/, '')
}
