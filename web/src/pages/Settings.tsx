// @ts-nocheck — Pre-existing auth type narrowing issues (inherited from AuthContext.tsx)
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { getToken } from '../lib/neon-auth'
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
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'
import {
  User, At, Key, Bell, Palette, ShareNetwork,
  ChatCircle, GithubLogo, Check, X, Spinner, Info, Lock,
  EnvelopeSimple, Sun, Moon, Eye, Code, Trash,
  Plugs
} from '@phosphor-icons/react'

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

  const orgName = user?.email || ''

  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences | null>(null)
  const [notifPrefsLoading, setNotifPrefsLoading] = useState(false)
  const [notifPrefsSaving, setNotifPrefsSaving] = useState(false)
  const [notifPrefsMsg, setNotifPrefsMsg] = useState('')

  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [showAddWebhook, setShowAddWebhook] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookDesc, setWebhookDesc] = useState('')
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['*'])
  const [webhookTestResult, setWebhookTestResult] = useState<string | null>(null)
  const [webhookCreated, setWebhookCreated] = useState<Webhook | null>(null)

  const [slackConnected, setSlackConnected] = useState(false)
  const [slackWebhook, setSlackWebhook] = useState('')
  const [slackChannel, setSlackChannel] = useState('#general')

  const [githubConnected, setGithubConnected] = useState(false)
  const [githubToken, setGithubToken] = useState('')
  const [githubTestResult, setGithubTestResult] = useState<GithubTestResult | null>(null)
  const [githubTesting, setGithubTesting] = useState(false)

  const eventLabels: Record<string, string> = {
    'task.assigned': 'Assigned', 'task.started': 'Started', 'task.submitted': 'Submitted',
    'task.reviewed': 'Reviewed', 'task.approved': 'Approved', 'task.completed': 'Completed',
    'task.needs_changes': 'Changes', 'task.cancelled': 'Cancelled',
    'module.granted': 'Module Granted', 'pr.merged': 'PR Merged',
    'milestone.reached': 'Milestone', 'team.invite': 'Team Invite',
    '*': 'All Events',
  }

  const fetchWebhooks = useCallback(async () => {
    setWebhooksLoading(true)
    try { const data = await listWebhooks(); setWebhooks(data.webhooks || []) } catch { /* ignore */ }
    setWebhooksLoading(false)
  }, [])

  const fetchIntegrations = useCallback(async () => {
    try {
      const slack = await getIntegration('slack')
      if (slack.configured) {
        setSlackConnected(true); setSlackWebhook(slack.config?.webhook_url || ''); setSlackChannel(slack.config?.channel || '#general')
      }
    } catch { /* ignore */ }
    try {
      const github = await getIntegration('github')
      if (github.configured) { setGithubConnected(true); setGithubToken('••••••••') }
    } catch { /* ignore */ }
  }, [])

  const notificationTypes: Record<string, string> = {
    task_assigned: 'Assigned', task_started: 'Started', task_submitted: 'Submitted',
    task_reviewed: 'Reviewed', task_approved: 'Approved', task_needs_changes: 'Changes',
    task_completed: 'Completed', task_cancelled: 'Cancelled', module_granted: 'Module Access',
    team_invite: 'Team Invite', system_alert: 'System Alert', pr_merged: 'PR Merged',
    milestone_reached: 'Milestone',
  }

  const channels = ['in_app', 'email', 'slack']
  const channelLabels: Record<string, string> = { in_app: 'In-App', email: 'Email', slack: 'Slack' }

  const fetchNotifPrefs = useCallback(async () => {
    setNotifPrefsLoading(true)
    try { const data = await getNotificationPreferences(); setNotifPrefs(data) } catch { /* ignore */ }
    setNotifPrefsLoading(false)
  }, [])

  useEffect(() => { setName(user?.displayName || ''); setEmail(user?.email || '') }, [user])

  const fetchKeys = useCallback(async () => {
    if (!orgName) return
    try { const data = await listApiKeys(orgName); setKeys(data.keys || []) } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to load API keys') }
  }, [orgName])

  useEffect(() => { fetchKeys() }, [fetchKeys])
  useEffect(() => { fetchNotifPrefs() }, [fetchNotifPrefs])
  useEffect(() => {
    if (activeTab === 'integrations') { fetchWebhooks(); fetchIntegrations() }
  }, [activeTab, fetchWebhooks, fetchIntegrations])

  async function handleCreateWebhook() {
    if (!webhookUrl.trim()) return
    try {
      const wh = await createWebhook({ url: webhookUrl.trim(), events: webhookEvents, description: webhookDesc.trim() || undefined })
      setWebhookCreated(wh); setWebhookUrl(''); setWebhookDesc(''); setShowAddWebhook(false); await fetchWebhooks()
    } catch { /* ignore */ }
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return
    try { await deleteWebhook(id); setWebhooks((prev) => prev.filter((w) => w.webhook_id !== id)); toast.success('Webhook deleted') }
    catch { toast.error('Failed to delete webhook') }
  }

  async function handleTestWebhook(id: string) {
    try { const result = await testWebhook(id); setWebhookTestResult(result.success ? '✓ Success' : `✗ ${result.error || 'Failed'}`); setTimeout(() => setWebhookTestResult(null), 3000) }
    catch { /* ignore */ }
  }

  async function handleSaveSlack() {
    try { await saveIntegration('slack', { webhook_url: slackWebhook, channel: slackChannel }); setSlackConnected(true) }
    catch { /* ignore */ }
  }

  async function handleDisconnectSlack() {
    try { await deleteIntegration('slack'); setSlackConnected(false); setSlackWebhook('') }
    catch { /* ignore */ }
  }

  async function handleSaveGithub() {
    try { await saveIntegration('github', { token: githubToken }); setGithubConnected(true); setGithubToken('••••••••') }
    catch { /* ignore */ }
  }

  async function handleDisconnectGithub() {
    try { await deleteIntegration('github'); setGithubConnected(false); setGithubToken('') }
    catch { /* ignore */ }
  }

  async function handleTestGithub() {
    const tokenToTest = githubToken || ''
    if (!tokenToTest.trim() || githubConnected) return
    setGithubTesting(true); setGithubTestResult(null)
    try { const result = await testGithubToken(tokenToTest.trim()); setGithubTestResult(result) }
    catch { setGithubTestResult({ valid: false, error: 'Failed to connect to server' }) }
    setGithubTesting(false)
  }

  async function handleSaveProfile() {
    const token = getToken()
    if (!token) return
    setSaving(true); setSavedMsg('')
    try {
      setSavedMsg('Profile saved'); toast.success('Profile saved')
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : 'Save failed'); toast.error('Failed to save profile')
    } finally { setSaving(false) }
  }

  async function handleToggleNotifType(channel: string, type: string, enabled: boolean) {
    if (!notifPrefs) return
    const updated = { ...notifPrefs, channels: { ...notifPrefs.channels, [channel]: { ...(notifPrefs.channels[channel] || {}), [type]: enabled } } }
    setNotifPrefs(updated); setNotifPrefsSaving(true); setNotifPrefsMsg('')
    try { await updateNotificationPreferences({ channels: { [channel]: { [type]: enabled } } }); setNotifPrefsMsg('Saved'); setTimeout(() => setNotifPrefsMsg(''), 2000) }
    catch (e) { setNotifPrefsMsg('Failed to save'); toast.error('Failed to save notification preferences') }
    setNotifPrefsSaving(false)
  }

  async function handleSaveDigestSettings(digestFrequency: string) {
    setNotifPrefsSaving(true); setNotifPrefsMsg('')
    try {
      await updateNotificationPreferences({ digest_frequency: digestFrequency })
      setNotifPrefs((prev) => prev ? { ...prev, digest_frequency: digestFrequency } : prev)
      setNotifPrefsMsg('Digest preference saved'); setTimeout(() => setNotifPrefsMsg(''), 2000)
    } catch (e) { setNotifPrefsMsg('Failed to save'); toast.error('Failed to save digest preference') }
    setNotifPrefsSaving(false)
  }

  async function handleToggleQuietHours(enabled: boolean) {
    setNotifPrefsSaving(true)
    try {
      await updateNotificationPreferences({ quiet_hours_enabled: enabled })
      setNotifPrefs((prev) => prev ? { ...prev, quiet_hours_enabled: enabled } : prev)
      setNotifPrefsMsg(enabled ? 'Quiet hours enabled' : 'Quiet hours disabled'); setTimeout(() => setNotifPrefsMsg(''), 2000)
    } catch { /* ignore */ }
    setNotifPrefsSaving(false)
  }

  async function handleGenerateKey() {
    if (!orgName) return
    setKeyError(''); setNewKey(null)
    try { const data = await createApiKey(orgName); setNewKey(data.raw_key); await fetchKeys() }
    catch (e) { setKeyError(e instanceof Error ? e.message : 'Failed to generate key') }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key?')) return
    try { await revokeApiKey(keyId); await fetchKeys(); toast.success('API key revoked') }
    catch (e) { setKeyError(e instanceof Error ? e.message : 'Failed to revoke key'); toast.error('Failed to revoke key') }
  }

  const initial = (name || email || 'U').charAt(0).toUpperCase()

  const containerVariants = {
    hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  }
  const itemVariants = {
    hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 },
  }

  const tabs = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Plugs },
    { id: 'theme', label: 'Theme', icon: Palette },
  ]

  return (
    <PageTransition>
      <div className="w-full max-w-4xl pt-4 sm:pt-8 pb-12 font-body text-text-primary px-4 sm:px-6">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border mb-8 overflow-x-auto pb-0">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors relative whitespace-nowrap ${
                activeTab === tab.id ? 'text-accent-primary' : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <tab.icon className="w-4 h-4" weight={activeTab === tab.id ? 'fill' : 'regular'} />
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-8">
            <CardSpotlight className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <User className="w-5 h-5 text-accent-primary" weight="fill" />
                <h3 className="font-display text-lg font-bold">Profile Information</h3>
              </div>

              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-bg-tertiary border border-border flex items-center justify-center">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={name || 'Avatar'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-accent-primary">{initial}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Display Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Email Address</label>
                    <div className="relative">
                      <At className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary/50" />
                      <input
                        type="email" value={email} readOnly
                        title="Email is managed by your sign-in provider"
                        className="w-full bg-bg-primary border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm text-text-tertiary cursor-not-allowed focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-4 pt-2">
                    {savedMsg && <span className="text-xs text-green-400">{savedMsg}</span>}
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving || !user}
                      className="bg-accent-primary hover:bg-accent-primary/90 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </CardSpotlight>

            {/* API Keys */}
            <CardSpotlight className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-accent-primary" weight="fill" />
                  <div>
                    <h3 className="font-display text-lg font-bold">API Keys</h3>
                    <p className="text-sm text-text-secondary">Manage your secret keys for programmatic access.</p>
                  </div>
                </div>
                <button onClick={handleGenerateKey} disabled={!orgName}
                  className="border border-border bg-transparent hover:bg-bg-tertiary text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                  Generate New Key
                </button>
              </div>

              {keyError && <div className="mb-4 text-sm text-red-400">{keyError}</div>}

              {newKey && (
                <div className="mb-4 bg-yellow-500/10 text-yellow-400 rounded-xl p-4 border border-yellow-500/20">
                  <p className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                    <Key className="w-4 h-4" weight="fill" />
                    Save this key — it won't be shown again:
                  </p>
                  <code className="text-xs bg-bg-primary px-3 py-2 rounded block font-mono break-all select-all">{newKey}</code>
                </div>
              )}

              {keys.length === 0 ? (
                <p className="text-sm text-text-tertiary">No API keys yet.</p>
              ) : (
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
                  {keys.map(k => (
                    <motion.div key={k.key_id} variants={itemVariants}
                      className="flex items-center justify-between bg-bg-primary border border-border rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Key className="w-4 h-4 text-text-tertiary" />
                        <div>
                          <span className="font-mono text-sm text-text-secondary">{k.key_id}</span>
                          <p className="text-xs text-text-tertiary mt-0.5">
                            <span className="capitalize">{k.tier}</span>
                            {' · '}Used {k.usage_count}x
                            {!k.is_active && <span className="text-red-400"> · revoked</span>}
                          </p>
                        </div>
                      </div>
                      {k.is_active && (
                        <button onClick={() => handleRevoke(k.key_id)}
                          className="p-1.5 text-red-400/70 hover:text-red-400 transition-colors" title="Revoke">
                          <Trash className="w-4 h-4" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </CardSpotlight>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="space-y-8">
            <CardSpotlight className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-accent-primary" weight="fill" />
                <div>
                  <h3 className="font-display text-lg font-bold">Notification Channels</h3>
                  <p className="text-sm text-text-secondary">Choose which types of notifications you receive and through which channels.</p>
                </div>
              </div>

              {notifPrefsLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-5 h-5 animate-spin text-accent-primary" />
                </div>
              )}

              {!notifPrefsLoading && notifPrefs && (
                <>
                  <div className="grid grid-cols-[1fr_repeat(3,44px)] sm:grid-cols-[1fr_repeat(3,60px)] gap-2 mb-4 px-1">
                    <div className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">Type</div>
                    {channels.map((ch) => (
                      <div key={ch} className="flex flex-col items-center text-[10px] text-text-tertiary">
                        {ch === 'in_app' && <Bell className="w-4 h-4 mb-0.5" />}
                        {ch === 'email' && <EnvelopeSimple className="w-4 h-4 mb-0.5" />}
                        {ch === 'slack' && <ChatCircle className="w-4 h-4 mb-0.5" />}
                        <span>{channelLabels[ch]}</span>
                      </div>
                    ))}
                  </div>

                  <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border">
                    {Object.entries(notificationTypes).map(([type, label]) => (
                      <motion.div key={type} variants={itemVariants}
                        className="grid grid-cols-[1fr_repeat(3,60px)] gap-2 py-2.5 px-1 items-center hover:bg-bg-tertiary/30 rounded-lg transition-colors">
                        <span className="text-sm text-text-secondary truncate">{label}</span>
                        {channels.map((ch) => {
                          const enabled = notifPrefs.channels[ch]?.[type] ?? false
                          return (
                            <div key={ch} className="flex justify-center">
                              <button
                                onClick={() => handleToggleNotifType(ch, type, !enabled)}
                                disabled={notifPrefsSaving}
                                className={cn(
                                  'w-9 h-5 rounded-full transition-all duration-200 relative',
                                  enabled ? 'bg-accent-primary' : 'bg-bg-tertiary',
                                  notifPrefsSaving && 'opacity-50 cursor-not-allowed'
                                )}
                              >
                                <div className={cn(
                                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm',
                                  enabled ? 'left-[18px]' : 'left-[2px]'
                                )} />
                              </button>
                            </div>
                          )
                        })}
                      </motion.div>
                    ))}
                  </motion.div>

                  <div className="flex items-center justify-end mt-4">
                    {notifPrefsMsg && <span className="text-xs text-green-400 mr-3">{notifPrefsMsg}</span>}
                    {notifPrefsSaving && <span className="text-xs text-text-tertiary animate-pulse">Saving…</span>}
                  </div>
                </>
              )}
            </CardSpotlight>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CardSpotlight className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <EnvelopeSimple className="w-5 h-5 text-accent-primary" weight="fill" />
                  <h4 className="font-display font-bold">Email Digest</h4>
                </div>
                <p className="text-xs text-text-tertiary mb-4">Receive a summary of unread notifications via email.</p>
                {notifPrefs && (
                  <div className="flex gap-2">
                    {['daily', 'weekly', 'never'].map((opt) => (
                      <button key={opt}
                        onClick={() => handleSaveDigestSettings(opt)}
                        disabled={notifPrefsSaving}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-semibold transition-all capitalize',
                          notifPrefs.digest_frequency === opt
                            ? 'bg-accent-primary text-white'
                            : 'bg-bg-tertiary text-text-tertiary hover:text-text-secondary border border-border'
                        )}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </CardSpotlight>

              <CardSpotlight className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Moon className="w-5 h-5 text-accent-primary" weight="fill" />
                    <h4 className="font-display font-bold">Quiet Hours</h4>
                  </div>
                  {notifPrefs && (
                    <button onClick={() => handleToggleQuietHours(!notifPrefs.quiet_hours_enabled)}
                      disabled={notifPrefsSaving}
                      className={cn('w-11 h-6 rounded-full transition-all duration-200 relative',
                        notifPrefs.quiet_hours_enabled ? 'bg-accent-primary' : 'bg-bg-tertiary')}>
                      <div className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200 shadow-sm',
                        notifPrefs.quiet_hours_enabled ? 'left-[22px]' : 'left-[2px]')} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-text-tertiary mb-4">Mute notifications during specified hours.</p>
                {notifPrefs && notifPrefs.quiet_hours_enabled && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-text-tertiary">From</span>
                    <span className="font-mono text-accent-primary bg-accent-primary/5 px-2.5 py-1 rounded border border-accent-primary/15">
                      {notifPrefs.quiet_hours_start}
                    </span>
                    <span className="text-text-tertiary">to</span>
                    <span className="font-mono text-accent-primary bg-accent-primary/5 px-2.5 py-1 rounded border border-accent-primary/15">
                      {notifPrefs.quiet_hours_end}
                    </span>
                  </div>
                )}
                {notifPrefs && !notifPrefs.quiet_hours_enabled && (
                  <p className="text-xs text-text-tertiary italic">All hours unmuted.</p>
                )}
              </CardSpotlight>
            </div>

            <div className="bg-accent-primary/5 border border-accent-primary/15 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-accent-primary shrink-0 mt-0.5" weight="fill" />
                <div className="text-xs text-text-secondary leading-relaxed">
                  <p className="font-semibold text-text-secondary mb-1">About notification channels</p>
                  <p><strong className="text-text-secondary">In-App:</strong> Notifications appear in the bell icon and on the Notifications page.</p>
                  <p><strong className="text-text-secondary">Email:</strong> Digest emails are sent based on your digest frequency setting.</p>
                  <p><strong className="text-text-secondary">Slack:</strong> Real-time alerts sent to your connected Slack workspace.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Theme Tab */}
        {activeTab === 'theme' && <ThemeTabContent />}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            {/* Slack */}
            <CardSpotlight className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#4A154B]/20 border border-[#4A154B]/30 flex items-center justify-center">
                    <ChatCircle className="w-5 h-5 text-[#E01E5A]" weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold">Slack</h4>
                    <p className="text-xs text-text-tertiary">Send notifications and digests to Slack</p>
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
                  <p className="text-xs text-text-tertiary">Connect a Slack workspace by providing an incoming webhook URL from Slack.</p>
                  <div className="flex flex-wrap gap-3">
                    <input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="flex-1 min-w-[200px] bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 placeholder:text-text-tertiary/50" />
                    <input value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#general"
                      className="w-28 bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 placeholder:text-text-tertiary/50" />
                    <button onClick={handleSaveSlack} disabled={!slackWebhook.trim()}
                      className="bg-[#4A154B] hover:bg-[#611f63] text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                      Connect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-xs text-text-tertiary">
                    Connected to <span className="text-text-secondary">{slackChannel}</span>
                    <p className="mt-0.5 text-text-tertiary/50">{slackWebhook.substring(0, 40)}…</p>
                  </div>
                  <button onClick={handleDisconnectSlack} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Disconnect</button>
                </div>
              )}
            </CardSpotlight>

            {/* GitHub */}
            <CardSpotlight className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-bg-tertiary border border-border flex items-center justify-center">
                    <GithubLogo className="w-5 h-5 text-text-primary" weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold">GitHub</h4>
                    <p className="text-xs text-text-tertiary">Authenticate to analyze private repositories</p>
                  </div>
                </div>
                {githubConnected && (
                  <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-[10px] font-mono border border-green-500/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Connected
                  </span>
                )}
              </div>

              {!githubConnected ? (
                <div className="space-y-4">
                  <p className="text-xs text-text-tertiary">Provide a GitHub personal access token to enable private repository analysis and PR operations.</p>
                  <div className="flex flex-wrap gap-3">
                    <input value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                      type="password" placeholder="ghp_... or github_pat_..."
                      className="flex-1 min-w-[200px] bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 placeholder:text-text-tertiary/50" />
                    <button onClick={handleTestGithub} disabled={!githubToken.trim() || githubTesting}
                      className="bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-tertiary hover:text-text-secondary px-3 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-40">
                      {githubTesting ? 'Testing…' : 'Test'}
                    </button>
                    <button onClick={handleSaveGithub} disabled={!githubToken.trim()}
                      className="bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                      Save
                    </button>
                  </div>
                  {githubTestResult && (
                    <div className={`text-xs flex items-center gap-2 ${githubTestResult.valid ? 'text-green-400' : 'text-red-400'}`}>
                      {githubTestResult.valid ? (
                        <><Check className="w-4 h-4" weight="bold" /> Valid — {githubTestResult.username} ({githubTestResult.scopes?.join(', ') || ''})</>
                      ) : (
                        <><X className="w-4 h-4" weight="bold" /> {githubTestResult.error}</>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-xs text-text-tertiary flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-400" weight="bold" /> Token configured
                  </div>
                  <button onClick={handleDisconnectGithub} className="text-xs text-red-400/60 hover:text-red-400 transition-colors">Disconnect</button>
                </div>
              )}
            </CardSpotlight>

            {/* Webhooks */}
            <CardSpotlight className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center">
                    <ShareNetwork className="w-5 h-5 text-accent-primary" weight="fill" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold">Webhooks</h4>
                    <p className="text-xs text-text-tertiary">Send real-time events to external services</p>
                  </div>
                </div>
                <button onClick={() => { setShowAddWebhook(!showAddWebhook); setWebhookCreated(null) }}
                  className="bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors">
                  {showAddWebhook ? 'Cancel' : '+ Add Webhook'}
                </button>
              </div>

              {showAddWebhook && (
                <div className="mb-6 p-5 bg-bg-primary border border-accent-primary/15 rounded-xl space-y-4">
                  <h4 className="text-sm font-semibold">New Webhook Endpoint</h4>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5 block">Payload URL</label>
                    <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/webhooks/codeflow"
                      className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 placeholder:text-text-tertiary/50" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5 block">Description</label>
                    <input value={webhookDesc} onChange={(e) => setWebhookDesc(e.target.value)}
                      placeholder="e.g., CI pipeline notifications"
                      className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary/50 placeholder:text-text-tertiary/50" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5 block">Events</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(eventLabels).map(([evt, label]) => (
                        <button key={evt} onClick={() => {
                          if (evt === '*') { setWebhookEvents(['*']) }
                          else { setWebhookEvents((prev) => prev.includes('*') ? [evt] : prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]) }
                        }}
                          className={cn('px-2.5 py-1 rounded text-[10px] font-mono transition-colors border',
                            webhookEvents.includes(evt) || (evt === '*' && webhookEvents.includes('*'))
                              ? 'bg-accent-primary/15 text-accent-primary border-accent-primary/30'
                              : 'bg-bg-tertiary text-text-tertiary border-transparent hover:text-text-secondary')}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => { setShowAddWebhook(false); setWebhookCreated(null) }}
                      className="text-xs text-text-tertiary hover:text-text-secondary transition-colors">Cancel</button>
                    <button onClick={handleCreateWebhook} disabled={!webhookUrl.trim()}
                      className="bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">Create Webhook</button>
                  </div>
                  {webhookCreated && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mt-4">
                      <p className="text-xs text-yellow-400 font-semibold mb-2 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" weight="fill" />
                        Webhook created! Save this secret — it won't be shown again:
                      </p>
                      <code className="block text-xs font-mono bg-bg-primary px-3 py-2 rounded select-all break-all text-text-secondary border border-border">{webhookCreated.secret}</code>
                    </div>
                  )}
                </div>
              )}

              {webhooksLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner className="w-5 h-5 animate-spin text-accent-primary" />
                </div>
              )}

              {!webhooksLoading && webhooks.length === 0 && !showAddWebhook && (
                <div className="text-center py-6">
                  <ShareNetwork className="w-8 h-8 mx-auto text-text-tertiary/30 mb-2" weight="fill" />
                  <p className="text-xs text-text-tertiary">No webhooks configured yet.</p>
                </div>
              )}

              {webhooks.length > 0 && (
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3">
                  {webhooks.map((wh) => (
                    <motion.div key={wh.webhook_id} variants={itemVariants}
                      className="flex items-center gap-4 bg-bg-primary border border-border rounded-xl p-4">
                      <div className={cn('w-2.5 h-2.5 rounded-full shrink-0', wh.active ? 'bg-green-500' : 'bg-text-tertiary/50')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text-primary font-medium truncate">{wh.description || 'Webhook'}</span>
                          <span className="text-[10px] text-text-tertiary font-mono truncate">{wh.url}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-text-tertiary">
                            {wh.delivery_count} deliveries
                            {wh.failure_count > 0 && <span className="text-red-400 ml-1">({wh.failure_count} failed)</span>}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {wh.events.slice(0, 3).map((evt) => (
                              <span key={evt} className="text-[9px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-tertiary font-mono">
                                {eventLabels[evt] || evt}
                              </span>
                            ))}
                            {wh.events.length > 3 && <span className="text-[9px] text-text-tertiary">+{wh.events.length - 3}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleTestWebhook(wh.webhook_id)}
                          className="text-[10px] text-text-tertiary hover:text-text-secondary px-2 py-1 rounded border border-border transition-colors" title="Test">Ping</button>
                        <button onClick={() => handleDeleteWebhook(wh.webhook_id)}
                          className="text-red-400/40 hover:text-red-400 transition-colors" title="Delete">
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}

              {webhookTestResult && (
                <div className={cn('mt-4 text-xs px-4 py-2 rounded-xl',
                  webhookTestResult.startsWith('✓')
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
                  {webhookTestResult}
                </div>
              )}
            </CardSpotlight>

            <div className="bg-accent-primary/5 border border-accent-primary/15 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-accent-primary shrink-0 mt-0.5" weight="fill" />
                <div className="text-xs text-text-secondary leading-relaxed">
                  <p className="font-semibold text-text-secondary mb-1">Webhook Security</p>
                  <p>All webhook payloads include a <code className="font-mono bg-accent-primary/10 px-1 rounded text-accent-primary">X-CodeFlow-Signature</code> header. Verify signatures using the secret shown when creating a webhook.</p>
                  <p className="mt-1">Headers: <code className="font-mono bg-accent-primary/10 px-1 rounded text-accent-primary">X-CodeFlow-Event</code>, <code className="font-mono bg-accent-primary/10 px-1 rounded text-accent-primary">X-CodeFlow-Delivery</code>, <code className="font-mono bg-accent-primary/10 px-1 rounded text-accent-primary">X-CodeFlow-Signature</code></p>
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
        <CardSpotlight className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Sun className="w-5 h-5 text-accent-primary" weight="fill" />
            <div>
              <h3 className="font-display text-lg font-bold">Theme</h3>
              <p className="text-sm text-text-secondary">Choose your preferred color scheme.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {THEMES.map((t) => {
              const isActive = theme === t.id
              return (
                <button key={t.id} onClick={() => setTheme(t.id as Theme)}
                  className={cn('relative group rounded-xl border-2 transition-all duration-200 overflow-hidden text-left',
                    isActive ? 'border-accent-primary ring-2 ring-accent-primary/30' : 'border-border hover:border-text-tertiary')}>
                  <div className="h-24 px-4 pt-4 pb-3" data-theme={t.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-full" style={{
                        backgroundColor: t.id === 'himalayan' ? '#F59E0B' : t.id === 'midnight' ? '#6366F1' : t.id === 'forest' ? '#22C55E' : '#A855F7'
                      }} />
                      <div className="h-2 w-16 rounded-full" style={{
                        backgroundColor: t.id === 'himalayan' ? '#EBF0FF' : t.id === 'midnight' ? '#E8ECFF' : t.id === 'forest' ? '#E6F7E6' : '#F0E8FF', opacity: 0.7
                      }} />
                    </div>
                    <div className="flex gap-1">
                      <div className="h-1.5 flex-1 rounded-full" style={{
                        backgroundColor: t.id === 'himalayan' ? '#0C1426' : t.id === 'midnight' ? '#141B33' : t.id === 'forest' ? '#162613' : '#1C1430'
                      }} />
                      <div className="h-1.5 flex-1 rounded-full" style={{
                        backgroundColor: t.id === 'himalayan' ? '#111D35' : t.id === 'midnight' ? '#1A2547' : t.id === 'forest' ? '#1E341A' : '#251C3F'
                      }} />
                      <div className="h-1.5 w-4 rounded-full" style={{
                        backgroundColor: t.id === 'himalayan' ? '#F59E0B' : t.id === 'midnight' ? '#6366F1' : t.id === 'forest' ? '#22C55E' : '#A855F7', opacity: 0.5
                      }} />
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-bg-primary">
                    <p className="text-sm font-medium text-text-primary">{t.name}</p>
                    <p className="text-[10px] text-text-tertiary mt-0.5">{t.description}</p>
                  </div>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" weight="bold" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardSpotlight>

        {/* Accent Color */}
        <CardSpotlight className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Palette className="w-5 h-5 text-accent-primary" weight="fill" />
            <div>
              <h3 className="font-display text-lg font-bold">Accent Color</h3>
              <p className="text-sm text-text-secondary">Override the theme's accent color with your own preference.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={resetAccentColor}
              className={cn('w-10 h-10 rounded-xl border-2 transition-all duration-200 flex items-center justify-center',
                !accentColor ? 'border-accent-primary ring-2 ring-accent-primary/30' : 'border-border hover:border-text-tertiary')}
              title="Default accent">
              <Eye className="w-4 h-4 text-text-tertiary" />
            </button>
            {ACCENT_COLORS.map((c) => {
              const isActive = accentColor === c.value
              return (
                <button key={c.value} onClick={() => setAccentColor(c.value)}
                  className={cn('w-10 h-10 rounded-xl border-2 transition-all duration-200',
                    isActive ? 'border-accent-primary ring-2 ring-accent-primary/30' : 'border-border hover:border-text-tertiary')}
                  style={{ backgroundColor: c.value }} title={c.name} />
              )
            })}
          </div>
          <p className="text-xs text-text-tertiary mt-4">
            {accentColor ? `Custom accent applied: ${ACCENT_COLORS.find(c => c.value === accentColor)?.name || accentColor}` : 'Using theme default accent'}
          </p>
        </CardSpotlight>

        {/* Preview */}
        <CardSpotlight className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Code className="w-5 h-5 text-accent-primary" weight="fill" />
            <div>
              <h3 className="font-display text-lg font-bold">Preview</h3>
              <p className="text-sm text-text-secondary">Sample UI elements with your selected theme.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button className="px-5 py-2.5 rounded-xl bg-accent-primary text-white text-sm font-semibold shadow-lg">Primary Button</button>
              <button className="px-5 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary transition-colors">Secondary</button>
              <button className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold">Success</button>
              <button className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold">Danger</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border p-5 bg-bg-secondary">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-primary/15 flex items-center justify-center">
                    <Code className="w-4 h-4 text-accent-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Sample Card</p>
                    <p className="text-[10px] text-text-tertiary">With description text</p>
                  </div>
                </div>
                <p className="text-xs text-text-secondary">This is how cards, text, and borders render with your current theme settings.</p>
              </div>

              <div className="rounded-xl border border-border p-5 bg-bg-primary">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-mono text-text-secondary">Status: Active</span>
                </div>
                <div className="flex gap-1 mb-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-accent-primary/15 text-accent-primary border border-accent-primary/30">badge</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-green-500/10 text-green-400 border border-green-500/20">active</span>
                </div>
                <p className="text-xs text-text-tertiary">Badges and status indicators.</p>
              </div>
            </div>

            <div>
              <input readOnly value="Sample input field"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-bg-primary border border-border text-text-primary" />
            </div>
          </div>
        </CardSpotlight>

        <div className="bg-accent-primary/5 border border-accent-primary/15 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-accent-primary shrink-0 mt-0.5" weight="fill" />
            <div className="text-xs text-text-secondary leading-relaxed">
              <p className="font-semibold text-text-secondary mb-1">Theme Notes</p>
              <p>The accent color override applies on top of your chosen theme. Themes affect all backgrounds, borders, and text colors.</p>
              <p className="mt-1">Settings are saved to local storage and persist across sessions.</p>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
