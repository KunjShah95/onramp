import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { getNotificationPreferences, updateNotificationPreferences } from '../lib/api'
import { useAuth } from './AuthContext'

interface RoastModeContextValue {
  enabled: boolean
  loading: boolean
  toggle: () => void
  setRoastMode: (on: boolean) => void
}

const RoastModeContext = createContext<RoastModeContextValue>({
  enabled: false,
  loading: true,
  toggle: () => {},
  setRoastMode: () => {},
})

export function RoastModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setEnabled(false)
      setLoading(false)
      return
    }
    setLoading(true)
    getNotificationPreferences()
      .then((prefs) => {
        setEnabled(prefs.roast_mode_enabled ?? false)
      })
      .catch(() => {
        setEnabled(false)
      })
      .finally(() => setLoading(false))
  }, [user])

  const setRoastMode = useCallback(
    (on: boolean) => {
      setEnabled(on)
      if (user) {
        updateNotificationPreferences({ roast_mode_enabled: on }).catch(() => {})
      }
    },
    [user],
  )

  const toggle = useCallback(() => {
    setRoastMode(!enabled)
  }, [enabled, setRoastMode])

  return (
    <RoastModeContext.Provider value={{ enabled, loading, toggle, setRoastMode }}>
      {children}
    </RoastModeContext.Provider>
  )
}

export function useRoastMode(): RoastModeContextValue {
  return useContext(RoastModeContext)
}
