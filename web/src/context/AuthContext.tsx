import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { setToken, setRefreshToken, clearTokens, getToken } from '../lib/neon-auth'
import { authLogin, authRegister, authMe, listTeams, forgotPassword as apiForgotPassword, refreshToken } from '../lib/api'
import { prefetchRoutes } from '../lib/prefetch'

interface User {
  id: string
  email: string
  name: string
  displayName?: string
  position?: string
  photoURL?: string
  githubUsername?: string
  emailVerified: boolean
  createdAt: Date | string
  updatedAt: Date | string
  metadata?: {
    creationTime?: string
    lastSignInTime?: string
  }
  providerData?: Array<{
    providerId: string
  }>
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  authMethod: 'password' | null
  role: 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr' | null
  activeTeamId: string | null
}

export type TeamRole = 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr'

/** Roles allowed to create & manage team API keys (Settings + Developer Portal). */
export const KEY_MANAGER_ROLES: TeamRole[] = ['ceo', 'cto', 'admin', 'senior', 'senior_dev', 'developer', 'tester']

/** Role-appropriate landing page after login/register. */
export function homeForRole(role: TeamRole | null | undefined): string {
  if (role === 'hr') return '/hr/people'
  if (role === 'junior_dev' || role === 'member') return '/my-progress'
  return '/dashboard'
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<{ ok: boolean; message: string }>
  clearError: () => void
  getIdToken: () => string | null
  switchTeam: (teamId: string) => Promise<void>
  refreshRole: () => Promise<void>
  updateUser: (user: Partial<User>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: (raw.uid as string) || '',
    email: (raw.email as string) || '',
    name: (raw.name as string) || '',
    displayName: (raw.name as string) || '',
    position: (raw.position as string) || undefined,
    photoURL: (raw.avatar_url as string) || undefined,
    githubUsername: (raw.github_username as string) || undefined,
    emailVerified: true,
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
    authMethod: null,
    role: null,
    activeTeamId: null,
  })

  const syncRoleFromTeams = useCallback(async (uid?: string) => {
    try {
      const teamsData = await listTeams(uid || 'current-user')
      if (teamsData?.teams?.length > 0) {
        const activeTeam = teamsData.teams[0]
        setState((prev) => ({
          ...prev,
          activeTeamId: (activeTeam as any).team_id || null,
             role: ((activeTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr') || 'junior_dev',
        }))
      } else {
        setState((prev) => ({ ...prev, role: null, activeTeamId: null }))
      }
    } catch {
      setState((prev) => ({ ...prev, role: 'junior_dev' }))
    }
  }, [])

  useEffect(() => {
    let active = true
    const initAuth = async () => {
      const storedToken = getToken()
      if (!storedToken) {
        if (active) setState((prev) => ({ ...prev, loading: false }))
        return
      }

      try {
        const me = await authMe()
        if (!active) return

        setState((prev) => ({
          ...prev,
          user: mapUser(me as unknown as Record<string, unknown>),
          authMethod: 'password',
          loading: true,
        }))

        await syncRoleFromTeams(me?.uid)

        if (active) {
          setState((prev) => ({ ...prev, loading: false }))
        }
      } catch {
        clearTokens()
        if (active) {
          setState({
            user: null,
            loading: false,
            error: null,
            authMethod: null,
            role: null,
            activeTeamId: null,
          })
        }
      }
    }

    initAuth()
    return () => { active = false }
  }, [syncRoleFromTeams])

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const resp = await authLogin(email, password, rememberMe)
      setToken(resp.token, rememberMe)
      if (resp.refresh_token) setRefreshToken(resp.refresh_token)
      setState((prev) => ({
        ...prev,
        user: mapUser({ uid: resp.uid, email: resp.email, name: resp.name }),
        authMethod: 'password',
        loading: true,
      }))
      // Warm the cache for the pages the redirect is about to land on.
      prefetchRoutes(['/dashboard', '/my-progress', '/hr/people', '/explore', '/ask', '/tasks'])
      await syncRoleFromTeams(resp.uid)
      setState((prev) => ({ ...prev, loading: false }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncRoleFromTeams])

  // Auto-refresh token periodically (every 4 hours) if user is signed in.
  // Depend on uid (not the full user object) so updateUser() patch calls
  // don't reset the interval — only login/logout should restart it.
  const userId = state.user?.id ?? null
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(async () => {
      try {
        const resp = await refreshToken()
        setToken(resp.token)
        if (resp.refresh_token) setRefreshToken(resp.refresh_token)
      } catch {
        // Silent — next 401 will redirect to login
      }
    }, 4 * 60 * 60 * 1000) // 4 hours
    return () => clearInterval(interval)
  }, [userId])

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const resp = await authRegister(email, password, name)
        setToken(resp.token)
        if (resp.refresh_token) setRefreshToken(resp.refresh_token)
        setState((prev) => ({
          ...prev,
          user: mapUser({ uid: resp.uid, email: resp.email, name: resp.name }),
          authMethod: 'password',
          loading: true,
        }))
        // Warm the cache for the pages the redirect is about to land on.
        prefetchRoutes(['/dashboard', '/my-progress', '/hr/people', '/explore', '/ask', '/tasks'])
        await syncRoleFromTeams(resp.uid)
        setState((prev) => ({ ...prev, loading: false }))
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Registration failed'
        setState((prev) => ({ ...prev, error: message, loading: false }))
        throw new Error(message)
      }
    },
    [syncRoleFromTeams]
  )

  const logout = useCallback(async () => {
    clearTokens()
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
        (t: any) => t.team_id === teamId
      )
      if (targetTeam) {
        setState((prev) => ({
          ...prev,
          loading: false,
          activeTeamId: teamId,
               role: ((targetTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr') || 'junior_dev',
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
            (t: any) => t.team_id === prev.activeTeamId
          )
          if (targetTeam) {
            return {
              ...prev,           role: ((targetTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr') || 'junior_dev',
            }
          }
        }
        if (teamsData?.teams?.length > 0) {
          const activeTeam = teamsData.teams[0]
          return {
            ...prev,
            activeTeamId: activeTeam.team_id,           role: ((activeTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'junior_dev' | 'admin' | 'senior' | 'member' | 'hr') || 'junior_dev',
          }
        }
        return { ...prev, role: null, activeTeamId: null }
      })
    } catch {
      // Ignore
    }
  }, [])

  const updateUser = useCallback((patch: Partial<User>) => {
    setState((prev) => (prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev))
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  const getIdToken = useCallback((): string | null => {
    return getToken()
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    setState((prev) => ({ ...prev, error: null }))
    try {
      const resp = await apiForgotPassword(email)
      return resp
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email'
      setState((prev) => ({ ...prev, error: message }))
      throw new Error(message)
    }
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
        getIdToken,
        switchTeam,
        refreshRole,
        updateUser,
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
