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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`bg-bg-primary border border-border rounded-2xl w-full ${maxWidth} max-h-[85vh] overflow-y-auto shadow-2xl relative`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-primary/30 to-transparent rounded-t-2xl" />
        {title !== undefined && (
          <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-bg-primary z-10">
            <div className="text-body font-medium text-text-primary pr-4">{title}</div>
            <button
              onClick={onClose}
              className="text-text-tertiary hover:text-text-primary transition-colors shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5" weight="bold" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
