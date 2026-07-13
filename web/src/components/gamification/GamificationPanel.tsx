import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy,
  Lightning,
  Fire,
  Medal,
  Crown,
  Sparkle,
} from '@phosphor-icons/react'
import CardSpotlight from '../ui/card-spotlight'
import { useAuth } from '../../context/AuthContext'
import {
  fetchGamificationSummary,
  fetchLeaderboard,
  recordLogin,
} from '../../lib/api'
import type { GamificationSummary, LeaderboardEntry, BadgeInfo } from '../../lib/api'

// ── Level color progression ───────────────────────────────────

function getLevelColor(level: number): string {
  if (level >= 20) return 'text-purple-400'
  if (level >= 10) return 'text-amber-400'
  if (level >= 5) return 'text-emerald-400'
  return 'text-blue-400'
}

function getLevelBg(level: number): string {
  if (level >= 20) return 'bg-purple-500/10'
  if (level >= 10) return 'bg-amber-500/10'
  if (level >= 5) return 'bg-emerald-500/10'
  return 'bg-blue-500/10'
}

function getProgressColor(xp: number, needed: number): string {
  const pct = (xp / needed) * 100
  if (pct >= 80) return 'bg-gradient-to-r from-amber-400 to-emerald-400'
  if (pct >= 50) return 'bg-gradient-to-r from-amber-500/80 to-amber-400'
  return 'bg-gradient-to-r from-accent-primary/60 to-accent-primary'
}

// ── Rank medal emojis ─────────────────────────────────────────

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

// ── Tab type ─────────────────────────────────────────────────

type Tab = 'overview' | 'badges' | 'leaderboard'

// ── Component ────────────────────────────────────────────────

