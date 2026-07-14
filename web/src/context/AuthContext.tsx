import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { setToken, getToken } from '../lib/neon-auth'
import { authLogin, authRegister, authMe, listTeams, forgotPassword as apiForgotPassword } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  displayName?: string
  photoURL?: string
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
  role: 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member' | null
  activeTeamId: string | null
}

export type TeamRole = 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member'

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<{ ok: boolean; message: string }>
  clearError: () => void
  getIdToken: () => string | null
  switchTeam: (teamId: string) => Promise<void>
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapUser(raw: Record<string, unknown>): User {
  return {
    id: (raw.uid as string) || '',
    email: (raw.email as string) || '',
    name: (raw.name as string) || '',
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
          role: ((activeTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member') || 'new_dev',
        }))
      } else {
        setState((prev) => ({ ...prev, role: null, activeTeamId: null }))
      }
    } catch {
      setState((prev) => ({ ...prev, role: 'new_dev' }))
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
        setToken(null)
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

  const login = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, error: null, loading: true }))
    try {
      const resp = await authLogin(email, password)
      setToken(resp.token)
      setState((prev) => ({
        ...prev,
        user: mapUser({ uid: resp.uid, email: resp.email, name: resp.name }),
        authMethod: 'password',
        loading: true,
      }))
      await syncRoleFromTeams(resp.uid)
      setState((prev) => ({ ...prev, loading: false }))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setState((prev) => ({ ...prev, error: message, loading: false }))
      throw new Error(message)
    }
  }, [syncRoleFromTeams])

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setState((prev) => ({ ...prev, error: null, loading: true }))
      try {
        const resp = await authRegister(email, password, name)
        setToken(resp.token)
        setState((prev) => ({
          ...prev,
          user: mapUser({ uid: resp.uid, email: resp.email, name: resp.name }),
          authMethod: 'password',
          loading: true,
        }))
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
    setToken(null)
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
          role: ((targetTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member') || 'new_dev',
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
              ...prev,
              role: ((targetTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member') || 'new_dev',
            }
          }
        }
        if (teamsData?.teams?.length > 0) {
          const activeTeam = teamsData.teams[0]
          return {
            ...prev,
            activeTeamId: activeTeam.team_id,
            role: ((activeTeam as any).role as 'ceo' | 'cto' | 'senior_dev' | 'developer' | 'tester' | 'new_dev' | 'owner' | 'senior' | 'member') || 'new_dev',
          }
        }
        return { ...prev, role: null, activeTeamId: null }
      })
    } catch {
      // Ignore
    }
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
