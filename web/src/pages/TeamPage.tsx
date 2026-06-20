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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(
      'w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40 transition-colors',
      className
    )} {...props} />
  )
}

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(
      'w-full bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40 transition-colors',
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

  const fetchTeamMembers = useCallback(async () => {
    if (!teamId) { setTeamMembers([]); return }
    try { setTeamMembers(await getTeamMembers(teamId)) } catch { setTeamMembers([]) }
  }, [teamId])

  const loadInvites = useCallback(async (tid: string) => {
    try {
      const data = await listTeamInvites(tid)
      setInvites(data.invites || [])
    } catch { /* ignore */ }
  }, [])

  const fetchTeams = useCallback(async () => {
    try { const data = await listTeams('current-user'); setTeams(data.teams || []) } catch { /* ignore */ }
  }, [])

  const fetchPermissions = useCallback(async () => {
    if (!teamId) return
    try {
      const data = await getTeamModulePermissions(teamId)
      setPermissions(data.permissions || [])
      setAvailableModules(data.modules || [])
    } catch { /* ignore */ }
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create team') }
    setLoading(false)
  }

  async function handleAddMember() {
    if (!teamId || !memberEmail.trim()) return
    try { await addTeamMember(teamId, memberEmail.trim(), 'member'); setMemberEmail(''); await fetchTeams() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to add member') }
  }

  async function handleChangeTier(newTier: string) {
    if (!teamId) return
    try { await changeTeamTier(teamId, newTier); setTier(newTier); await fetchTeams() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to change tier') }
  }

  async function handleGrantModule() {
    if (!teamId || !selectedUserId || !newModuleName.trim()) return
    try { await grantModuleAccess(teamId, selectedUserId, newModuleName.trim()); setNewModuleName(''); await fetchPermissions() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to grant module access') }
  }

  async function handleRevokeModule(userId: string, module: string) {
    if (!teamId) return
    try { await revokeModuleAccess(teamId, userId, module); await fetchPermissions() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke module access') }
  }

  async function handleRevokeAll(userId: string) {
    if (!teamId) return
    try { await revokeAllModuleAccess(teamId, userId); await fetchPermissions() }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke all access') }
  }

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim() || !teamId) return
    setInviteLoading(true)
    setInviteError('')
    try {
      await createTeamInvite(teamId, inviteEmail.trim())
      setInviteEmail('')
      await loadInvites(teamId)
    } catch (e: any) {
      setInviteError(e.message || 'Failed to create invite')
    } finally {
      setInviteLoading(false)
    }
  }

  const handleCancelInvite = async (inviteId: string) => {
    if (!teamId) return
    try {
      await cancelTeamInvite(teamId, inviteId)
      await loadInvites(teamId)
    } catch { /* ignore */ }
  }

  const membersWithModules = permissions.reduce<Record<string, { name: string; modules: string[]; sources: string[] }>>((acc, p) => {
    if (!acc[p.user_id]) acc[p.user_id] = { name: p.user_name, modules: [], sources: [] }
    acc[p.user_id].modules.push(p.module)
    if (!acc[p.user_id].sources.includes(p.source)) acc[p.user_id].sources.push(p.source)
    return acc
  }, {})

  const currentTeam = teams.find(t => t.team_id === teamId)

  return (
    <PageTransition>
      <div className="w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8]">
        <PageHeader
          title="Team Management"
          subtitle={teamId && currentTeam ? `Managing ${currentTeam.name}` : 'Create teams, invite members, manage module-level access'}
          pills={teamId && currentTeam ? [
            { label: 'members', value: currentTeam.members?.length || 0 },
            { label: 'tier', value: TIER_LABELS[currentTeam.tier] || currentTeam.tier, color: 'text-[#FF8C00]' },
          ] : undefined}
          actions={teamId ? (
            <div className="flex bg-[#120D0A] border border-[#FDFBF8]/8 rounded-lg overflow-hidden p-0.5 gap-0.5">
              {(['teams', 'modules'] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveSection(tab)}
                  className={cn(
                    'px-3.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150',
                    activeSection === tab
                      ? 'bg-[#2A1D16] text-[#FF8C00] shadow-sm'
                      : 'text-[#FDFBF8]/35 hover:text-[#FDFBF8]/60 hover:bg-[#1A110D]/50'
                  )}>
                  {tab === 'teams' ? 'Team' : 'Module Access'}
                </button>
              ))}
            </div>
          ) : undefined}
        />

        {error && (
          <div className="mb-5 flex items-center justify-between px-4 py-3 rounded-lg bg-red-500/8 border border-red-500/20 text-red-400 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-3 text-red-400/50 hover:text-red-400 text-xs transition-colors">✕</button>
          </div>
        )}

        {/* ── TEAM SECTION ─────────────────────────────────────────── */}
        {activeSection === 'teams' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Create team */}
              <CardSpotlight className="p-5">
                <GradientHeading as="h3" className="text-sm font-bold mb-3">Create Team</GradientHeading>
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
                    className="w-full bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-40">
                    {loading ? 'Creating…' : 'Create Team'}
                  </button>
                </div>
              </CardSpotlight>

              {/* Add member */}
              {teamId ? (
                <CardSpotlight className="p-5 space-y-4">
                  <GradientHeading as="h3" className="text-sm font-bold">Add Member</GradientHeading>
                  <div className="space-y-3">
                    <Field label="Email or User ID">
                      <Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="user@company.com" onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} />
                    </Field>
                    <button onClick={handleAddMember} disabled={!memberEmail.trim()}
                      className="w-full bg-[#FDFBF8]/8 hover:bg-[#FDFBF8]/12 text-[#FDFBF8]/80 hover:text-[#FDFBF8] px-4 py-2 rounded-lg text-sm font-medium border border-[#FDFBF8]/10 transition-colors disabled:opacity-40">
                      Add Member
                    </button>
                  </div>

                  {/* ── Invite Member ──────────────────────────── */}
                  <div className="border-t border-[#FDFBF8]/8 pt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-[#FDFBF8] tracking-wide">
                      Invite by Email
                    </h4>
                    <p className="text-xs text-[#FDFBF8]/40">
                      Send an email invitation. The user will receive a link to join.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="newmember@company.com"
                        className="flex-1 bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] placeholder:text-[#FDFBF8]/25 outline-none focus:border-[#FF8C00]/40"
                        onKeyDown={e => e.key === 'Enter' && handleCreateInvite()}
                      />
                      <button
                        onClick={handleCreateInvite}
                        disabled={inviteLoading || !inviteEmail.trim()}
                        className="px-4 py-2 bg-[#FF8C00] text-black text-sm font-bold rounded-lg hover:bg-[#FFB347] disabled:opacity-40 transition-colors"
                      >
                        {inviteLoading ? 'Sending...' : 'Send Invite'}
                      </button>
                    </div>
                    {inviteError && (
                      <p className="text-xs text-red-400">{inviteError}</p>
                    )}

                    {/* Pending invites list */}
                    {invites.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <h4 className="text-[10px] uppercase tracking-widest text-[#FDFBF8]/30 font-semibold">
                          Pending Invites ({invites.filter(i => i.status === 'pending').length})
                        </h4>
                        {invites.filter(i => i.status === 'pending').map(inv => (
                          <div key={inv.id} className="flex items-center justify-between bg-[#0D0906] rounded-lg px-3 py-2">
                            <div>
                              <span className="text-sm text-[#FDFBF8]">{inv.email}</span>
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-[#FF8C00]/60">
                                {inv.role}
                              </span>
                            </div>
                            <button
                              onClick={() => handleCancelInvite(inv.id)}
                              className="text-xs text-red-400 hover:text-red-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardSpotlight>
              ) : (
                <CardSpotlight className="p-5 flex items-center justify-center">
                  <p className="text-xs text-[#FDFBF8]/20 text-center">Create a team first to add members</p>
                </CardSpotlight>
              )}
            </div>

            {/* Tier switcher */}
            {teamId && (
              <CardSpotlight className="p-5">
                <GradientHeading as="h3" className="text-sm font-bold mb-3">Subscription Tier</GradientHeading>
                <div className="flex flex-wrap gap-2">
                  {['free', 'startup', 'professional', 'enterprise'].map((t) => (
                    <button key={t} onClick={() => handleChangeTier(t)}
                      className={cn(
                        'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all',
                        tier === t
                          ? 'bg-[#FF8C00] text-[#3D1C00] shadow-[0_0_12px_rgba(255,140,0,0.2)]'
                          : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/50 hover:bg-[#FDFBF8]/10 hover:text-[#FDFBF8]/70 border border-[#FDFBF8]/8'
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
                <div className="px-5 py-4 border-b border-[#FDFBF8]/5">
                  <GradientHeading as="h3" className="text-sm font-bold">Your Teams</GradientHeading>
                </div>
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="divide-y divide-[#FDFBF8]/4"
                >
                  {teams.map((t: any) => (
                    <motion.div key={t.team_id} variants={itemVariants}
                      className={cn(
                        'flex items-center justify-between px-5 py-4 hover:bg-[#FDFBF8]/[0.015] transition-colors',
                        teamId === t.team_id && 'bg-[#FF8C00]/3'
                      )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                          teamId === t.team_id ? 'bg-[#FF8C00]/20 text-[#FF8C00]' : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/40'
                        )}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[#FDFBF8]">{t.name}</p>
                          <p className="text-[10px] text-[#FDFBF8]/30 mt-0.5">
                            {t.members?.length || 0} members · <span className="capitalize">{t.tier}</span> tier
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setTeamId(t.team_id); setTier(t.tier || 'free'); setActiveSection('modules') }}
                        className="text-xs text-[#FF8C00] hover:text-[#FFB347] transition-colors font-medium"
                      >
                        Manage Access →
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
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>}
                />
              </CardSpotlight>
            )}
          </div>
        )}

        {/* ── MODULE ACCESS SECTION ─────────────────────────────────── */}
        {activeSection === 'modules' && teamId && (
          <div className="space-y-5">
            {/* Grant form */}
            <CardSpotlight className="p-5">
              <GradientHeading as="h3" className="text-sm font-bold mb-3">Grant Module Access</GradientHeading>
              <p className="text-xs text-[#FDFBF8]/30 mb-4 leading-relaxed">
                Grant access to a codebase module (e.g. <code className="text-[#FF8C00] bg-[#FF8C00]/8 px-1 rounded">api-core</code>).
                Also auto-granted when a task with <code className="text-[#FF8C00]/70 bg-[#FF8C00]/8 px-1 rounded">unlock_modules</code> completes.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Team Member">
                  <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                    <option value="">Select member…</option>
                    {teamMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>{m.name || m.user_id} ({m.role})</option>
                    ))}
                    {Object.keys(membersWithModules).filter(uid => !teamMembers.some(m => m.user_id === uid)).map(uid => (
                      <option key={uid} value={uid}>{membersWithModules[uid].name || uid}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Module Name">
                  <Input value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)}
                    placeholder="api-core" list="known-modules" />
                  <datalist id="known-modules">
                    {availableModules.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </Field>
                <Field label="Action">
                  <button onClick={handleGrantModule} disabled={!selectedUserId || !newModuleName.trim()}
                    className="w-full bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 h-[38px]">
                    Grant Access
                  </button>
                </Field>
              </div>
            </CardSpotlight>

            {/* Per-member summary */}
            <CardSpotlight className="overflow-hidden">
              <div className="px-5 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
                <GradientHeading as="h3" className="text-sm font-bold">
                  Module Permissions
                  <span className="ml-2 text-[#FDFBF8]/25 font-mono">{permissions.length} grants</span>
                </GradientHeading>
                {selectedUserId && (
                  <button onClick={() => handleRevokeAll(selectedUserId)}
                    className="text-xs text-red-400/50 hover:text-red-400 transition-colors">
                    Revoke all for selected
                  </button>
                )}
              </div>
              {permissions.length === 0 ? (
                <EmptyState
                  title="No module permissions yet"
                  description="Grant a module above, or complete tasks with unlock_modules set"
                  icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" /></svg>}
                />
              ) : (
                <motion.div
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                  className="divide-y divide-[#FDFBF8]/4"
                >
                  {Object.entries(membersWithModules).map(([uid, info]) => (
                    <motion.div key={uid} variants={itemVariants} className="px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#FF8C00]/15 text-[#FF8C00] flex items-center justify-center text-[11px] font-bold">
                            {(info.name || uid).charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm font-medium text-[#FDFBF8]">{info.name || uid}</span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-mono border',
                            info.sources.includes('task_completion')
                              ? 'bg-green-500/10 text-green-400 border-green-500/20'
                              : 'bg-[#FF8C00]/10 text-[#FF8C00] border-[#FF8C00]/20'
                          )}>
                            {info.sources.includes('task_completion') ? 'Auto' : 'Manual'}
                          </span>
                        </div>
                        <button onClick={() => handleRevokeAll(uid)}
                          className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors">
                          Revoke all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {info.modules.map((mod) => (
                          <span key={mod} className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FF8C00]/8 border border-[#FF8C00]/15 text-[#FF8C00] text-[11px] font-mono">
                            {mod}
                            <button onClick={() => handleRevokeModule(uid, mod)}
                              className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all leading-none">×</button>
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
                <div className="px-5 py-4 border-b border-[#FDFBF8]/5">
                  <GradientHeading as="h3" className="text-sm font-bold">
                    All Grants
                    <span className="ml-2 text-[#FDFBF8]/25 font-mono">{permissions.length} total</span>
                  </GradientHeading>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#FDFBF8]/5">
                        {['User', 'Module', 'Source', 'Granted', ''].map((h, i) => (
                          <th key={i} className={cn(
                            'py-3 text-[10px] uppercase tracking-widest text-[#FDFBF8]/25 font-semibold',
                            i === 0 || i === 4 ? 'text-left px-5' : 'text-left px-4'
                          )}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                      className="divide-y divide-[#FDFBF8]/4"
                    >
                      {permissions.map((p) => (
                        <motion.tr key={p.id} variants={itemVariants} className="hover:bg-[#FDFBF8]/[0.015] transition-colors">
                          <td className="px-5 py-3 text-sm text-[#FDFBF8]/80">{p.user_name || p.user_id}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-md bg-[#FF8C00]/8 text-[#FF8C00] text-[11px] font-mono border border-[#FF8C00]/15">
                              {p.module}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium',
                              p.source === 'task_completion' ? 'bg-green-500/10 text-green-400' : 'bg-[#FF8C00]/10 text-[#FF8C00]'
                            )}>
                              {p.source === 'task_completion' ? 'Task Auto' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-[#FDFBF8]/30 font-mono">
                            {new Date(p.granted_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => handleRevokeModule(p.user_id, p.module)}
                              className="text-[10px] text-red-400/40 hover:text-red-400 transition-colors">
                              Revoke
                            </button>
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

        {/* No team selected for modules */}
        {!teamId && activeSection === 'modules' && (
          <CardSpotlight>
            <EmptyState
              title="No team selected"
              description="Select or create a team first to manage module access"
              icon={<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>}
            />
          </CardSpotlight>
        )}
      </div>
    </PageTransition>
  )
}
