import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Storefront,
  MagnifyingGlass,
  Star,
  DownloadSimple,
  UploadSimple,
  Spinner,
  Users,
} from '@phosphor-icons/react'
import { EmptyState } from '../components/ui/empty-state'
import { Modal } from '../components/ui/modal'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import {
  listMarketplacePlaybooks,
  importMarketplaceListing,
  rateMarketplaceListing,
  publishPlaybook,
  listPlaybooks,
  type MarketplaceListing,
  type MarketplaceSort,
  type Playbook,
} from '../lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 80, damping: 18 } },
}

const SORTS: { key: MarketplaceSort; label: string }[] = [
  { key: 'popular', label: 'Popular' },
  { key: 'top_rated', label: 'Top rated' },
  { key: 'newest', label: 'Newest' },
]

function Stars({ value, onRate }: { value: number; onRate?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onRate}
          onClick={() => onRate?.(n)}
          className={onRate ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            className={`w-4 h-4 ${n <= Math.round(value) ? 'text-caution' : 'text-ink-disabled/40'}`}
            weight={n <= Math.round(value) ? 'fill' : 'regular'}
          />
        </button>
      ))}
    </div>
  )
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<MarketplaceSort>('popular')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [showPublish, setShowPublish] = useState(false)
  const [myPlaybooks, setMyPlaybooks] = useState<Playbook[]>([])
  const [publishing, setPublishing] = useState('')

  const toast = useToast()
  const { activeTeamId } = useAuth()

  const fetchListings = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listMarketplacePlaybooks({ search, sort })
      setListings(data.listings ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load the marketplace.')
    } finally {
      setLoading(false)
    }
  }, [search, sort])

  useEffect(() => {
    const t = setTimeout(fetchListings, 250) // debounce search
    return () => clearTimeout(t)
  }, [fetchListings])

  async function handleImport(listing: MarketplaceListing) {
    if (!activeTeamId) {
      toast.error('No active team', 'Join or create a team before importing.')
      return
    }
    setBusy(listing.listing_id)
    try {
      await importMarketplaceListing(listing.listing_id, activeTeamId)
      toast.success('Imported', `"${listing.title}" added to your playbooks.`)
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listing.listing_id ? { ...l, import_count: l.import_count + 1 } : l,
        ),
      )
    } catch (err: any) {
      toast.error('Import failed', err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleRate(listing: MarketplaceListing, rating: number) {
    try {
      const res = await rateMarketplaceListing(listing.listing_id, rating)
      setListings((prev) =>
        prev.map((l) =>
          l.listing_id === listing.listing_id
            ? { ...l, rating_avg: res.rating_avg, rating_count: res.rating_count }
            : l,
        ),
      )
      toast.success('Thanks for rating')
    } catch (err: any) {
      toast.error('Could not rate', err.message)
    }
  }

  async function openPublish() {
    setShowPublish(true)
    if (!activeTeamId) return
    try {
      const data = await listPlaybooks(activeTeamId)
      setMyPlaybooks(data.playbooks ?? [])
    } catch {
      /* modal shows empty state */
    }
  }

  async function handlePublish(pb: Playbook) {
    setPublishing(pb.playbook_id)
    try {
      await publishPlaybook(pb.playbook_id)
      toast.success('Published', `"${pb.title}" is now on the marketplace.`)
      setShowPublish(false)
      fetchListings()
    } catch (err: any) {
      toast.error('Publish failed', err.message)
    } finally {
      setPublishing('')
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto space-y-6 px-4 sm:px-0"
    >
      {/* ── Mission header ── */}
      <motion.div variants={itemVariants} className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="tile tile-go">
              <Storefront size={11} weight="fill" className="mr-1.5" />
              Marketplace
            </span>
            <span className="designator opacity-50">PLAYBOOK EXCHANGE</span>
          </div>
          <h1 className="text-xl sm:text-display-sm font-display font-medium text-text-primary">
            Playbook Marketplace
          </h1>
          <p className="text-caption text-text-secondary mt-0.5 font-code">
            Discover, import, and rate onboarding playbooks from the community.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={openPublish}
          className="btn btn-primary text-caption px-3 py-1.5 flex items-center gap-1.5 shrink-0"
        >
          <UploadSimple className="w-3.5 h-3.5" weight="bold" />
          Publish
        </motion.button>
      </motion.div>

      {/* Controls */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search playbooks…"
            className="input w-full pl-9 text-body-sm"
          />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-card bg-well border border-seam">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={cn(
                'px-3 py-1.5 rounded-tile text-caption font-medium transition-colors',
                sort === s.key
                  ? 'bg-panel text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink-secondary'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </motion.div>

      {error && (
        <motion.div variants={itemVariants} className="px-4 py-3 rounded-tile bg-abort/10 border border-abort/20 text-abort text-body-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchListings} className="text-caption underline ml-4 text-abort/70 hover:text-abort">Retry</button>
        </motion.div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Spinner className="w-6 h-6 text-go animate-spin" />
        </div>
      )}

      {!loading && listings.length === 0 && !error && (
        <motion.div variants={itemVariants}>
          <EmptyState
            icon={<Storefront className="w-10 h-10 text-ink-disabled/40" weight="duotone" />}
            title={search ? 'No matching playbooks' : 'The marketplace is empty'}
            description={search ? 'Try a different search term.' : 'Be the first — publish one of your team playbooks.'}
          />
        </motion.div>
      )}

      {/* Grid */}
      {!loading && listings.length > 0 && (
        <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2">
          {listings.map((l) => (
            <div key={l.listing_id} className="rounded-card border border-seam bg-panel p-5 flex flex-col gap-3 transition-colors hover:border-go/25">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-body font-medium text-ink line-clamp-1">{l.title}</h3>
                <span className="flex items-center gap-1 text-caption text-ink-muted shrink-0">
                  <DownloadSimple className="w-3.5 h-3.5" /> {l.import_count}
                </span>
              </div>
              <p className="text-caption text-ink-secondary line-clamp-2 min-h-[2.4em]">{l.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {(l.tags || []).slice(0, 4).map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-pill bg-well text-[11px] text-ink-muted border border-seam">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-caption text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> {l.publisher_name}
                </span>
                <span>{l.steps?.length ?? 0} steps</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-seam">
                <div className="flex items-center gap-2">
                  <Stars value={l.rating_avg} onRate={(n) => handleRate(l, n)} />
                  <span className="text-[11px] text-ink-disabled/60">
                    {l.rating_count > 0 ? `${l.rating_avg} (${l.rating_count})` : 'Not rated'}
                  </span>
                </div>
                <button
                  onClick={() => handleImport(l)}
                  disabled={busy === l.listing_id}
                  className="btn btn-secondary text-caption px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {busy === l.listing_id
                    ? <Spinner className="w-3.5 h-3.5 animate-spin" />
                    : <DownloadSimple className="w-3.5 h-3.5" weight="bold" />}
                  Import
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Publish modal */}
      <Modal open={showPublish} onClose={() => setShowPublish(false)} title="Publish a playbook">
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {myPlaybooks.length === 0 && (
            <p className="text-body-sm text-ink-muted py-6 text-center">
              No team playbooks to publish. Create one first on the Playbooks page.
            </p>
          )}
          {myPlaybooks.map((pb) => (
            <div
              key={pb.playbook_id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-tile border border-seam hover:bg-well/60"
            >
              <div className="min-w-0">
                <p className="text-body-sm text-ink truncate">{pb.title}</p>
                <p className="text-caption text-ink-muted truncate">{pb.description}</p>
              </div>
              <button
                onClick={() => handlePublish(pb)}
                disabled={publishing === pb.playbook_id}
                className="btn btn-primary text-caption px-3 py-1.5 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {publishing === pb.playbook_id
                  ? <Spinner className="w-3.5 h-3.5 animate-spin" />
                  : <UploadSimple className="w-3.5 h-3.5" weight="bold" />}
                Publish
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </motion.div>
  )
}
