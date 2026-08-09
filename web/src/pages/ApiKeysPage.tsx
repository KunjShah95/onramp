import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key,
  Plus,
  Trash,
  Copy,
  Check,
  X,
  Clock,
  Spinner,
  Terminal,
  ShieldCheck,
} from '@phosphor-icons/react'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { ApiKeysSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { listApiKeys, createApiKey, revokeApiKey } from '../lib/api'
import type { ApiKey } from '../lib/api'
import { cn } from '../lib/utils'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

const TIERS = ['free', 'pro', 'team', 'enterprise']

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTier, setNewTier] = useState('free')
  const [creating, setCreating] = useState(false)
  const [revealedRaw, setRevealedRaw] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toast = useToast()
  const { activeTeamId } = useAuth()
  const orgName = activeTeamId || 'default'

  async function fetchKeys() {
    setLoading(true); setError('')
    try {
      const data = await listApiKeys(orgName)
      setKeys(data.keys ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load API keys.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchKeys()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgName])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await createApiKey(orgName, newTier)
      setRevealedRaw(res.raw_key)
      await fetchKeys()
      toast.success('API key created', 'Copy it now — it will not be shown again.')
    } catch (err: any) {
      toast.error('Could not create key', err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (keyId: string) => {
    const prev = keys
    setKeys((cur) => cur.filter((k) => k.key_id !== keyId))
    try {
      await revokeApiKey(keyId)
      toast.success('API key revoked')
    } catch (err: any) {
      setKeys(prev)
      toast.error('Could not revoke', err.message)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto space-y-8 relative"
    >
      {/* ── Mission header ── */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">
              <Key size={11} weight="fill" className="mr-1.5" />
              API Keys
            </span>
            <span className="designator opacity-50">ACCESS · CREDENTIALS</span>
          </div>
          <h1 className="text-display-md md:text-display-lg text-text-primary">API Keys</h1>
          <p className="text-body-sm text-text-secondary mt-1 font-code">
            Programmatic access — keep keys secure, treat them like passwords.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => { setRevealedRaw(null); setShowCreate(true) }}
          className="btn btn-primary flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" weight="bold" />
          Create Key
        </motion.button>
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="px-4 py-3 rounded-tile bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchKeys} className="text-caption underline ml-4 text-abort/70 hover:text-abort">Retry</button>
        </motion.div>
      )}

      {loading && <motion.div variants={itemVariants}><ApiKeysSkeleton /></motion.div>}

      {!loading && keys.length === 0 && (
        <motion.div variants={itemVariants}>
          <EmptyState
            icon={<Key className="w-10 h-10 text-ink-disabled/40" weight="duotone" />}
            title="No API keys"
            description="Create your first key to get started with API access."
            action={
              <button onClick={() => setShowCreate(true)} className="btn btn-primary text-caption px-4 py-1.5">
                Create Key
              </button>
            }
          />
        </motion.div>
      )}

      {!loading && keys.length > 0 && (
        <motion.div variants={itemVariants} className="space-y-3">
          {keys.map((apiKey) => (
            <motion.div
              key={apiKey.key_id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              className="rounded-card border border-seam bg-panel p-5 hover:border-go/25 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-body font-medium text-ink font-code">
                      {apiKey.org_name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-tile text-[10px] font-medium uppercase tracking-wider bg-mission/15 text-mission">
                      {apiKey.tier}
                    </span>
                    {!apiKey.is_active && (
                      <span className="px-2 py-0.5 rounded-tile text-[10px] font-medium bg-well text-ink-muted">revoked</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-caption text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Created {new Date(apiKey.created_at).toLocaleDateString()}
                    </span>
                    <span>{apiKey.usage_count} calls</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleRevoke(apiKey.key_id)}
                    disabled={!apiKey.is_active}
                    className="w-9 h-9 rounded-tile bg-well flex items-center justify-center text-ink-muted hover:text-abort transition-colors disabled:opacity-30 disabled:hover:text-ink-muted"
                    title="Revoke"
                  >
                    <Trash className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              onClick={() => !revealedRaw && setShowCreate(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <ConsolePanel rail="Credentials" designator="CREATE KEY" status="go" className="w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-display-xs font-display font-medium text-ink">
                    {revealedRaw ? 'Save your key' : 'Create API Key'}
                  </h2>
                  {!revealedRaw && (
                    <button
                      onClick={() => setShowCreate(false)}
                      className="w-8 h-8 rounded-tile bg-well flex items-center justify-center text-ink-muted hover:text-ink transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {revealedRaw ? (
                  <div className="space-y-4">
                    <p className="text-caption text-ink-muted">
                      Copy this key now. For security, it will not be shown again.
                    </p>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-tile bg-well border border-seam font-code text-xs text-ink-secondary break-all">
                      <Terminal className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                      <code className="flex-1">{revealedRaw}</code>
                      <button onClick={() => handleCopy(revealedRaw)} className="shrink-0 text-ink-muted hover:text-ink">
                        {copied ? <Check className="w-4 h-4 text-go" weight="bold" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <button onClick={() => { setRevealedRaw(null); setShowCreate(false) }} className="btn btn-primary w-full">
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="block overline text-ink-muted mb-2">
                        Tier
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TIERS.map((tier) => (
                          <button
                            key={tier}
                            onClick={() => setNewTier(tier)}
                            className={cn(
                              'px-3 py-1.5 rounded-tile text-xs font-medium transition-all border',
                              newTier === tier
                                ? 'bg-go/15 text-go border-go/30'
                                : 'bg-well text-ink-muted border-seam hover:border-seam-strong'
                            )}
                          >
                            {tier}
                          </button>
                        ))}
                      </div>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleCreate}
                      disabled={creating}
                      className="btn btn-primary w-full flex items-center justify-center gap-2"
                    >
                      {creating ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" weight="bold" />}
                      {creating ? 'Creating...' : 'Create Key'}
                    </motion.button>
                  </div>
                )}
              </ConsolePanel>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Security Note */}
      <motion.div variants={itemVariants} className="rounded-card border border-mission/20 bg-panel p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-tile bg-mission/10 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-mission" weight="fill" />
          </div>
          <div>
            <h3 className="text-body-sm font-medium text-ink mb-1">
              Security Best Practices
            </h3>
            <ul className="text-caption text-ink-muted space-y-1">
              <li>• Use specific tiers — grant only the permissions needed</li>
              <li>• Rotate keys regularly, especially for production use</li>
              <li>• Never share keys in client-side code or version control</li>
              <li>• Revoke unused or compromised keys immediately</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
