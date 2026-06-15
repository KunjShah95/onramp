import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'

interface TransitionState {
  isTransitioning: boolean
}

interface TransitionContextValue extends TransitionState {}

const TransitionContext = createContext<TransitionContextValue | null>(null)

const MIN_DISPLAY_MS = 300
const SWITCH_THRESHOLD_MS = 80

export function TransitionProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const pathRef = useRef(location.pathname)
  const isFirstRender = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Skip the initial mount — no transition on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      pathRef.current = location.pathname
      return
    }

    const prevPath = pathRef.current
    pathRef.current = location.pathname

    // Same path — no transition (e.g. search param change)
    if (prevPath === location.pathname) return

    // Clear any pending timers
    if (timerRef.current) clearTimeout(timerRef.current)
    if (endTimerRef.current) clearTimeout(endTimerRef.current)

    // Only show overlay if navigation takes longer than the threshold
    timerRef.current = setTimeout(() => {
      setIsTransitioning(true)
    }, SWITCH_THRESHOLD_MS)

    // Hide overlay after minimum display time
    endTimerRef.current = setTimeout(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setIsTransitioning(false)
    }, MIN_DISPLAY_MS + SWITCH_THRESHOLD_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (endTimerRef.current) clearTimeout(endTimerRef.current)
    }
  }, [location.pathname])

  return (
    <TransitionContext.Provider value={{ isTransitioning }}>
      {children}
    </TransitionContext.Provider>
  )
}

export function useTransition(): TransitionContextValue {
  const context = useContext(TransitionContext)
  if (!context) {
    throw new Error('useTransition must be used within a TransitionProvider')
  }
  return context
}
