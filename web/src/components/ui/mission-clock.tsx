import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

interface MissionClockProps {
  /** Current console call-sign, e.g. "FLIGHT · CTO". */
  callsign?: string
  className?: string
}

function pad(n: number) { return String(n).padStart(2, '0') }

/**
 * Mission Clock. A live instrument readout in the top bar — UTC wall time plus
 * a T+ session-elapsed counter — set in JetBrains Mono, tabular. Replaces the
 * decorative shortcut hint as the bar's primary telemetry.
 */
export default function MissionClock({ callsign, className }: MissionClockProps) {
  const start = useRef(Date.now())
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const utc = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  const elapsed = Math.floor((now.getTime() - start.current) / 1000)
  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  const tplus = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-go-lit shrink-0 motion-safe:animate-pulse-glow" aria-hidden />
      {callsign && (
        <span className="callsign text-ink-muted hidden md:inline truncate">{callsign}</span>
      )}
      <span className="readout text-ink-secondary tabular-nums" aria-label="Mission time (UTC)">
        {utc}<span className="text-ink-muted ml-1">UTC</span>
      </span>
      <span className="designator hidden sm:inline" aria-label="Session elapsed">
        T+{tplus}
      </span>
    </div>
  )
}
