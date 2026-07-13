import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { cn } from '../lib/utils'

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

export interface PromiseToastOptions<T = unknown> {
  loading: string | { title: string; message?: string }
  success: string | { title: string; message?: string } | ((data: T) => { title: string; message?: string })
  error: string | { title: string; message?: string } | ((err: unknown) => { title: string; message?: string })
}

interface ToastContextValue {
  toasts: Toast[]
  toast: (type: ToastType, title: string, message?: string, duration?: number) => void
  dismissToast: (id: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  promise: <T>(promise: Promise<T> | (() => Promise<T>), opts: PromiseToastOptions<T>) => Promise<T>
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastCounter = 0  // Exit animation duration (must match CSS animation-duration for toast-exit)
  const EXIT_DURATION = 200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [exiting, setExiting] = useState<Set<string>>(new Set())

  const dismissToast = useCallback((id: string) => {
    // Start exit animation
    setExiting((prev) => new Set(prev).add(id))
    // Remove from state after animation completes
    setTimeout(() => {
      setExiting((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, EXIT_DURATION)
  }, [])

  const addToast = useCallback((type: ToastType, title: string, message?: string, duration = 4000) => {
    const id = `toast-${++toastCounter}`
    const toast: Toast = { id, type, title, message, duration }
    setToasts((prev) => [...prev, toast])
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration)
    }
  }, [dismissToast])

  const toast = useCallback((type: ToastType, title: string, message?: string, duration?: number) => {
    addToast(type, title, message, duration)
  }, [addToast])

  const success = useCallback((title: string, message?: string) => addToast('success', title, message), [addToast])
  const error = useCallback((title: string, message?: string) => addToast('error', title, message, 6000), [addToast])
  const info = useCallback((title: string, message?: string) => addToast('info', title, message), [addToast])
  const warning = useCallback((title: string, message?: string) => addToast('warning', title, message, 5000), [addToast])

  const promise = useCallback(<T,>(
    promiseOrFn: Promise<T> | (() => Promise<T>),
    opts: PromiseToastOptions<T>
  ): Promise<T> => {
    let promise: Promise<T>
    try {
      promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn
    } catch (e) {
      const errorOpt = typeof opts.error === 'function'
        ? (opts.error as (err: unknown) => { title: string; message?: string })(e)
        : typeof opts.error === 'string'
          ? { title: opts.error, message: undefined }
          : opts.error
      addToast('error', errorOpt.title, errorOpt.message, 6000)
      throw e
    }

    const loadingOpt = typeof opts.loading === 'string'
      ? { title: opts.loading, message: undefined }
      : opts.loading

    const loadingId = `toast-${++toastCounter}`
    const loadingToast: Toast = { id: loadingId, type: 'loading', title: loadingOpt.title, message: loadingOpt.message, duration: 0 }
    setToasts((prev) => [...prev, loadingToast])

    const resolveLoading = (result: T) => {
      const successOpt = typeof opts.success === 'function'
        ? (opts.success as (data: T) => { title: string; message?: string })(result)
        : typeof opts.success === 'string'
          ? { title: opts.success, message: undefined }
          : opts.success

      setToasts((prev) => prev.map((t) =>
        t.id === loadingId
          ? { ...t, type: 'success' as ToastType, title: successOpt.title, message: successOpt.message, duration: 4000 }
          : t
      ))
      setTimeout(() => dismissToast(loadingId), 4000)
    }

    const rejectLoading = (err: unknown) => {
      const errorOpt = typeof opts.error === 'function'
        ? (opts.error as (err: unknown) => { title: string; message?: string })(err)
        : typeof opts.error === 'string'
          ? { title: opts.error, message: undefined }
          : opts.error

      setToasts((prev) => prev.map((t) =>
        t.id === loadingId
          ? { ...t, type: 'error' as ToastType, title: errorOpt.title, message: errorOpt.message, duration: 6000 }
          : t
      ))
      setTimeout(() => dismissToast(loadingId), 6000)
    }

    promise.then(resolveLoading, rejectLoading)

    return promise
  }, [addToast, dismissToast])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismissToast, success, error, info, warning, promise }}>
      {children}
      <ToastContainer toasts={toasts} exiting={exiting} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// ─── Toast Container ───────────────────────────────────────────────────

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconBg: string; iconColor: string }> = {
  success: {
    bg: 'bg-[#0D1F11]',
    border: 'border-green-500/25',
    icon: 'check_circle',
    iconBg: 'bg-green-500/15',
    iconColor: 'text-green-400',
  },
  error: {
    bg: 'bg-[#1F0D0D]',
    border: 'border-red-500/25',
    icon: 'error',
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
  },
  info: {
    bg: 'bg-[#0D1420]',
    border: 'border-[#4DA8DA]/25',
    icon: 'info',
    iconBg: 'bg-[#4DA8DA]/15',
    iconColor: 'text-[#4DA8DA]',
  },
  warning: {
    bg: 'bg-[#1F180D]',
    border: 'border-yellow-500/25',
    icon: 'warning',
    iconBg: 'bg-yellow-500/15',
    iconColor: 'text-yellow-400',
  },
  loading: {
    bg: 'bg-[#14100C]',
    border: 'border-[#FF8C00]/25',
    icon: 'loading',
    iconBg: 'bg-[#FF8C00]/15',
    iconColor: 'text-[#FF8C00]',
  },
}

function ToastContainer({
  toasts,
  exiting,
  onDismiss,
}: {
  toasts: Toast[]
  exiting: Set<string>
  onDismiss: (id: string) => void
}) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col-reverse gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const style = TYPE_STYLES[t.type]
        const isExiting = exiting.has(t.id)
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-xl border p-4 shadow-2xl backdrop-blur-xl',
              style.bg,
              style.border,
              isExiting ? 'toast-exit' : 'toast-enter'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', style.iconBg)}>
                {t.type === 'loading' ? (
                  <svg className="w-4 h-4 animate-spin text-[#FF8C00]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <span className={cn('material-symbols-outlined text-sm', style.iconColor)}>{style.icon}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-[#FDFBF8]">{t.title}</p>
                {t.message && (
                  <p className="text-xs text-[#FDFBF8]/50 mt-0.5 leading-relaxed">{t.message}</p>
                )}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="text-[#FDFBF8]/20 hover:text-[#FDFBF8]/60 transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
