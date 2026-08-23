
/*
 * ─── DIRECTION CONTRACT · ONRAMP MISSION CONTROL ────────────────────────────
 * THESIS: Settings is the station engineer's seat — identity, signal routing
 *   (notifications), outbound links (integrations), federation (SSO) and
 *   instrument appearance (theme). Same seated-panel language as the mission
 *   dashboards: console panels with call-sign rails, mono designators, live
 *   status LEDs, recessed .input wells and signal-only colour.
 * OWN-WORLD: Daylit ops room, seated panels, signal-only colour, mono telemetry.
 * ───────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useAuth, KEY_MANAGER_ROLES } from '../context/AuthContext'
import { getToken } from '../lib/neon-auth'
import { PageHeader } from '../components/ui/page-header'
import { cn, daysUntilExpiry, formatKeyDate } from '../lib/utils'
import { useTheme, THEMES, ACCENT_COLORS, type Theme } from '../context/ThemeContext'
import {
  API_BASE,
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
  testJiraConnection,
  listJiraProjects,
  testLinearConnection,
  listLinearTeams,
  listTeams,
  configureSso,
  getSsoConfig,
  testSsoConnection,
  updateProfile,
  type ApiKey,
  type NotificationPreferences,
  type Webhook,
  type GithubTestResult,
} from '../lib/api'
import ConsolePanel from '../components/ui/console-panel'

import { useToast } from '../context/ToastContext'
import {
  User, At, Key, Bell, Palette, ShareNetwork,
  ChatCircle, GithubLogo, Check, X, Spinner, Info, Lock,
  EnvelopeSimple, Eye, Code, Trash,
  Plugs, Fire, CaretDown,
} from '@phosphor-icons/react'

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } }
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 90, damping: 18 } } }

/** Signal switch — the one toggle control used across every settings seat. */
function Toggle({ on, onChange, disabled, danger, label, describedBy }: {
  on: boolean
  onChange: () => void
  disabled?: boolean
  danger?: boolean
  label?: string
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label ? `${label} ${on ? 'on' : 'off'}` : on ? 'On' : 'Off'}
      aria-describedby={describedBy}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'w-11 h-6 rounded-pill relative shrink-0 border transition-colors duration-200',
        on ? (danger ? 'bg-abort border-abort' : 'bg-go border-go') : 'bg-well border-seam',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span aria-hidden="true" className={cn(
        'absolute top-0.5 w-5 h-5 rounded-full bg-panel-raised shadow-sm transition-all duration-200',
        on ? 'left-[22px]' : 'left-[2px]'
      )} />
    </button>
  )
}

