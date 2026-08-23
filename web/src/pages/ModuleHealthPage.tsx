import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/ui/page-header'
import {
  Code, Lock, CheckCircle,
} from '@phosphor-icons/react'
import { ModuleAccessSkeleton } from '../components/ui/Skeleton'
import ConsolePanel from '../components/ui/console-panel'
import { useAuth } from '../context/AuthContext'
import { getTeamModulePermissions } from '../lib/api'
import type { ModulePermission } from '../lib/api'

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
}

export default function ModuleHealthPage() {
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { activeTeamId } = useAuth()

  async function fetchModules() {
    if (!activeTeamId) { setLoading(false); setError('Join a team to view module access.'); return }
    setLoading(true); setError('')
    try {
      const res = await getTeamModulePermissions(activeTeamId)
      setPermissions(res.permissions ?? [])
      setModules(res.modules ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load module access.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!activeTeamId) { setLoading(false); setError('Join a team to view module access.'); return }
      setLoading(true); setError('')
      try {
        const res = await getTeamModulePermissions(activeTeamId)
        if (!cancelled) {
          setPermissions(res.permissions ?? [])
          setModules(res.modules ?? [])
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load module access.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [activeTeamId])

  const grantedModules = new Set(permissions.map((p) => p.module))
  const granted = permissions.length
  const total = modules.length
  const grantedAll = total > 0 && granted === total

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[hsl(var(--background))]">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <motion.header initial="hidden" animate="show" variants={fade} className="mb-8">
          <PageHeader
            eyebrow="Folio · Module health"
            title="Module Health"
            subtitle="Module-level permissions your team holds · each module unlocks as trainees complete onboarding tasks."
          />
        </motion.header>

        {/* Error */}
        {error && (
          <ConsolePanel pad="dense" status="abort" className="mb-6 flex items-center justify-between">
            <span className="text-[13px] text-abort">{error}</span>
            <button onClick={fetchModules} disabled={loading} className="text-[12px] text-abort/70 hover:text-abort underline">
              Retry
            </button>
          </ConsolePanel>
        )}

        {loading ? (
          <div className="py-8"><ModuleAccessSkeleton /></div>
        ) : modules.length === 0 && permissions.length === 0 ? (
          <motion.div initial="hidden" animate="show" variants={fade}>
            <ConsolePanel rail="No access" designator="AWAITING GRANTS" status="idle" className="py-16 text-center">
              <div className="w-14 h-14 rounded-[3px] bg-base border border-seam flex items-center justify-center mx-auto mb-4">
                <Lock size={26} className="text-ink-disabled" weight="duotone" />
              </div>
              <p className="font-display text-lg text-ink font-semibold mb-1">No module grants yet</p>
              <p className="text-[13px] text-ink-tertiary max-w-sm mx-auto">
                Modules unlock automatically as trainees complete onboarding tasks.
              </p>
            </ConsolePanel>
          </motion.div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            className="space-y-6"
          >
            {/* Verdict bar — the single dominant read */}
            <motion.div variants={fade}>
              <ConsolePanel
                rail={grantedAll ? 'All granted' : 'Partial access'}
                designator={`${granted} / ${total}`}
                status={grantedAll ? 'go' : granted > 0 ? 'standby' : 'idle'}
                live={grantedAll}
                action={
                  total > 0 && (
                    <span className="font-mono text-[12px] text-ink-tertiary tabular-nums">
                      {Math.round((granted / total) * 100)}%
                    </span>
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1 rounded-full bg-base overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${total > 0 ? (granted / total) * 100 : 0}%` }}
                      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full bg-go"
                    />
                  </div>
                  <span className="font-code text-[11px] text-ink-tertiary shrink-0">
                    {granted} of {total} unlocked
                  </span>
                </div>
              </ConsolePanel>
            </motion.div>

            {/* Module grid */}
            {modules.length > 0 && (
              <motion.div variants={fade}>
                <ConsolePanel rail="Modules" designator={`${total} TOTAL`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {modules.map((mod, i) => {
                      const isGranted = grantedModules.has(mod)
                      return (
                        <motion.div
                          key={mod}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={cn(
                            'flex items-center justify-between px-3 py-2.5 rounded-[3px] border transition-colors',
                            isGranted
                              ? 'bg-go/5 border-go/20'
                              : 'bg-base border-seam',
                          )}
                        >
                          <span className={cn(
                            'font-code text-[12px] truncate',
                            isGranted ? 'text-ink' : 'text-ink-tertiary',
                          )}>{mod}</span>
                          {isGranted ? (
                            <CheckCircle size={12} className="text-go shrink-0 ml-2" weight="fill" />
                          ) : (
                            <Lock size={11} className="text-ink-disabled shrink-0 ml-2" />
                          )}
                        </motion.div>
                      )
                    })}
                  </div>
                </ConsolePanel>
              </motion.div>
            )}

            {/* Access grants */}
            <motion.div variants={fade}>
              <ConsolePanel rail="Access Grants" designator={`${granted} ENTRIES`} status="standby">
                {permissions.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="font-body text-[13px] text-ink-tertiary">
                      Modules unlock automatically as trainees complete onboarding tasks.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-seam">
                    {permissions.map((p, i) => (
                      <motion.div
                        key={p.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="w-7 h-7 rounded-[3px] bg-go/10 border border-go/20 flex items-center justify-center shrink-0">
                          <CheckCircle size={12} className="text-go" weight="fill" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-code text-[13px] text-ink truncate">{p.module}</p>
                          <p className="font-code text-[11px] text-ink-tertiary mt-0.5">
                            Granted to {p.user_name || 'N/A'}
                            {p.granted_at ? ` · ${new Date(p.granted_at).toLocaleDateString()}` : ''}
                            {p.source ? ` · ${p.source}` : ''}
                          </p>
                        </div>
                        <Code size={12} className="text-ink-disabled shrink-0" />
                      </motion.div>
                    ))}
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  )
}