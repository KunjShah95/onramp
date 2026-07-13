import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Code,
  ShieldCheck,
  Lock,
  CheckCircle,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { ModuleAccessSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/empty-state'
import { useAuth } from '../context/AuthContext'
import { getTeamModulePermissions } from '../lib/api'
import type { ModulePermission } from '../lib/api'

export default function ModuleHealthPage() {
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [modules, setModules] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { activeTeamId } = useAuth()

  async function fetchModules() {
    if (!activeTeamId) {
      setLoading(false)
      setError('Join a team to view module access.')
      return
    }
    setLoading(true); setError('')
    try {
      const res = await getTeamModulePermissions(activeTeamId)
      setPermissions(res.permissions ?? [])
      setModules(res.modules ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load module access.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchModules()
  }, [activeTeamId])

  const grantedModules = new Set(permissions.map((p) => p.module))

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-accent-primary" weight="duotone" />
          </div>
          <div>
            <h1 className="text-display-sm font-display font-medium text-text-primary">
              Module Access
            </h1>
            <p className="text-body-sm text-text-tertiary">
              Module-level permissions granted to your team.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchModules} disabled={loading} className="text-caption underline ml-4 text-error/70 hover:text-error disabled:opacity-50">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="py-8"><ModuleAccessSkeleton /></div>
        ) : (
          <>
            {modules.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {modules.map((mod, i) => {
                  const granted = grantedModules.has(mod)
                  return (
                    <motion.div
                      key={mod}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`card p-4 flex items-center justify-between ${
                        granted ? 'border-emerald-500/20' : 'border-text-tertiary/10'
                      }`}
                    >
                      <span className="text-body-sm font-code text-text-primary truncate">{mod}</span>
                      {granted ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" weight="fill" />
                      ) : (
                        <Lock className="w-4 h-4 text-text-tertiary/40 shrink-0" />
                      )}
                    </motion.div>
                  )
                })}
              </div>
            )}

            <div>
              <h2 className="text-body font-medium text-text-primary mb-4">
                Access Grants ({permissions.length})
              </h2>
              {permissions.length === 0 ? (
                <CardSpotlight className="border border-accent-primary/10">
                  <EmptyState
                    icon={<ShieldCheck className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
                    title="No module grants yet"
                    description="Modules unlock automatically as trainees complete onboarding tasks."
                  />
                </CardSpotlight>
              ) : (
                <div className="space-y-2">
                  {permissions.map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="card p-4 flex items-center gap-4"
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCircle className="w-4.5 h-4.5" weight="fill" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-text-primary font-code">{p.module}</p>
                        <p className="text-caption text-text-tertiary/60">
                          Granted to {p.user_name || p.user_id}
                          {p.granted_at ? ` · ${new Date(p.granted_at).toLocaleDateString()}` : ''}
                          {p.source ? ` · ${p.source}` : ''}
                        </p>
                      </div>
                      <Code className="w-4 h-4 text-text-tertiary shrink-0" />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PageTransition>
  )
}
