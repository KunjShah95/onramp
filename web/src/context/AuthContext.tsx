import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { setWsToken, clearTokens, getWsToken } from '../lib/neon-auth'
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

function isSafeAvatarUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function mapUser(raw: Record<string, unknown>): User {
  const rawAvatar = (raw.avatar_url as string) || ''
  const safeAvatar = rawAvatar && isSafeAvatarUrl(rawAvatar) ? rawAvatar : undefined
  return {
    id: (raw.uid as string) || '',
    email: (raw.email as string) || '',
    name: (raw.name as string) || '',
    displayName: (raw.name as string) || '',
    position: (raw.position as string) || undefined,
    photoURL: safeAvatar,
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
      // On failure, keep the current role rather than silently downgrading.
      // The user will retain whatever role was previously set; the next
      // navigation or retry will attempt to sync again.
      console.warn('[Auth] Failed to sync role from teams — keeping current role')
    }
  }, [])

  useEffect(() => {
    let active = true
    const initAuth = async () => {
      // With cookie-based auth, we don't check for a stored token.
      // Instead, call /auth/me — the browser sends the HttpOnly cookie
      // automatically.  If the cookie is missing/expired, /me returns 401
      // and we fall through to the logged-out state.
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
        // No valid session cookie — user is logged out.
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
      // Backend sets HttpOnly cookies.  Store token in memory for WebSocket.
      setWsToken(resp.token)
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
    let pendingRefresh = false
    const doRefresh = async () => {
      try {
        const resp = await refreshToken()
        setWsToken(resp.token)
        pendingRefresh = false
      } catch {
        // Silent — next 401 will redirect to login
      }
    }
    const interval = setInterval(async () => {
      if (document.visibilityState === 'hidden') {
        pendingRefresh = true
        return
      }
      await doRefresh()
    }, 4 * 60 * 60 * 1000) // 4 hours
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && pendingRefresh) {
        pendingRefresh = false
        void doRefresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const resp = await authRegister(email, password, name)
        // Backend sets HttpOnly cookies.  Store token in memory for WebSocket.
        setWsToken(resp.token)
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
    try {
      await clearTokens()
    } catch {
      // Even if cookie-clear fails, proceed to clear local state
    }
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
    return getWsToken()
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
