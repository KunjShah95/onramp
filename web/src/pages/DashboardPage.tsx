import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import { fetchCTODashboard, type CTODashboardResponse } from '../lib/api'

const STATE_COLORS: Record<string, string> = {
  pending: 'text-[#FDFBF8]/50 bg-[#FDFBF8]/5',
  assigned: 'text-blue-400 bg-blue-500/10',
  in_progress: 'text-[#FF8C00] bg-[#FF8C00]/10',
  submitted: 'text-purple-400 bg-purple-500/10',
  under_review: 'text-yellow-400 bg-yellow-500/10',
  needs_changes: 'text-red-400 bg-red-500/10',
  product_review: 'text-pink-400 bg-pink-500/10',
  approved: 'text-green-400 bg-green-500/10',
  completed: 'text-green-400 bg-green-500/10',
  cancelled: 'text-[#FDFBF8]/30 bg-[#FDFBF8]/5',
}

const STATE_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  under_review: 'Under Review',
  needs_changes: 'Needs Changes',
  product_review: 'Product Review',
  approved: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [dashboard, setDashboard] = useState<CTODashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'trainees' | 'reviews' | 'activity'>('overview')

  useEffect(() => {
    fetchCTODashboard()
      .then(setDashboard)
      .catch((err) => {
        setError(err.message || 'Failed to load dashboard')
        setDashboard(null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg className="w-8 h-8 animate-spin text-[#FF8C00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-[#FDFBF8]/40 text-sm font-mono animate-pulse">Loading dashboard metrics…</p>
        </div>
      </div>
    )
  }

  if (error || !dashboard) {
    return (
      <div className="animate-in w-full min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <svg className="w-12 h-12 text-red-400/50 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-red-400 font-mono text-sm mb-2">{error || 'Failed to load dashboard metrics.'}</p>
          <p className="text-[#FDFBF8]/30 text-xs font-mono mb-4">Check that the backend is running and you have a team set up.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const {
    total_tasks, completed_tasks, in_progress_tasks, pending_review_tasks, blocked_tasks,
    completion_rate, total_members, total_trainees, first_prs_merged,
    member_progress, pending_reviews, recent_activity, actions,
  } = dashboard

  return (
    <div className="animate-in w-full min-h-[calc(100vh-4rem)] p-6 font-body text-[#FDFBF8]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold mb-1 text-[#FDFBF8]">Senior Dashboard</h1>
          <p className="text-[#FDFBF8]/40 text-sm">
            {total_members} team member{total_members !== 1 ? 's' : ''} · {total_trainees} trainee{total_trainees !== 1 ? 's' : ''} · {first_prs_merged} PRs merged
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex bg-[#1A110D] border border-[#FDFBF8]/10 rounded-lg overflow-hidden">
          {(['overview', 'trainees', 'reviews', 'activity'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-xs font-medium transition-colors capitalize',
                activeTab === tab
                  ? 'bg-[#FF8C00]/20 text-[#FF8C00]'
                  : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
              )}
            >
              {tab === 'overview' ? 'Overview' : tab === 'trainees' ? `Trainees (${member_progress.length})` : tab === 'reviews' ? `Reviews (${pending_reviews.length})` : 'Activity'}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* OVERVIEW TAB */}
      {/* ============================================================ */}
      {activeTab === 'overview' && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            {[
              { label: 'Total Tasks', value: total_tasks, color: 'text-[#FDFBF8]' },
              { label: 'Completed', value: completed_tasks, color: 'text-green-400' },
              { label: 'In Progress', value: in_progress_tasks, color: 'text-[#FF8C00]' },
              { label: 'Pending Review', value: pending_review_tasks, color: 'text-yellow-400' },
              { label: 'Blocked', value: blocked_tasks, color: 'text-red-400' },
              { label: 'Completion', value: `${completion_rate}%`, color: 'text-[#4DA8DA]' },
            ].map((m) => (
              <div key={m.label} className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-4 hover:border-[#FF8C00]/15 transition-colors">
                <div className={cn('font-display text-2xl font-bold', m.color)}>{m.value}</div>
                <div className="text-[10px] text-[#FDFBF8]/40 uppercase tracking-wider mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Main grid: Trainee leaderboard + Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
            {/* Trainee Leaderboard */}
            <div className="lg:col-span-3 bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#FDFBF8]/5">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Trainee Leaderboard</h2>
                <button
                  onClick={() => setActiveTab('trainees')}
                  className="text-[10px] text-[#FF8C00] hover:underline"
                >
                  View all
                </button>
              </div>
              {member_progress.length === 0 ? (
                <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
                  No team members found. Add members to your team to track progress.
                </div>
              ) : (
                <div className="divide-y divide-[#FDFBF8]/5">
                  {member_progress.slice(0, 8).map((member, i) => (
                    <div key={member.user_id} className="flex items-center justify-between px-5 py-3.5 hover:bg-[#FDFBF8]/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                          i === 0 ? 'bg-[#FF8C00]/20 text-[#FF8C00]' :
                          i === 1 ? 'bg-[#FDFBF8]/10 text-[#FDFBF8]/60' :
                          i === 2 ? 'bg-[#FFB347]/10 text-[#FFB347]' :
                          'bg-[#FDFBF8]/5 text-[#FDFBF8]/40'
                        )}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm text-[#FDFBF8] truncate block">{member.name}</span>
                          <span className="text-[10px] text-[#FDFBF8]/30">{member.role}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-xs shrink-0">
                        <div className="text-right">
                          <div className="text-[#FDFBF8] font-medium">{member.completed}/{member.total}</div>
                          <div className="text-[10px] text-[#FDFBF8]/30">tasks</div>
                        </div>
                        <div className="w-16">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={cn(
                              'text-[11px] font-mono font-bold',
                              member.completion_rate >= 80 ? 'text-green-400' :
                              member.completion_rate >= 50 ? 'text-[#FF8C00]' :
                              'text-red-400'
                            )}>
                              {member.completion_rate}%
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#0D0906] overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                member.completion_rate >= 80 ? 'bg-green-500' :
                                member.completion_rate >= 50 ? 'bg-[#FF8C00]' :
                                'bg-red-400'
                              )}
                              style={{ width: `${member.completion_rate}%` }}
                            />
                          </div>
                        </div>
                        {member.modules_unlocked.length > 0 && (
                          <div className="text-[10px] text-green-400/70 font-mono">
                            +{member.modules_unlocked.length}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions / Alerts */}
            <div className="lg:col-span-2 bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5">
              <h2 className="font-display text-sm font-bold text-[#FDFBF8] mb-4">Requires Attention</h2>
              {actions.length === 0 ? (
                <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">
                  No pending actions. Everything is up to date.
                </div>
              ) : (
                <div className="space-y-3">
                  {actions.slice(0, 6).map((action, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border text-sm',
                      action.severity === 'warning'
                        ? 'bg-red-500/5 border-red-500/20'
                        : action.severity === 'info'
                        ? 'bg-[#FF8C00]/5 border-[#FF8C00]/20'
                        : 'bg-[#FDFBF8]/5 border-[#FDFBF8]/10'
                    )}>
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1 shrink-0',
                        action.severity === 'warning' ? 'bg-red-400' :
                        action.severity === 'info' ? 'bg-[#FF8C00]' :
                        'bg-[#FDFBF8]/30'
                      )} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[#FDFBF8] text-xs font-medium">{action.title}</div>
                        <div className="text-[#FDFBF8]/40 text-[11px] mt-0.5">{action.subtitle}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Activity + Pending Reviews side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Recent Activity</h2>
                <button
                  onClick={() => setActiveTab('activity')}
                  className="text-[10px] text-[#FF8C00] hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {recent_activity.length === 0 && (
                  <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">No activity yet.</div>
                )}
                {recent_activity.slice(0, 6).map((a) => (
                  <div key={a.task_id} className="flex items-start gap-3 text-sm">
                    <span className={cn(
                      'w-2 h-2 rounded-full mt-1.5 shrink-0',
                      a.state === 'completed' ? 'bg-green-500' :
                      a.state === 'in_progress' ? 'bg-[#FF8C00]' :
                      a.state === 'submitted' || a.state === 'under_review' ? 'bg-yellow-400' :
                      a.state === 'needs_changes' ? 'bg-red-400' :
                      'bg-[#FDFBF8]/20'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[#FDFBF8] truncate">{a.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATE_COLORS[a.state] || STATE_COLORS.pending)}>
                          {STATE_LABELS[a.state] || a.state}
                        </span>
                        {a.module && <span className="text-[10px] text-[#FDFBF8]/30">{a.module}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Reviews */}
            <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                  Pending Reviews
                  {pending_reviews.length > 0 && (
                    <span className="ml-2 text-[10px] text-yellow-400 font-mono">({pending_reviews.length})</span>
                  )}
                </h2>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className="text-[10px] text-[#FF8C00] hover:underline"
                >
                  View all
                </button>
              </div>
              {pending_reviews.length === 0 ? (
                <div className="text-center py-6 text-[#FDFBF8]/20 text-sm italic">
                  No pending reviews. Great team velocity!
                </div>
              ) : (
                <div className="space-y-3">
                  {pending_reviews.slice(0, 5).map((pr) => (
                    <div
                      key={pr.task_id}
                      onClick={() => navigate('/tasks')}
                      className="flex items-start gap-3 p-3 rounded-lg bg-[#0D0906] border border-[#FDFBF8]/5 cursor-pointer hover:border-yellow-500/30 transition-colors"
                    >
                      <div className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#FDFBF8] font-medium truncate">{pr.title}</div>
                        <div className="text-[10px] text-[#FDFBF8]/40 mt-0.5">
                          {pr.pr_url ? 'PR submitted' : 'Ready'} · {pr.module || 'general'}
                          {pr.assigned_to && ` · by ${pr.assigned_to}`}
                        </div>
                      </div>
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0',
                        STATE_COLORS[pr.state] || STATE_COLORS.pending
                      )}>
                        {STATE_LABELS[pr.state] || pr.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* TRAINEES TAB */}
      {/* ============================================================ */}
      {activeTab === 'trainees' && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FDFBF8]/5">
            <h2 className="font-display text-sm font-bold text-[#FDFBF8]">All Team Members</h2>
          </div>
          {member_progress.length === 0 ? (
            <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
              No team members found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#FDFBF8]/5">
                    <th className="text-left px-6 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Member</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Total</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Done</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">In Prog.</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Review</th>
                    <th className="text-center px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Rate</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#FDFBF8]/40 font-semibold">Modules Unlocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FDFBF8]/5">
                  {member_progress.map((member) => (
                    <tr key={member.user_id} className="hover:bg-[#FDFBF8]/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[#FDFBF8]">{member.name}</span>
                          <span className="text-[10px] text-[#FDFBF8]/30 bg-[#FDFBF8]/5 px-1.5 py-0.5 rounded">{member.role}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-[#FDFBF8] font-mono">{member.total}</td>
                      <td className="px-4 py-4 text-center text-green-400 font-mono">{member.completed}</td>
                      <td className="px-4 py-4 text-center text-[#FF8C00] font-mono">{member.in_progress}</td>
                      <td className="px-4 py-4 text-center text-yellow-400 font-mono">{member.pending_review}</td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-16 h-1.5 rounded-full bg-[#0D0906] overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                member.completion_rate >= 80 ? 'bg-green-500' :
                                member.completion_rate >= 50 ? 'bg-[#FF8C00]' :
                                'bg-red-400'
                              )}
                              style={{ width: `${member.completion_rate}%` }}
                            />
                          </div>
                          <span className={cn(
                            'text-[11px] font-mono',
                            member.completion_rate >= 80 ? 'text-green-400' :
                            member.completion_rate >= 50 ? 'text-[#FF8C00]' :
                            'text-red-400'
                          )}>
                            {member.completion_rate}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1">
                          {member.modules_unlocked.length > 0 ? (
                            member.modules_unlocked.map((mod, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-mono">
                                {mod}
                              </span>
                            ))
                          ) : (
                            <span className="text-[#FDFBF8]/20 text-[10px] italic">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* REVIEWS TAB */}
      {/* ============================================================ */}
      {activeTab === 'reviews' && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
              Pending Reviews
              <span className="ml-2 text-[10px] text-[#FDFBF8]/30 font-mono">{pending_reviews.length} items</span>
            </h2>
            <button
              onClick={() => navigate('/tasks')}
              className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-3 py-1.5 rounded text-[11px] font-bold transition-colors"
            >
              Go to Tasks
            </button>
          </div>
          {pending_reviews.length === 0 ? (
            <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
              No pending reviews. All tasks are up to date.
            </div>
          ) : (
            <div className="divide-y divide-[#FDFBF8]/5">
              {pending_reviews.map((pr) => (
                <div
                  key={pr.task_id}
                  onClick={() => navigate('/tasks')}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-[#FDFBF8]/[0.02] cursor-pointer transition-colors"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#FDFBF8] font-medium truncate">{pr.title}</div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATE_COLORS[pr.state] || STATE_COLORS.pending)}>
                        {STATE_LABELS[pr.state] || pr.state}
                      </span>
                      {pr.module && <span className="text-[10px] text-[#FDFBF8]/30">{pr.module}</span>}
                      {pr.assigned_to && <span className="text-[10px] text-[#FDFBF8]/30">by {pr.assigned_to}</span>}
                      {pr.pr_url && (
                        <a href={pr.pr_url} target="_blank" rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-[#4DA8DA] hover:underline"
                        >
                          View PR →
                        </a>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#FDFBF8]/30 font-mono shrink-0">
                    {new Date(pr.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* ACTIVITY TAB */}
      {/* ============================================================ */}
      {activeTab === 'activity' && (
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FDFBF8]/5">
            <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
              Recent Activity
              <span className="ml-2 text-[10px] text-[#FDFBF8]/30 font-mono">{recent_activity.length} events</span>
            </h2>
          </div>
          <div className="relative">
            <div className="absolute left-9 top-0 bottom-0 w-px bg-[#FDFBF8]/5" />
            <div className="divide-y divide-[#FDFBF8]/5">
              {recent_activity.length === 0 && (
                <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">No activity yet.</div>
              )}
              {recent_activity.map((a, i) => (
                <div key={`${a.task_id}-${i}`} className="relative flex gap-4 pl-14 pr-6 py-4 hover:bg-[#FDFBF8]/[0.02] transition-colors">
                  <div className={cn(
                    'absolute left-7 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                    a.state === 'completed' ? 'border-green-500 bg-green-500/10' :
                    a.state === 'in_progress' ? 'border-[#FF8C00] bg-[#FF8C00]/10' :
                    a.state === 'submitted' || a.state === 'under_review' ? 'border-yellow-500 bg-yellow-500/10' :
                    a.state === 'needs_changes' ? 'border-red-500 bg-red-500/10' :
                    'border-[#FDFBF8]/20 bg-[#FDFBF8]/5'
                  )}>
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full',
                      a.state === 'completed' ? 'bg-green-500' :
                      a.state === 'in_progress' ? 'bg-[#FF8C00]' :
                      a.state === 'submitted' || a.state === 'under_review' ? 'bg-yellow-500' :
                      a.state === 'needs_changes' ? 'bg-red-500' :
                      'bg-[#FDFBF8]/30'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[#FDFBF8] font-medium truncate">{a.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATE_COLORS[a.state] || STATE_COLORS.pending)}>
                        {STATE_LABELS[a.state] || a.state}
                      </span>
                      {a.module && <span className="text-[10px] text-[#FDFBF8]/30">Module: {a.module}</span>}
                      {a.assigned_to && <span className="text-[10px] text-[#FDFBF8]/30">Assignee: {a.assigned_to}</span>}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#FDFBF8]/30 font-mono shrink-0">
                    {new Date(a.updated_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
