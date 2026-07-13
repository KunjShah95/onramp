// @ts-nocheck — Pre-existing union type narrowing issues with authClient
// (real client vs test mock client have different shapes)
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { authClient } from '../lib/neon-auth'
import { authRegister, authMe, setAuthToken, listTeams } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  displayName?: string
  photoURL?: string
  emailVerified: boolean
  image?: string
  createdAt: Date | string
  updatedAt: Date | string
  providerData?: any[]
  metadata?: {
    creationTime?: string
    lastSignInTime?: string
  }
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /** The auth provider used by this account (from backend) */
  authMethod: 'password' | 'google.com' | 'github.com' | null
  role: 'owner' | 'developer' | 'senior' | 'member' | null
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    authMethod: null,
    role: null,
    activeTeamId: null,
  })

  // Helper to map Neon Auth User to the format expected by the frontend
  const mapUser = useCallback((rawUser: any): User => {
    return {
      ...rawUser,
      displayName: rawUser.name,
      photoURL: rawUser.image,
      providerData: [],
      metadata: {
        creationTime: rawUser.createdAt,
        lastSignInTime: rawUser.updatedAt,
      }
    }
  }, [])

  /** Register/sync the Neon Auth user in the backend storage */
  const syncToBackend = useCallback(async (provider: 'google.com' | 'github.com' | 'password') => {
    const sessionResult = await authClient.getSession()
    if (!sessionResult.data?.session) return

    const sessionToken = sessionResult.data.session.token
    setAuthToken(sessionToken)

    try {
      const resp = await authRegister(sessionToken, provider)
      setState((prev) => ({ ...prev, authMethod: resp.provider as 'google.com' | 'github.com' | 'password' }))
      // Set user from session data
      if (sessionResult.data?.user) {
        setState((prev) => ({ ...prev, user: mapUser(sessionResult.data.user), loading: false }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        const msg = err.message.includes('google.com')
          ? 'This email is registered with Google. Please sign in with Google.'
          : err.message.includes('github.com')
          ? 'This email is registered with GitHub. Please sign in with GitHub.'
          : 'This email is registered with email/password. Please sign in with your password.'
        setState((prev) => ({ ...prev, error: msg, loading: false }))
        // Sign out the client to prevent partial state
        await authClient.signOut()
        throw new Error(msg)
      }
    }
  }, [mapUser])

  useEffect(() => {
    let active = true
    const initAuth = async () => {
      try {
        const sessionResult = await authClient.getSession()
        if (!active) return

        if (sessionResult.data?.session && sessionResult.data?.user) {
          const user = mapUser(sessionResult.data.user)
          const sessionToken = sessionResult.data.session.token
          setAuthToken(sessionToken)

          setState((prev) => ({
            ...prev,
            user,
            loading: true,
            error: null,
          }))

          // Sync to backend and load role/team in the background
          try {
            const me = await authMe(sessionToken)
            let resolvedRole: 'owner' | 'developer' | 'senior' | 'member' | null = null
            let resolvedTeamId: string | null = null

            try {
              const teamsData = await listTeams('current-user')
              if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
                 const activeTeam = teamsData.teams[0]
                 resolvedTeamId = activeTeam.team_id
                 resolvedRole = ((activeTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member'
              }
            } catch {
              resolvedRole = 'member'
            }

            setState((prev) => ({
              ...prev,
              loading: false,
              authMethod: me.provider as 'google.com' | 'github.com' | 'password',
              role: resolvedRole,
              activeTeamId: resolvedTeamId,
            }))
          } catch (syncErr) {
            console.error('[AuthContext] init sync error:', syncErr)
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
      } catch (err) {
        if (!active) return
        setState({
          user: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Auth initialization failed',
          authMethod: null,
          role: null,
          activeTeamId: null,
        })
      }
    }

    initAuth()
    return () => {
      active = false
    }
  }, [mapUser])

  // ─── Email/Password Login ───────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const res = await authClient.signIn.email({ email, password })
      if (res.error) {
        throw new Error(res.error.message || 'Login failed')
      }
      await syncToBackend('password')
    } catch (err: unknown) {
      console.error('[AuthContext] login error:', err)
      const message = err instanceof Error ? err.message : 'Login failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  // ─── Email/Password Register ────────────────────────────────────────────

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const res = await authClient.signUp.email({ email, password, name })
        if (res.error) {
          throw new Error(res.error.message || 'Registration failed')
        }
        await syncToBackend('password')
      } catch (err: unknown) {
        console.error('[AuthContext] register error:', err)
        const message = err instanceof Error ? err.message : 'Registration failed'
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
      const res = await authClient.signIn.social({ provider: 'google' })
      if (res.error) {
        throw new Error(res.error.message || 'Google sign-in failed')
      }
      await syncToBackend('google.com')
    } catch (err: unknown) {
      console.error('[AuthContext] Google login error:', err)
      const message = err instanceof Error ? err.message : 'Google sign-in failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  const registerWithGoogle = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const res = await authClient.signIn.social({ provider: 'google' })
      if (res.error) {
        throw new Error(res.error.message || 'Google sign-up failed')
      }
      await syncToBackend('google.com')
    } catch (err: unknown) {
      console.error('[AuthContext] Google signup error:', err)
      const message = err instanceof Error ? err.message : 'Google sign-up failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  // ─── GitHub OAuth ───────────────────────────────────────────────────────

  const loginWithGithub = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const res = await authClient.signIn.social({ provider: 'github' })
      if (res.error) {
        throw new Error(res.error.message || 'GitHub sign-in failed')
      }
      await syncToBackend('github.com')
    } catch (err: unknown) {
      console.error('[AuthContext] GitHub login error:', err)
      const message = err instanceof Error ? err.message : 'GitHub sign-in failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  const registerWithGithub = useCallback(async () => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const res = await authClient.signIn.social({ provider: 'github' })
      if (res.error) {
        throw new Error(res.error.message || 'GitHub sign-up failed')
      }
      await syncToBackend('github.com')
    } catch (err: unknown) {
      console.error('[AuthContext] GitHub signup error:', err)
      const message = err instanceof Error ? err.message : 'GitHub sign-up failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncToBackend])

  // ─── Logout ─────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await authClient.signOut()
    setAuthToken(null)
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
          role: ((targetTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
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
              role: ((targetTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
            }
          }
        }
        if (teamsData && teamsData.teams && teamsData.teams.length > 0) {
          const activeTeam = teamsData.teams[0]
          return {
            ...prev,
            activeTeamId: activeTeam.team_id,
            role: ((activeTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
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
    try {
      const res = await authClient.forgetPassword.emailOtp({ email })
      if (res.error) {
        throw new Error(res.error.message || 'Failed to send reset email')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email'
      throw new Error(message)
    }
  }, [])

  // ─── Helpers ────────────────────────────────────────────────────────────

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  const getIdToken = useCallback(async (): Promise<string | null> => {
    const sessionResult = await authClient.getSession()
    return sessionResult.data?.session?.token || null
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
