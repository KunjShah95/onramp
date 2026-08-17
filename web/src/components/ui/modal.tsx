import { type ReactNode, useEffect } from 'react'
import { X } from '@phosphor-icons/react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-2xl' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-base border border-seam rounded-card w-full ${maxWidth} max-h-[85vh] overflow-y-auto shadow-overhead relative`}
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
              className="flex h-7 w-7 items-center justify-center rounded-btn border border-seam text-ink-tertiary hover:text-ink hover:bg-well transition-colors shrink-0"
              aria-label="Close"
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
