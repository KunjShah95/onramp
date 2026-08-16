import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export interface Shortcut {
  key: string
  description: string
  action: () => void
}

export type ShortcutEvent = {
  key: string
  description: string
} | null

const NAV_SHORTCUTS: { key: string; path: string; label: string; roles?: string[] }[] = [
  { key: 'd', path: '/dashboard', label: 'Dashboard', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 'p', path: '/my-progress', label: 'My Progress', roles: ['member', 'junior_dev'] },
  { key: 'r', path: '/reviews', label: 'Review Queue', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 't', path: '/tasks', label: 'Tasks' },
  { key: 'e', path: '/explore', label: 'Explore' },
  { key: 'a', path: '/ask', label: 'Ask Codebase' },
  { key: 'l', path: '/learn', label: 'Learn' },
  { key: 'x', path: '/first-issue', label: 'First Issue' },
  { key: 'n', path: '/notifications', label: 'Notifications' },
  { key: 's', path: '/settings', label: 'Settings' },
  { key: 'i', path: '/admin', label: 'Admin', roles: ['admin', 'ceo', 'cto'] },
  { key: 'c', path: '/code-health', label: 'Code Health', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 'm', path: '/team', label: 'Team', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 'k', path: '/api-keys', label: 'API Keys', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 'y', path: '/playbooks', label: 'Playbooks', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer'] },
  { key: 'o', path: '/developer-portal', label: 'Developer Portal', roles: ['admin', 'senior', 'ceo', 'cto', 'senior_dev', 'developer', 'tester'] },
  { key: 'w', path: '/wiki', label: 'Wiki' },
  { key: 'u', path: '/executive', label: 'Executive', roles: ['admin', 'ceo', 'cto'] },
  { key: 'v', path: '/dev-space', label: 'Dev Space', roles: ['developer', 'admin', 'ceo', 'cto', 'senior_dev', 'tester'] },
  { key: 'z', path: '/senior-space', label: 'Senior Space', roles: ['senior', 'senior_dev', 'developer', 'admin', 'ceo', 'cto'] },
]

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [showHelp, setShowHelp] = useState(false)
  const [lastShortcut, setLastShortcut] = useState<ShortcutEvent>(null)
  const bufferRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = NAV_SHORTCUTS.filter(s => !s.roles || (role && s.roles.includes(role)))

  const getShortcuts = useCallback((): Shortcut[] => {
    const navShortcuts: Shortcut[] = filtered.map(s => ({
      key: s.key,
      description: `Navigate to ${s.label}`,
      action: () => { navigate(s.path); setShowHelp(false) },
    }))

    return [
      { key: 'Escape', description: 'Close help / dismiss', action: () => setShowHelp(false) },
      { key: '?', description: 'Toggle this help panel', action: () => setShowHelp(prev => !prev) },
      { key: 'h', description: 'Go to landing page', action: () => navigate('/') },
      { key: 'b', description: 'Go to billing', action: () => navigate('/billing') },
      ...navShortcuts,
    ]
  }, [navigate, filtered])

  const flashShortcut = useCallback((key: string, description: string) => {
    setLastShortcut({ key, description })
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => setLastShortcut(null), 1500)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        if (e.key === 'Escape') {
          ;(e.target as HTMLElement).blur()
        }
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        setShowHelp(prev => !prev)
        flashShortcut('?', 'Toggle help')
        return
      }

      if (e.key === 'Escape') {
        setShowHelp(false)
        return
      }

      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        bufferRef.current = 'g'
        flashShortcut('g', 'Waiting for nav key…')
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => { bufferRef.current = ''; setLastShortcut(null) }, 1000)
        return
      }

      if (bufferRef.current === 'g') {
        const match = filtered.find(s => s.key === e.key)
        if (match) {
          e.preventDefault()
          bufferRef.current = ''
          flashShortcut(`g ${match.key}`, `Navigating to ${match.label}`)
          navigate(match.path)
          setShowHelp(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    }
  }, [navigate, filtered, flashShortcut])

  return { showHelp, setShowHelp, getShortcuts, lastShortcut }
}
