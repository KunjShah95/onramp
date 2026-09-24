import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash,
  Check,
  X,
  Spinner,
  ShieldCheck,
  Eye,
  EyeSlash,
  PencilSimple,
  CheckCircle,
  Circle,
  Warning,
} from '@phosphor-icons/react'
import { PageHeader } from '../components/ui/page-header'
import { useToast } from '../context/ToastContext'
import { useAuth, KEY_MANAGER_ROLES } from '../context/AuthContext'
import {
  listProviderKeys,
  setProviderKey,
  deleteProviderKey,
  type ProviderKeyInfo,
} from '../lib/api'
import { PROVIDER_OPTIONS } from '../lib/providers'
import { cn } from '../lib/utils'

const PROVIDER_COLORS: Record<string, string> = {
  openai:      'bg-[#10a37f]/10 text-[#10a37f] border-[#10a37f]/20',
  anthropic:   'bg-[#c96a47]/10 text-[#c96a47] border-[#c96a47]/20',
  gemini:      'bg-[#4285f4]/10 text-[#4285f4] border-[#4285f4]/20',
  groq:        'bg-[#f55036]/10 text-[#f55036] border-[#f55036]/20',
  openrouter:  'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/20',
  mistral:     'bg-[#ff7000]/10 text-[#ff7000] border-[#ff7000]/20',
  deepseek:    'bg-[#0ea5e9]/10 text-[#0ea5e9] border-[#0ea5e9]/20',
  nvidia:      'bg-[#76b900]/10 text-[#76b900] border-[#76b900]/20',
  cohere:      'bg-[#39594d]/10 text-[#39594d] border-[#39594d]/20',
  together:    'bg-[#6366f1]/10 text-[#6366f1] border-[#6366f1]/20',
  fireworks:   'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20',
  perplexity:  'bg-[#20b2aa]/10 text-[#20b2aa] border-[#20b2aa]/20',
  azure:       'bg-[#0078d4]/10 text-[#0078d4] border-[#0078d4]/20',
}

const DEFAULT_COLOR = 'bg-ink/5 text-ink-muted border-seam'

function providerColor(id: string) {
  return PROVIDER_COLORS[id] ?? DEFAULT_COLOR
}

interface EditState {
  providerId: string
  value: string
  saving: boolean
  show: boolean
}

