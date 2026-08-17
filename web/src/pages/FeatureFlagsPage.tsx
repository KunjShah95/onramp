import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ToggleLeft, ToggleRight, Plus, Trash, Spinner, Flag } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import {
  listFeatureFlags,
  setFeatureFlag,
  deleteFeatureFlag,
  type FeatureFlag,
} from '../lib/api'
import { useToast } from '../context/ToastContext'
import { cn } from '../lib/utils'

const PRESET_FLAGS = [
  { name: 'senior_dev_roast', description: 'Enable Senior Dev Roast mode across all AI agents' },
  { name: 'auto_pr_review', description: 'Automatically trigger PR review on push' },
  { name: 'drift_detection', description: 'Enable architecture drift detection alerts' },
  { name: 'playbook_marketplace', description: 'Enable community playbook marketplace' },
  { name: 'usage_based_billing', description: 'Enable usage-based pricing tier' },
  { name: 'jira_sync', description: 'Enable Jira ticket synchronization' },
  { name: 'linear_sync', description: 'Enable Linear ticket synchronization' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

export default function FeatureFlagsPage() {
  const { activeTeamId } = useAuth()
  const toast = useToast()
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')

  const fetch = useCallback(async () => {
    if (!activeTeamId) { setLoading(false); return }
    setLoading(true)
    try {
      const data = await listFeatureFlags(activeTeamId)
      setFlags(data.flags ?? [])
    } catch {
      setFlags([])
    }
    setLoading(false)
  }, [activeTeamId])

  useEffect(() => { fetch() }, [fetch])

  const isEnabled = (name: string) => flags.find((f) => f.flag_name === name)?.enabled ?? false

  const handleToggle = async (flagName: string, currentlyEnabled: boolean) => {
    if (!activeTeamId) return
    setToggling(flagName)
    try {
      const updated = await setFeatureFlag(activeTeamId, flagName, !currentlyEnabled)
      setFlags((prev) => {
        const idx = prev.findIndex((f) => f.flag_name === flagName)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [...prev, updated]
      })
      toast.success(flagName, `${!currentlyEnabled ? 'Enabled' : 'Disabled'}`)
    } catch {
      toast.error('Failed', `Could not toggle ${flagName}`)
    }
    setToggling(null)
  }

  const handleDelete = async (flagName: string) => {
    if (!activeTeamId) return
    try {
      await deleteFeatureFlag(activeTeamId, flagName)
      setFlags((prev) => prev.filter((f) => f.flag_name !== flagName))
      toast.success('Deleted', `Flag "${flagName}" removed`)
    } catch {
      toast.error('Failed', `Could not delete ${flagName}`)
    }
  }

  const handleAddCustom = async () => {
    const name = customName.trim().toLowerCase().replace(/\s+/g, '_')
    if (!name || !activeTeamId) return
    try {
      const flag = await setFeatureFlag(activeTeamId, name, false)
      setFlags((prev) => [...prev, flag])
      setCustomName('')
      toast.success('Created', `Flag "${name}" added`)
    } catch {
      toast.error('Failed', `Could not create "${name}"`)
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="max-w-3xl mx-auto px-4 sm:px-6">
      <div className="flex items-center gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">
              <Flag size={11} weight="fill" className="mr-1.5" />
              Feature Flags
            </span>
            <span className="designator opacity-50">CONFIG SWITCHES</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-ink">Feature Flags</h1>
          <p className="text-body-xs text-ink-secondary font-code">Toggle team-level features on and off.</p>
        </div>
      </div>

      {!activeTeamId && (
        <div className="card p-6 text-center text-ink-tertiary text-body-sm">
          Select a team to manage feature flags.
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="w-6 h-6 text-go animate-spin" />
        </div>
      )}

      {!loading && activeTeamId && (
        <>
          {/* Preset flags */}
          <div className="space-y-2 mb-8">
            {PRESET_FLAGS.map((preset) => {
              const enabled = isEnabled(preset.name)
              const togglingThis = toggling === preset.name
              return (
                <motion.div key={preset.name} variants={itemVariants} className="card p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-caption font-code text-go bg-go/5 px-2 py-0.5 rounded border border-go/15">
                        {preset.name}
                      </code>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-well text-ink-muted'
                      )}>
                        {enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="text-caption text-ink-tertiary mt-1">{preset.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleDelete(preset.name)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-abort hover:bg-abort/10 transition-all"
                      title="Remove flag"
                    >
                      <Trash size={14} />
                    </button>
                    <button
                      onClick={() => handleToggle(preset.name, enabled)}
                      disabled={toggling !== null}
                      className="text-ink-tertiary hover:text-go transition-colors"
                    >
                      {togglingThis ? (
                        <Spinner className="w-6 h-6 animate-spin text-go" />
                      ) : enabled ? (
                        <ToggleRight size={24} className="text-go" weight="fill" />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Custom flags */}
          <div className="space-y-2">
            <h3 className="text-body-sm font-medium text-ink mb-3">Custom Flags</h3>
            {flags.filter((f) => !PRESET_FLAGS.some((p) => p.name === f.flag_name)).length === 0 && (
              <p className="text-caption text-ink-tertiary/60 mb-3">No custom flags yet.</p>
            )}
            {flags
              .filter((f) => !PRESET_FLAGS.some((p) => p.name === f.flag_name))
              .map((flag) => (
                <motion.div key={flag.id} variants={itemVariants} className="card p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <code className="text-caption font-code text-ink bg-well/50 px-2 py-0.5 rounded">{flag.flag_name}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDelete(flag.flag_name)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-abort hover:bg-abort/10 transition-all"
                    >
                      <Trash size={14} />
                    </button>
                    <button
                      onClick={() => handleToggle(flag.flag_name, flag.enabled)}
                      className="text-ink-tertiary hover:text-go transition-colors"
                    >
                      {flag.enabled ? (
                        <ToggleRight size={24} className="text-go" weight="fill" />
                      ) : (
                        <ToggleLeft size={24} />
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}

            {/* Add custom flag */}
            <div className="flex items-center gap-2 mt-4">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                placeholder="custom_flag_name"
                className="flex-1 bg-panel border border-seam text-ink text-body-sm rounded-input px-3 py-2 focus:outline-none focus:border-go/60 placeholder:text-ink-tertiary/40"
              />
              <button
                onClick={handleAddCustom}
                disabled={!customName.trim()}
                className="btn btn-primary text-caption px-3 py-2 flex items-center gap-1.5"
              >
                <Plus size={14} />
                Add Flag
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
