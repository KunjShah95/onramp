import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  createTeam, listTeams, addTeamMember, getTeamMembers, changeTeamTier,
  getTeamModulePermissions, grantModuleAccess, revokeModuleAccess, revokeAllModuleAccess,
  createTeamInvite, listTeamInvites, cancelTeamInvite,
  type ModulePermission, type TeamInvite,
} from '../lib/api'
import { PageHeader } from '../components/ui/page-header'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import { useToast } from '../context/ToastContext'
import { TeamSettingsSkeleton } from '../components/ui/Skeleton'
import {
  Users, UserPlus, EnvelopeSimple, X, ArrowRight,
  Shield, Lock, Key, Star
} from '@phosphor-icons/react'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(
      'w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-accent-primary/40 transition-colors',
      className
    )} {...props} />
  )
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(
      'w-full bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary/40 transition-colors',
      className
    )} {...props} />
  )
}

const TIER_LABELS: Record<string, string> = {
  free: 'Free', startup: 'Startup', professional: 'Professional', enterprise: 'Enterprise',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function TeamPage() {
  const toast = useToast()
  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [tier, setTier] = useState('free')

  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [availableModules, setAvailableModules] = useState<string[]>([])
  const [newModuleName, setNewModuleName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [activeSection, setActiveSection] = useState<'teams' | 'modules'>('teams')

  const [teamMembers, setTeamMembers] = useState<{ user_id: string; name: string; role: string }[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [teamsLoading, setTeamsLoading] = useState(true)

  const fetchTeamMembers = useCallback(async () => {
    if (!teamId) { setTeamMembers([]); return }
    try { setTeamMembers(await getTeamMembers(teamId)) } catch { setTeamMembers([]) }
  }, [teamId])

  const loadInvites = useCallback(async (tid: string) => {
    try { const data = await listTeamInvites(tid); setInvites(data.invites || []) } catch { /* ignore */ }
  }, [])

  const fetchTeams = useCallback(async () => {
    try { const data = await listTeams('current-user'); setTeams(data.teams || []) } catch { /* ignore */ }
    finally { setTeamsLoading(false) }
  }, [])

  const fetchPermissions = useCallback(async () => {
    if (!teamId) return
    try { const data = await getTeamModulePermissions(teamId); setPermissions(data.permissions || []); setAvailableModules(data.modules || []) } catch { /* ignore */ }
  }, [teamId])

  useEffect(() => { fetchTeams() }, [fetchTeams])
  useEffect(() => { fetchPermissions() }, [fetchPermissions])
  useEffect(() => { fetchTeamMembers() }, [fetchTeamMembers])
  useEffect(() => { if (teamId) loadInvites(teamId) }, [teamId, loadInvites])

  async function handleCreateTeam() {
    if (!teamName.trim()) return
    setLoading(true); setError('')
    try {
      const data = await createTeam(teamName.trim(), 'current-user', tier)
      setTeamId(data.team_id); setTeamName(''); await fetchTeams()
      toast.success('Team created', teamName.trim())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create team'); toast.error('Failed to create team') }
    setLoading(false)
  }

  async function handleAddMember() {
    if (!teamId || !memberEmail.trim()) return
    try {
      await addTeamMember(teamId, memberEmail.trim(), 'member'); setMemberEmail(''); await fetchTeams()
      toast.success('Member added', memberEmail.trim())
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to add member'); toast.error('Failed to add member') }
  }

  async function handleChangeTier(newTier: string) {
    if (!teamId) return
    try { await changeTeamTier(teamId, newTier); setTier(newTier); await fetchTeams(); toast.success('Tier updated', newTier) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to change tier'); toast.error('Failed to update tier') }
  }

  async function handleGrantModule() {
    if (!teamId || !selectedUserId || !newModuleName.trim()) return
    try { await grantModuleAccess(teamId, selectedUserId, newModuleName.trim()); setNewModuleName(''); await fetchPermissions(); toast.success('Module granted', newModuleName.trim()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to grant module access'); toast.error('Failed to grant module') }
  }

  async function handleRevokeModule(userId: string, module: string) {
    if (!teamId) return
    if (!confirm(`Revoke access to module "${module}" for this user?`)) return
    try { await revokeModuleAccess(teamId, userId, module); await fetchPermissions(); toast.success('Module access revoked') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke module access') }
  }

  async function handleRevokeAll(userId: string) {
    if (!teamId) return
    if (!confirm('Revoke ALL module access for this user?')) return
    try { await revokeAllModuleAccess(teamId, userId); await fetchPermissions(); toast.success('All module access revoked') }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke all access') }
  }

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim() || !teamId) return
    setInviteLoading(true); setInviteError('')
    try {
      await createTeamInvite(teamId, inviteEmail.trim())
      setInviteEmail(''); await loadInvites(teamId)
      toast.success('Invite sent', inviteEmail.trim())
    } catch (e: any) { setInviteError(e.message || 'Failed to create invite'); toast.error('Invite failed', e.message) }
    finally { setInviteLoading(false) }
  }

  const handleCancelInvite = async (inviteId: string) => {
    if (!teamId) return
    if (!confirm('Cancel this pending invite?')) return
    try { await cancelTeamInvite(teamId, inviteId); await loadInvites(teamId); toast.success('Invite cancelled') }
    catch { toast.error('Failed to cancel invite') }
  }

  const membersWithModules = permissions.reduce<Record<string, { name: string; modules: string[]; sources: string[] }>>((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = { name: p.user_name, modules: [], sources: [] }
    acc[p.user_id].modules.push(p.module)
    if (!acc[p.user_id].sources.includes(p.source)) acc[p.user_id].sources.push(p.source)
    return acc
  }, {})

  const currentTeam = teams.find(t => t.team_id === teamId)

  if (teamsLoading) {
    return (
      <PageTransition>
        <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6">
          <TeamSettingsSkeleton />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 font-body text-text-primary">
        <PageHeader
          title="Team Management"
          subtitle={teamId && currentTeam ? `Managing ${currentTeam.name}` : 'Create teams, invite members, manage module-level access'}
          pills={teamId && currentTeam ? [
            { label: 'members', value: currentTeam.members?.length || 0 },
            { label: 'tier', value: TIER_LABELS[currentTeam.tier] || currentTeam.tier, color: 'text-accent-primary' },
          ] : undefined}
          actions={teamId ? (
            <div className="flex bg-bg-primary border border-border rounded-xl overflow-hidden p-0.5 gap-0.5">
              {(['teams', 'modules'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveSection(tab)}
                  className={cn(
                    'px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150',
                    activeSection === tab ? 'bg-bg-tertiary text-accent-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50'
                  )}>
                  {tab === 'teams' ? 'Team' : 'Module Access'}
                </button>
              ))}
            </div>
          ) : undefined}
        />

        {error && (
          <div className="mb-5 flex items-center justify-between px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-3 text-red-400/50 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" weight="bold" />
            </button>
          </div>
        )}

        {activeSection === 'teams' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Create team */}
              <CardSpotlight className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <UserPlus className="w-4 h-4 text-accent-primary" weight="fill" />
                  <GradientHeading as="h3" className="text-sm font-bold">Create Team</GradientHeading>
                </div>
                <div className="space-y-3">
                  <Field label="Team Name">
                    <Input value={teamName} onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g., Backend Squad" onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()} />
                  </Field>
                  <Field label="Initial Tier">
                    <Select value={tier} onChange={(e) => setTier(e.target.value)}>
                      <option value="free">Free — 1 member</option>
                      <option value="startup">Startup — $49/mo, 5 members</option>
                      <option value="professional">Professional — $299/mo, 20 members</option>
                      <option value="enterprise">Enterprise — Custom</option>
                    </Select>
                  </Field>
                  <button onClick={handleCreateTeam} disabled={loading || !teamName.trim()}
                    className="w-full bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40">
                    {loading ? 'Creating…' : 'Create Team'}
                  </button>
                </div>
              </CardSpotlight>

              {/* Add member */}
              {teamId ? (
                <CardSpotlight className="p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserPlus className="w-4 h-4 text-accent-primary" weight="fill" />
                    <GradientHeading as="h3" className="text-sm font-bold">Add Member</GradientHeading>
                  </div>
                  <div className="space-y-3">
                    <Field label="Email or User ID">
                      <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="user@company.com" onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} />
                    </Field>
                    <button onClick={handleAddMember} disabled={!memberEmail.trim()}
                      className="w-full bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-secondary hover:text-text-primary px-4 py-2 rounded-xl text-sm font-medium border border-border transition-colors disabled:opacity-40">
                      Add Member
                    </button>
                  </div>

                  {/* Invite Member */}
                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-text-primary tracking-wide flex items-center gap-1.5">
                      <EnvelopeSimple className="w-4 h-4" />
                      Invite by Email
                    </h4>
                    <p className="text-xs text-text-tertiary">Send an email invitation. The user will receive a link to join.</p>
                    <div className="flex gap-2">
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                        placeholder="newmember@company.com"
                        className="flex-1 bg-bg-primary border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary/30 outline-none focus:border-accent-primary/40"
                        onKeyDown={e => e.key === 'Enter' && handleCreateInvite()} />
                      <button onClick={handleCreateInvite} disabled={inviteLoading || !inviteEmail.trim()}
                        className="px-4 py-2 bg-accent-primary text-white text-sm font-bold rounded-xl hover:bg-accent-primary/90 disabled:opacity-40 transition-colors">
                        {inviteLoading ? 'Sending...' : 'Send Invite'}
                      </button>
                    </div>
                    {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}

                    {invites.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <h4 className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold">
                          Pending Invites ({invites.filter(i => i.status === 'pending').length})
                        </h4>
                        {invites.filter(i => i.status === 'pending').map(inv => (
                          <div key={inv.id} className="flex items-center justify-between bg-bg-primary rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <EnvelopeSimple className="w-3.5 h-3.5 text-text-tertiary" />
                              <span className="text-sm text-text-primary">{inv.email}</span>
                              <span className="ml-1 text-[10px] uppercase tracking-wider text-accent-primary/60">{inv.role}</span>
                            </div>
                            <button onClick={() => handleCancelInvite(inv.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Cancel</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardSpotlight>
              ) : (
                <CardSpotlight className="p-5 flex items-center justify-center">
                  <p className="text-xs text-text-tertiary text-center">Create a team first to add members</p>
                </CardSpotlight>
              )}
            </div>

            {/* Tier switcher */}
            {teamId && (
              <CardSpotlight className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Star className="w-4 h-4 text-accent-primary" weight="fill" />
                  <GradientHeading as="h3" className="text-sm font-bold">Subscription Tier</GradientHeading>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['free', 'startup', 'professional', 'enterprise'].map((t) => (
                    <button key={t} onClick={() => handleChangeTier(t)}
                      className={cn(
                        'px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all',
                        tier === t
                          ? 'bg-accent-primary text-white shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                          : 'bg-bg-tertiary text-text-tertiary hover:bg-bg-tertiary/80 hover:text-text-secondary border border-border'
                      )}>
                      {t}
                    </button>
                  ))}
                </div>
              </CardSpotlight>
            )}

            {/* Teams list */}
            {teams.length > 0 && (
              <CardSpotlight className="overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent-primary" weight="fill" />
                    <GradientHeading as="h3" className="text-sm font-bold">Your Teams</GradientHeading>
                  </div>
                </div>
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border/60">
                  {teams.map((t: any) => (
                    <motion.div key={t.team_id} variants={itemVariants}
                      className={cn('flex items-center justify-between px-5 py-4 hover:bg-bg-tertiary/30 transition-colors', teamId === t.team_id && 'bg-accent-primary/3')}>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold',
                          teamId === t.team_id ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-text-tertiary')}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{t.name}</p>
                          <p className="text-[10px] text-text-tertiary mt-0.5">
                            {t.members?.length || 0} members · <span className="capitalize">{t.tier}</span> tier
                          </p>
                        </div>
                      </div>
                      <button onClick={() => { setTeamId(t.team_id); setTier(t.tier || 'free'); setActiveSection('modules') }}
                        className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors font-medium flex items-center gap-1">
                        Manage
                        <ArrowRight className="w-3 h-3" weight="bold" />
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              </CardSpotlight>
            )}

            {teams.length === 0 && !loading && (
              <CardSpotlight>
                <EmptyState
                  title="No teams yet"
                  description="Create a team to start managing members and module access"
                  icon={<Users className="w-8 h-8" weight="thin" />}
                />
              </CardSpotlight>
            )}
          </div>
        )}

        {/* Module Access Section */}
        {activeSection === 'modules' && teamId && (
          <div className="space-y-5">
            {/* Grant form */}
            <CardSpotlight className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-accent-primary" weight="fill" />
                <GradientHeading as="h3" className="text-sm font-bold">Grant Module Access</GradientHeading>
              </div>
              <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
                Grant access to a codebase module (e.g. <code className="text-accent-primary bg-accent-primary/8 px-1 rounded">api-core</code>).
                Also auto-granted when a task with <code className="text-accent-primary/70 bg-accent-primary/8 px-1 rounded">unlock_modules</code> completes.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Team Member">
                  <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                    <option value="">Select member…</option>
                    {teamMembers.map((m) => (<option key={m.user_id} value={m.user_id}>{m.name || m.user_id} ({m.role})</option>))}
                    {Object.keys(membersWithModules).filter(uid => !teamMembers.some(m => m.user_id === uid)).map(uid => (
                      <option key={uid} value={uid}>{membersWithModules[uid].name || uid}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Module Name">
                  <Input value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)} placeholder="api-core" list="known-modules" />
                  <datalist id="known-modules">{availableModules.map((m) => <option key={m} value={m} />)}</datalist>
                </Field>
                <Field label="Action">
                  <button onClick={handleGrantModule} disabled={!selectedUserId || !newModuleName.trim()}
                    className="w-full bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 h-[38px]">
                    Grant Access
                  </button>
                </Field>
              </div>
            </CardSpotlight>

            {/* Per-member summary */}
            <CardSpotlight className="overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-accent-primary" weight="fill" />
                  <GradientHeading as="h3" className="text-sm font-bold">
                    Module Permissions
                    <span className="ml-2 text-text-tertiary font-mono">{permissions.length} grants</span>
                  </GradientHeading>
                </div>
                {selectedUserId && (
                  <button onClick={() => handleRevokeAll(selectedUserId)} className="text-xs text-red-400/50 hover:text-red-400 transition-colors">Revoke all for selected</button>
                )}
              </div>
              {permissions.length === 0 ? (
                <EmptyState
                  title="No module permissions yet"
                  description="Grant a module above, or complete tasks with unlock_modules set"
                  icon={<Lock className="w-8 h-8" weight="thin" />}
                />
              ) : (
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border/60">
                  {Object.entries(membersWithModules).map(([uid, info]) => (
                    <motion.div key={uid} variants={itemVariants} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-accent-primary/15 text-accent-primary flex items-center justify-center text-[11px] font-bold">
                            {(info.name || uid).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-text-primary">{info.name || uid}</span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono border',
                            info.sources.includes('task_completion')
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-accent-primary/10 text-accent-primary border-accent-primary/20'
                          )}>
                            {info.sources.includes('task_completion') ? 'Auto' : 'Manual'}
                          </span>
                        </div>
                        <button onClick={() => handleRevokeAll(uid)} className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors">Revoke all</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {info.modules.map((mod) => (
                          <span key={mod} className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-primary/8 border border-accent-primary/15 text-accent-primary text-[11px] font-mono">
                            {mod}
                            <button onClick={() => handleRevokeModule(uid, mod)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all leading-none">
                              <X className="w-2.5 h-2.5" weight="bold" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </CardSpotlight>

            {/* Full table */}
            {permissions.length > 0 && (
              <CardSpotlight className="overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-accent-primary" weight="fill" />
                    <GradientHeading as="h3" className="text-sm font-bold">
                      All Grants
                      <span className="ml-2 text-text-tertiary font-mono">{permissions.length} total</span>
                    </GradientHeading>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        {['User', 'Module', 'Source', 'Granted', ''].map((h, i) => (
                          <th key={i} className={cn('py-3 text-[10px] uppercase tracking-widest text-text-tertiary font-semibold', i === 0 || i === 4 ? 'text-left px-5' : 'text-left px-4')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody variants={containerVariants} initial="hidden" animate="visible" className="divide-y divide-border/60">
                      {permissions.map((p) => (
                        <motion.tr key={p.id} variants={itemVariants} className="hover:bg-bg-tertiary/30 transition-colors">
                          <td className="px-5 py-3 text-sm text-text-secondary">{p.user_name || p.user_id}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-lg bg-accent-primary/8 text-accent-primary text-[11px] font-mono border border-accent-primary/15">{p.module}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                              p.source === 'task_completion' ? 'bg-green-500/10 text-green-400' : 'bg-accent-primary/10 text-accent-primary')}>
                              {p.source === 'task_completion' ? 'Task Auto' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-text-tertiary font-mono">{new Date(p.granted_at).toLocaleDateString()}</td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => handleRevokeModule(p.user_id, p.module)} className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors">Revoke</button>
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              </CardSpotlight>
            )}
          </div>
        )}

        {!teamId && activeSection === 'modules' && (
          <CardSpotlight>
            <EmptyState
              title="No team selected"
              description="Select or create a team first to manage module access"
              icon={<Users className="w-8 h-8" weight="thin" />}
            />
          </CardSpotlight>
        )}
      </div>
    </PageTransition>
  )
}
