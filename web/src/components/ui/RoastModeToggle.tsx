import { Fire } from '@phosphor-icons/react'
import { useRoastMode } from '../../context/RoastModeContext'
import { cn } from '../../lib/utils'

interface RoastModeToggleProps {
  compact?: boolean
}

export default function RoastModeToggle({ compact }: RoastModeToggleProps) {
  const { enabled, toggle } = useRoastMode()

  if (compact) {
    return (
      <button
        onClick={toggle}
        className={cn(
          'relative w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200',
          enabled
            ? 'bg-error/15 text-error'
            : 'text-text-muted hover:text-text-secondary'
        )}
        aria-label={enabled ? 'Roast Mode ON' : 'Roast Mode OFF'}
        title={enabled ? 'Roast Mode ON' : 'Roast Mode OFF'}
      >
        <Fire
          size={14}
          weight={enabled ? 'fill' : 'regular'}
          className={cn(enabled && 'animate-pulse')}
        />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-medium transition-all duration-200',
        enabled
          ? 'bg-error/15 text-error border border-error/25 shadow-sm'
          : 'bg-bg-tertiary/30 text-text-tertiary border border-border hover:text-text-secondary'
      )}
    >
      <Fire
        size={14}
        weight={enabled ? 'fill' : 'regular'}
        className={cn(enabled && 'animate-pulse')}
      />
      {enabled ? 'Roast Mode' : 'Roast'}
    </button>
  )
}
