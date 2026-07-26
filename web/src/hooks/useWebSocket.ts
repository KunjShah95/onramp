import { useEffect, useRef, useCallback, useState } from 'react'
import { getToken } from '../lib/neon-auth'

const API_BASE = (() => {
  const url = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  return url.replace(/\/+$/, '').replace('/api/v1', '')
})()

export interface WsNotificationEvent {
  type: 'notification'
  event: 'new'
  notification: {
    notification_id: string
    type: string
    title: string
    message: string
    read: boolean
    created_at: string
    team_id?: string
    metadata?: Record<string, unknown>
  }
}

export interface WsTaskEvent {
  type: 'task_update'
  event: 'updated' | 'created' | 'deleted'
  task: {
    task_id: string
    team_id: string
    state: string
    title: string
    assigned_to?: string | null
    module?: string
  }
}

export type WsEvent = WsNotificationEvent | WsTaskEvent

type WsHandler = (event: WsEvent) => void

interface UseWebSocketReturn {
  connected: boolean
  subscribe: (handler: WsHandler) => () => void
  lastEvent: WsEvent | null
}

let globalListeners = new Set<WsHandler>()
let lastGlobalEvent: WsEvent | null = null

/**
 * Singleton WebSocket hook — shares one connection across the entire app.
 *
 * Usage:
 * ```tsx
 * const { connected, subscribe } = useWebSocket()
 * useEffect(() => {
 *   const unsub = subscribe((event) => {
 *     if (event.type === 'notification') { ... }
 *   })
 *   return unsub
 * }, [])
 * ```
 */
export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    const token = getToken()
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = API_BASE.replace(/^https?:\/\//, '')
    const url = `${protocol}//${host}/api/v1/ws?token=${encodeURIComponent(token)}`

    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        if (mountedRef.current) {
          setConnected(true)
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WsEvent
          lastGlobalEvent = data
          if (mountedRef.current) {
            setLastEvent(data)
          }
          // Notify all subscribers
          globalListeners.forEach((handler) => {
            try {
              handler(data)
            } catch {
              // Silently handle subscriber errors
            }
          })
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (mountedRef.current) {
          setConnected(false)
          // Auto-reconnect after 5 seconds
          if (reconnectRef.current) clearTimeout(reconnectRef.current)
          reconnectRef.current = setTimeout(() => {
            if (mountedRef.current) connect()
          }, 5000)
        }
      }

      ws.onerror = () => {
        // onclose will fire after this, handling reconnection
      }

      wsRef.current = ws
    } catch {
      // Connection failed, retry later
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect()
      }, 5000)
    }
  }, [])

  // Connect on mount, reconnect on token change
  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const subscribe = useCallback((handler: WsHandler): (() => void) => {
    globalListeners.add(handler)

    // If there's a last event, replay it to the new subscriber
    if (lastGlobalEvent) {
      try {
        handler(lastGlobalEvent)
      } catch {
        // Ignore
      }
    }

    return () => {
      globalListeners.delete(handler)
    }
  }, [])

  return { connected, subscribe, lastEvent }
}
