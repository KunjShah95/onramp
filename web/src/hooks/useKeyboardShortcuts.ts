import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export interface Shortcut {
  key: string
  description: string
  action: () => void
}

const NAV_SHORTCUTS: { key: string; path: string; label: string; roles?: string[] }[] = [
  { key: 'd', path: '/dashboard', label: 'Overview', roles: ['owner', 'senior', 'ceo', 'cto', 'senior_dev'] },
  { key: 'p', path: '/my-progress', label: 'My Progress', roles: ['member', 'new_dev'] },
  { key: 'r', path: '/reviews', label: 'Review Queue', roles: ['owner', 'senior', 'ceo', 'cto', 'senior_dev'] },
  { key: 't', path: '/tasks', label: 'Tasks' },
  { key: 'e', path: '/explore', label: 'Explore' },
  { key: 'a', path: '/ask', label: 'Ask Codebase' },
  { key: 'l', path: '/learn', label: 'Learn' },
  { key: 'x', path: '/first-issue', label: 'First Issue' },
  { key: 'n', path: '/notifications', label: 'Notifications' },
  { key: 's', path: '/settings', label: 'Settings' },
  { key: 'i', path: '/admin', label: 'Admin', roles: ['owner', 'ceo', 'cto'] },
  { key: 'c', path: '/code-health', label: 'Code Health', roles: ['owner', 'senior', 'ceo', 'cto', 'senior_dev'] },
]

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const [showHelp, setShowHelp] = useState(false)
  const bufferRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = NAV_SHORTCUTS.filter(s => !s.roles || (role && s.roles.includes(role)))

  const getShortcuts = useCallback((): Shortcut[] => {
    const navShortcuts: Shortcut[] = filtered.map(s => ({
      key: s.key,
      description: `Navigate to ${s.label}`,
      action: () => { navigate(s.path); setShowHelp(false) },
    }))

    return [
      { key: 'Escape', description: 'Close help / dismiss', action: () => setShowHelp(false) },
      { key: 'h', description: 'Go to landing page', action: () => navigate('/') },
      { key: 'b', description: 'Go to billing', action: () => navigate('/billing') },
      ...navShortcuts,
    ]
  }, [navigate, filtered])

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
        return
      }

      if (e.key === 'Escape') {
        setShowHelp(false)
        return
      }

      if (e.key === 'g' && !e.ctrlKey && !e.metaKey) {
        bufferRef.current = 'g'
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => { bufferRef.current = '' }, 1000)
        return
      }

      if (bufferRef.current === 'g') {
        const match = filtered.find(s => s.key === e.key)
        if (match) {
          e.preventDefault()
          bufferRef.current = ''
          navigate(match.path)
          setShowHelp(false)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [navigate, filtered])

  return { showHelp, setShowHelp, getShortcuts }
}
