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

const RECONNECT_DELAY = 5000
const TOKEN_POLL_MS = 2000

/**
 * Module-level singleton state — ONE WebSocket shared across every caller.
 *
 * The previous implementation created a fresh `WebSocket` per hook instance and
 * closed it on every unmount. Rapid mount/unmount churn (route changes, HMR,
 * providers remounting) meant sockets were being closed while still CONNECTING,
 * which browsers log as "WebSocket is closed before the connection is
 * established." — the console error this rewrite eliminates.
 *
 * A subscriber count gates the connection: the socket is created when the
 * first subscriber appears and torn down when the last one leaves. A light
 * token poll keeps the connection in sync with login/logout (the token can
 * change without any hook re-running).
 */

let socket: WebSocket | null = null
let socketToken: string | null = null
let subscribers = 0
let connectedFlag = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let tokenPollTimer: ReturnType<typeof setInterval> | null = null
let globalListeners = new Set<WsHandler>()
let lastGlobalEvent: WsEvent | null = null

// Hook instances subscribe here so module-level state changes re-render them.
const stateListeners = new Set<() => void>()

function emitState(): void {
  for (const listener of stateListeners) {
    try {
      listener()
    } catch {
      // Ignore subscriber render errors
    }
  }
}

function buildWsUrl(_token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // When the API base is relative (Vite proxy / same-origin reverse proxy),
  // connect to the page's own host. Otherwise use the API's host directly.
  const host = !API_BASE || API_BASE.startsWith('/')
    ? window.location.host
    : API_BASE.replace(/^https?:\/\//, '')
  return `${protocol}//${host}/api/v1/ws`
}

function notifyListeners(event: WsEvent): void {
  lastGlobalEvent = event
  for (const handler of globalListeners) {
    try {
      handler(event)
    } catch {
      // Silently handle subscriber errors
    }
  }
}

function clearTimers(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (tokenPollTimer) {
    clearInterval(tokenPollTimer)
    tokenPollTimer = null
  }
}

function teardownSocket(): void {
  clearTimers()
  const ws = socket
  socket = null
  socketToken = null
  if (!ws) return

  // Detach handlers first so the onclose handler can't schedule a reconnect
  // for a socket we're deliberately discarding.
  ws.onopen = null
  ws.onmessage = null
  ws.onerror = null
  ws.onclose = null

  // Only close() an established socket. Closing a CONNECTING socket makes the
  // browser log "WebSocket is closed before the connection is established."
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.close()
    } catch {
      // Already closing — nothing to do
    }
  }
  connectedFlag = false
  emitState()
}

function connect(): void {
  if (subscribers <= 0) return

  const token = getToken()
  if (socket) {
    // Token changed (login/logout) — recycle the connection with the new token.
    if (socketToken !== token) teardownSocket()
    else return
  }
  if (!token) {
    startTokenPolling()
    return
  }

  const url = buildWsUrl(token)
  const ws = new WebSocket(url, [`bearer ${token}`, token])
  socket = ws
  socketToken = token

  ws.onopen = () => {
    if (socket !== ws) return
    // Send auth as first message (preferred, avoids URL logging)
    try { ws.send(JSON.stringify({ type: 'auth', token })) } catch {}
    connectedFlag = true
    emitState()
  }

  ws.onmessage = (event) => {
    if (socket !== ws) return
    try {
      notifyListeners(JSON.parse(event.data) as WsEvent)
    } catch {
      // Ignore malformed messages
    }
  }

  ws.onclose = () => {
    if (socket !== ws) return
    socket = null
    socketToken = null
    connectedFlag = false
    emitState()
    if (subscribers > 0) {
      reconnectTimer = setTimeout(() => connect(), RECONNECT_DELAY)
    }
  }

  ws.onerror = () => {
    // onclose fires after this, which schedules reconnection
  }
}

function startTokenPolling(): void {
  if (tokenPollTimer) return
  tokenPollTimer = setInterval(() => {
    if (subscribers <= 0) {
      clearTimers()
      return
    }
    const token = getToken()
    if (!token) {
      if (socket) teardownSocket()
      return
    }
    if (!socket || socketToken !== token) connect()
  }, TOKEN_POLL_MS)
}

function ensureConnected(): void {
  if (socket || subscribers <= 0) return
  if (!getToken()) {
    startTokenPolling()
    return
  }
  connect()
}

function release(): void {
  subscribers = Math.max(0, subscribers - 1)
  if (subscribers === 0) {
    teardownSocket()
  }
}

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
  const [connected, setConnected] = useState(connectedFlag)
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(lastGlobalEvent)
  const stateRef = useRef({ connected, lastEvent })

  useEffect(() => {
    const onState = () => {
      // Only re-render when something actually changed — avoids wasted renders
      // from unrelated state transitions.
      const nextConnected = connectedFlag
      const nextLastEvent = lastGlobalEvent
      if (stateRef.current.connected !== nextConnected || stateRef.current.lastEvent !== nextLastEvent) {
        stateRef.current = { connected: nextConnected, lastEvent: nextLastEvent }
        setConnected(nextConnected)
        setLastEvent(nextLastEvent)
      }
    }
    stateListeners.add(onState)
    subscribers += 1
    ensureConnected()

    return () => {
      stateListeners.delete(onState)
      release()
    }
  }, [])

  const subscribe = useCallback((handler: WsHandler): (() => void) => {
    globalListeners.add(handler)

    return () => {
      globalListeners.delete(handler)
    }
  }, [])

  return { connected, subscribe, lastEvent }
}

// Clear module-level state on Vite HMR hot-replace so stale handler
// references from old component closures don't accumulate across reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    teardownSocket()
    subscribers = 0
    globalListeners.clear()
    lastGlobalEvent = null
  })
}