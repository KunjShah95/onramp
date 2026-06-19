import { useState, useEffect, useCallback } from 'react'
import { updateProfile } from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getNotificationPreferences,
  updateNotificationPreferences,
  type ApiKey,
  type NotificationPreferences,
} from '../lib/api'

export default function Settings() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('account')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState('')

  // Organization scope for API keys: the signed-in user's email.
  const orgName = user?.email || ''

  useEffect(() => {
    setName(user?.displayName || '')
    setEmail(user?.email || '')
  }, [user])

  const fetchKeys = useCallback(async () => {
    if (!orgName) return
    try {
      const data = await listApiKeys(orgName)
      setKeys(data.keys || [])
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to load API keys')
    }
  }, [orgName])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  async function handleSaveProfile() {
    const auth = getFirebaseAuth()
    const current = auth.currentUser
    if (!current) return
    setSaving(true)
    setSavedMsg('')
    try {
      await updateProfile(current, { displayName: name.trim() })
      setSavedMsg('Profile saved')
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateKey() {
    if (!orgName) return
    setKeyError('')
    setNewKey(null)
    try {
      const data = await createApiKey(orgName)
      setNewKey(data.raw_key)
      await fetchKeys()
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to generate key')
    }
  }

  async function handleRevoke(keyId: string) {
    try {
      await revokeApiKey(keyId)
      await fetchKeys()
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  const initial = (name || email || 'U').charAt(0).toUpperCase()

  const tabs = [
    { id: 'account', label: 'ACCOUNT' },
    { id: 'notifications', label: 'NOTIFICATIONS' },
    { id: 'integrations', label: 'INTEGRATIONS' },
    { id: 'theme', label: 'THEME' },
  ]

  return (
    <div className="w-full max-w-4xl pt-8 pb-12 font-body text-[#FDFBF8]">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-2 text-white">Settings</h1>
        <p className="text-[#FDFBF8]/60 text-sm">Manage your account settings and preferences.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-8 border-b border-[#FDFBF8]/10 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium tracking-wide transition-colors relative ${
              activeTab === tab.id ? 'text-[#FF8C00]' : 'text-[#FDFBF8]/50 hover:text-[#FDFBF8]'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-[#FF8C00]" />
            )}
          </button>
        ))}
      </div>

      {/* Account Tab Content */}
      {activeTab === 'account' && (
        <div className="space-y-8">
          {/* Profile Information */}
          <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
            <div className="mb-6">
              <h3 className="font-display text-lg font-bold text-white mb-1">Profile Information</h3>
              <p className="text-sm text-[#FDFBF8]/60">Update your photo and personal details here.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
              <div className="flex flex-col items-center gap-4">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-[#241912] border border-[#FDFBF8]/10 flex-shrink-0 flex items-center justify-center">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt={name || 'Avatar'} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-[#FF8C00]">{initial}</span>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-[#FDFBF8]/80 mb-2">Display Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#FDFBF8]/80 mb-2">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    title="Email is managed by your sign-in provider"
                    className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white/60 cursor-not-allowed focus:outline-none"
                  />
                </div>
                <div className="flex items-center justify-end gap-4 pt-2">
                  {savedMsg && <span className="text-xs text-[#FDFBF8]/60">{savedMsg}</span>}
                  <button
                    onClick={handleSaveProfile}
                    disabled={saving || !user}
                    className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors shadow-glow disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-white mb-1">API Keys</h3>
                <p className="text-sm text-[#FDFBF8]/60">Manage your secret keys for programmatic access.</p>
              </div>
              <button
                onClick={handleGenerateKey}
                disabled={!orgName}
                className="border border-[#FDFBF8]/20 bg-transparent hover:bg-[#FDFBF8]/5 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Generate New Key
              </button>
            </div>

            {keyError && (
              <div className="mb-4 text-sm text-red-400">{keyError}</div>
            )}

            {newKey && (
              <div className="mb-4 bg-yellow-500/10 text-yellow-400 rounded-lg p-4 border border-yellow-500/20">
                <p className="text-sm font-semibold mb-1">Save this key — it won't be shown again:</p>
                <code className="text-xs bg-[#110D0A] px-3 py-2 rounded block font-mono break-all select-all">{newKey}</code>
              </div>
            )}

            {keys.length === 0 ? (
              <p className="text-sm text-[#FDFBF8]/40">No API keys yet.</p>
            ) : (
              <div className="space-y-3">
                {keys.map(k => (
                  <div key={k.key_id} className="flex items-center justify-between bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#FDFBF8]/40 text-lg">key</span>
                      <div>
                        <span className="font-mono text-sm text-[#FDFBF8]/80">{k.key_id}</span>
                        <p className="text-xs text-[#FDFBF8]/40 mt-0.5">
                          <span className="capitalize">{k.tier}</span>
                          {' · '}Used {k.usage_count}x
                          {k.revoked && <span className="text-red-400"> · revoked</span>}
                        </p>
                      </div>
                    </div>
                    {!k.revoked && (
                      <button
                        onClick={() => handleRevoke(k.key_id)}
                        className="p-1.5 text-red-400/70 hover:text-red-400 transition-colors"
                        title="Revoke"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
