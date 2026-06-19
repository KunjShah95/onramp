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

  // ── Notification preferences state ──────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null)
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false)
  const [notifPrefsSaving, setNotifPrefsSaving] = useState(false)
  const [notifPrefsMsg, setNotifPrefsMsg] = useState('')

  const notificationTypes: Record<string, string> = {
    task_assigned: 'Task Assigned',
    task_started: 'Task Started',
    task_submitted: 'Task Submitted',
    task_reviewed: 'Task Reviewed',
    task_approved: 'Task Approved',
    task_needs_changes: 'Changes Requested',
    task_completed: 'Task Completed',
    task_cancelled: 'Task Cancelled',
    module_granted: 'Module Access',
    team_invite: 'Team Invite',
    system_alert: 'System Alert',
    pr_merged: 'PR Merged',
    milestone_reached: 'Milestone',
  }

  const channels = ['in_app', 'email', 'slack']
  const channelLabels: Record<string, string> = {
    in_app: 'In-App',
    email: 'Email',
    slack: 'Slack',
  }
  const channelIcons: Record<string, string> = {
    in_app: 'notifications',
    email: 'mail',
    slack: 'chat',
  }

  const fetchNotifPrefs = useCallback(async () => {
    setNotifPrefsLoading(true)
    try {
      const data = await getNotificationPreferences()
      setNotifPrefs(data)
    } catch { /* ignore */ }
    setNotifPrefsLoading(false)
  }, [])

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

  useEffect(() => {
    fetchNotifPrefs()
  }, [fetchNotifPrefs])

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

  async function handleToggleNotifType(channel: string, type: string, enabled: boolean) {
    if (!notifPrefs) return
    const updated = {
      ...notifPrefs,
      channels: {
        ...notifPrefs.channels,
        [channel]: {
          ...(notifPrefs.channels[channel] || {}),
          [type]: enabled,
        },
      },
    }
    setNotifPrefs(updated)
    setNotifPrefsSaving(true)
    setNotifPrefsMsg('')
    try {
      await updateNotificationPreferences({
        channels: { [channel]: { [type]: enabled } },
      })
      setNotifPrefsMsg('Saved')
      setTimeout(() => setNotifPrefsMsg(''), 2000)
    } catch (e) {
      setNotifPrefsMsg('Failed to save')
    }
    setNotifPrefsSaving(false)
  }

  async function handleSaveDigestSettings(digestFrequency: string) {
    setNotifPrefsSaving(true)
    setNotifPrefsMsg('')
    try {
      await updateNotificationPreferences({ digest_frequency: digestFrequency })
      setNotifPrefs((prev) => prev ? { ...prev, digest_frequency: digestFrequency } : prev)
      setNotifPrefsMsg('Digest preference saved')
      setTimeout(() => setNotifPrefsMsg(''), 2000)
    } catch (e) {
      setNotifPrefsMsg('Failed to save')
    }
    setNotifPrefsSaving(false)
  }

  async function handleToggleQuietHours(enabled: boolean) {
    setNotifPrefsSaving(true)
    try {
      await updateNotificationPreferences({ quiet_hours_enabled: enabled })
      setNotifPrefs((prev) => prev ? { ...prev, quiet_hours_enabled: enabled } : prev)
      setNotifPrefsMsg(enabled ? 'Quiet hours enabled' : 'Quiet hours disabled')
      setTimeout(() => setNotifPrefsMsg(''), 2000)
    } catch { /* ignore */ }
    setNotifPrefsSaving(false)
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

      {/* Notifications Tab Content */}
      {activeTab === 'notifications' && (
        <div className="space-y-8">
          {/* Notification Channels Grid */}
          <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
            <div className="mb-6">
              <h3 className="font-display text-lg font-bold text-white mb-1">Notification Channels</h3>
              <p className="text-sm text-[#FDFBF8]/60">
                Choose which types of notifications you receive and through which channels.
              </p>
            </div>

            {notifPrefsLoading && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!notifPrefsLoading && notifPrefs && (
              <>
                {/* Channel column headers */}
                <div className="grid grid-cols-[1fr_repeat(3,60px)] gap-2 mb-4 px-1">
                  <div className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">Type</div>
                  {channels.map((ch) => (
                    <div key={ch} className="flex flex-col items-center text-[10px] text-[#FDFBF8]/40">
                      <span className="material-symbols-outlined text-lg">{channelIcons[ch]}</span>
                      <span>{channelLabels[ch]}</span>
                    </div>
                  ))}
                </div>

                {/* Toggle rows */}
                <div className="divide-y divide-[#FDFBF8]/5">
                  {Object.entries(notificationTypes).map(([type, label]) => (
                    <div key={type} className="grid grid-cols-[1fr_repeat(3,60px)] gap-2 py-2.5 px-1 items-center hover:bg-[#FDFBF8]/[0.02] rounded-lg transition-colors">
                      <span className="text-sm text-[#FDFBF8]/80 truncate">{label}</span>
                      {channels.map((ch) => {
                        const enabled = notifPrefs.channels[ch]?.[type] ?? false
                        return (
                          <div key={ch} className="flex justify-center">
                            <button
                              onClick={() => handleToggleNotifType(ch, type, !enabled)}
                              disabled={notifPrefsSaving}
                              className={cn(
                                'w-9 h-5 rounded-full transition-all duration-200 relative',
                                enabled ? 'bg-[#FF8C00]' : 'bg-[#FDFBF8]/10',
                                notifPrefsSaving && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              <div
                                className={cn(
                                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm',
                                  enabled ? 'left-[18px]' : 'left-[2px]'
                                )}
                              />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-end mt-4">
                  {notifPrefsMsg && (
                    <span className="text-xs text-green-400 mr-3 animate-fade-in">{notifPrefsMsg}</span>
                  )}
                  {notifPrefsSaving && (
                    <span className="text-xs text-[#FDFBF8]/40 animate-pulse">Saving…</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Digest & Quiet Hours */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Digest Frequency */}
            <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
              <h3 className="font-display text-base font-bold text-white mb-4">Email Digest</h3>
              <p className="text-xs text-[#FDFBF8]/50 mb-4">
                Receive a summary of unread notifications via email.
              </p>
              {notifPrefs && (
                <div className="flex gap-2">
                  {[
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'never', label: 'Never' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSaveDigestSettings(opt.value)}
                      disabled={notifPrefsSaving}
                      className={cn(
                        'px-4 py-2 rounded-lg text-xs font-semibold transition-all',
                        notifPrefs.digest_frequency === opt.value
                          ? 'bg-[#FF8C00] text-[#3D1C00]'
                          : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/50 hover:text-[#FDFBF8] border border-[#FDFBF8]/10'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quiet Hours */}
            <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-bold text-white">Quiet Hours</h3>
                {notifPrefs && (
                  <button
                    onClick={() => handleToggleQuietHours(!notifPrefs.quiet_hours_enabled)}
                    disabled={notifPrefsSaving}
                    className={cn(
                      'w-11 h-6 rounded-full transition-all duration-200 relative',
                      notifPrefs.quiet_hours_enabled ? 'bg-[#FF8C00]' : 'bg-[#FDFBF8]/10'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 shadow-sm',
                        notifPrefs.quiet_hours_enabled ? 'left-[22px]' : 'left-[2px]'
                      )}
                    />
                  </button>
                )}
              </div>
              <p className="text-xs text-[#FDFBF8]/50 mb-4">
                Mute notifications during specified hours.
              </p>
              {notifPrefs && notifPrefs.quiet_hours_enabled && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-[#FDFBF8]/60">From</span>
                  <span className="font-mono text-[#FF8C00] bg-[#FF8C00]/5 px-2.5 py-1 rounded border border-[#FF8C00]/15">
                    {notifPrefs.quiet_hours_start}
                  </span>
                  <span className="text-[#FDFBF8]/60">to</span>
                  <span className="font-mono text-[#FF8C00] bg-[#FF8C00]/5 px-2.5 py-1 rounded border border-[#FF8C00]/15">
                    {notifPrefs.quiet_hours_end}
                  </span>
                </div>
              )}
              {notifPrefs && !notifPrefs.quiet_hours_enabled && (
                <p className="text-xs text-[#FDFBF8]/30 italic">All hours unmuted.</p>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-[#FF8C00]/5 border border-[#FF8C00]/15 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[#FF8C00] text-lg mt-0.5">info</span>
              <div className="text-xs text-[#FDFBF8]/60 leading-relaxed">
                <p className="font-semibold text-[#FDFBF8]/80 mb-1">About notification channels</p>
                <p><strong className="text-[#FDFBF8]/70">In-App:</strong> Notifications appear in the bell icon and on the Notifications page.</p>
                <p><strong className="text-[#FDFBF8]/70">Email:</strong> Digest emails are sent based on your digest frequency setting.</p>
                <p><strong className="text-[#FDFBF8]/70">Slack:</strong> Real-time alerts sent to your connected Slack workspace.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
