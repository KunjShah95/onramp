import { useState, useEffect, useCallback } from 'react'
import { cn } from '../lib/utils'
import {
  createTeam,
  listTeams,
  addTeamMember,
  getTeamMembers,
  changeTeamTier,
  getTeamModulePermissions,
  grantModuleAccess,
  revokeModuleAccess,
  revokeAllModuleAccess,
  type ModulePermission,
} from '../lib/api'

export default function TeamPage() {
  // ── Team CRUD state ──────────────────────────────────────
  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [tier, setTier] = useState('free')

  // ── Module access state ──────────────────────────────────
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [availableModules, setAvailableModules] = useState<string[]>([])
  const [newModuleName, setNewModuleName] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [activeSection, setActiveSection] = useState<'teams' | 'modules'>('teams')

  // ── Team members lookup (for dropdown) ───────────────────
  const [teamMembers, setTeamMembers] = useState<{ user_id: string; name: string; role: string }[]>([])

  const fetchTeamMembers = useCallback(async () => {
    if (!teamId) { setTeamMembers([]); return }
    try {
      const members = await getTeamMembers(teamId)
      setTeamMembers(members)
    } catch { setTeamMembers([]) }
  }, [teamId])

  // ── Fetch teams ──────────────────────────────────────────
  const fetchTeams = useCallback(async () => {
    try {
      const data = await listTeams('current-user')
      setTeams(data.teams || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchTeams()
  }, [fetchTeams])

  // ── Fetch module permissions ─────────────────────────────
  const fetchPermissions = useCallback(async () => {
    if (!teamId) return
    try {
      const data = await getTeamModulePermissions(teamId)
      setPermissions(data.permissions || [])
      setAvailableModules(data.modules || [])
    } catch { /* ignore */ }
  }, [teamId])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  useEffect(() => {
    fetchTeamMembers()
  }, [fetchTeamMembers])

  // ── Team CRUD handlers ───────────────────────────────────
  async function handleCreateTeam() {
    if (!teamName.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await createTeam(teamName.trim(), 'current-user', tier)
      setTeamId(data.team_id)
      setTeamName('')
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create team')
    }
    setLoading(false)
  }

  async function handleAddMember() {
    if (!teamId || !memberEmail.trim()) return
    try {
      await addTeamMember(teamId, memberEmail.trim(), 'member')
      setMemberEmail('')
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member')
    }
  }

  async function handleChangeTier(newTier: string) {
    if (!teamId) return
    try {
      await changeTeamTier(teamId, newTier)
      setTier(newTier)
      await fetchTeams()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change tier')
    }
  }

  // ── Module permission handlers ───────────────────────────
  async function handleGrantModule() {
    if (!teamId || !selectedUserId || !newModuleName.trim()) return
    try {
      await grantModuleAccess(teamId, selectedUserId, newModuleName.trim())
      setNewModuleName('')
      await fetchPermissions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to grant module access')
    }
  }

  async function handleRevokeModule(userId: string, module: string) {
    if (!teamId) return
    try {
      await revokeModuleAccess(teamId, userId, module)
      await fetchPermissions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke module access')
    }
  }

  async function handleRevokeAll(userId: string) {
    if (!teamId) return
    try {
      await revokeAllModuleAccess(teamId, userId)
      await fetchPermissions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke all access')
    }
  }

  // ── Get unique members from permissions ─────────────────
  const membersWithModules = permissions.reduce<Record<string, { name: string; modules: string[]; sources: string[] }>>((acc, p) => {
    if (!acc[p.user_id]) {
      acc[p.user_id] = { name: p.user_name, modules: [], sources: [] }
    }
    acc[p.user_id].modules.push(p.module)
    if (!acc[p.user_id].sources.includes(p.source)) {
      acc[p.user_id].sources.push(p.source)
    }
    return acc
  }, {})

  const currentTeam = teams.find(t => t.team_id === teamId)

  return (
    <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1">Team Management</h1>
          <p className="text-[#FDFBF8]/40 text-sm">
            Create teams, invite members, manage module-level access
            {teamId && currentTeam && (
              <span className="ml-2 text-[#FF8C00]">· {currentTeam.name}</span>
            )}
          </p>
        </div>

        {/* Section tabs */}
        {teamId && (
          <div className="flex bg-[#1A110D] border border-[#FDFBF8]/10 rounded-lg overflow-hidden">
            {(['teams', 'modules'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveSection(tab)}
                className={cn(
                  'px-4 py-2 text-xs font-medium transition-colors capitalize',
                  activeSection === tab
                    ? 'bg-[#FF8C00]/20 text-[#FF8C00]'
                    : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
                )}
              >
                {tab === 'teams' ? 'Team' : 'Module Access'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 rounded-card p-4 mb-6 text-sm border border-red-500/20">{error}
          <button onClick={() => setError('')} className="ml-3 text-red-400/60 hover:text-red-400 text-xs">Dismiss</button>
        </div>
      )}

      {/* ============================================================ */}
      {/* TEAM SECTION */}
      {/* ============================================================ */}
      {activeSection === 'teams' && (
        <div className="space-y-6">
          {/* Create Team + Add Member */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="font-display text-base font-semibold text-text-primary mb-4">Create Team</h2>
              <div className="space-y-3">
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name"
                  className="input"
                />
                <select value={tier} onChange={(e) => setTier(e.target.value)} className="input">
                  <option value="free">Free — 1 member</option>
                  <option value="startup">Startup — $49/mo, 5 members</option>
                  <option value="professional">Professional — $299/mo, 20 members</option>
                  <option value="enterprise">Enterprise — Custom</option>
                </select>
                <button onClick={handleCreateTeam} disabled={loading || !teamName.trim()} className="btn disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>

            {teamId && (
              <div className="card">
                <h2 className="font-display text-base font-semibold text-text-primary mb-4">Add Member</h2>
                <div className="space-y-3">
                  <input
                    value={memberEmail}
                    onChange={(e) => setMemberEmail(e.target.value)}
                    placeholder="User email or ID"
                    className="input"
                  />
                  <button onClick={handleAddMember} disabled={!memberEmail.trim()} className="btn disabled:opacity-50">
                    Add Member
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Subscription Tier */}
          {teamId && (
            <div className="card">
              <h2 className="font-display text-base font-semibold text-text-primary mb-4">Subscription Tier</h2>
              <div className="flex flex-wrap gap-2">
                {['free', 'startup', 'professional', 'enterprise'].map((t) => (
                  <button
                    key={t}
                    onClick={() => handleChangeTier(t)}
                    className={cn(
                      'px-4 py-2 rounded-btn text-sm font-semibold capitalize transition-all',
                      tier === t
                        ? 'bg-accent-from text-white shadow-card'
                        : 'bg-bg-secondary text-text-secondary hover:bg-bg-elevated'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Teams list */}
          {teams.length > 0 && (
            <div className="card">
              <h2 className="font-display text-base font-semibold text-text-primary mb-4">Your Teams</h2>
              <div className="space-y-3">
                {teams.map((t: any) => (
                  <div key={t.team_id} className="flex items-center justify-between p-3 rounded-card bg-bg-secondary border border-border/40">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{t.name}</p>
                      <p className="text-xs text-text-muted">
                        {t.members?.length || 0} members · {t.tier} tier
                      </p>
                    </div>
                    <button
                      onClick={() => { setTeamId(t.team_id); setTier(t.tier || 'free'); setActiveSection('modules') }}
                      className="text-xs text-accent-from hover:underline"
                    >
                      Manage Access
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* MODULE ACCESS SECTION */}
      {/* ============================================================ */}
      {activeSection === 'modules' && teamId && (
        <div className="space-y-6">
          {/* Grant Module Access Form */}
          <div className="card">
            <h2 className="font-display text-base font-semibold text-text-primary mb-4">Grant Module Access</h2>
            <p className="text-xs text-text-muted mb-4">
              Grant a team member access to a specific module. Modules represent codebase areas
              (e.g. <code className="text-accent-from bg-accent-from/10 px-1 rounded">api-core</code>,
              {' '}<code className="text-accent-from bg-accent-from/10 px-1 rounded">frontend-auth</code>).
              Access is also auto-granted when a task with <code className="text-accent-from/80">unlock_modules</code> is completed.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="input"
              >
                <option value="">Select member...</option>
                {teamMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.user_id} ({m.role})
                  </option>
                ))}
                {/* Also show members who already have permissions but might not be in team_members response */}
                {Object.keys(membersWithModules)
                  .filter(uid => !teamMembers.some(m => m.user_id === uid))
                  .map(uid => (
                    <option key={uid} value={uid}>{membersWithModules[uid].name || uid}</option>
                  ))
                }
              </select>
              <input
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder="Module name (e.g. api-core)"
                list="known-modules"
                className="input"
              />
              <datalist id="known-modules">
                {availableModules.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button
                onClick={handleGrantModule}
                disabled={!selectedUserId || !newModuleName.trim()}
                className="btn disabled:opacity-50 bg-green-600 hover:bg-green-500 text-white"
              >
                Grant Access
              </button>
            </div>
          </div>

          {/* Members & Their Modules */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-text-primary">
                Module Permissions
                <span className="ml-2 text-xs text-text-muted font-normal">{permissions.length} grants</span>
              </h2>
              {selectedUserId && (
                <button
                  onClick={() => handleRevokeAll(selectedUserId)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Revoke all for selected
                </button>
              )}
            </div>

            {permissions.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm italic">
                No module permissions granted yet. Grant a module above or complete tasks with unlock_modules.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Per-member module summary */}
                {Object.entries(membersWithModules).map(([uid, info]) => (
                  <div key={uid} className="rounded-lg border border-[#FDFBF8]/10 bg-[#0D0906] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-[#FDFBF8]/5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#FDFBF8]">{info.name || uid}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-mono',
                          info.sources.includes('task_completion')
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-[#FF8C00]/10 text-[#FF8C00]'
                        )}>
                          {info.sources.includes('task_completion') ? 'Auto' : 'Manual'}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRevokeAll(uid)}
                        className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                        title="Revoke all modules"
                      >
                        Revoke all
                      </button>
                    </div>
                    <div className="px-4 py-3 flex flex-wrap gap-1.5">
                      {info.modules.map((mod) => (
                        <span
                          key={mod}
                          className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#FF8C00]/10 border border-[#FF8C00]/20 text-[#FF8C00] text-[11px] font-mono"
                        >
                          {mod}
                          <button
                            onClick={() => handleRevokeModule(uid, mod)}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all text-[10px] leading-none"
                            title="Revoke"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Full permissions table */}
          <div className="card">
            <h2 className="font-display text-base font-semibold text-text-primary mb-4">
              All Grants
              <span className="ml-2 text-xs text-text-muted font-normal">{permissions.length} total</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#FDFBF8]/5">
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">User</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Module</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Source</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Granted</th>
                    <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FDFBF8]/5">
                  {permissions.map((p) => (
                    <tr key={p.id} className="hover:bg-[#FDFBF8]/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm text-[#FDFBF8]">{p.user_name || p.user_id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-[#FF8C00]/10 text-[#FF8C00] text-[11px] font-mono">
                          {p.module}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-medium',
                          p.source === 'task_completion'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-[#FF8C00]/10 text-[#FF8C00]'
                        )}>
                          {p.source === 'task_completion' ? 'Task Auto' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[#FDFBF8]/40 font-mono">
                        {new Date(p.granted_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRevokeModule(p.user_id, p.module)}
                          className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* No team selected state */}
      {!teamId && activeSection === 'modules' && (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-[#FDFBF8]/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <p className="text-[#FDFBF8]/30 text-sm">Select or create a team first to manage module access.</p>
        </div>
      )}
    </div>
  )
}
