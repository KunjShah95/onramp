import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useWebSocket, type WsEvent } from '../hooks/useWebSocket'
import { useAuth } from './AuthContext'

interface RealTimeContextValue {
  connected: boolean
  /** Subscribe to real-time events. Returns unsubscribe function. */
  onEvent: (handler: (event: WsEvent) => void) => () => void
  /** Latest event received (for reactive UI updates). */
  lastEvent: WsEvent | null
  /** Manual reconnect trigger. */
  reconnect: () => void
}

const RealTimeContext = createContext<RealTimeContextValue>({
  connected: false,
  onEvent: () => () => {},
  lastEvent: null,
  reconnect: () => {},
})

export function RealTimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { connected, subscribe, lastEvent } = useWebSocket()
  const [handlers] = useState(new Set<(event: WsEvent) => void>())

  // Only subscribe to the global WebSocket when user is logged in
  const onEvent = useCallback(
    (handler: (event: WsEvent) => void): (() => void) => {
      handlers.add(handler)
      const unsub = subscribe(handler)
      return () => {
        handlers.delete(handler)
        unsub()
      }
    },
    [subscribe, handlers],
  )

  // If user changes (login/logout), the useWebSocket hook handles reconnection
  // via its internal token check

  return (
    <RealTimeContext.Provider
      value={{ connected, onEvent, lastEvent, reconnect: () => {} }}
    >
      {user ? children : children}
    </RealTimeContext.Provider>
  )
}

export function useRealTime(): RealTimeContextValue {
  return useContext(RealTimeContext)
}

/** Convenience hook: subscribe to notification events only. */
export function useWsNotifications() {
  const { onEvent } = useRealTime()
  const [notifications, setNotifications] = useState<Array<{
    notification_id: string
    type: string
    title: string
    message: string
  }>>([])

  useEffect(() => {
    const unsub = onEvent((event) => {
      if (event.type === 'notification' && event.event === 'new') {
        setNotifications((prev) => [event.notification, ...prev].slice(0, 50))
      }
    })
    return unsub
  }, [onEvent])

  return notifications
}

/** Convenience hook: subscribe to task update events only. */
export function useWsTaskUpdates() {
  const { onEvent } = useRealTime()
  const [taskUpdates, setTaskUpdates] = useState<Array<{
    task_id: string
    state: string
    title: string
    event: string
  }>>([])

  useEffect(() => {
    const unsub = onEvent((event) => {
      if (event.type === 'task_update') {
        setTaskUpdates((prev) => [{
          task_id: event.task.task_id,
          state: event.task.state,
          title: event.task.title,
          event: event.event,
        }, ...prev].slice(0, 50))
      }
    })
    return unsub
  }, [onEvent])

  return taskUpdates
}
