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
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import CardSpotlight from '../components/ui/card-spotlight'
import { EmptyState } from '../components/ui/empty-state'
import { ApiKeysSkeleton } from '../components/ui/Skeleton'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { listApiKeys, createApiKey, revokeApiKey } from '../lib/api'
import type { ApiKey } from '../lib/api'

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
    <PageTransition>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                API Keys
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Manage API keys for programmatic access. Keep your keys secure — treat them like passwords.
            </p>
          </div>
          <button
            onClick={() => { setRevealedRaw(null); setShowCreate(true) }}
            className="btn btn-primary flex items-center gap-2 shrink-0"
          >
            <Plus className="w-4 h-4" weight="bold" />
            Create Key
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchKeys} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {loading && <ApiKeysSkeleton />}

        {!loading && keys.length === 0 && (
          <EmptyState
            icon={<Key className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
            title="No API keys"
            description="Create your first key to get started with API access."
            action={
              <button onClick={() => setShowCreate(true)} className="btn btn-primary text-caption px-4 py-1.5">
                Create Key
              </button>
            }
          />
        )}

        {!loading && keys.length > 0 && (
          <div className="space-y-3">
            {keys.map((apiKey) => (
              <motion.div
                key={apiKey.key_id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-body font-medium text-text-primary font-code">
                        {apiKey.org_name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-accent-primary/10 text-accent-primary">
                        {apiKey.tier}
                      </span>
                      {!apiKey.is_active && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-bg-tertiary/40 text-text-tertiary">revoked</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-caption text-text-tertiary">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Created {new Date(apiKey.created_at).toLocaleDateString()}
                      </span>
                      <span>{apiKey.usage_count} calls</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleRevoke(apiKey.key_id)}
                      disabled={!apiKey.is_active}
                      className="w-9 h-9 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:text-text-tertiary"
                      title="Revoke"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
                <CardSpotlight className="w-full max-w-md p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-display-xs font-display font-medium text-text-primary">
                      {revealedRaw ? 'Save your key' : 'Create API Key'}
                    </h2>
                    {!revealedRaw && (
                      <button
                        onClick={() => setShowCreate(false)}
                        className="w-8 h-8 rounded-lg bg-bg-tertiary/50 flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {revealedRaw ? (
                    <div className="space-y-4">
                      <p className="text-caption text-text-tertiary">
                        Copy this key now. For security, it will not be shown again.
                      </p>
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary/30 font-code text-xs text-text-secondary break-all">
                        <Terminal className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <code className="flex-1">{revealedRaw}</code>
                        <button onClick={() => handleCopy(revealedRaw)} className="shrink-0 text-text-tertiary hover:text-text-primary">
                          {copied ? <Check className="w-4 h-4 text-accent-primary" weight="bold" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <button onClick={() => { setRevealedRaw(null); setShowCreate(false) }} className="btn btn-primary w-full">
                        Done
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div>
                        <label className="block text-caption font-medium text-text-secondary mb-1.5">
                          Tier
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {TIERS.map((tier) => (
                            <button
                              key={tier}
                              onClick={() => setNewTier(tier)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                newTier === tier
                                  ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                                  : 'bg-bg-tertiary/50 text-text-tertiary border border-border hover:border-border-hover'
                              }`}
                            >
                              {tier}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={handleCreate}
                        disabled={creating}
                        className="btn btn-primary w-full flex items-center justify-center gap-2"
                      >
                        {creating ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" weight="bold" />}
                        {creating ? 'Creating...' : 'Create Key'}
                      </button>
                    </div>
                  )}
                </CardSpotlight>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Security Note */}
        <div className="card p-5 border border-accent-primary/10">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Key className="w-4 h-4 text-accent-primary" weight="duotone" />
            </div>
            <div>
              <h3 className="text-body-sm font-medium text-text-primary mb-1">
                Security Best Practices
              </h3>
              <ul className="text-caption text-text-tertiary space-y-1">
                <li>• Use specific tiers — grant only the permissions needed</li>
                <li>• Rotate keys regularly, especially for production use</li>
                <li>• Never share keys in client-side code or version control</li>
                <li>• Revoke unused or compromised keys immediately</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
