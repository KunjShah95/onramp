import { type ReactNode, useEffect, useRef } from 'react'
import { X } from '@phosphor-icons/react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !panelRef.current) return
      const els = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter((el) => el.offsetParent !== null)
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea, a[href]')
      ;(first ?? panelRef.current)?.focus?.()
    }, 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(t)
      prevFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-sheet backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`modal-enter bg-base border border-seam rounded-card w-full ${maxWidth} max-h-[85vh] overflow-y-auto shadow-overhead relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-seam sticky top-0 bg-base z-10">
            <div className="callsign text-ink-secondary pr-4">{title}</div>
            <button
              onClick={onClose}
              className="flex min-h-[36px] min-w-[36px] h-9 w-9 items-center justify-center rounded-btn border border-seam text-ink-tertiary hover:text-ink hover:bg-well transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-go/50"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" weight="bold" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
