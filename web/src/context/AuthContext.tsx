import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { setToken, getToken } from '../lib/neon-auth'
import { authLogin, authRegister, authMe, listTeams } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date | string
  updatedAt: Date | string
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  authMethod: 'password' | null
  role: 'owner' | 'developer' | 'senior' | 'member' | null
  activeTeamId: string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  clearError: () => void
  getIdToken: () => string | null
  switchTeam: (teamId: string) => Promise<void>
  refreshRole: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(atob(parts[1]))
  } catch {
    return null
  }
}

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

  const syncRoleFromTeams = useCallback(async () => {
    try {
      const teamsData = await listTeams('current-user')
      if (teamsData?.teams?.length > 0) {
        const activeTeam = teamsData.teams[0]
        setState((prev) => ({
          ...prev,
          activeTeamId: (activeTeam as any).team_id || null,
          role: ((activeTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
        }))
      } else {
        setState((prev) => ({ ...prev, role: null, activeTeamId: null }))
      }
    } catch {
      setState((prev) => ({ ...prev, role: 'member' }))
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

        await syncRoleFromTeams()

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
      await syncRoleFromTeams()
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
        await syncRoleFromTeams()
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
            (t: any) => t.team_id === prev.activeTeamId
          )
          if (targetTeam) {
            return {
              ...prev,
              role: ((targetTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
            }
          }
        }
        if (teamsData?.teams?.length > 0) {
          const activeTeam = teamsData.teams[0]
          return {
            ...prev,
            activeTeamId: activeTeam.team_id,
            role: ((activeTeam as any).role as 'owner' | 'developer' | 'senior' | 'member') || 'member',
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

  const resetPassword = useCallback(async (_email: string) => {
    throw new Error('Password reset is not available. Contact your administrator.')
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