export default function Settings() {
  const { user, role, activeTeamId, updateUser } = useAuth()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState('account')

  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [githubUsername, setGithubUsername] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState('')
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyTier, setNewKeyTier] = useState('pro')
  const [newKeyCostLimit, setNewKeyCostLimit] = useState('')
  const [newKeyExpiry, setNewKeyExpiry] = useState('')
  const [creatingKey, setCreatingKey] = useState(false)

  // Earliest selectable expiry date (today) — past dates mean "no expiry".
  const today = new Date().toISOString().split('T')[0]

  // Only engineering + exec seats may issue credentials. Everyone else sees
  // the key roster read-only (no create/revoke controls).
  const canManageKeys = !!role && KEY_MANAGER_ROLES.includes(role)

  // API keys are scoped to the active team on the backend (same identifier the
  // Developer Portal and cost-tracking panels use). Using the user's email here
  // queried a different namespace and made existing keys invisible.
  const orgName = activeTeamId || ''

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

  useEffect(() => {
    setName(user?.name || user?.displayName || '')
    setPosition(user?.position || '')
    setAvatarUrl(user?.photoURL || '')
    setGithubUsername(user?.githubUsername || '')
    setEmail(user?.email || '')
  }, [user])

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
      const updated = await updateProfile({
        name: name.trim(),
        position: position.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        github_username: githubUsername.trim() || null,
      })
      updateUser({ name: updated.name, displayName: updated.name, position: updated.position || undefined, photoURL: updated.avatar_url || undefined, githubUsername: updated.github_username || undefined })
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

  async function handleCreateKey() {
    if (!orgName) return
    setKeyError(''); setNewKey(null); setCreatingKey(true)
    // 0/empty = no limit (matches backend semantics where a 0 budget is free).
    const raw = Number(newKeyCostLimit.trim() || '')
    const costLimit = Number.isFinite(raw) && raw > 0 ? raw : undefined
    const expiresInDays = daysUntilExpiry(newKeyExpiry)
    try {
      const data = await createApiKey(orgName, newKeyTier, newKeyName.trim() || undefined, costLimit, expiresInDays)
      setNewKey(data.raw_key)
      setShowCreateKey(false); setNewKeyName(''); setNewKeyTier('pro'); setNewKeyCostLimit(''); setNewKeyExpiry('')
      await fetchKeys()
    } catch (e) {
      setKeyError(e instanceof Error ? e.message : 'Failed to create key')
    } finally { setCreatingKey(false) }
  }

  async function handleRevoke(keyId: string) {
    if (!confirm('Revoke this API key?')) return
    try { await revokeApiKey(keyId); await fetchKeys(); toast.success('API key revoked') }
    catch (e) { setKeyError(e instanceof Error ? e.message : 'Failed to revoke key'); toast.error('Failed to revoke key') }
  }

  const initial = (name || email || 'U').charAt(0).toUpperCase()

  const tabs = [
    { id: 'account', label: 'Account', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'integrations', label: 'Integrations', icon: Plugs },
    { id: 'sso', label: 'SSO', icon: Lock },
    { id: 'theme', label: 'Theme', icon: Palette },
  ]

  return (
    <motion.div variants={container} initial="hidden" animate="show"      className="w-full max-w-5xl pt-4 sm:pt-8 pb-12">
      {/* ── Header ── */}
      <motion.div variants={item} className="mb-6">
        <PageHeader
          eyebrow="Folio · Settings"
          title="Settings"
          subtitle="Identity · signal routing · outbound links · federation · appearance"
        />
      </motion.div>

      {/* ── Seat selector (segmented control) ── */}
      <motion.div variants={item} className="mb-6">
        <div className="flex items-center gap-1 rounded-btn border border-seam bg-panel-raised p-1 shadow-seam w-fit max-w-full overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              aria-pressed={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-btn text-caption font-semibold whitespace-nowrap transition-colors',
                activeTab === tab.id
                  ? 'bg-go text-[hsl(var(--primary-foreground))] shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              <tab.icon size={14} weight={activeTab === tab.id ? 'bold' : 'regular'} />
              {tab.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Account Tab */}
      {activeTab === 'account' && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
          <motion.div variants={item}>
            <ConsolePanel rail="Crew Profile" designator="IDENT" status="go">
              <div className="flex flex-col md:flex-row gap-6 sm:gap-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-well border border-seam flex items-center justify-center">
                    {user?.photoURL ? (
                      <img src={user.photoURL} alt={name || 'Avatar'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-go font-display">{initial}</span>
                    )}
                  </div>
                  <span className="overline text-ink-muted/60">Call Sign</span>
                </div>

                <div className="flex-1 space-y-5">
                  <div>
                    <label className="block overline text-ink-muted mb-2">Display Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="input"
                      placeholder="Your display name"
                    />
                  </div>
                  <div>
                    <label className="block overline text-ink-muted mb-2">Position / Title</label>
                    <input
                      type="text"
                      value={position}
                      placeholder="e.g. Senior Software Engineer"
                      onChange={e => setPosition(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block overline text-ink-muted mb-2">Avatar URL</label>
                    <input
                      type="text"
                      value={avatarUrl}
                      placeholder="https://… (optional)"
                      onChange={e => setAvatarUrl(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block overline text-ink-muted mb-2">GitHub Username</label>
                    <div className="relative">
                      <GithubLogo className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-disabled" />
                      <input
                        type="text"
                        value={githubUsername}
                        onChange={e => setGithubUsername(e.target.value)}
                        className="input pl-10"
                        placeholder="octocat"
                        maxLength={39}
                      />
                    </div>
                    <p className="text-caption text-ink-muted mt-1.5">
                      Used to connect your account to GitHub issues and PRs so your work is
                      auto-linked and recognized.
                    </p>
                  </div>
                  <div>
                    <label className="block overline text-ink-muted mb-2">Email Address</label>
                    <div className="relative">
                      <At className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-disabled" />
                      <input
                        type="email" value={email} readOnly
                        title="Email is managed by your sign-in provider"
                        className="input pl-10 text-ink-muted cursor-not-allowed"
                      />
                    </div>
                    <p className="text-caption text-ink-muted mt-1.5">Managed by your sign-in provider · not editable here.</p>
                  </div>
                  {(role || user?.createdAt) && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-ink-muted">
                      {role && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="capitalize">{role}</span>
                          <span className="text-ink-muted/60">· Team role</span>
                        </span>
                      )}
                      {user?.createdAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <span>Member since {new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-4 pt-2">
                    {savedMsg && <span className="text-caption text-go">{savedMsg}</span>}
                    <button
                      onClick={handleSaveProfile}
                      disabled={saving || !user}
                      className="btn"
                    >
                      {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            </ConsolePanel>
          </motion.div>

          {/* API Keys */}
          <motion.div variants={item}>
            <ConsolePanel
              rail="API Keys"
              designator="CREDENTIALS"
              status="standby"
              action={canManageKeys ? (
                <button onClick={() => { setNewKey(null); setShowCreateKey(!showCreateKey) }} disabled={!orgName} className="btn btn-secondary px-3 py-1.5 text-caption">
                  {showCreateKey ? 'Cancel' : '+ Create Key'}
                </button>
              ) : undefined}
            >
              <p className="text-caption text-ink-muted mb-4">
                Secret keys for programmatic access to the gateway.
                {!canManageKeys && (
                  <span className="mt-1 flex items-center gap-1.5">
                    <Lock size={13} /> Key creation is restricted to engineering & executive seats.
                  </span>
                )}
                {!orgName && (
                  <span className="mt-1 flex items-center gap-1.5">
                    <Info size={13} /> Join or select a team to manage API keys.
                  </span>
                )}
              </p>

              {keyError && <div className="mb-4 text-caption text-abort bg-abort/10 border border-abort/20 rounded-btn px-3 py-2">{keyError}</div>}

              {showCreateKey && canManageKeys && (
                <div className="mb-5 p-5 bg-well border border-seam rounded-card space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="overline text-ink-muted/70">New Credential</span>
                    <span className="designator">ISSUE</span>
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Key Name</label>
                    <input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="e.g., CI pipeline, staging, prod"
                      className="input" />
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Tier</label>
                    <div className="flex flex-wrap gap-2">
                      {['free', 'pro', 'team', 'enterprise'].map((t) => (
                        <button key={t} onClick={() => setNewKeyTier(t)}
                          className={cn('px-3 py-1.5 rounded-tile text-caption font-semibold transition-all border capitalize',
                            newKeyTier === t
                              ? 'bg-go/15 text-go border-go/30'
                              : 'bg-panel-raised text-ink-muted border-seam hover:text-ink')}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Cost Limit <span className="text-ink-muted/60 normal-case">(credits / month)</span></label>
                    <input value={newKeyCostLimit} onChange={(e) => setNewKeyCostLimit(e.target.value.replace(/[^0-9]/g, ''))}
                      type="number" min={0} placeholder="e.g., 5000 · leave blank for no limit"
                      className="input" />
                    <p className="text-caption text-ink-muted mt-1.5">The key stops working once its usage reaches this budget.</p>
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Expires On <span className="text-ink-muted/60 normal-case">(optional)</span></label>
                    <input value={newKeyExpiry} onChange={(e) => setNewKeyExpiry(e.target.value)}
                      type="date" min={today} className="input" />
                    <p className="text-caption text-ink-muted mt-1.5">The key stops working after this date. Leave blank for no expiry.</p>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setShowCreateKey(false)} className="btn btn-ghost text-caption">Cancel</button>
                    <button onClick={handleCreateKey} disabled={creatingKey} className="btn text-caption">
                      {creatingKey ? 'Creating…' : 'Create Key'}
                    </button>
                  </div>
                </div>
              )}

              {newKey && (
                <div className="mb-4 bg-caution/10 border border-caution/25 rounded-card p-4">
                  <p className="text-caption font-semibold mb-1 flex items-center gap-1.5 text-caution">
                    <Key size={14} weight="fill" />
                    Save this key · it won't be shown again:
                  </p>
                  <code className="text-caption bg-panel-raised px-3 py-2 rounded-sm block font-code break-all select-all border border-seam">{newKey}</code>
                </div>
              )}

              {keys.length === 0 ? (
                <p className="text-caption text-ink-muted italic">No API keys yet.</p>
              ) : (
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-2.5">
                  {keys.map(k => {
                    const limit = k.credit_limit ?? 0
                    const used = k.credits_used ?? k.usage_count ?? 0
                    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
                    const exhausted = limit > 0 && used >= limit
                    return (
                      <motion.div key={k.key_id} variants={item}
                        className="bg-well border border-seam rounded-tile px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Key size={16} className={cn('shrink-0', exhausted ? 'text-abort' : 'text-ink-muted')} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-body-sm text-ink-secondary font-medium truncate">{k.name || k.key_id}</span>
                                <span className="capitalize text-caption font-code text-go bg-go/10 border border-go/20 px-1.5 py-0.5 rounded-sm">{k.tier}</span>
                              </div>
                              <p className="text-caption text-ink-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="readout">{used} credits</span>
                                {k.credit_limit != null && (
                                  <span className={cn('font-medium', exhausted ? 'text-abort' : 'text-ink-muted')}>
                                    / {k.credit_limit} budget {exhausted && '· limit reached'}
                                  </span>
                                )}
                                {!k.is_active && <span className="text-abort">revoked</span>}
                              </p>
                              <p className="text-caption text-ink-muted/70 mt-1 font-code">
                                Created {formatKeyDate(k.created_at)}
                                {k.last_used_at && <> · last used {formatKeyDate(k.last_used_at)}</>}
                                {k.expires_at && <> · expires {formatKeyDate(k.expires_at)}</>}
                              </p>
                              {limit > 0 && k.is_active && (
                                <div className="mt-2 h-1.5 w-full max-w-[280px] rounded-pill bg-panel-raised border border-seam overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-pill transition-all', exhausted ? 'bg-abort' : 'bg-go')}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          {k.is_active && canManageKeys && (
                            <button onClick={() => handleRevoke(k.key_id)}
                              className="p-1.5 text-abort/60 hover:text-abort transition-colors shrink-0" title="Revoke" aria-label="Revoke key">
                              <Trash size={16} />
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </ConsolePanel>
          </motion.div>
        </motion.div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
          <motion.div variants={item}>
            <ConsolePanel rail="Notification Channels" designator="CHANNEL MATRIX" status="go">
              <p className="text-caption text-ink-muted mb-4">Choose which types of notifications you receive and through which channels.</p>

              {notifPrefsLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner size={20} className="animate-spin text-go" />
                </div>
              )}

              {!notifPrefsLoading && notifPrefs && (
                <>
                  <div className="grid grid-cols-[1fr_repeat(3,52px)] gap-2 mb-2 px-1">
                    <div className="overline text-ink-muted/70">Type</div>
                    {channels.map((ch) => (
                      <div key={ch} className="flex flex-col items-center text-caption text-ink-muted">
                        {ch === 'in_app' && <Bell size={14} className="mb-0.5" />}
                        {ch === 'email' && <EnvelopeSimple size={14} className="mb-0.5" />}
                        {ch === 'slack' && <ChatCircle size={14} className="mb-0.5" />}
                        <span>{channelLabels[ch]}</span>
                      </div>
                    ))}
                  </div>

                  <div className="divide-y divide-seam border-t border-seam">
                    {Object.entries(notificationTypes).map(([type, label]) => (
                      <div key={type}
                        className="grid grid-cols-[1fr_repeat(3,52px)] gap-2 py-2.5 px-1 items-center hover:bg-well/60 rounded-tile transition-colors">
                        <span className="text-body-sm text-ink-secondary truncate">{label}</span>
                        {channels.map((ch) => {
                          const enabled = notifPrefs.channels[ch]?.[type] ?? false
                          return (
                            <div key={ch} className="flex justify-center">
                              <Toggle
                                on={enabled}
                                onChange={() => handleToggleNotifType(ch, type, !enabled)}
                                disabled={notifPrefsSaving}
                                label={`${label} · ${channelLabels[ch]}`}
                              />
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end mt-4">
                    {notifPrefsMsg && <span className="text-caption text-go mr-3">{notifPrefsMsg}</span>}
                    {notifPrefsSaving && <span className="text-caption text-ink-muted animate-pulse">Saving…</span>}
                  </div>
                </>
              )}
            </ConsolePanel>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <ConsolePanel rail="Email Digest" designator="DIGEST" status="standby">
              <p className="text-caption text-ink-muted mb-4">Receive a summary of unread notifications via email.</p>
              {notifPrefs && (
                <div className="flex gap-2">
                  {['daily', 'weekly', 'never'].map((opt) => (
                    <button key={opt}
                      onClick={() => handleSaveDigestSettings(opt)}
                      disabled={notifPrefsSaving}
                      className={cn(
                        'px-4 py-2 rounded-btn text-caption font-semibold transition-all capitalize border',
                        notifPrefs.digest_frequency === opt
                          ? 'bg-go text-[hsl(var(--primary-foreground))] border-go shadow-sm'
                          : 'bg-well text-ink-muted hover:text-ink border-seam'
                      )}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </ConsolePanel>

            <ConsolePanel rail="Quiet Hours" designator="MUTE WINDOW" status="standby">
              <div className="flex items-center justify-between mb-3">
                <p className="text-body-sm text-ink-secondary font-medium">Mute during specified hours</p>
                {notifPrefs && (
                  <Toggle
                    on={notifPrefs.quiet_hours_enabled}
                    onChange={() => handleToggleQuietHours(!notifPrefs.quiet_hours_enabled)}
                    disabled={notifPrefsSaving}
                    label="Quiet hours"
                  />
                )}
              </div>
              <p className="text-caption text-ink-muted mb-4">No signal outside working hours.</p>
              {notifPrefs && notifPrefs.quiet_hours_enabled && (
                <div className="flex items-center gap-3 text-caption">
                  <span className="text-ink-muted">From</span>
                  <span className="font-code text-go bg-go/5 px-2.5 py-1 rounded-sm border border-go/20">
                    {notifPrefs.quiet_hours_start}
                  </span>
                  <span className="text-ink-muted">to</span>
                  <span className="font-code text-go bg-go/5 px-2.5 py-1 rounded-sm border border-go/20">
                    {notifPrefs.quiet_hours_end}
                  </span>
                </div>
              )}
              {notifPrefs && !notifPrefs.quiet_hours_enabled && (
                <p className="text-caption text-ink-muted italic">All hours unmuted.</p>
              )}
            </ConsolePanel>
          </motion.div>

          <motion.div variants={item}>
            <div className="bg-mission/5 border border-mission/15 rounded-card p-5">
              <div className="flex items-start gap-3">
                <Info size={20} className="text-mission shrink-0 mt-0.5" weight="fill" />
                <div className="text-caption text-ink-secondary leading-relaxed">
                  <p className="font-semibold text-ink mb-1">About notification channels</p>
                  <p><strong className="text-ink">In-App:</strong> Notifications appear in the bell icon and on the Notifications page.</p>
                  <p><strong className="text-ink">Email:</strong> Digest emails are sent based on your digest frequency setting.</p>
                  <p><strong className="text-ink">Slack:</strong> Real-time alerts sent to your connected Slack workspace.</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Senior Dev Roast Mode */}
          <motion.div variants={item}>
            <ConsolePanel rail="Senior Dev Roast Mode" designator="PERSONA" status="abort">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-tile bg-abort/10 flex items-center justify-center">
                    <Fire size={18} className="text-abort" weight="fill" />
                  </div>
                  <div>
                    <p className="font-heading text-body font-semibold text-ink">Roast mode</p>
                    <p className="text-caption text-ink-muted">Make the AI brutally honest. Code gets roasted, not people.</p>
                  </div>
                </div>
                {notifPrefs && (
                  <Toggle
                    on={notifPrefs.roast_mode_enabled}
                    danger
                    disabled={notifPrefsSaving}
                    label="Roast mode"
                    onChange={async () => {
                      if (notifPrefsSaving) return
                      setNotifPrefsSaving(true)
                      const next = !notifPrefs.roast_mode_enabled
                      try {
                        const updated = await updateNotificationPreferences({ roast_mode_enabled: next })
                        setNotifPrefs(updated)
                        setNotifPrefsMsg(next ? 'Roast mode activated' : 'Roast mode off')
                        setTimeout(() => setNotifPrefsMsg(''), 2000)
                      } catch (e) {
                        toast.error('Failed to save roast mode preference')
                      }
                      setNotifPrefsSaving(false)
                    }}
                  />
                )}
              </div>
              {notifPrefs?.roast_mode_enabled && (
                <p className="text-caption text-abort/70 italic mt-3">"Finally, someone who wants the truth. Buckle up." · Senior Dev Roast Bot</p>
              )}
            </ConsolePanel>
          </motion.div>
        </motion.div>
      )}

      {/* SSO Tab */}
      {activeTab === 'sso' && <SsoConfigSection />}

      {/* Theme Tab */}
      {activeTab === 'theme' && <ThemeTabContent />}

      {/* Integrations Tab */}
      {activeTab === 'integrations' && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
          {/* Slack */}
          <motion.div variants={item}>
            <ConsolePanel rail="Slack" designator="CHAT RELAY" status={slackConnected ? 'go' : 'idle'}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-tile bg-well border border-seam flex items-center justify-center">
                    <ChatCircle size={20} className="text-ink-secondary" weight="fill" />
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-ink">Slack</p>
                    <p className="text-caption text-ink-muted">Send notifications and digests to Slack</p>
                  </div>
                </div>
                {slackConnected && <span className="tile tile-go">Connected</span>}
              </div>

              {!slackConnected ? (
                <div className="space-y-4">
                  <p className="text-caption text-ink-muted">Connect a Slack workspace by providing an incoming webhook URL from Slack.</p>
                  <div className="flex flex-wrap gap-3">
                    <input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="input flex-1 min-w-[220px]" />
                    <input value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#general"
                      className="input w-28" />
                    <button onClick={handleSaveSlack} disabled={!slackWebhook.trim()} className="btn">
                      Connect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-caption text-ink-muted">
                    Relay to <span className="text-ink font-medium">{slackChannel}</span>
                    <p className="mt-0.5 text-ink-muted/60 font-code">{slackWebhook.substring(0, 40)}…</p>
                  </div>
                  <button onClick={handleDisconnectSlack} className="btn btn-danger px-3 py-1.5 text-caption">Disconnect</button>
                </div>
              )}
            </ConsolePanel>
          </motion.div>

          {/* GitHub */}
          <motion.div variants={item}>
            <ConsolePanel rail="GitHub" designator="REPO ACCESS" status={githubConnected ? 'go' : 'idle'}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-tile bg-well border border-seam flex items-center justify-center">
                    <GithubLogo size={20} className="text-ink-secondary" weight="fill" />
                  </div>
                  <div>
                    <p className="font-heading font-semibold text-ink">GitHub</p>
                    <p className="text-caption text-ink-muted">Authenticate to analyze private repositories</p>
                  </div>
                </div>
                {githubConnected && <span className="tile tile-go">Connected</span>}
              </div>

              {!githubConnected ? (
                <div className="space-y-4">
                  <p className="text-caption text-ink-muted">Provide a GitHub personal access token to enable private repository analysis and PR operations.</p>
                  <div className="flex flex-wrap gap-3">
                    <input value={githubToken} onChange={(e) => setGithubToken(e.target.value)}
                      type="password" placeholder="ghp_... or github_pat_..."
                      className="input flex-1 min-w-[220px]" />
                    <button onClick={handleTestGithub} disabled={!githubToken.trim() || githubTesting}
                      className="btn btn-secondary">
                      {githubTesting ? 'Testing…' : 'Test'}
                    </button>
                    <button onClick={handleSaveGithub} disabled={!githubToken.trim()} className="btn">
                      Save
                    </button>
                  </div>
                  {githubTestResult && (
                    <div className={cn('text-caption flex items-center gap-2', githubTestResult.valid ? 'text-go' : 'text-abort')}>
                      {githubTestResult.valid ? (
                        <><Check size={16} weight="bold" /> Valid · {githubTestResult.username} ({githubTestResult.scopes?.join(', ') || ''})</>
                      ) : (
                        <><X size={16} weight="bold" /> {githubTestResult.error}</>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="text-caption text-ink-muted flex items-center gap-2">
                    <Check size={16} className="text-go" weight="bold" /> Token configured
                  </div>
                  <button onClick={handleDisconnectGithub} className="btn btn-danger px-3 py-1.5 text-caption">Disconnect</button>
                </div>
              )}
            </ConsolePanel>
          </motion.div>

          {/* Jira */}
          <motion.div variants={item}>
            <ConsolePanel rail="Jira" designator="TICKET SYNC" status="standby">
              <JiraIntegrationSection />
            </ConsolePanel>
          </motion.div>

          {/* Linear */}
          <motion.div variants={item}>
            <ConsolePanel rail="Linear" designator="TICKET SYNC" status="standby">
              <LinearIntegrationSection />
            </ConsolePanel>
          </motion.div>

          {/* Webhooks */}
          <motion.div variants={item}>
            <ConsolePanel
              rail="Webhooks"
              designator="EVENT BUS"
              status="standby"
              action={
                <button onClick={() => { setShowAddWebhook(!showAddWebhook); setWebhookCreated(null) }}
                  className="btn btn-secondary px-3 py-1.5 text-caption">
                  {showAddWebhook ? 'Cancel' : '+ Add Webhook'}
                </button>
              }
            >
              <p className="text-caption text-ink-muted mb-4">Send real-time events to external services.</p>

              {showAddWebhook && (
                <div className="mb-5 p-5 bg-well border border-seam rounded-card space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="overline text-ink-muted/70">New Endpoint</span>
                    <span className="designator">INBOUND</span>
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Payload URL</label>
                    <input value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://example.com/webhooks/onramp"
                      className="input" />
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Description</label>
                    <input value={webhookDesc} onChange={(e) => setWebhookDesc(e.target.value)}
                      placeholder="e.g., CI pipeline notifications"
                      className="input" />
                  </div>
                  <div>
                    <label className="overline text-ink-muted mb-1.5 block">Events</label>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(eventLabels).map(([evt, label]) => (
                        <button key={evt} onClick={() => {
                          if (evt === '*') { setWebhookEvents(['*']) }
                          else { setWebhookEvents((prev) => prev.includes('*') ? [evt] : prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]) }
                        }}
                          className={cn('px-2.5 py-1 rounded-sm text-caption font-code transition-colors border',
                            webhookEvents.includes(evt) || (evt === '*' && webhookEvents.includes('*'))
                              ? 'bg-go/10 text-go border-go/25'
                              : 'bg-panel-raised text-ink-muted border-seam hover:text-ink')}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => { setShowAddWebhook(false); setWebhookCreated(null) }}
                      className="btn btn-ghost text-caption">Cancel</button>
                    <button onClick={handleCreateWebhook} disabled={!webhookUrl.trim()} className="btn text-caption">
                      Create Webhook
                    </button>
                  </div>
                  {webhookCreated && (
                    <div className="bg-caution/10 border border-caution/25 rounded-card p-4 mt-4">
                      <p className="text-caption text-caution font-semibold mb-2 flex items-center gap-1.5">
                        <Lock size={14} weight="fill" />
                        Webhook created! Save this secret · it won't be shown again:
                      </p>
                      <code className="block text-caption font-code bg-panel-raised px-3 py-2 rounded-sm select-all break-all text-ink-secondary border border-seam">{webhookCreated.secret}</code>
                    </div>
                  )}
                </div>
              )}

              {webhooksLoading && (
                <div className="flex items-center justify-center py-8">
                  <Spinner size={20} className="animate-spin text-go" />
                </div>
              )}

              {!webhooksLoading && webhooks.length === 0 && !showAddWebhook && (
                <div className="text-center py-6">
                  <ShareNetwork size={32} className="mx-auto text-ink-disabled/40 mb-2" weight="fill" />
                  <p className="text-caption text-ink-muted">No webhooks configured yet.</p>
                </div>
              )}

              {webhooks.length > 0 && (
                <div className="space-y-2.5">
                  {webhooks.map((wh) => (
                    <div key={wh.webhook_id}
                      className="flex items-center gap-4 bg-well border border-seam rounded-tile p-4">
                      <span className={cn('w-2 h-2 rounded-pill shrink-0', wh.active ? 'bg-go-lit' : 'bg-ink-disabled')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-body-sm text-ink font-medium truncate">{wh.description || 'Webhook'}</span>
                          <span className="text-caption text-ink-muted font-code truncate">{wh.url}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <span className="text-caption text-ink-muted">
                            {wh.delivery_count} deliveries
                            {wh.failure_count > 0 && <span className="text-abort ml-1">({wh.failure_count} failed)</span>}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {wh.events.slice(0, 3).map((evt) => (
                              <span key={evt} className="text-caption px-1.5 py-0.5 rounded-sm bg-panel-raised text-ink-muted font-code border border-seam">
                                {eventLabels[evt] || evt}
                              </span>
                            ))}
                            {wh.events.length > 3 && <span className="text-caption text-ink-muted">+{wh.events.length - 3}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => handleTestWebhook(wh.webhook_id)}
                          className="text-caption text-ink-muted hover:text-ink px-2 py-1 rounded-sm border border-seam transition-colors" title="Test">Ping</button>
                        <button onClick={() => handleDeleteWebhook(wh.webhook_id)}
                          className="text-abort/50 hover:text-abort transition-colors" title="Delete" aria-label="Delete webhook">
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {webhookTestResult && (
                <div className={cn('mt-4 text-caption px-4 py-2 rounded-btn',
                  webhookTestResult.startsWith('✓')
                    ? 'bg-go/10 text-go border border-go/20'
                    : 'bg-abort/10 text-abort border border-abort/20')}>
                  {webhookTestResult}
                </div>
              )}
            </ConsolePanel>
          </motion.div>

          <motion.div variants={item}>
            <div className="bg-mission/5 border border-mission/15 rounded-card p-5">
              <div className="flex items-start gap-3">
                <Lock size={20} className="text-mission shrink-0 mt-0.5" weight="fill" />
                <div className="text-caption text-ink-secondary leading-relaxed">
                  <p className="font-semibold text-ink mb-1">Webhook Security</p>
                  <p>All webhook payloads include a <code className="font-code bg-mission/10 px-1 rounded-sm text-mission">X-Onramp-Signature</code> header. Verify signatures using the secret shown when creating a webhook.</p>
                  <p className="mt-1">Headers: <code className="font-code bg-mission/10 px-1 rounded-sm text-mission">X-Onramp-Event</code>, <code className="font-code bg-mission/10 px-1 rounded-sm text-mission">X-Onramp-Delivery</code>, <code className="font-code bg-mission/10 px-1 rounded-sm text-mission">X-Onramp-Signature</code></p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}

function ThemeTabContent() {
  const { theme, accentColor, setTheme, setAccentColor, resetAccentColor } = useTheme()

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {/* Theme Picker */}
      <motion.div variants={item}>
        <ConsolePanel rail="Theme" designator="APPEARANCE" status="standby">
          <p className="text-caption text-ink-muted mb-5">Choose your preferred instrument scheme.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {THEMES.map((t) => {
              const isActive = theme === t.id
              return (
                <button key={t.id} onClick={() => setTheme(t.id as Theme)} data-theme={t.id}
                  className={cn('relative group rounded-card border transition-all duration-200 overflow-hidden text-left',
                    isActive ? 'border-go ring-1 ring-go/30 shadow-seam' : 'border-seam hover:border-seam-strong')}>
                  <div className="h-24 px-4 pt-4 pb-3">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-full" style={{
                        backgroundColor: t.id === 'light' ? '#0E7A3C' : t.id === 'himalayan' ? '#F59E0B' : t.id === 'midnight' ? '#6366F1' : t.id === 'forest' ? '#22C55E' : '#A855F7'
                      }} />
                      <div className="h-2 w-16 rounded-full" style={{
                        backgroundColor: t.id === 'light' ? '#E4E7E3' : t.id === 'himalayan' ? '#EBF0FF' : t.id === 'midnight' ? '#E8ECFF' : t.id === 'forest' ? '#E6F7E6' : '#F0E8FF', opacity: 0.7
                      }} />
                    </div>
                    <div className="flex gap-1">
                      <div className="h-1.5 flex-1 rounded-full" style={{
                        backgroundColor: t.id === 'light' ? '#F6F7F4' : t.id === 'himalayan' ? '#0C1426' : t.id === 'midnight' ? '#141B33' : t.id === 'forest' ? '#162613' : '#1C1430'
                      }} />
                      <div className="h-1.5 flex-1 rounded-full" style={{
                        backgroundColor: t.id === 'light' ? '#EDEFEB' : t.id === 'himalayan' ? '#111D35' : t.id === 'midnight' ? '#1A2547' : t.id === 'forest' ? '#1E341A' : '#251C3F'
                      }} />
                      <div className="h-1.5 w-4 rounded-full" style={{
                        backgroundColor: t.id === 'light' ? '#0E7A3C' : t.id === 'himalayan' ? '#F59E0B' : t.id === 'midnight' ? '#6366F1' : t.id === 'forest' ? '#22C55E' : '#A855F7', opacity: 0.5
                      }} />
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-panel-raised border-t border-seam">
                    <p className="text-body-sm font-medium text-ink">{t.name}</p>
                    <p className="text-caption text-ink-muted mt-0.5">{t.description}</p>
                  </div>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-go flex items-center justify-center">
                      <Check size={12} className="text-panel-raised" weight="bold" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </ConsolePanel>
      </motion.div>

      {/* Accent Color */}
      <motion.div variants={item}>
        <ConsolePanel rail="Accent Color" designator="SIGNAL OVERRIDE" status="standby">
          <p className="text-caption text-ink-muted mb-5">Override the theme's accent color with your own preference.</p>

          <div className="flex flex-wrap gap-3">
            <button onClick={resetAccentColor}
              className={cn('w-10 h-10 rounded-tile border-2 transition-all duration-200 flex items-center justify-center bg-well',
                !accentColor ? 'border-go ring-1 ring-go/30' : 'border-seam hover:border-seam-strong')}
              title="Default accent">
              <Eye size={16} className="text-ink-muted" />
            </button>
            {ACCENT_COLORS.map((c) => {
              const isActive = accentColor === c.value
              return (
                <button key={c.value} onClick={() => setAccentColor(c.value)}
                  className={cn('w-10 h-10 rounded-tile border-2 transition-all duration-200',
                    isActive ? 'border-go ring-1 ring-go/30' : 'border-seam hover:border-seam-strong')}
                  style={{ backgroundColor: c.value }} title={c.name} aria-label={c.name} />
              )
            })}
          </div>
          <p className="text-caption text-ink-muted mt-4">
            {accentColor ? `Custom accent applied: ${ACCENT_COLORS.find(c => c.value === accentColor)?.name || accentColor}` : 'Using theme default accent'}
          </p>
        </ConsolePanel>
      </motion.div>

      {/* Preview */}
      <motion.div variants={item}>
        <ConsolePanel rail="Preview" designator="SAMPLE RIG" status="go">
          <p className="text-caption text-ink-muted mb-5">Sample UI elements with your selected theme.</p>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <button className="btn">Primary Button</button>
              <button className="btn btn-secondary">Secondary</button>
              <button className="btn" style={{ background: 'var(--success)', color: 'var(--panel-raised)' }}>Success</button>
              <button className="btn" style={{ background: 'var(--abort)', color: 'var(--panel-raised)' }}>Danger</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-card border border-seam p-5 bg-panel">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-tile bg-go/10 flex items-center justify-center">
                    <Code size={16} className="text-go" />
                  </div>
                  <div>
                    <p className="text-body-sm font-medium text-ink">Sample Card</p>
                    <p className="text-caption text-ink-muted">With description text</p>
                  </div>
                </div>
                <p className="text-caption text-ink-secondary">This is how cards, text, and borders render with your current theme settings.</p>
              </div>

              <div className="rounded-card border border-seam p-5 bg-panel-raised">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-pill bg-go-lit" />
                  <span className="text-caption font-code text-ink-secondary">Status: Active</span>
                </div>
                <div className="flex gap-1 mb-3">
                  <span className="px-2 py-0.5 rounded-sm text-caption font-code bg-go/10 text-go border border-go/25">badge</span>
                  <span className="px-2 py-0.5 rounded-sm text-caption font-code bg-go/10 text-go border border-go/20">active</span>
                </div>
                <p className="text-caption text-ink-muted">Badges and status indicators.</p>
              </div>
            </div>

            <div>
              <input readOnly value="Sample input field" className="input" />
            </div>
          </div>
        </ConsolePanel>
      </motion.div>

      <motion.div variants={item}>
        <div className="bg-mission/5 border border-mission/15 rounded-card p-5">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-mission shrink-0 mt-0.5" weight="fill" />
            <div className="text-caption text-ink-secondary leading-relaxed">
              <p className="font-semibold text-ink mb-1">Theme Notes</p>
              <p>The accent color override applies on top of your chosen theme. Themes affect all backgrounds, borders, and text colors.</p>
              <p className="mt-1">Settings are saved to local storage and persist across sessions.</p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/** SSO configuration section with form fields and test connection. */
function SsoConfigSection() {
  const [idpType, setIdpType] = useState('okta')
  const [domain, setDomain] = useState('')
  const [entityId, setEntityId] = useState('')
  const [ssoUrl, setSsoUrl] = useState('')
  const [x509Cert, setX509Cert] = useState('')
  const [metadataXml, setMetadataXml] = useState('')
  const [useMetadata, setUseMetadata] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [existingConfig, setExistingConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const { user } = useAuth()
  const toast = useToast()

  useEffect(() => {
    async function load() {
      if (!user?.id) return
      setLoading(true)
      try {
        const teamsData = await listTeams(user.id)
        if (teamsData.teams?.length > 0) {
          const tid = teamsData.teams[0].team_id
          setTeamId(tid)
          try {
            const existing = await getSsoConfig(tid)
            setExistingConfig(existing)
            setIdpType(existing.idp_type)
            setEntityId(existing.entity_id)
            setSsoUrl(existing.sso_url)
            setDomain(existing.domain)
          } catch { /* no existing config */ }
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    load()
  }, [user?.id])

  async function handleSave() {
    if (!teamId) { setMessage('No team selected'); return }
    setSaving(true); setMessage('')
    try {
      await configureSso({
        team_id: teamId, idp_type: idpType,
        entity_id: useMetadata ? '' : entityId,
        sso_url: useMetadata ? '' : ssoUrl,
        x509_cert: useMetadata ? '' : x509Cert,
        domain,
        metadata_xml: useMetadata ? metadataXml : '',
      })
      setMessage('SSO configuration saved')
      toast.success('SSO configured')
      setExistingConfig({ idp_type: idpType, entity_id: entityId, domain })
    } catch (e: any) { setMessage(`Failed: ${e.message}`); toast.error('Failed to save') }
    setSaving(false)
  }

  async function handleTest() {
    if (!teamId) return
    setTesting(true)
    try {
      const result = await testSsoConnection(teamId)
      setMessage(result.success ? 'Connection OK!' : `Test failed: ${result.errors?.join(', ') || 'Unknown'}`)
    } catch (e: any) { setMessage(`Error: ${e.message}`) }
    setTesting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={20} className="animate-spin text-go" />
      </div>
    )
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={item}>
        <ConsolePanel rail="SSO / SAML" designator="FEDERATION" status="standby">
          <p className="text-caption text-ink-muted mb-5">Configure single sign-on via SAML 2.0 identity providers.</p>

          {message && (
            <div className={cn('mb-4 px-4 py-3 rounded-btn text-caption border',
              message.includes('OK') || message.includes('saved')
                ? 'bg-go/10 text-go border-go/20'
                : 'bg-abort/10 text-abort border-abort/20'
            )}>
              {message}
            </div>
          )}

          {existingConfig && (
            <div className="mb-5 px-4 py-3 rounded-btn bg-go/5 border border-go/20 text-caption text-ink-secondary">
              <p className="font-semibold text-go mb-1">✓ Currently configured</p>
              <p className="text-caption text-ink-muted">IdP: {existingConfig.idp_type} · Domain: {existingConfig.domain}</p>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="overline text-ink-muted mb-1.5 block">Identity Provider</label>
              <div className="relative">
                <select value={idpType} onChange={(e) => setIdpType(e.target.value)}
                  className="input appearance-none pr-8">
                  <option value="okta">Okta</option>
                  <option value="azure_ad">Azure AD / Entra ID</option>
                  <option value="google_workspace">Google Workspace</option>
                  <option value="onelogin">OneLogin</option>
                  <option value="custom">Custom SAML 2.0</option>
                </select>
                <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="overline text-ink-muted mb-1.5 block">Domain (e.g., company.com)</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)}
                placeholder="company.com"
                className="input" />
              <p className="text-caption text-ink-muted mt-1">Users with this email domain will be redirected for SSO login.</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useMetadata} onChange={() => setUseMetadata(!useMetadata)}
                  className="w-4 h-4 rounded-sm accent-[var(--go)]" />
                <span className="text-caption text-ink-secondary">Use metadata XML</span>
              </label>
            </div>

            {useMetadata ? (
              <div>
                <label className="overline text-ink-muted mb-1.5 block">IdP Metadata XML</label>
                <textarea value={metadataXml} onChange={(e) => setMetadataXml(e.target.value)}
                  rows={6} placeholder="Paste IdP metadata XML here..."
                  className="input font-code" />
              </div>
            ) : (
              <>
                <div>
                  <label className="overline text-ink-muted mb-1.5 block">Entity ID / Issuer</label>
                  <input value={entityId} onChange={(e) => setEntityId(e.target.value)}
                    placeholder="https://idp.company.com/saml/metadata"
                    className="input" />
                </div>
                <div>
                  <label className="overline text-ink-muted mb-1.5 block">SSO URL</label>
                  <input value={ssoUrl} onChange={(e) => setSsoUrl(e.target.value)}
                    placeholder="https://idp.company.com/saml/sso"
                    className="input" />
                </div>
                <div>
                  <label className="overline text-ink-muted mb-1.5 block">X.509 Certificate</label>
                  <textarea value={x509Cert} onChange={(e) => setX509Cert(e.target.value)}
                    rows={4} placeholder="-----BEGIN CERTIFICATE-----\n..."
                    className="input font-code" />
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={handleTest} disabled={!teamId || testing} className="btn btn-secondary">
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              <button onClick={handleSave} disabled={!teamId || saving || !domain.trim()} className="btn">
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </ConsolePanel>
      </motion.div>

      <motion.div variants={item}>
        <div className="bg-mission/5 border border-mission/15 rounded-card p-5">
          <div className="flex items-start gap-3">
            <Info size={20} className="text-mission shrink-0 mt-0.5" weight="fill" />
            <div className="text-caption text-ink-secondary leading-relaxed">
              <p className="font-semibold text-ink mb-1">About SSO / SAML</p>
              <p>Onramp supports SAML 2.0 federation with major identity providers. Once configured, users with matching email domains are automatically redirected to your IdP for authentication.</p>
              <p className="mt-1">The ACS (Assertion Consumer Service) URL is: <code className="font-code bg-mission/10 px-1 rounded-sm text-mission text-caption">{API_BASE}/auth/sso/callback</code></p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}


/*
 * Jira Integration Section
 */
function JiraIntegrationSection() {
  const [connected, setConnected] = useState(false)
  const [config, setConfig] = useState({ base_url: '', email: '', api_token: '', project_key: '', issue_type: 'Task' })
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [showProjects, setShowProjects] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getIntegration('jira').then((data: any) => {
      if (data.configured && data.config) {
        setConnected(true)
        setConfig({
          base_url: data.config.base_url || '',
          email: data.config.email || '',
          api_token: '••••••••',
          project_key: data.config.project_key || '',
          issue_type: data.config.issue_type || 'Task',
        })
      }
    }).catch(() => {})
  }, [])

  async function handleTest() {
    if (config.api_token === '••••••••') {
      toast.info('Already connected', 'Disconnect first to re-enter credentials')
      return
    }
    setTesting(true); setTestResult(null)
    try {
      const result = await testJiraConnection({
        base_url: config.base_url,
        email: config.email,
        api_token: config.api_token,
      })
      setTestResult(result)
      if (result.valid) {
        // Fetch projects
        const projData = await listJiraProjects({
          base_url: config.base_url,
          email: config.email,
          api_token: config.api_token,
        })
        setProjects(projData.projects || [])
        setShowProjects(true)
      }
    } catch (e: any) {
      setTestResult({ valid: false, error: e.message })
    }
    setTesting(false)
  }

  async function handleConnect() {
    try {
      await saveIntegration('jira', config)
      setConnected(true)
      setConfig(prev => ({ ...prev, api_token: '••••••••' }))
      toast.success('Jira connected')
    } catch (e: any) {
      toast.error('Failed', e.message)
    }
  }

  async function handleDisconnect() {
    try {
      await deleteIntegration('jira')
      setConnected(false)
      setConfig({ base_url: '', email: '', api_token: '', project_key: '', issue_type: 'Task' })
      setTestResult(null)
      setProjects([])
      setShowProjects(false)
      toast.success('Jira disconnected')
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-tile bg-well border border-seam flex items-center justify-center">
            <span className="font-heading text-ink-secondary font-bold">J</span>
          </div>
          <div>
            <p className="font-heading font-semibold text-ink">Jira</p>
            <p className="text-caption text-ink-muted">Sync tasks as Jira issues</p>
          </div>
        </div>
        {connected && <span className="tile tile-go">Connected</span>}
      </div>

      {!connected ? (
        <div className="space-y-4">
          <p className="text-caption text-ink-muted">Enter your Jira Cloud credentials. You'll need an <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener noreferrer" className="text-go hover:underline">API token</a> from Atlassian.</p>
          <div className="space-y-3">
            <input value={config.base_url} onChange={(e) => setConfig(p => ({ ...p, base_url: e.target.value }))}
              placeholder="https://your-domain.atlassian.net"
              className="input" />
            <div className="flex gap-3">
              <input value={config.email} onChange={(e) => setConfig(p => ({ ...p, email: e.target.value }))}
                placeholder="you@company.com"
                className="input flex-1" />
              <input value={config.api_token} onChange={(e) => setConfig(p => ({ ...p, api_token: e.target.value }))}
                type="password" placeholder="API token"
                className="input flex-1" />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleTest} disabled={!config.base_url || !config.email || !config.api_token || testing}
              className="btn btn-secondary">
              {testing ? 'Testing…' : 'Test & Fetch Projects'}
            </button>
          </div>
          {testResult && (
            <div className={cn('text-caption flex items-center gap-2', testResult.valid ? 'text-go' : 'text-abort')}>
              {testResult.valid ? (
                <><Check size={16} weight="bold" /> Connected as {testResult.display_name}</>
              ) : (
                <><X size={16} weight="bold" /> {testResult.error}</>
              )}
            </div>
          )}
          {showProjects && projects.length > 0 && (
            <div className="space-y-2">
              <label className="overline text-ink-muted">Project</label>
              <div className="relative">
                <select value={config.project_key}
                  onChange={(e) => setConfig(p => ({ ...p, project_key: e.target.value, issue_type: 'Task' }))}
                  className="input appearance-none pr-8">
                  <option value="">Select a project…</option>
                  {projects.map((p: any) => (
                    <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
                  ))}
                </select>
                <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={handleConnect} disabled={!config.project_key}
              className="btn">
              Connect Jira
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-caption text-ink-muted flex items-center gap-2">
            <Check size={16} className="text-go" weight="bold" /> Connected to {config.base_url || 'Jira'}
            {config.project_key && <span className="text-ink-secondary ml-1">({config.project_key})</span>}
          </div>
          <button onClick={handleDisconnect} className="btn btn-danger px-3 py-1.5 text-caption">Disconnect</button>
        </div>
      )}
    </>
  )
}


/*
 * Linear Integration Section
 */
function LinearIntegrationSection() {
  const [connected, setConnected] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [teamId, setTeamId] = useState('')
  const [testResult, setTestResult] = useState<any>(null)
  const [testing, setTesting] = useState(false)
  const [teams, setTeams] = useState<any[]>([])
  const [showTeams, setShowTeams] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getIntegration('linear').then((data: any) => {
      if (data.configured && data.config) {
        setConnected(true)
        setApiKey('••••••••')
        setTeamId(data.config.team_id || '')
      }
    }).catch(() => {})
  }, [])

  async function handleTest() {
    if (apiKey === '••••••••') {
      toast.info('Already connected', 'Disconnect first to re-enter credentials')
      return
    }
    setTesting(true); setTestResult(null)
    try {
      const result = await testLinearConnection({ api_key: apiKey })
      setTestResult(result)
      if (result.valid) {
        const teamData = await listLinearTeams({ api_key: apiKey })
        setTeams(teamData.teams || [])
        setShowTeams(true)
      }
    } catch (e: any) {
      setTestResult({ valid: false, error: e.message })
    }
    setTesting(false)
  }

  async function handleConnect() {
    try {
      await saveIntegration('linear', { api_key: apiKey, team_id: teamId })
      setConnected(true)
      setApiKey('••••••••')
      toast.success('Linear connected')
    } catch (e: any) {
      toast.error('Failed', e.message)
    }
  }

  async function handleDisconnect() {
    try {
      await deleteIntegration('linear')
      setConnected(false)
      setApiKey('')
      setTeamId('')
      setTestResult(null)
      setTeams([])
      setShowTeams(false)
      toast.success('Linear disconnected')
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  return (
    <>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-tile bg-well border border-seam flex items-center justify-center">
            <span className="font-heading text-ink-secondary font-bold">L</span>
          </div>
          <div>
            <p className="font-heading font-semibold text-ink">Linear</p>
            <p className="text-caption text-ink-muted">Sync tasks as Linear issues</p>
          </div>
        </div>
        {connected && <span className="tile tile-go">Connected</span>}
      </div>

      {!connected ? (
        <div className="space-y-4">
          <p className="text-caption text-ink-muted">Enter your Linear API key. Generate one from <span className="text-ink-secondary">Settings → API → Personal API keys</span> in Linear.</p>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            type="password" placeholder="lin_api_..."
            className="input" />
          <div className="flex gap-3">
            <button onClick={handleTest} disabled={!apiKey || testing}
              className="btn btn-secondary">
              {testing ? 'Testing…' : 'Test & Fetch Teams'}
            </button>
          </div>
          {testResult && (
            <div className={cn('text-caption flex items-center gap-2', testResult.valid ? 'text-go' : 'text-abort')}>
              {testResult.valid ? (
                <><Check size={16} weight="bold" /> Connected as {testResult.name} ({testResult.email})</>
              ) : (
                <><X size={16} weight="bold" /> {testResult.error}</>
              )}
            </div>
          )}
          {showTeams && teams.length > 0 && (
            <div className="space-y-2">
              <label className="overline text-ink-muted">Team</label>
              <div className="relative">
                <select value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="input appearance-none pr-8">
                  <option value="">Select a team…</option>
                  {teams.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.key})</option>
                  ))}
                </select>
                <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={handleConnect} disabled={!teamId}
              className="btn">
              Connect Linear
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="text-caption text-ink-muted flex items-center gap-2">
            <Check size={16} className="text-go" weight="bold" /> Connected to Linear
            {teamId && <span className="text-ink-secondary ml-1">(team: {teams.find((t: any) => t.id === teamId)?.name || teamId})</span>}
          </div>
          <button onClick={handleDisconnect} className="btn btn-danger px-3 py-1.5 text-caption">Disconnect</button>
        </div>
      )}
    </>
  )
}
