import { useState } from 'react'
import { createApiKey, listApiKeys, revokeApiKey } from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

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
    <PageTransition>
    <div className="w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8] max-w-4xl">
      <GradientHeading as="h1" className="mb-1">API Keys</GradientHeading>
      <p className="text-[#FDFBF8]/60 text-sm mb-6">Manage API keys for AIaaS access</p>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-lg p-4 mb-6 text-sm border border-red-500/20">{error}</div>
      )}

      {newKey && (
        <div className="bg-yellow-500/10 text-yellow-400 rounded-lg p-4 mb-6 border border-yellow-500/20">
          <p className="text-sm font-semibold mb-1">Save this API key — it won't be shown again:</p>
          <code className="text-xs bg-[#0D0906] px-3 py-2 rounded block font-mono break-all select-all">{newKey}</code>
        </div>
      )}

      <CardSpotlight className="p-6 mb-8">
        <GradientHeading as="h2" className="text-base mb-4">Create New Key</GradientHeading>
        <div className="flex gap-3 mb-4">
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name"
            className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 flex-1 outline-none focus:border-[#FF8C00]/40 transition-colors"
          />
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 w-auto outline-none focus:border-[#FF8C00]/40 transition-colors">
            <option value="free">Free</option>
            <option value="startup">Startup</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button onClick={handleCreateKey} disabled={loading || !orgName.trim()} className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50">
            {loading ? 'Creating...' : 'Create Key'}
          </button>
        </div>
        <button onClick={fetchKeys} className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-3 py-1.5 rounded-lg text-xs transition-colors">
          Refresh Key List
        </button>
      </CardSpotlight>

      {keys.length > 0 && (
        <CardSpotlight className="p-6">
          <GradientHeading as="h2" className="text-base mb-4">Active Keys</GradientHeading>
          <div className="space-y-3">
            {keys.map((k: any) => (
              <div key={k.key_id || k.id} className="flex items-center justify-between p-3 rounded-lg bg-[#1A110D] border border-[#FDFBF8]/5">
                <div>
                  <p className="text-xs font-mono text-[#FDFBF8]/60">
                    {k.key_id || k.id}
                  </p>
                  <p className="text-xs text-[#FDFBF8]/40 mt-0.5">
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
        </CardSpotlight>
      )}
    </div>
    </PageTransition>
  )
}
