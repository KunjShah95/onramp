import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'
import {
  adminListApiKeys,
  adminGetUsage,
  adminGetTeamUsage,
  adminListAuditEvents,
  adminListWebhooks,
  adminTestWebhook,
  adminDeleteWebhook,
  adminGetWebhookDeliveries,
  adminRotateWebhookSecret,
  revokeApiKey,
  type AdminApiKey,
  type AdminUsageResponse,
  type AdminTeamUsage,
  type AdminAuditEvent,
  type AdminWebhook,
  type AdminWebhookDelivery,
} from '../lib/api'
import CardSpotlight from '../components/ui/card-spotlight'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'
import Pagination from '../components/ui/Pagination'
import SearchInput from '../components/ui/SearchInput'
import { useToast } from '../context/ToastContext'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

function downloadCSV<T extends Record<string, any>>(
  data: T[],
  columns: { label: string; accessor: (row: T) => string }[],
  filename: string,
) {
  const header = columns.map(c => JSON.stringify(c.label)).join(',')
  const rows = data.map(row =>
    columns.map(c => {
      const val = c.accessor(row)
      // Escape quotes and wrap in quotes to handle commas/special chars
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const EVENT_COLORS: Record<string, string> = {
  api_key_created: '#22c55e',
  api_key_revoked: '#ef4444',
  task_completed: '#22c55e',
  task_created: '#4DA8DA',
  task_reviewed: '#eab308',
  task_approved: '#22c55e',
  module_granted: '#4DA8DA',
  role_changed: '#FF8C00',
  user_joined_team: '#4DA8DA',
  code_access: '#a78bfa',
}

type AdminTab = 'usage' | 'audit' | 'keys' | 'webhooks'

export default function AdminDashboardPage() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<AdminTab>('usage')
  const [loading, setLoading] = useState(true)

  // ── Usage state ─────────────────────────────────────────────
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null)
  const [teamUsage, setTeamUsage] = useState<AdminTeamUsage[]>([])

  // ── Audit state ─────────────────────────────────────────────
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([])
  const [auditFilterEvent, setAuditFilterEvent] = useState('')
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditSearchRaw, setAuditSearchRaw] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const AUDIT_PAGE_SIZE = 25

  // ── API Key state ────────────────────────────────────────────
  const [allKeys, setAllKeys] = useState<AdminApiKey[]>([])
  const [keysLoading, setKeysLoading] = useState(false)
  const [showRevoked, setShowRevoked] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [keySearchRaw, setKeySearchRaw] = useState('')
  const [keySearch, setKeySearch] = useState('')
  const [keyPage, setKeyPage] = useState(0)
  const KEY_PAGE_SIZE = 25

  // ── Webhook state ────────────────────────────────────────────
  const [allWebhooks, setAllWebhooks] = useState<AdminWebhook[]>([])
  const [webhooksLoading, setWebhooksLoading] = useState(false)
  const [webhookSearch, setWebhookSearch] = useState('')
  const [webhookPage, setWebhookPage] = useState(0)
  const WEBHOOK_PAGE_SIZE = 20
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null)
  const [webhookTestResult, setWebhookTestResult] = useState<{ id: string; msg: string; ok: boolean } | null>(null)
  const [deliveriesModal, setDeliveriesModal] = useState<{ webhookId: string; deliveries: AdminWebhookDelivery[]; loading: boolean } | null>(null)
  const [showActiveOnly, setShowActiveOnly] = useState(true)

  // ── Debounce search inputs (300ms) ────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setAuditSearch(auditSearchRaw), 300)
    return () => clearTimeout(t)
  }, [auditSearchRaw])

  useEffect(() => {
    const t = setTimeout(() => setKeySearch(keySearchRaw), 300)
    return () => clearTimeout(t)
  }, [keySearchRaw])

  // ── Fetch on mount ──────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      adminGetUsage('month').then(setUsage).catch(() => {}),
      adminGetTeamUsage().then(d => setTeamUsage(d.teams)).catch(() => {}),
      adminListApiKeys().then(d => setAllKeys(d.keys)).catch(() => {}),
      adminListAuditEvents({ limit: 100 }).then(d => setAuditEvents(d.events)).catch(() => {}),
      adminListWebhooks(!showActiveOnly).then(d => setAllWebhooks(d.webhooks)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  // ── Audit filter ────────────────────────────────────────────
  async function handleAuditSearch() {
    setAuditLoading(true)
    try {
      const data = await adminListAuditEvents({
        event_type: auditFilterEvent || undefined,
        limit: 100,
      })
      setAuditEvents(data.events)
    } catch { /* ignore */ }
    setAuditLoading(false)
  }

  async function handleRefreshAudit() {
    setAuditLoading(true)
    try {
      const params: { event_type?: string; limit?: number } = { limit: 100 }
      if (auditFilterEvent) params.event_type = auditFilterEvent
      const data = await adminListAuditEvents(params)
      setAuditEvents(data.events)
    } catch { /* ignore */ }
    setAuditLoading(false)
  }

  async function handleClearAuditFilter() {
    setAuditFilterEvent('')
    setAuditLoading(true)
    try {
      const data = await adminListAuditEvents({ limit: 100 })
      setAuditEvents(data.events)
    } catch { /* ignore */ }
    setAuditLoading(false)
  }

  // ── Revoke key ──────────────────────────────────────────────
  async function handleRevokeKey(keyId: string) {
    setRevokingId(keyId)
    try {
      await revokeApiKey(keyId)
      setAllKeys(prev => prev.map(k => k.key_id === keyId ? { ...k, is_active: false } : k))
      toast.success('API key revoked', 'Key has been deactivated')
    } catch (e) {
      toast.error('Failed to revoke', e instanceof Error ? e.message : undefined)
    }
    setRevokingId(null)
  }

  // ── Derived ─────────────────────────────────────────────────
  const auditEventTypes = useMemo(() => {
    const types = new Set(auditEvents.map(e => e.event_type))
    return Array.from(types).sort()
  }, [auditEvents])

  // ── Filtered + paginated audit events ────────────────────────
  const filteredAuditEvents = useMemo(() => {
    if (!auditSearch.trim()) return auditEvents
    const q = auditSearch.toLowerCase()
    return auditEvents.filter(e =>
      e.event_type.toLowerCase().includes(q) ||
      e.actor_id?.toLowerCase().includes(q) ||
      e.target_id?.toLowerCase().includes(q) ||
      e.team_id?.toLowerCase().includes(q)
    )
  }, [auditEvents, auditSearch])

  const paginatedAuditEvents = useMemo(() => {
    const start = auditPage * AUDIT_PAGE_SIZE
    return filteredAuditEvents.slice(start, start + AUDIT_PAGE_SIZE)
  }, [filteredAuditEvents, auditPage])

  const auditTotalPages = useMemo(() =>
    Math.max(1, Math.ceil(filteredAuditEvents.length / AUDIT_PAGE_SIZE)),
    [filteredAuditEvents]
  )

  // ── Filtered + paginated API keys ────────────────────────────
  const filteredKeys = useMemo(() => {
    const source = showRevoked ? allKeys : allKeys.filter(k => k.is_active)
    if (!keySearch.trim()) return source
    const q = keySearch.toLowerCase()
    return source.filter(k =>
      (k.org_name || k.name || '').toLowerCase().includes(q) ||
      k.key_id?.toLowerCase().includes(q) ||
      k.tier?.toLowerCase().includes(q) ||
      (k.team_id || k.user_id || '').toLowerCase().includes(q)
    )
  }, [allKeys, keySearch, showRevoked])

  const paginatedKeys = useMemo(() => {
    const start = keyPage * KEY_PAGE_SIZE
    return filteredKeys.slice(start, start + KEY_PAGE_SIZE)
  }, [filteredKeys, keyPage])

  const keyTotalPages = useMemo(() =>
    Math.max(1, Math.ceil(filteredKeys.length / KEY_PAGE_SIZE)),
    [filteredKeys]
  )

  // ── Filtered + paginated webhooks ─────────────────────────
  const filteredWebhooks = useMemo(() => {
    let source = allWebhooks
    if (showActiveOnly) source = source.filter(w => w.active)
    if (!webhookSearch.trim()) return source
    const q = webhookSearch.toLowerCase()
    return source.filter(w =>
      (w.description || '').toLowerCase().includes(q) ||
      w.url?.toLowerCase().includes(q) ||
      w.webhook_id?.toLowerCase().includes(q) ||
      w.user_id?.toLowerCase().includes(q)
    )
  }, [allWebhooks, webhookSearch, showActiveOnly])

  const paginatedWebhooks = useMemo(() => {
    const start = webhookPage * WEBHOOK_PAGE_SIZE
    return filteredWebhooks.slice(start, start + WEBHOOK_PAGE_SIZE)
  }, [filteredWebhooks, webhookPage])

  const webhookTotalPages = useMemo(() =>
    Math.max(1, Math.ceil(filteredWebhooks.length / WEBHOOK_PAGE_SIZE)),
    [filteredWebhooks]
  )

  // Reset page when filters change
  useEffect(() => { setAuditPage(0) }, [auditSearch, auditFilterEvent])
  useEffect(() => { setKeyPage(0) }, [keySearch, showRevoked])
  useEffect(() => { setWebhookPage(0) }, [webhookSearch, showActiveOnly])

  const activeKeys = useMemo(() => allKeys.filter(k => k.is_active), [allKeys])
  const revokedKeys = useMemo(() => allKeys.filter(k => !k.is_active), [allKeys])

  const endpointChartData = useMemo(() => {
    if (!usage?.endpoint_breakdown) return []
    return Object.entries(usage.endpoint_breakdown)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [usage])

  const teamChartData = useMemo(() => {
    return teamUsage.slice(0, 10).map(t => ({
      name: t.team_name.length > 12 ? t.team_name.slice(0, 12) + '…' : t.team_name,
      requests: t.total_requests,
      credits: t.total_credits,
    }))
  }, [teamUsage])

  const tabs = [
    { key: 'usage' as const, label: 'Usage Overview', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
    { key: 'audit' as const, label: 'Audit Log', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
    { key: 'keys' as const, label: 'API Keys', icon: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' },
    { key: 'webhooks' as const, label: 'Webhooks', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  ]

  if (loading) {
    return (
      <PageTransition>
        <div className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 space-y-6 animate-pulse">
          <div className="h-8 w-64 bg-[#FDFBF8]/5 rounded" />
          <div className="h-4 w-48 bg-[#FDFBF8]/5 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-[#FDFBF8]/5 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-[#FDFBF8]/5 rounded-xl" />
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <motion.div variants={container} initial="hidden" animate="show" className="w-full min-h-[calc(100vh-4rem)] p-4 sm:p-6 max-w-full overflow-x-hidden">
        <motion.div variants={item} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <GradientHeading as="h1">Admin Dashboard</GradientHeading>
            <p className="text-[#FDFBF8]/40 text-sm mt-1">
              Owner-level management · {allKeys.length} API keys · {auditEvents.length} audit events
            </p>
          </div>
          <div className="flex bg-[#1A110D] rounded-xl border border-[#FDFBF8]/5 p-1 gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-all',
                  activeTab === tab.key
                    ? 'text-[#FF8C00]'
                    : 'text-[#FDFBF8]/40 hover:text-[#FDFBF8]/70'
                )}
              >
                {activeTab === tab.key && (
                  <motion.div layoutId="adminTab" className="absolute inset-0 bg-[#FF8C00]/10 rounded-lg border border-[#FF8C00]/20" />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  {tab.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════════════
           TAB 1: USAGE OVERVIEW
           ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'usage' && (
          <>
            <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Total Requests', value: usage?.total_requests ?? '—', color: 'text-[#FDFBF8]', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z' },
                { label: 'Total Credits', value: (usage?.total_credits ?? 0).toLocaleString(), color: 'text-[#FF8C00]', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Active Teams', value: teamUsage.filter(t => t.total_requests > 0).length, color: 'text-green-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Period', value: usage?.period ?? '—', color: 'text-[#4DA8DA]', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5' },
              ].map((m) => (
                <CardSpotlight key={m.label} className="p-4" color="rgba(255,140,0,0.05)">
                  <div className="flex items-start justify-between mb-2">
                    <svg className="w-4 h-4 text-[#FDFBF8]/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <div className={cn('font-display text-2xl font-bold tracking-tight', m.color)}>{m.value}</div>
                  <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{m.label}</div>
                </CardSpotlight>
              ))}
            </motion.div>

            <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
              {/* ── Endpoint Breakdown (Donut) ── */}
              <CardSpotlight className="lg:col-span-2 p-5" color="rgba(255,140,0,0.05)">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[#4DA8DA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                    </svg>
                  </div>
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Endpoint Distribution</h2>
                </div>
                {endpointChartData.length === 0 ? (
                  <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No usage data yet.</div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="w-36 h-36 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={endpointChartData}
                            cx="50%" cy="50%"
                            innerRadius={38}
                            outerRadius={62}
                            paddingAngle={3}
                            dataKey="value"
                            stroke="none"
                          >
                            {endpointChartData.map((_, i) => (
                              <Cell key={i} fill={`hsl(${(i * 47 + 200) % 360}, 70%, 55%)`} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: '#1A110D',
                              border: '1px solid rgba(253,251,248,0.1)',
                              borderRadius: '8px',
                              fontSize: '12px',
                              color: '#FDFBF8',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {endpointChartData.slice(0, 6).map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${(i * 47 + 200) % 360}, 70%, 55%)` }} />
                            <span className="text-[#FDFBF8]/60">{d.name}</span>
                          </div>
                          <span className="text-[#FDFBF8] font-mono tabular-nums">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardSpotlight>

              {/* ── Team Usage Bar Chart ── */}
              <CardSpotlight className="lg:col-span-3 p-5" color="rgba(255,140,0,0.05)">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">Per-Team Usage (Top 10)</h2>
                </div>
                {teamChartData.length === 0 ? (
                  <div className="text-center py-8 text-[#FDFBF8]/20 text-sm italic">No team usage data yet.</div>
                ) : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamChartData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(253,251,248,0.06)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: 'rgba(253,251,248,0.3)', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(253,251,248,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                        <Tooltip
                          contentStyle={{
                            background: '#1A110D',
                            border: '1px solid rgba(253,251,248,0.1)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#FDFBF8',
                          }}
                        />
                        <Bar dataKey="requests" fill="#4DA8DA" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardSpotlight>
            </motion.div>

            {/* ── Team Usage Table ── */}
            <motion.div variants={item}>
              <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
                <div className="px-6 py-4 border-b border-[#FDFBF8]/5">
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">All Teams Usage</h2>
                </div>
                {teamUsage.length === 0 ? (
                  <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">No teams found.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#FDFBF8]/5">
                          {['Team', 'Tier', 'Members', 'Requests', 'Credits', 'Avg / Member'].map((h) => (
                            <th key={h} className="text-left px-6 py-3.5 text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FDFBF8]/5">
                        {teamUsage.map((team, i) => (
                          <motion.tr
                            key={team.team_id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.02 }}
                            className="hover:bg-[#FDFBF8]/[0.02] transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4DA8DA]/15 to-[#4DA8DA]/10 border border-[#4DA8DA]/20 flex items-center justify-center text-[11px] font-bold text-[#4DA8DA]">
                                  {team.team_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm text-[#FDFBF8] font-medium">{team.team_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full font-mono',
                                team.tier === 'enterprise' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/15' :
                                team.tier === 'professional' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' :
                                team.tier === 'startup' ? 'bg-[#FF8C00]/10 text-[#FF8C00] border border-[#FF8C00]/15' :
                                'bg-[#FDFBF8]/5 text-[#FDFBF8]/40 border border-[#FDFBF8]/10'
                              )}>{team.tier}</span>
                            </td>
                            <td className="px-6 py-4 font-mono tabular-nums text-[#FDFBF8]/70">{team.member_count}</td>
                            <td className="px-6 py-4 font-mono tabular-nums text-[#FDFBF8]">{team.total_requests}</td>
                            <td className="px-6 py-4 font-mono tabular-nums text-[#FF8C00]">{team.total_credits}</td>
                            <td className="px-6 py-4 font-mono tabular-nums text-[#FDFBF8]/50">
                              {team.member_count > 0 ? Math.round(team.total_requests / team.member_count) : '—'}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardSpotlight>
            </motion.div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           TAB 2: AUDIT LOG
           ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'audit' && (
          <>
            <motion.div variants={item} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <SearchInput
                  value={auditSearchRaw}
                  onChange={setAuditSearchRaw}
                  placeholder="Search by event, actor, target, team…"
                />
                <select
                  value={auditFilterEvent}
                  onChange={(e) => setAuditFilterEvent(e.target.value)}
                  className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg px-3 py-2 text-sm text-[#FDFBF8] outline-none focus:border-[#FF8C00]/40 transition-colors"
                >
                  <option value="">All event types</option>
                  {auditEventTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <button
                  onClick={handleAuditSearch}
                  disabled={auditLoading}
                  className="bg-[#FF8C00] hover:bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
                >
                  {auditLoading ? 'Filtering…' : 'Filter'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {auditFilterEvent && (
                  <button
                    onClick={handleClearAuditFilter}
                    disabled={auditLoading}
                    className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    Clear filter
                  </button>
                )}
                <button
                  onClick={handleRefreshAudit}
                  disabled={auditLoading}
                  className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50"
                >
                  Refresh
                </button>
              </div>
            </motion.div>

            <motion.div variants={item}>
              <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
                <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                    Audit Log
                    <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{filteredAuditEvents.length} events</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {filteredAuditEvents.length > 0 && (
                      <button
                        onClick={() => {
                          downloadCSV(
                            filteredAuditEvents,
                            [
                              { label: 'Timestamp', accessor: e => e.timestamp ? new Date(e.timestamp).toISOString() : '' },
                              { label: 'Event Type', accessor: e => e.event_type },
                              { label: 'Actor', accessor: e => e.actor_id || '' },
                              { label: 'Target', accessor: e => e.target_id || '' },
                              { label: 'Team', accessor: e => e.team_id || '' },
                            ],
                            `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
                          )
                          toast.success(`Exported ${filteredAuditEvents.length} audit events`)
                        }}
                        className="text-[10px] text-[#4DA8DA]/60 hover:text-[#4DA8DA] px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                        title="Export all filtered events as CSV"
                      >
                        Export CSV
                      </button>
                    )}
                    <Pagination page={auditPage} totalPages={auditTotalPages} onPageChange={setAuditPage} />
                  </div>
                </div>
                {filteredAuditEvents.length === 0 ? (
                  <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
                    {auditSearch ? 'No events match your search.' : 'No audit events found.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#FDFBF8]/5">
                          {['Timestamp', 'Event Type', 'Actor', 'Target', 'Team'].map((h) => (
                            <th key={h} className="text-left px-6 py-3.5 text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FDFBF8]/5">
                        {paginatedAuditEvents.map((event, i) => (
                          <motion.tr
                            key={event.event_id || `audit-${auditPage * AUDIT_PAGE_SIZE + i}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.01 }}
                            className="hover:bg-[#FDFBF8]/[0.02] transition-colors"
                          >
                            <td className="px-6 py-3 text-[11px] font-mono text-[#FDFBF8]/50 whitespace-nowrap">
                              {event.timestamp ? new Date(event.timestamp).toLocaleString() : '—'}
                            </td>
                            <td className="px-6 py-3">
                              <span
                                className={cn(
                                  'text-[11px] px-2 py-0.5 rounded-full font-mono',
                                  event.event_type in EVENT_COLORS
                                    ? `bg-[${EVENT_COLORS[event.event_type]}]/10`
                                    : 'bg-[#FDFBF8]/5 text-[#FDFBF8]/50'
                                )}
                                style={event.event_type in EVENT_COLORS ? {
                                  backgroundColor: `${EVENT_COLORS[event.event_type]}15`,
                                  color: EVENT_COLORS[event.event_type],
                                } : {}}
                              >
                                {event.event_type}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-xs text-[#FDFBF8]/70 font-mono">{event.actor_id?.slice(0, 12) || '—'}</td>
                            <td className="px-6 py-3 text-xs text-[#FDFBF8]/50 font-mono max-w-[200px] truncate" title={event.target_id}>
                              {event.target_id?.slice(0, 30) || '—'}
                            </td>
                            <td className="px-6 py-3 text-xs text-[#FDFBF8]/40 font-mono">{event.team_id?.slice(0, 12) || '—'}</td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardSpotlight>
            </motion.div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           TAB 3: API KEYS (GLOBAL)
           ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'keys' && (
          <>
            <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { label: 'Total Keys', value: allKeys.length, color: 'text-[#FDFBF8]', icon: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z' },
                { label: 'Active', value: activeKeys.length, color: 'text-green-400', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Revoked', value: revokedKeys.length, color: 'text-red-400', icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' },
                { label: 'Teams Using', value: new Set(allKeys.filter(k => k.team_id).map(k => k.team_id)).size, color: 'text-[#4DA8DA]', icon: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-18v18M3 7h4.5m-4.5 4h4.5' },
              ].map((m) => (
                <CardSpotlight key={m.label} className="p-4" color="rgba(255,140,0,0.05)">
                  <div className="flex items-start justify-between mb-2">
                    <svg className="w-4 h-4 text-[#FDFBF8]/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={m.icon} />
                    </svg>
                  </div>
                  <div className={cn('font-display text-2xl font-bold tracking-tight', m.color)}>{m.value}</div>
                  <div className="text-[10px] text-[#FDFBF8]/35 uppercase tracking-wider mt-1">{m.label}</div>
                </CardSpotlight>
              ))}
            </motion.div>

            <motion.div variants={item} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
              <SearchInput
                value={keySearchRaw}
                onChange={setKeySearchRaw}
                placeholder="Search by org, name, ID, tier…"
              />
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={showRevoked}
                  onChange={(e) => setShowRevoked(e.target.checked)}
                  className="w-4 h-4 rounded border-[#FDFBF8]/20 bg-[#0D0906] accent-[#FF8C00]"
                />
                <span className="text-xs text-[#FDFBF8]/60">Show revoked</span>
              </label>
              <button
                onClick={async () => {
                  setKeysLoading(true)
                  try {
                    const data = await adminListApiKeys(showRevoked)
                    setAllKeys(data.keys)
                  } catch { /* ignore */ }
                  setKeysLoading(false)
                }}
                disabled={keysLoading}
                className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 shrink-0"
              >
                {keysLoading ? 'Loading…' : 'Refresh'}
              </button>
            </motion.div>

            <motion.div variants={item}>
              <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
                <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                    {showRevoked ? 'All API Keys' : 'Active API Keys'}
                    <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{filteredKeys.length} keys</span>
                  </h2>
                  <div className="flex items-center gap-2">
                    {filteredKeys.length > 0 && (
                      <button
                        onClick={() => {
                          downloadCSV(
                            filteredKeys,
                            [
                              { label: 'Name', accessor: k => k.org_name || k.name || '' },
                              { label: 'Key ID', accessor: k => k.key_id || '' },
                              { label: 'Tier', accessor: k => k.tier || '' },
                              { label: 'Scope', accessor: k => k.team_id ? `${k.team_id} (team)` : k.user_id ? `${k.user_id} (user)` : '' },
                              { label: 'Created', accessor: k => k.created_at ? new Date(k.created_at).toISOString() : '' },
                              { label: 'Last Used', accessor: k => k.last_used_at ? new Date(k.last_used_at).toISOString() : '' },
                              { label: 'Status', accessor: k => k.is_active ? 'Active' : 'Revoked' },
                            ],
                            `api-keys-${new Date().toISOString().slice(0, 10)}.csv`,
                          )
                          toast.success(`Exported ${filteredKeys.length} API keys`)
                        }}
                        className="text-[10px] text-[#4DA8DA]/60 hover:text-[#4DA8DA] px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                        title="Export all filtered keys as CSV"
                      >
                        Export CSV
                      </button>
                    )}
                    <Pagination page={keyPage} totalPages={keyTotalPages} onPageChange={setKeyPage} />
                  </div>
                </div>
                {filteredKeys.length === 0 ? (
                  <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
                    {keySearch ? 'No keys match your search.' : 'No API keys found.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#FDFBF8]/5">
                          {['Name / Org', 'Tier', 'Scope', 'Created', 'Last Used', 'Status', ''].map((h) => (
                            <th key={h} className="text-left px-6 py-3.5 text-[10px] uppercase tracking-wider text-[#FDFBF8]/30 font-semibold">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#FDFBF8]/5">
                        {paginatedKeys.map((key, i) => (
                          <motion.tr
                            key={key.key_id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.01 }}
                            className="hover:bg-[#FDFBF8]/[0.02] transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FF8C00]/15 to-[#FFB347]/10 border border-[#FF8C00]/20 flex items-center justify-center text-[11px] font-bold text-[#FF8C00]">
                                  K
                                </div>
                                <div>
                                  <div className="text-sm text-[#FDFBF8] font-medium">{key.org_name || key.name || 'Unnamed'}</div>
                                  <div className="text-[10px] text-[#FDFBF8]/30 font-mono">{key.key_id?.slice(0, 16)}…</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full font-mono',
                                key.tier === 'enterprise' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/15' :
                                key.tier === 'pro' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' :
                                key.tier === 'free' ? 'bg-[#FDFBF8]/5 text-[#FDFBF8]/40 border border-[#FDFBF8]/10' :
                                'bg-[#FF8C00]/10 text-[#FF8C00] border border-[#FF8C00]/15'
                              )}>{key.tier}</span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs text-[#FDFBF8]/50 font-mono">
                                {key.team_id ? `${key.team_id.slice(0, 10)}… (team)` : key.user_id ? `${key.user_id.slice(0, 10)}… (user)` : '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-[#FDFBF8]/40 font-mono">
                              {key.created_at ? new Date(key.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-6 py-4 text-xs text-[#FDFBF8]/30 font-mono">
                              {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                'text-[11px] px-2 py-0.5 rounded-full',
                                key.is_active
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/15'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/15'
                              )}>
                                {key.is_active ? 'Active' : 'Revoked'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {key.is_active && (
                                <button
                                  onClick={() => handleRevokeKey(key.key_id)}
                                  disabled={revokingId === key.key_id}
                                  className="text-[11px] text-red-400 hover:text-red-300 hover:underline disabled:opacity-50 transition-colors"
                                >
                                  {revokingId === key.key_id ? '…' : 'Revoke'}
                                </button>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardSpotlight>
            </motion.div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           TAB 4: WEBHOOKS (GLOBAL)
           ═══════════════════════════════════════════════════════════════ */}
        {activeTab === 'webhooks' && (
          <>
            <motion.div variants={item} className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
              <SearchInput
                value={webhookSearch}
                onChange={setWebhookSearch}
                placeholder="Search by description, URL, user…"
              />
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="w-4 h-4 rounded border-[#FDFBF8]/20 bg-[#0D0906] accent-[#FF8C00]"
                />
                <span className="text-xs text-[#FDFBF8]/60">Active only</span>
              </label>
              <button
                onClick={async () => {
                  setWebhooksLoading(true)
                  try {
                    const data = await adminListWebhooks(!showActiveOnly)
                    setAllWebhooks(data.webhooks)
                  } catch { /* ignore */ }
                  setWebhooksLoading(false)
                }}
                disabled={webhooksLoading}
                className="bg-[#FDFBF8]/5 hover:bg-[#FDFBF8]/10 text-[#FDFBF8]/70 border border-[#FDFBF8]/8 px-3 py-2 rounded-lg text-xs transition-colors disabled:opacity-50 shrink-0"
              >
                {webhooksLoading ? 'Loading…' : 'Refresh'}
              </button>
            </motion.div>

            <motion.div variants={item}>
              <CardSpotlight className="p-0 overflow-hidden" color="rgba(255,140,0,0.03)">
                <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between">
                  <h2 className="font-display text-sm font-bold text-[#FDFBF8]">
                    All Webhooks
                    <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{filteredWebhooks.length} webhooks</span>
                  </h2>
                  <Pagination page={webhookPage} totalPages={webhookTotalPages} onPageChange={setWebhookPage} />
                </div>

                {filteredWebhooks.length === 0 ? (
                  <div className="p-8 text-center text-[#FDFBF8]/20 text-sm italic">
                    {webhookSearch ? 'No webhooks match your search.' : 'No webhooks found.'}
                  </div>
                ) : (
                  <div className="divide-y divide-[#FDFBF8]/5">
                    {paginatedWebhooks.map((wh) => (
                      <motion.div
                        key={wh.webhook_id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="px-6 py-4 hover:bg-[#FDFBF8]/[0.02] transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          {/* Status dot */}
                          <div className={cn(
                            'w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',
                            wh.active ? 'bg-green-500' : 'bg-[#FDFBF8]/20'
                          )} />
                          <div className="flex-1 min-w-0">
                            {/* Description + URL */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm text-[#FDFBF8] font-medium truncate">
                                {wh.description || 'Unnamed webhook'}
                              </span>
                              <span className="text-[10px] text-[#FDFBF8]/30 font-mono truncate hidden sm:inline">
                                {wh.url}
                              </span>
                            </div>
                            {/* Events row */}
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              {wh.events.slice(0, 4).map((evt) => (
                                <span key={evt} className="text-[9px] px-1.5 py-0.5 rounded bg-[#FDFBF8]/5 text-[#FDFBF8]/40 font-mono">
                                  {evt}
                                </span>
                              ))}
                              {wh.events.length > 4 && (
                                <span className="text-[9px] text-[#FDFBF8]/30">+{wh.events.length - 4}</span>
                              )}
                            </div>
                            {/* Stats row */}
                            <div className="flex items-center gap-3 text-[10px] text-[#FDFBF8]/40">
                              <span>User: <span className="font-mono">{wh.user_id?.slice(0, 10)}…</span></span>
                              <span>{wh.delivery_count} deliveries</span>
                              {wh.failure_count > 0 && (
                                <span className="text-red-400/70">{wh.failure_count} failed</span>
                              )}
                              {wh.last_success_at && (
                                <span className="hidden md:inline">Last OK: {new Date(wh.last_success_at).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Test/Ping */}
                            <button
                              onClick={async () => {
                                setTestingWebhookId(wh.webhook_id)
                                try {
                                  const result = await adminTestWebhook(wh.webhook_id)
                                  setWebhookTestResult({
                                    id: wh.webhook_id,
                                    msg: result.success ? '✓ OK' : `✗ ${result.error || 'Failed'}`,
                                    ok: result.success,
                                  })
                                  setTimeout(() => setWebhookTestResult(null), 3000)
                                } catch { /* ignore */ }
                                setTestingWebhookId(null)
                              }}
                              disabled={testingWebhookId === wh.webhook_id || !wh.active}
                              className="text-[10px] text-[#FDFBF8]/40 hover:text-[#FDFBF8] px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors disabled:opacity-30"
                              title="Send test ping"
                            >
                              {testingWebhookId === wh.webhook_id ? '…' : 'Ping'}
                            </button>
                            {/* View Deliveries */}
                            <button
                              onClick={async () => {
                                setDeliveriesModal({ webhookId: wh.webhook_id, deliveries: [], loading: true })
                                try {
                                  const data = await adminGetWebhookDeliveries(wh.webhook_id)
                                  setDeliveriesModal({ webhookId: wh.webhook_id, deliveries: data.deliveries, loading: false })
                                } catch {
                                  setDeliveriesModal({ webhookId: wh.webhook_id, deliveries: [], loading: false })
                                }
                              }}
                              className="text-[10px] text-[#4DA8DA]/60 hover:text-[#4DA8DA] px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                              title="View delivery history"
                            >
                              Logs
                            </button>
                            {/* Rotate Secret */}
                            <button
                              onClick={async () => {
                                try {
                                  await adminRotateWebhookSecret(wh.webhook_id)
                                  setWebhookTestResult({ id: wh.webhook_id, msg: '✓ Secret rotated', ok: true })
                                  setTimeout(() => setWebhookTestResult(null), 3000)
                                } catch { /* ignore */ }
                              }}
                              className="text-[10px] text-yellow-400/50 hover:text-yellow-400 px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                              title="Rotate signing secret"
                            >
                              Rotate
                            </button>
                            {/* Delete */}
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this webhook? This action cannot be undone.')) return
                                try {
                                  await adminDeleteWebhook(wh.webhook_id)
                                  setAllWebhooks(prev => prev.filter(w => w.webhook_id !== wh.webhook_id))
                                } catch { /* ignore */ }
                              }}
                              className="text-[10px] text-red-400/40 hover:text-red-400 px-2 py-1 rounded border border-[#FDFBF8]/10 transition-colors"
                              title="Delete webhook"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        {/* Test result inline */}
                        {webhookTestResult?.id === wh.webhook_id && (
                          <div className={cn(
                            'mt-2 text-[10px] px-3 py-1.5 rounded',
                            webhookTestResult.ok ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          )}>
                            {webhookTestResult.msg}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardSpotlight>
            </motion.div>

            {/* ── Deliveries Modal ── */}
            {deliveriesModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={() => setDeliveriesModal(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-[#FDFBF8]/10 bg-[#110B08] shadow-2xl"
                >
                  <div className="px-6 py-4 border-b border-[#FDFBF8]/5 flex items-center justify-between sticky top-0 bg-[#110B08] z-10">
                    <h3 className="font-display text-sm font-bold text-[#FDFBF8]">
                      Delivery Logs
                      <span className="ml-2 text-[10px] text-[#FDFBF8]/25 font-mono">{deliveriesModal.webhookId.slice(0, 12)}…</span>
                    </h3>
                    <button onClick={() => setDeliveriesModal(null)} className="text-[#FDFBF8]/40 hover:text-[#FDFBF8] text-sm">✕</button>
                  </div>
                  <div className="p-6">
                    {deliveriesModal.loading ? (
                      <div className="flex items-center justify-center py-12">
                        <svg className="w-5 h-5 animate-spin text-[#FF8C00]" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    ) : deliveriesModal.deliveries.length === 0 ? (
                      <div className="text-center py-12 text-[#FDFBF8]/20 text-sm italic">No delivery history yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {deliveriesModal.deliveries.map((d, i) => (
                          <div key={d.id || i} className="flex items-center gap-3 p-3 rounded-xl bg-[#0D0906] border border-[#FDFBF8]/5 text-xs">
                            <div className={cn(
                              'w-2 h-2 rounded-full shrink-0',
                              d.success ? 'bg-green-500' : 'bg-red-500'
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[#FDFBF8]/60">{d.event || '—'}</span>
                                <span className={cn(
                                  'text-[10px] px-1.5 py-0.5 rounded font-mono',
                                  d.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                )}>
                                  {d.status_code || '—'}
                                </span>
                              </div>
                              {d.error && <div className="text-red-400/70 mt-0.5 truncate">{d.error}</div>}
                              <div className="text-[#FDFBF8]/30 mt-0.5 font-mono">
                                {d.created_at ? new Date(d.created_at).toLocaleString() : '—'}
                                {d.duration_ms != null && ` · ${d.duration_ms}ms`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </>
        )}
      </motion.div>
    </PageTransition>
  )
}