export default function GamificationPanel() {
  const [summary, setSummary] = useState<GamificationSummary | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loginStreakFlame, setLoginStreakFlame] = useState(false)
  const { activeTeamId, user } = useAuth()

  async function loadData() {
    if (!user?.id) return
    setLoading(true)
    try {
      const [sum, lb] = await Promise.all([
        fetchGamificationSummary(activeTeamId ?? undefined),
        activeTeamId
          ? fetchLeaderboard(activeTeamId, 'all_time', 10)
          : Promise.resolve({ entries: [], team_id: '', period: '', total_entries: 0 }),
      ])
      setSummary(sum)
      setLeaderboard(lb.entries)
    } catch {
      // Silently fail — gamification is non-critical
    } finally {
      setLoading(false)
    }
  }

  // Record login streak on mount
  useEffect(() => {
    const recorded = sessionStorage.getItem('cf_login_recorded')
    if (!recorded) {
      recordLogin().then((res) => {
        sessionStorage.setItem('cf_login_recorded', 'true')
        if (res.xp_awarded) setLoginStreakFlame(true)
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [activeTeamId, user?.id])

  if (loading && !summary) {
    return (
      <CardSpotlight className="p-4 min-h-[200px] flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-tertiary/60">
          <Sparkle className="w-4 h-4 animate-pulse" weight="duotone" />
          <span className="text-caption">Loading gamification...</span>
        </div>
      </CardSpotlight>
    )
  }

  if (!summary) {
    return (
      <CardSpotlight className="p-4 border border-accent-primary/10">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-text-tertiary/40" weight="duotone" />
          <div>
            <p className="text-body-sm font-medium text-text-primary">Gamification</p>
            <p className="text-caption text-text-tertiary/60">Earn XP by completing tasks and quizzes.</p>
          </div>
        </div>
      </CardSpotlight>
    )
  }

  const { total_xp, level, xp_progress, xp_needed, badges, streak, badges_count } = summary
  const progressPct = xp_needed > 0 ? Math.min((xp_progress / xp_needed) * 100, 100) : 0

  return (
    <CardSpotlight className="p-4 border border-accent-primary/10">
      {/* ── Header / Level Badge ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl ${getLevelBg(level)} flex items-center justify-center`}>
            <Trophy className={`w-5 h-5 ${getLevelColor(level)}`} weight="duotone" />
          </div>
          <div>
            <p className="text-body-sm font-medium text-text-primary flex items-center gap-1.5">
              Level {level}
              <span className="text-caption text-text-tertiary/60 font-normal">· {total_xp} XP</span>
            </p>
          </div>
        </div>

        {/* Streak flame */}
        <motion.div
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-caption font-medium ${
            streak.current_streak > 0
              ? 'bg-orange-500/10 text-orange-400'
              : 'bg-bg-tertiary/30 text-text-tertiary/50'
          }`}
          animate={loginStreakFlame ? { scale: [1, 1.2, 1], rotate: [0, -5, 5, 0] } : {}}
          transition={{ duration: 0.5 }}
        >
          <Fire className="w-3.5 h-3.5" weight="fill" />
          <span>{streak.current_streak} day{streak.current_streak !== 1 ? 's' : ''}</span>
        </motion.div>
      </div>

      {/* ── XP Progress Bar ── */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-caption text-text-tertiary/70">Next level</span>
          <span className="text-caption text-text-tertiary/60">
            {xp_progress} / {xp_needed} XP
          </span>
        </div>
        <div className="h-2 bg-bg-tertiary/30 rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${getProgressColor(xp_progress, xp_needed)}`}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* ── Tab Nav ── */}
      <div className="flex gap-1 mb-3 bg-bg-tertiary/20 rounded-lg p-0.5">
        {(['overview', 'badges', 'leaderboard'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-caption font-medium transition-all capitalize ${
              activeTab === tab
                ? 'bg-accent-primary/10 text-accent-primary shadow-sm'
                : 'text-text-tertiary/60 hover:text-text-secondary hover:bg-bg-tertiary/30'
            }`}
          >
            {tab === 'leaderboard' ? '🏆 Rank' : tab === 'badges' ? `🎖️ ${badges_count} Badges` : '📊 Overview'}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab summary={summary} />}
          {activeTab === 'badges' && <BadgesTab badges={badges} />}
          {activeTab === 'leaderboard' && <LeaderboardTab entries={leaderboard} />}
        </motion.div>
      </AnimatePresence>
    </CardSpotlight>
  )
}

// ── Overview Tab ──────────────────────────────────────────────

function OverviewTab({ summary }: { summary: GamificationSummary }) {
  const { xp_breakdown, streak } = summary

  const sourceLabels: Record<string, string> = {
    learning_module_completed: 'Modules',
    quiz_passed: 'Quizzes',
    quiz_perfect_score: 'Perfect Scores',
    first_pr_merged: 'PRs Merged',
    task_completed: 'Tasks',
    question_asked: 'Questions',
    playbook_created: 'Playbooks',
    repo_analyzed: 'Repos',
    daily_login: 'Logins',
    badge_bonus: 'Badges',
  }
  const sourceIcons: Record<string, string> = {
    learning_module_completed: '📚',
    quiz_passed: '📝',
    quiz_perfect_score: '💯',
    first_pr_merged: '🔄',
    task_completed: '✅',
    question_asked: '❓',
    playbook_created: '📋',
    repo_analyzed: '🔍',
    daily_login: '🔑',
    badge_bonus: '🎖️',
  }

  const sortedSources = Object.entries(xp_breakdown).sort(([, a], [, b]) => b - a)

  return (
    <div className="space-y-3">
      {/* Streak detail */}
      <div className="flex items-center justify-between">
        <span className="text-caption text-text-tertiary/70">Longest streak</span>
        <span className="text-body-sm font-medium text-text-primary">
          <Fire className="w-3.5 h-3.5 inline mr-0.5 text-orange-400" weight="fill" />
          {streak.longest_streak} days
        </span>
      </div>

      {/* XP breakdown */}
      <div>
        <p className="text-caption text-text-tertiary/70 mb-1.5">XP Sources</p>
        <div className="space-y-1">
          {sortedSources.map(([source, amount]) => (
            <div key={source} className="flex items-center justify-between text-caption">
              <span className="text-text-secondary">
                <span className="mr-1">{sourceIcons[source] || '•'}</span>
                {sourceLabels[source] || source.replace(/_/g, ' ')}
              </span>
              <span className="text-text-primary font-medium">{amount} XP</span>
            </div>
          ))}
          {sortedSources.length === 0 && (
            <p className="text-caption text-text-tertiary/40 italic">No XP earned yet. Start exploring!</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Badges Tab ────────────────────────────────────────────────

function BadgesTab({ badges }: { badges: BadgeInfo[] }) {
  if (badges.length === 0) {
    return (
      <div className="py-6 text-center">
        <Medal className="w-8 h-8 mx-auto mb-2 text-text-tertiary/30" weight="duotone" />
        <p className="text-caption text-text-tertiary/50 italic">No badges earned yet.</p>
        <p className="text-caption text-text-tertiary/40 mt-1">Complete tasks and modules to earn badges!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {badges.map((badge, i) => (
        <motion.div
          key={badge.badge_key}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.04 }}
          className="p-2.5 rounded-lg bg-bg-tertiary/10 border border-accent-primary/5 hover:border-accent-primary/20 transition-colors"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{badge.icon}</span>
            <span className="text-body-sm font-medium text-text-primary truncate">
              {badge.badge_name}
            </span>
          </div>
          <p className="text-caption text-text-tertiary/60 leading-tight">{badge.description}</p>
          {badge.xp_bonus > 0 && (
            <div className="mt-1 flex items-center gap-1">
              <Lightning className="w-3 h-3 text-amber-400" weight="fill" />
              <span className="text-[10px] text-amber-400/80 font-medium">+{badge.xp_bonus} XP</span>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}

// ── Leaderboard Tab ───────────────────────────────────────────

function LeaderboardTab({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="py-6 text-center">
        <Crown className="w-8 h-8 mx-auto mb-2 text-text-tertiary/30" weight="duotone" />
        <p className="text-caption text-text-tertiary/50 italic">No leaderboard data yet.</p>
        <p className="text-caption text-text-tertiary/40 mt-1">Join a team to see rankings!</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {entries.slice(0, 10).map((entry, i) => (
        <motion.div
          key={entry.user_id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
            entry.rank <= 3
              ? 'bg-amber-500/5 border border-amber-500/10'
              : 'hover:bg-bg-tertiary/20'
          }`}
        >
          {/* Rank */}
          <span className="w-6 text-center text-body-sm font-mono font-bold text-text-primary">
            {rankMedal(entry.rank)}
          </span>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <p className="text-body-sm font-medium text-text-primary truncate">{entry.name}</p>
            <p className="text-[10px] text-text-tertiary/50">
              {entry.badges_count} badge{entry.badges_count !== 1 ? 's' : ''}
              {entry.current_streak > 0 && ` · 🔥 ${entry.current_streak}d`}
            </p>
          </div>

          {/* XP */}
          <span className="text-body-sm font-medium text-text-primary font-mono">{entry.xp.toLocaleString()}</span>
          <span className="text-caption text-text-tertiary/50">XP</span>
        </motion.div>
      ))}
    </div>
  )
}
