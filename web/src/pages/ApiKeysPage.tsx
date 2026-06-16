import { useState } from 'react'
import { createApiKey, listApiKeys, revokeApiKey } from '../lib/api'

export default function ApiKeysPage() {
  const [orgName, setOrgName] = useState('')
  const [tier, setTier] = useState('free')
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  async function handleCreateKey() {
    if (!orgName.trim()) return
    setLoading(true)
    setError('')
    setNewKey(null)
    try {
      const data = await createApiKey(orgName.trim(), tier)
      setNewKey(data.raw_key)
      await fetchKeys()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create API key')
    }
    setLoading(false)
  }

  async function fetchKeys() {
    if (!orgName.trim()) return
    try {
      const data = await listApiKeys(orgName.trim())
      setKeys(data.keys || [])
    } catch { /* ignore */ }
  }

  async function handleRevoke(keyId: string) {
    try {
      await revokeApiKey(keyId)
      await fetchKeys()
    } catch { /* ignore */ }
  }

  return (
    <div className="animate-in max-w-4xl">
      <h1 className="font-display text-2xl font-bold text-text-primary mb-1">API Keys</h1>
      <p className="text-text-secondary text-sm mb-6">Manage API keys for AIaaS access</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {newKey && (
        <div className="bg-yellow-500/10 text-yellow-400 rounded-card p-4 mb-6 border border-yellow-500/20">
          <p className="text-sm font-semibold mb-1">Save this API key — it won't be shown again:</p>
          <code className="text-xs bg-bg-primary px-3 py-2 rounded block font-mono break-all select-all">{newKey}</code>
        </div>
      )}

      <div className="card mb-8">
        <h2 className="font-display text-base font-semibold text-text-primary mb-4">Create New Key</h2>
        <div className="flex gap-3 mb-4">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            className="input flex-1"
          />
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="input w-auto">
            <option value="free">Free</option>
            <option value="startup">Startup</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={handleCreateKey} disabled={loading || !orgName.trim()} className="btn disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Key'}
          </button>
        </div>
        <button onClick={fetchKeys} className="btn btn-ghost text-xs">
          Refresh Key List
        </button>
      </div>

      {keys.length > 0 && (
        <div className="card">
          <h2 className="font-display text-base font-semibold text-text-primary mb-4">Active Keys</h2>
          <div className="space-y-3">
            {keys.map((k: any) => (
              <div key={k.key_id || k.id} className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border/40">
                <div>
                  <p className="text-xs font-mono text-text-secondary">
                    {k.key_id || k.id}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Tier: <span className="capitalize">{k.tier}</span>
                    {' · '}Created: {k.created_at ? new Date(k.created_at).toLocaleDateString() : '?'}
                    {' · '}Used: {k.usage_count || 0}x
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(k.key_id || k.id)}
                  className="text-xs text-red-400 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
