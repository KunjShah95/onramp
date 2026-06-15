import type { LearningPathModule } from '../lib/types'
import { useState } from 'react'
import TracingBeam from './ui/tracing-beam'

interface Props {
  modules: LearningPathModule[]
  totalHours: number
}

export default function LearningPathTimeline({ modules, totalHours }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div>
      <div className="text-sm text-text-muted mb-6">
        Estimated total: <span className="text-text-primary font-medium">{totalHours} hours</span>
      </div>

      <TracingBeam>
        <div className="space-y-6">
          {modules.map((mod) => (
            <div key={mod.order}>
              <div
                className="card cursor-pointer"
                onClick={() => setExpanded(expanded === mod.order ? null : mod.order)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">Module {mod.order}</span>
                    <h3 className="font-display text-sm font-semibold text-text-primary">{mod.name}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-muted">{mod.time_hours}h</span>
                    <span className="text-text-muted text-xs">
                      {expanded === mod.order ? '−' : '+'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-text-secondary mt-2">{mod.description}</p>

                {expanded === mod.order && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    {mod.files.length > 0 && (
                      <div>
                        <div className="text-xs text-text-muted mb-1">Files to explore:</div>
                        <div className="flex flex-wrap gap-1">
                          {mod.files.map((f) => (
                            <span key={f} className="text-xs bg-bg-elevated text-text-secondary px-2 py-0.5 rounded">
                              {f.split('/').pop()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-text-muted mb-1">Objectives:</div>
                      <ul className="space-y-1">
                        {mod.objectives.map((obj, i) => (
                          <li key={i} className="text-xs text-text-secondary flex items-start gap-1">
                            <span className="text-accent-from mt-0.5">•</span>
                            {obj}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </TracingBeam>
    </div>
  )
}
