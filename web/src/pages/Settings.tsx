import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { updateProfile } from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import { useTheme, THEMES, ACCENT_COLORS, type Theme } from '../context/ThemeContext'
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getNotificationPreferences,
  updateNotificationPreferences,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  testWebhook,
  getIntegration,
  saveIntegration,
  deleteIntegration,
  testGithubToken,
  type ApiKey,
  type NotificationPreferences,
  type Webhook,
  type GithubTestResult,
} from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'

export default function Settings() {
  const { user } = useAuth()
  const toast = useToast()
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

  // ── Integrations state ───────────────────────────────────────
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookDesc, setWebhookDesc] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['*'])
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null)
  const [webhookCreated, setWebhookCreated] = useState<Webhook | null>(null)

  // Slack integration
  const [slackConnected, setSlackConnected] = useState(false)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [slackChannel, setSlackChannel] = useState('#general')

  // GitHub integration
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubTestResult, setGithubTestResult] = useState<GithubTestResult | null>(null)
  const [githubTesting, setGithubTesting] = useState(false)

  const eventLabels: Record<string, string> = {
    'task.assigned': 'Task Assigned',
    'task.started': 'Task Started',
    'task.submitted': 'Task Submitted',
    'task.reviewed': 'Task Reviewed',
    'task.approved': 'Task Approved',
    'task.completed': 'Task Completed',
    'task.needs_changes': 'Changes Requested',
    'task.cancelled': 'Task Cancelled',
    'module.granted': 'Module Granted',
    'pr.merged': 'PR Merged',
    'milestone.reached': 'Milestone Reached',
    'team.invite': 'Team Invite',
    '*': 'All Events',
  }

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true)
    try {
      const data = await listWebhooks()
      setWebhooks(data.webhooks || [])
    } catch { /* ignore */ }
    setWebhooksLoading(false)
  }, [])

  const fetchIntegrations = useCallback(async () => {
    try {
      const slack = await getIntegration('slack')
      if (slack.configured) {
        setSlackConnected(true)
        setSlackWebhook(slack.config?.webhook_url || '')
        setSlackChannel(slack.config?.channel || '#general')
      }
    } catch { /* ignore */ }
    try {
      const github = await getIntegration('github')
      if (github.configured) {
        setGithubConnected(true)
        setGithubToken(github.config?.token ? '••••••••' : '')
      }
    } catch { /* ignore */ }
  }, [])

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

  useEffect(() => {
    if (activeTab === 'integrations') {
      fetchWebhooks()
      fetchIntegrations()
    }
  }, [activeTab, fetchWebhooks, fetchIntegrations])

  async function handleCreateWebhook() {
    if (!webhookUrl.trim()) return
    try {
      const wh = await createWebhook({
        url: webhookUrl.trim(),
        events: webhookEvents,
        description: webhookDesc.trim() || undefined,
      })
      setWebhookCreated(wh)
      setWebhookUrl('')
      setWebhookDesc('')
      setShowAddWebhook(false)
      await fetchWebhooks()
    } catch { /* ignore */ }
  }

  async function handleDeleteWebhook(id: string) {
    try {
      await deleteWebhook(id)
      setWebhooks((prev) => prev.filter((w) => w.webhook_id !== id))
    } catch { /* ignore */ }
  }

  async function handleTestWebhook(id: string) {
    try {
      const result = await testWebhook(id)
      setWebhookTestResult(result.success ? '✓ Success' : `✗ ${result.error || 'Failed'}`)
      setTimeout(() => setWebhookTestResult(null), 3000)
    } catch { /* ignore */ }
  }

  async function handleSaveSlack() {
    try {
      await saveIntegration('slack', {
        webhook_url: slackWebhook,
        channel: slackChannel,
      })
      setSlackConnected(true)
    } catch { /* ignore */ }
  }

  async function handleDisconnectSlack() {
    try {
      await deleteIntegration('slack')
      setSlackConnected(false)
      setSlackWebhook('')
    } catch { /* ignore */ }
  }

  async function handleSaveGithub() {
    try {
      await saveIntegration('github', {
        token: githubToken,
      })
      setGithubConnected(true)
      setGithubToken('••••••••')
    } catch { /* ignore */ }
  }

  async function handleDisconnectGithub() {
    try {
      await deleteIntegration('github')
      setGithubConnected(false)
      setGithubToken('')
    } catch { /* ignore */ }
  }

  async function handleTestGithub() {
    const tokenToTest = githubToken || ''
    if (!tokenToTest.trim() || githubConnected) return
    setGithubTesting(true)
    setGithubTestResult(null)
    try {
      const result = await testGithubToken(tokenToTest.trim())
      setGithubTestResult(result)
    } catch {
      setGithubTestResult({ valid: false, error: 'Failed to connect to server' })
    }
    setGithubTesting(false)
  }

  async function handleSaveProfile() {
    const auth = getFirebaseAuth()
    const current = auth.currentUser
    if (!current) return
    setSaving(true)
    setSavedMsg('')
    try {
      await updateProfile(current, { displayName: name.trim() })
      setSavedMsg('Profile saved')
      toast.success('Profile saved')
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : 'Save failed')
      toast.error('Failed to save profile', e instanceof Error ? e.message : undefined)
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
      toast.error('Failed to save notification preferences')
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
      toast.error('Failed to save digest preference')
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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  }

  const tabs = [
    { id: 'account', label: 'ACCOUNT' },
    { id: 'notifications', label: 'NOTIFICATIONS' },
    { id: 'integrations', label: 'INTEGRATIONS' },
    { id: 'theme', label: 'THEME' },
  ]

  return (
    <PageTransition>
        <div className="w-full max-w-4xl pt-4 sm:pt-8 pb-12 font-body text-[#FDFBF8] max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="mb-8">
        <GradientHeading as="h1" className="mb-2">Settings</GradientHeading>
        <p className="text-[#FDFBF8]/60 text-sm">Manage your account settings and preferences.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-8 border-b border-[#FDFBF8]/10 mb-8 overflow-x-auto">
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
          <CardSpotlight className="p-8">
            <div className="mb-6">
              <GradientHeading as="h3" className="mb-1">Profile Information</GradientHeading>
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
          </CardSpotlight>

          {/* API Keys */}
          <CardSpotlight className="p-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <GradientHeading as="h3" className="mb-1">API Keys</GradientHeading>
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
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
                {keys.map(k => (
                  <motion.div key={k.key_id} variants={itemVariants} className="flex items-center justify-between bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-3">
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
                  </motion.div>
                ))}
              </motion.div>
            )}
          </CardSpotlight>
        </div>
      )}

      {/* Notifications Tab Content */}
      {activeTab === 'notifications' && (
        <div className="space-y-8">
          {/* Notification Channels Grid */}
          <CardSpotlight className="p-8">
            <div className="mb-6">
              <GradientHeading as="h3" className="mb-1">Notification Channels</GradientHeading>
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
                <div className="grid grid-cols-[1fr_repeat(3,44px)] sm:grid-cols-[1fr_repeat(3,60px)] gap-2 mb-4 px-1">
                  <div className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">Type</div>
                  {channels.map((ch) => (
                    <div key={ch} className="flex flex-col items-center text-[10px] text-[#FDFBF8]/40">
                      <span className="material-symbols-outlined text-lg">{channelIcons[ch]}</span>
                      <span>{channelLabels[ch]}</span>
                    </div>
                  ))}
                </div>

                {/* Toggle rows */}
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-[#FDFBF8]/5">
                  {Object.entries(notificationTypes).map(([type, label]) => (
                    <motion.div key={type} variants={itemVariants} className="grid grid-cols-[1fr_repeat(3,60px)] gap-2 py-2.5 px-1 items-center hover:bg-[#FDFBF8]/[0.02] rounded-lg transition-colors">
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
                    </motion.div>
                  ))}
                </motion.div>

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
          </CardSpotlight>

          {/* Digest & Quiet Hours */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Digest Frequency */}
            <CardSpotlight className="p-8">
              <GradientHeading as="h4" className="mb-4">Email Digest</GradientHeading>
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
            </CardSpotlight>

            {/* Quiet Hours */}
            <CardSpotlight className="p-8">
              <div className="flex items-center justify-between mb-4">
                <GradientHeading as="h4">Quiet Hours</GradientHeading>
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
            </CardSpotlight>
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

      {/* Theme Tab Content */}
      {activeTab === 'theme' && <ThemeTabContent />}

      {/* Integrations Tab Content */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Slack Integration */}
          <CardSpotlight className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#4A154B]/20 border border-[#4A154B]/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#E01E5A] text-xl">chat</span>
                </div>
                <div>
                  <GradientHeading as="h4">Slack</GradientHeading>
                  <p className="text-xs text-[#FDFBF8]/50">Send notifications and digests to Slack</p>
                </div>
              </div>
              {slackConnected && (
                <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              )}
            </div>

            {!slackConnected ? (
              <div className="space-y-4">
                <p className="text-xs text-[#FDFBF8]/50">
                  Connect a Slack workspace by providing an incoming webhook URL from Slack.
                </p>
                <div className="flex gap-3">
                  <input
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    placeholder="https://hooks.slack.com/services/..."
                    className="flex-1 bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] placeholder:text-[#FDFBF8]/30"
                  />
                  <input
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                    placeholder="#general"
                    className="w-28 bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] placeholder:text-[#FDFBF8]/30"
                  />
                  <button
                    onClick={handleSaveSlack}
                    disabled={!slackWebhook.trim()}
                    className="bg-[#4A154B] hover:bg-[#611f63] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-xs text-[#FDFBF8]/50">
                  Connected to <span className="text-[#FDFBF8]/80">{slackChannel}</span>
                  <p className="mt-0.5 text-[#FDFBF8]/30">{slackWebhook.substring(0, 40)}…</p>
                </div>
                <button onClick={handleDisconnectSlack} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">
                  Disconnect
                </button>
              </div>
            )}
          </CardSpotlight>

          {/* GitHub Integration */}
          <CardSpotlight className="p-8">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FDFBF8]/5 border border-[#FDFBF8]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#FDFBF8] text-xl">code</span>
                </div>
                <div>
                  <GradientHeading as="h4">GitHub</GradientHeading>
                  <p className="text-xs text-[#FDFBF8]/50">Authenticate to analyze private repositories</p>
                </div>
              </div>
              {githubConnected && (
                <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Connected
                </span>
              )}
            </div>

            {!githubConnected ? (
              <div className="space-y-4">
                <p className="text-xs text-[#FDFBF8]/50">
                  Provide a GitHub personal access token to enable private repository analysis and PR operations.
                </p>
                <div className="flex gap-3">
                  <input
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    type="password"
                    placeholder="ghp_... or github_pat_..."
                    className="flex-1 bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] placeholder:text-[#FDFBF8]/30"
                  />
                  <button
                    onClick={handleTestGithub}
                    disabled={!githubToken.trim() || githubTesting}
                    className="bg-[#FDFBF8]/6 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/60 hover:text-[#FDFBF8] px-3 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-40"
                  >
                    {githubTesting ? 'Testing…' : 'Test'}
                  </button>
                  <button
                    onClick={handleSaveGithub}
                    disabled={!githubToken.trim()}
                    className="bg-[#FF8C00] hover:bg-[#FF8C00]/90 text-[#3D1C00] px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                {githubTestResult && (
                  <div className={`text-xs flex items-center gap-2 ${
                    githubTestResult.valid ? 'text-green-400' : 'text-red-400'
                  }`}>
                    <span className="material-symbols-outlined text-sm">
                      {githubTestResult.valid ? 'check_circle' : 'error'}
                    </span>
                    {githubTestResult.valid
                      ? `Valid — ${githubTestResult.username} (${(githubTestResult.scopes || []).join(', ')})`
                      : githubTestResult.error}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-xs text-[#FDFBF8]/50 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Token configured
                </div>
                <button onClick={handleDisconnectGithub} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">
                  Disconnect
                </button>
              </div>
            )}
          </CardSpotlight>

          {/* Webhooks */}
          <CardSpotlight className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#FF8C00] text-xl">webhook</span>
                </div>
                <div>
                  <GradientHeading as="h4">Webhooks</GradientHeading>
                  <p className="text-xs text-[#FDFBF8]/50">Send real-time events to external services</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAddWebhook(!showAddWebhook); setWebhookCreated(null) }}
                className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-xs font-bold transition-colors"
              >
                {showAddWebhook ? 'Cancel' : '+ Add Webhook'}
              </button>
            </div>

            {/* Add webhook form */}
            {showAddWebhook && (
              <div className="mb-6 p-5 bg-[#0D0906] border border-[#FF8C00]/15 rounded-xl space-y-4">
                <h4 className="text-sm font-semibold text-[#FDFBF8]">New Webhook Endpoint</h4>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1.5 block">Payload URL</label>
                  <input
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://example.com/webhooks/codeflow"
                    className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] placeholder:text-[#FDFBF8]/30"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1.5 block">Description</label>
                  <input
                    value={webhookDesc}
                    onChange={(e) => setWebhookDesc(e.target.value)}
                    placeholder="e.g., CI pipeline notifications"
                    className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF8C00] placeholder:text-[#FDFBF8]/30"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 mb-1.5 block">Events</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {Object.entries(eventLabels).map(([evt, label]) => (
                      <button
                        key={evt}
                        onClick={() => {
                          if (evt === '*') {
                            setWebhookEvents(['*'])
                          } else {
                            setWebhookEvents((prev) =>
                              prev.includes('*')
                                ? [evt]
                                : prev.includes(evt)
                                ? prev.filter((e) => e !== evt)
                                : [...prev, evt]
                            )
                          }
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded text-[10px] font-mono transition-colors border',
                          webhookEvents.includes(evt) || (evt === '*' && webhookEvents.includes('*'))
                            ? 'bg-[#FF8C00]/15 text-[#FF8C00] border-[#FF8C00]/30'
                            : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/40 border-transparent hover:text-[#FDFBF8]/70'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { setShowAddWebhook(false); setWebhookCreated(null) }}
                    className="text-xs text-[#FDFBF8]/40 hover:text-[#FDFBF8] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWebhook}
                    disabled={!webhookUrl.trim()}
                    className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    Create Webhook
                  </button>
                </div>

                {webhookCreated && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mt-4">
                    <p className="text-xs text-yellow-400 font-semibold mb-2">Webhook created! Save this secret — it won't be shown again:</p>
                    <code className="block text-xs font-mono bg-[#0D0906] px-3 py-2 rounded select-all break-all text-[#FDFBF8]/80 border border-[#FDFBF8]/10">
                      {webhookCreated.secret}
                    </code>
                  </div>
                )}
              </div>
            )}

            {/* Webhook list */}
            {webhooksLoading && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-5 h-5 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!webhooksLoading && webhooks.length === 0 && !showAddWebhook && (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-3xl text-[#FDFBF8]/10 mb-2 block">webhook</span>
                <p className="text-xs text-[#FDFBF8]/30">No webhooks configured yet.</p>
              </div>
            )}

            {webhooks.length > 0 && (
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
                {webhooks.map((wh) => (
                  <motion.div key={wh.webhook_id} variants={itemVariants} className="flex items-center gap-4 bg-[#0D0906] border border-[#FDFBF8]/5 rounded-xl p-4">
                    <div className={cn(
                      'w-2.5 h-2.5 rounded-full shrink-0',
                      wh.active ? 'bg-green-500' : 'bg-[#FDFBF8]/20'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#FDFBF8] font-medium truncate">
                          {wh.description || 'Webhook'}
                        </span>
                        <span className="text-[10px] text-[#FDFBF8]/30 font-mono truncate">{wh.url}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-[#FDFBF8]/40">
                          {wh.delivery_count} deliveries
                          {wh.failure_count > 0 && (
                            <span className="text-red-400 ml-1">({wh.failure_count} failed)</span>
                          )}
                        </span>
                        <div className="flex gap-1 flex-wrap">
                          {wh.events.slice(0, 3).map((evt) => (
                            <span key={evt} className="text-[9px] px-1.5 py-0.5 rounded bg-[#FDFBF8]/5 text-[#FDFBF8]/40 font-mono">
                              {eventLabels[evt] || evt}
                            </span>
                          ))}
                          {wh.events.length > 3 && (
                            <span className="text-[9px] text-[#FDFBF8]/30">+{wh.events.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleTestWebhook(wh.webhook_id)}
                        className="text-[10px] text-[#FDFBF8]/40 hover:text-[#FDFBF8] px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                        title="Test"
                      >
                        Ping
                      </button>
                      <button
                        onClick={() => handleDeleteWebhook(wh.webhook_id)}
                        className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                    </motion.div>
                  ))}
                </motion.div>
            )}

            {webhookTestResult && (
              <div className={cn(
                'mt-4 text-xs px-4 py-2 rounded-lg',
                webhookTestResult.startsWith('✓')
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              )}>
                {webhookTestResult}
              </div>
            )}
          </CardSpotlight>

          {/* Webhook Signature Info */}
          <div className="bg-[#FF8C00]/5 border border-[#FF8C00]/15 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-[#FF8C00] text-lg mt-0.5">lock</span>
              <div className="text-xs text-[#FDFBF8]/60 leading-relaxed">
                <p className="font-semibold text-[#FDFBF8]/80 mb-1">Webhook Security</p>
                <p>All webhook payloads include a <code className="font-mono bg-[#FF8C00]/10 px-1 rounded text-[#FF8C00]">X-CodeFlow-Signature</code> header. Verify signatures using the secret shown when creating a webhook. You can rotate secrets at any time.</p>
                <p className="mt-1">Headers: <code className="font-mono bg-[#FF8C00]/10 px-1 rounded text-[#FF8C00]">X-CodeFlow-Event</code>, <code className="font-mono bg-[#FF8C00]/10 px-1 rounded text-[#FF8C00]">X-CodeFlow-Delivery</code>, <code className="font-mono bg-[#FF8C00]/10 px-1 rounded text-[#FF8C00]">X-CodeFlow-Signature</code></p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  )
}

function ThemeTabContent() {
  const { theme, accentColor, setTheme, setAccentColor, resetAccentColor } = useTheme()

  return (
    <PageTransition>
    <div className="space-y-8">
      {/* Theme Picker */}
      <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
        <div className="mb-6">
          <h3 className="font-display text-lg font-bold text-white mb-1">Theme</h3>
          <p className="text-sm text-[#FDFBF8]/60">Choose your preferred color scheme.</p>
        </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {THEMES.map((t) => {
            const isActive = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id as Theme)}
                className={cn(
                  'relative group rounded-xl border-2 transition-all duration-200 overflow-hidden text-left',
                  isActive
                    ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/30'
                    : 'border-[#FDFBF8]/10 hover:border-[#FDFBF8]/30'
                )}
              >
                {/* Theme preview card */}
                <div className="h-24 px-4 pt-4 pb-3" data-theme={t.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full" style={{
                      backgroundColor: t.id === 'himalayan' ? '#FF8C00' :
                        t.id === 'midnight' ? '#6366F1' :
                        t.id === 'forest' ? '#22C55E' :
                        '#A855F7'
                    }} />
                    <div className="h-2 w-16 rounded-full" style={{
                      backgroundColor: t.id === 'himalayan' ? '#EBF0FF' :
                        t.id === 'midnight' ? '#E8ECFF' :
                        t.id === 'forest' ? '#E6F7E6' :
                        '#F0E8FF',
                      opacity: 0.7
                    }} />
                  </div>
                  <div className="flex gap-1">
                    <div className="h-1.5 flex-1 rounded-full" style={{
                      backgroundColor: t.id === 'himalayan' ? '#0C1426' :
                        t.id === 'midnight' ? '#141B33' :
                        t.id === 'forest' ? '#162613' :
                        '#1C1430'
                    }} />
                    <div className="h-1.5 flex-1 rounded-full" style={{
                      backgroundColor: t.id === 'himalayan' ? '#111D35' :
                        t.id === 'midnight' ? '#1A2547' :
                        t.id === 'forest' ? '#1E341A' :
                        '#251C3F'
                    }} />
                    <div className="h-1.5 w-4 rounded-full" style={{
                      backgroundColor: t.id === 'himalayan' ? '#FF8C00' :
                        t.id === 'midnight' ? '#6366F1' :
                        t.id === 'forest' ? '#22C55E' :
                        '#A855F7',
                      opacity: 0.5
                    }} />
                  </div>
                </div>

                {/* Info */}
                <div className="px-4 py-3 bg-[#0D0906]">
                  <p className="text-sm font-medium text-[#FDFBF8]">{t.name}</p>
                  <p className="text-[10px] text-[#FDFBF8]/40 mt-0.5">{t.description}</p>
                </div>

                {/* Active checkmark */}
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FF8C00] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[10px] text-white">check</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Accent Color */}
      <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
        <div className="mb-6">
          <h3 className="font-display text-lg font-bold text-white mb-1">Accent Color</h3>
          <p className="text-sm text-[#FDFBF8]/60">
            Override the theme's accent color with your own preference.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Default (no override) */}
          <button
            onClick={resetAccentColor}
            className={cn(
              'w-10 h-10 rounded-xl border-2 transition-all duration-200 flex items-center justify-center',
              !accentColor
                ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/30'
                : 'border-[#FDFBF8]/10 hover:border-[#FDFBF8]/30'
            )}
            title="Default accent"
          >
            <span className="material-symbols-outlined text-sm text-[#FDFBF8]/60">auto_awesome</span>
          </button>

          {ACCENT_COLORS.map((c) => {
            const isActive = accentColor === c.value
            return (
              <button
                key={c.value}
                onClick={() => setAccentColor(c.value)}
                className={cn(
                  'w-10 h-10 rounded-xl border-2 transition-all duration-200',
                  isActive
                    ? 'border-[#FF8C00] ring-2 ring-[#FF8C00]/30'
                    : 'border-[#FDFBF8]/10 hover:border-[#FDFBF8]/30'
                )}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            )
          })}
        </div>

        <p className="text-xs text-[#FDFBF8]/40 mt-4">
          {accentColor
            ? `Custom accent applied: ${ACCENT_COLORS.find(c => c.value === accentColor)?.name || accentColor}`
            : 'Using theme default accent'
          }
        </p>
      </div>

      {/* Preview box */}
      <div className="bg-[#1A1512] rounded-2xl border border-[#FDFBF8]/5 p-8">
        <div className="mb-6">
          <h3 className="font-display text-lg font-bold text-white mb-1">Preview</h3>
          <p className="text-sm text-[#FDFBF8]/60">Sample UI elements with your selected theme.</p>
        </div>

        <div className="space-y-4">
          {/* Buttons */}
          <div className="flex flex-wrap gap-3">
            <button className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[var(--accent-from,#FF8C00)] via-[var(--accent-via,#FF6B35)] to-[var(--accent-to,#FFB347)] text-white text-sm font-semibold shadow-lg">
              Primary Button
            </button>
            <button className="px-5 py-2.5 rounded-lg border border-[var(--border,#FDFBF8/10)] text-sm text-[var(--text-secondary,#94A3B8)] hover:text-[var(--text-primary,#EBF0FF)] transition-colors">
              Secondary
            </button>
            <button className="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold">
              Success
            </button>
            <button className="px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold">
              Danger
            </button>
          </div>

          {/* Card preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--border)] p-5" style={{
              backgroundColor: 'var(--bg-tertiary, #111D35)',
            }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg" style={{
                  backgroundColor: 'var(--accent-muted, rgba(255,140,0,0.12))',
                }}>
                  <span className="material-symbols-outlined text-sm flex items-center justify-center h-full" style={{
                    color: 'var(--accent-from, #FF8C00)',
                  }}>code</span>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary, #EBF0FF)' }}>Sample Card</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted, #64748B)' }}>With description text</p>
                </div>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary, #94A3B8)' }}>
                This is how cards, text, and borders render with your current theme settings.
              </p>
            </div>

            <div className="rounded-xl border p-5" style={{
              backgroundColor: 'var(--bg-secondary, #0C1426)',
              borderColor: 'var(--border)'
            }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs font-mono" style={{ color: 'var(--text-secondary, #94A3B8)' }}>Status: Active</span>
              </div>
              <div className="flex gap-1 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono" style={{
                  backgroundColor: 'var(--accent-muted, rgba(255,140,0,0.12))',
                  color: 'var(--accent-from, #FF8C00)',
                }}>badge</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">active</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted, #64748B)' }}>
                Badges and status indicators.
              </p>
            </div>
          </div>

          {/* Input preview */}
          <div>
            <input
              readOnly
              value="Sample input field"
              className="w-full px-3.5 py-2.5 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--bg-secondary, #0C1426)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary, #EBF0FF)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-[#FF8C00]/5 border border-[#FF8C00]/15 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[#FF8C00] text-lg mt-0.5">palette</span>
          <div className="text-xs text-[#FDFBF8]/60 leading-relaxed">
            <p className="font-semibold text-[#FDFBF8]/80 mb-1">Theme Notes</p>
            <p>The accent color override applies on top of your chosen theme. Themes affect all backgrounds, borders, and text colors. The accent color affects buttons, links, badges, and highlighted elements.</p>
            <p className="mt-1">Settings are saved to local storage and persist across sessions.</p>
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  )
}
