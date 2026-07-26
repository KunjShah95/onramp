import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  Code, ShieldCheck, Lock, CheckCircle, User,
} from '@phosphor-icons/react'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import { ModuleAccessSkeleton } from '../components/ui/Skeleton'
import { useAuth } from '../context/AuthContext'
import { getTeamModulePermissions } from '../lib/api'
import type { ModulePermission } from '../lib/api'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
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

  useEffect(() => { fetchModules() }, [activeTeamId])

  const grantedModules = new Set(permissions.map((p) => p.module))
  const granted = permissions.length
  const total = modules.length

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-[calc(100vh-4rem)] relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 px-4 sm:px-6 py-6">
        {/* Header */}
        <motion.div variants={item} className="mb-8">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center">
              <ShieldCheck size={16} className="text-amber-400" weight="duotone" />
            </div>
            <span className="text-overline text-amber-400/80">Access Control</span>
          </div>
          <GradientHeading as="h1" className="text-display-md mb-1">Module Access</GradientHeading>
          <p className="text-body-sm text-text-muted/60">Module-level permissions granted to your team</p>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                <span className="text-body-xs text-red-300">{error}</span>
                <button onClick={fetchModules} disabled={loading}
                  className="text-caption text-red-400/60 hover:text-red-400 underline">Retry</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="py-8"><ModuleAccessSkeleton /></div>
        ) : (
          <>
            {/* Summary Bar */}
            {modules.length > 0 && (
              <motion.div variants={item} className="flex items-center gap-4 p-4 mb-6 rounded-xl border border-border bg-gradient-to-r from-emerald-500/[0.03] to-blue-500/[0.03]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-400/8 border border-emerald-400/15 flex items-center justify-center">
                    <CheckCircle size={16} className="text-emerald-400" weight="fill" />
                  </div>
                  <div>
                    <div className="text-body-xs font-semibold text-text-primary tabular-nums">{granted}/{total} modules</div>
                    <div className="text-caption text-text-muted/40">access granted</div>
                  </div>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden max-w-xs">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${total > 0 ? (granted / total) * 100 : 0}%` }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-400"
                  />
                </div>
              </motion.div>
            )}

            {/* Module Grid */}
            {modules.length > 0 && (
              <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mb-8">
                {modules.map((mod, i) => {
                  const granted = grantedModules.has(mod)
                  return (
                    <motion.div
                      key={mod}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.025 }}
                      whileHover={{ y: -1 }}
                      className={cn(
                        'p-3.5 rounded-xl border flex items-center justify-between transition-all',
                        granted
                          ? 'bg-emerald-400/5 border-emerald-400/15'
                          : 'bg-bg-tertiary/30 border-border/50'
                      )}
                    >
                      <span className={cn(
                        'text-body-xs font-code truncate',
                        granted ? 'text-text-primary' : 'text-text-muted/40'
                      )}>{mod}</span>
                      {granted ? (
                        <CheckCircle size={14} className="text-emerald-400 shrink-0 ml-2" weight="fill" />
                      ) : (
                        <Lock size={12} className="text-text-muted/20 shrink-0 ml-2" />
                      )}
                    </motion.div>
                  )
                })}
              </motion.div>
            )}

            {/* Access Grants */}
            <motion.div variants={item}>
              <div className="flex items-center gap-2 mb-3">
                <User size={14} className="text-amber-400" />
                <span className="text-body-xs font-semibold text-text-primary">Access Grants ({granted})</span>
              </div>
              {permissions.length === 0 ? (
                <CardSpotlight className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-bg-tertiary border border-border flex items-center justify-center mx-auto mb-3">
                    <Lock size={22} className="text-text-muted/20" />
                  </div>
                  <p className="text-body-sm text-text-muted/40 font-medium mb-1">No module grants yet</p>
                  <p className="text-caption text-text-muted/20">Modules unlock automatically as trainees complete onboarding tasks.</p>
                </CardSpotlight>
              ) : (
                <div className="space-y-1.5">
                  {permissions.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="flex items-center gap-3.5 p-3.5 rounded-xl bg-bg-tertiary/20 border border-border hover:border-border-hover transition-all"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-400/8 border border-emerald-400/15 flex items-center justify-center shrink-0">
                        <CheckCircle size={14} className="text-emerald-400" weight="fill" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-xs font-medium text-text-primary font-code">{p.module}</p>
                        <p className="text-caption text-text-muted/30 mt-0.5">
                          Granted to {p.user_name || p.user_id}
                          {p.granted_at ? ` · ${new Date(p.granted_at).toLocaleDateString()}` : ''}
                          {p.source ? ` · ${p.source}` : ''}
                        </p>
                      </div>
                      <Code size={14} className="text-text-muted/20 shrink-0" />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  )
}