export default function ApiKeysPage() {
  const { activeTeamId, role } = useAuth()
  const toast = useToast()
  const orgName = activeTeamId || 'default'

  const canManage = !!role && KEY_MANAGER_ROLES.includes(role)
  const noPermMsg = 'Only key managers can modify provider keys'

  const [providerMap, setProviderMap] = useState<Record<string, ProviderKeyInfo>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setFetchError('')
    try {
      const res = await listProviderKeys(orgName)
      const map: Record<string, ProviderKeyInfo> = {}
      for (const p of res.providers) map[p.provider] = p
      setProviderMap(map)
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load provider keys.')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => { load() }, [load])

  const openEdit = (providerId: string) => {
    if (!canManage) { toast.error('Not permitted', noPermMsg); return }
    setEdit({ providerId, value: '', saving: false, show: false })
  }

  const saveEdit = async () => {
    if (!edit || !edit.value.trim()) return
    setEdit((e) => e && { ...e, saving: true })
    try {
      const info = await setProviderKey(orgName, edit.providerId, edit.value.trim())
      setProviderMap((m) => ({ ...m, [edit.providerId]: info }))
      toast.success('Key saved', `${PROVIDER_OPTIONS.find((p) => p.id === edit.providerId)?.label} key configured.`)
      setEdit(null)
    } catch (err: any) {
      toast.error('Could not save key', err.message)
      setEdit((e) => e && { ...e, saving: false })
    }
  }

  const handleDelete = async (providerId: string) => {
    if (!canManage) { toast.error('Not permitted', noPermMsg); return }
    setDeleting(providerId)
    try {
      await deleteProviderKey(orgName, providerId)
      setProviderMap((m) => {
        const next = { ...m }
        delete next[providerId]
        return next
      })
      toast.success('Key removed', `${PROVIDER_OPTIONS.find((p) => p.id === providerId)?.label} key deleted.`)
    } catch (err: any) {
      toast.error('Could not delete', err.message)
    } finally {
      setDeleting(null)
    }
  }

  const configuredCount = Object.values(providerMap).filter((p) => p.configured).length

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <PageHeader
          eyebrow="Manage · AI Providers"
          title="Provider settings"
          subtitle={
            loading
              ? 'Loading...'
              : `${configuredCount} of ${PROVIDER_OPTIONS.length} providers configured — these keys power the LLM router.`
          }
          flush
        />
      </div>

      {fetchError && (
        <div className="px-4 py-3 rounded-tile bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={load} className="text-caption underline ml-4 text-abort/70 hover:text-abort">Retry</button>
        </div>
      )}

      {!canManage && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-tile bg-warning-muted border border-warning/25 text-warning text-caption">
          <Warning className="w-4 h-4 shrink-0" weight="fill" />
          Read-only view — key managers (admin / CTO / CEO) can add or remove keys.
        </div>
      )}

      {/* Provider grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PROVIDER_OPTIONS.map((provider) => {
          const info = providerMap[provider.id]
          const configured = !!info?.configured
          const isEditing = edit?.providerId === provider.id
          const isDeleting = deleting === provider.id

          return (
            <div
              key={provider.id}
              className={cn(
                'rounded-card border bg-panel p-4 transition-colors',
                isEditing ? 'border-go/40' : 'border-seam hover:border-seam-strong'
              )}
            >
              {/* Provider header */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0', providerColor(provider.id))}>
                    {provider.id.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="text-body-sm font-medium text-ink truncate">{provider.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {configured ? (
                    <CheckCircle className="w-4 h-4 text-go" weight="fill" />
                  ) : (
                    <Circle className="w-4 h-4 text-ink-disabled/40" />
                  )}
                  <span className={cn('text-caption', configured ? 'text-go' : 'text-ink-muted/50')}>
                    {configured ? 'Active' : 'Not set'}
                  </span>
                </div>
              </div>

              {/* env var hint */}
              <p className="text-caption text-ink-muted/50 font-code mb-3">{provider.envVar}</p>

              {/* Last updated */}
              {configured && info?.updated_at && (
                <p className="text-caption text-ink-muted/60 mb-3">
                  Updated {new Date(info.updated_at).toLocaleDateString()}
                  {info.updated_by && ` · ${info.updated_by}`}
                </p>
              )}

              {/* Edit form */}
              {isEditing ? (
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      autoFocus
                      type={edit.show ? 'text' : 'password'}
                      value={edit.value}
                      onChange={(e) => setEdit((s) => s && { ...s, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit()
                        if (e.key === 'Escape') setEdit(null)
                      }}
                      placeholder={`Paste ${provider.label} API key…`}
                      className="input pr-9 font-code text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setEdit((s) => s && { ...s, show: !s.show })}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    >
                      {edit.show ? <EyeSlash className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={edit.saving || !edit.value.trim()}
                      className="btn btn-primary flex-1 flex items-center justify-center gap-1.5 text-caption py-1.5 disabled:opacity-40"
                    >
                      {edit.saving ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" weight="bold" />}
                      {edit.saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEdit(null)}
                      className="w-8 h-8 rounded-btn bg-well flex items-center justify-center text-ink-muted hover:text-ink shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(provider.id)}
                    disabled={!canManage}
                    className="flex-1 flex items-center justify-center gap-1.5 text-caption py-1.5 rounded-btn border border-seam bg-well text-ink-muted hover:text-ink hover:border-seam-strong transition-colors disabled:opacity-30"
                    title={!canManage ? noPermMsg : configured ? `Update ${provider.label} key` : `Add ${provider.label} key`}
                  >
                    {configured
                      ? <><PencilSimple className="w-3.5 h-3.5" /> Update</>
                      : <><Plus className="w-3.5 h-3.5" weight="bold" /> Add key</>
                    }
                  </button>
                  {configured && (
                    <button
                      onClick={() => handleDelete(provider.id)}
                      disabled={!canManage || isDeleting}
                      className="w-8 h-8 rounded-btn bg-well flex items-center justify-center text-ink-muted hover:text-abort transition-colors disabled:opacity-30"
                      title={!canManage ? noPermMsg : `Remove ${provider.label} key`}
                    >
                      {isDeleting
                        ? <Spinner className="w-3.5 h-3.5 animate-spin" />
                        : <Trash className="w-3.5 h-3.5" />
                      }
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-ink-muted gap-3">
          <Spinner className="w-5 h-5 animate-spin" />
          <span className="text-body-sm">Loading provider keys…</span>
        </div>
      )}

      {/* Security note */}
      <div className="rounded-card border border-mission/20 bg-panel p-5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-tile bg-mission/10 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-mission" weight="fill" />
          </div>
          <div>
            <h3 className="text-body-sm font-medium text-ink mb-1">Security</h3>
            <ul className="text-caption text-ink-muted space-y-1">
              <li>• Keys are stored encrypted — never exposed in API responses</li>
              <li>• The LLM router uses these keys for your team only (BYOK)</li>
              <li>• Configure OpenRouter as a single fallback to cover all providers</li>
              <li>• Revoke and replace any key you believe has been compromised</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
