import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  const requestIdRef = useRef(0)

  const fetch = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!activeTeamId) {
      setFlags([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await listFeatureFlags(activeTeamId)
      if (requestId === requestIdRef.current) setFlags(data.flags ?? [])
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      console.warn('[FeatureFlags] fetch failed', e)
      setFlags([])
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [activeTeamId])

  useEffect(() => {
    void fetch()
    return () => {
      // Invalidate any in-flight response when the provider unmounts or the
      // active team changes before the request settles.
      requestIdRef.current++
    }
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
