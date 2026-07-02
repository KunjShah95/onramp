import type { Shortcut } from '../../hooks/useKeyboardShortcuts'
import GradientHeading from './gradient-heading'

interface Props {
  shortcuts: Shortcut[]
  onClose: () => void
}

export default function KeyboardShortcutHelp({ shortcuts, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Keyboard shortcuts reference"
    >
      <div
        className="bg-[#0D1225] border border-white/10 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <GradientHeading as="h2" className="text-lg font-bold mb-4">
          Keyboard Shortcuts
        </GradientHeading>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2 pb-2 border-b border-white/5">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 text-white/60 font-mono text-[10px]">g</kbd>
            <span>then press a key below</span>
          </div>
          {shortcuts.map(s => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <span className="text-white/70">{s.description}</span>
              <kbd className="px-2 py-0.5 rounded bg-white/5 text-[#FF8C00] font-mono text-[11px] border border-white/10">
                {s.key === 'Escape' ? 'Esc' : s.key.startsWith('g ') ? s.key : `g ${s.key}`}
              </kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-white/30 text-center">
          Press <kbd className="px-1 py-0.5 rounded bg-white/5 text-white/50 font-mono">?</kbd> to toggle this panel
        </p>
      </div>
    </div>
  )
}
