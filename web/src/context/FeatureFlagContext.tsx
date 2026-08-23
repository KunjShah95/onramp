import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { listFeatureFlags, type FeatureFlag } from '../lib/api'
import { useAuth } from './AuthContext'

interface FeatureFlagContextValue {
  flags: FeatureFlag[]
  loading: boolean
  isEnabled: (flagName: string) => boolean
  refresh: () => Promise<void>
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: [],
  loading: true,
  isEnabled: () => false,
  refresh: async () => {},
})

export function FeatureFlagProvider({ children }: { children: ReactNode }) {
  const { activeTeamId } = useAuth()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!activeTeamId) {
      setFlags([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listFeatureFlags(activeTeamId)
      setFlags(data.flags ?? [])
    } catch (e) {
      console.warn('[FeatureFlags] fetch failed', e)
      setFlags([])
    }
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => {
    fetch()
  }, [fetch])

  const isEnabled = useCallback(
    (flagName: string): boolean => {
      const flag = flags.find((f) => f.flag_name === flagName)
      return flag?.enabled ?? false
    },
    [flags],
  )

  return (
    <FeatureFlagContext.Provider value={{ flags, loading, isEnabled, refresh: fetch }}>
      {children}
    </FeatureFlagContext.Provider>
  )
}

export function useFeatureFlag(flagName: string): boolean {
  const ctx = useContext(FeatureFlagContext)
  return ctx.isEnabled(flagName)
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext)
}
