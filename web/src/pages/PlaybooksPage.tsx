import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpenText,
  Plus,
  Play,
  Clock,
  CheckCircle,
  MagnifyingGlass,
  Trash,
  Spinner,
} from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import { EmptyState } from '../components/ui/empty-state'
import CardSpotlight from '../components/ui/card-spotlight'
import { PlaybooksSkeleton } from '../components/ui/Skeleton'
import { Modal } from '../components/ui/modal'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { listPlaybooks, createPlaybook, archivePlaybook } from '../lib/api'
import type { Playbook } from '../lib/api'

export default function PlaybooksPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newSteps, setNewSteps] = useState('')
  const [creating, setCreating] = useState(false)

  const [openBook, setOpenBook] = useState<Playbook | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)

  const toast = useToast()
  const { activeTeamId, user } = useAuth()

  async function fetchPlaybooks() {
    if (!activeTeamId) {
      setLoading(false)
      setError('Join or create a team to manage playbooks.')
      return
    }
    setLoading(true); setError('')
    try {
      const data = await listPlaybooks(activeTeamId)
      setPlaybooks(data.playbooks ?? [])
    } catch (err: any) {
      setError(err.message || 'Failed to load playbooks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlaybooks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId])

  const categories = ['All', ...Array.from(new Set(playbooks.flatMap((p) => p.tags.length ? p.tags : ['General'])))]
  const filtered = playbooks.filter((p) => {
    const matchSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase())
    const tagCat = p.tags.length ? p.tags : ['General']
    const matchCategory = category === 'All' || tagCat.includes(category)
    return matchSearch && matchCategory
  })

  async function handleCreate() {
    if (!newTitle.trim() || !activeTeamId) return
    setCreating(true)
    try {
      await createPlaybook({
        team_id: activeTeamId,
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        steps: newSteps.split('\n').map((s) => s.trim()).filter(Boolean),
        created_by: user?.id || 'unknown',
      })
      setShowCreate(false)
      setNewTitle(''); setNewDesc(''); setNewSteps('')
      toast.success('Playbook created')
      await fetchPlaybooks()
    } catch (err: any) {
      toast.error('Could not create playbook', err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleArchive(id: string) {
    setArchiving(id)
    try {
      await archivePlaybook(id)
      setPlaybooks((prev) => prev.filter((p) => p.playbook_id !== id))
      if (openBook?.playbook_id === id) setOpenBook(null)
      toast.success('Playbook archived')
    } catch (err: any) {
      toast.error('Could not archive', err.message)
    } finally {
      setArchiving(null)
    }
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-accent-primary/10 flex items-center justify-center">
                <BookOpenText className="w-5 h-5 text-accent-primary" weight="duotone" />
              </div>
              <h1 className="text-display-sm font-display font-medium text-text-primary">
                Playbooks
              </h1>
            </div>
            <p className="text-body-sm text-text-tertiary max-w-xl">
              Automated workflows and guided processes to standardize engineering operations.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={!activeTeamId}
            className="btn btn-primary flex items-center gap-2 shrink-0 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" weight="bold" />
            New Playbook
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error-muted border border-error/20 text-error text-body-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchPlaybooks} className="text-caption underline ml-4 text-error/70 hover:text-error">Retry</button>
          </div>
        )}

        {loading && <PlaybooksSkeleton />}

        {!loading && playbooks.length === 0 && !error && (
          <EmptyState
            icon={<BookOpenText className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
            title="No playbooks yet"
            description="Create a reusable onboarding or review playbook for your team."
            action={
              <button onClick={() => setShowCreate(true)} disabled={!activeTeamId} className="btn btn-primary text-caption px-4 py-1.5 disabled:opacity-40">
                New Playbook
              </button>
            }
          />
        )}

        {!loading && (
          <>
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <MagnifyingGlass className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search playbooks..."
                  className="input w-full pl-10"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-caption font-medium transition-all ${
                      category === cat
                        ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                        : 'bg-bg-tertiary/30 text-text-tertiary border border-border hover:border-border-hover'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<BookOpenText className="w-10 h-10 text-text-tertiary/30" weight="duotone" />}
                title="No playbooks found"
                description={search ? 'Try a different search term' : 'No playbooks available in this category'}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((playbook, i) => (
                  <motion.div
                    key={playbook.playbook_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <CardSpotlight className="p-5 h-full flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-accent-primary/10 text-accent-primary">
                          {playbook.tags[0] || 'General'}
                        </span>
                        <button
                          onClick={() => handleArchive(playbook.playbook_id)}
                          disabled={archiving === playbook.playbook_id}
                          className="text-text-tertiary hover:text-red-400 transition-colors disabled:opacity-40"
                          title="Archive"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h3 className="text-body font-medium text-text-primary mb-1.5">{playbook.title}</h3>
                      <p className="text-caption text-text-tertiary leading-relaxed mb-5 flex-1">
                        {playbook.description || 'No description.'}
                      </p>
                      <div className="flex items-center gap-4 text-caption text-text-tertiary mb-4">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {playbook.steps.length} steps
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {playbook.use_count} uses
                        </span>
                      </div>
                      <button
                        onClick={() => setOpenBook(playbook)}
                        className="w-full py-2 rounded-xl text-caption font-medium flex items-center justify-center gap-2 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20 transition-all"
                      >
                        <Play className="w-3.5 h-3.5" weight="fill" />
                        Open
                      </button>
                    </CardSpotlight>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Playbook">
          <div className="space-y-4">
            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1.5">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. New Hire Onboarding"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1.5">Description</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1.5">Steps (one per line)</label>
              <textarea
                value={newSteps}
                onChange={(e) => setNewSteps(e.target.value)}
                rows={5}
                placeholder={'Step one\nStep two'}
                className="input w-full font-code text-caption"
              />
            </div>
            <button onClick={handleCreate} disabled={!newTitle.trim() || creating} className="btn btn-primary w-full flex items-center justify-center gap-2">
              {creating ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" weight="bold" />}
              {creating ? 'Creating...' : 'Create Playbook'}
            </button>
          </div>
        </Modal>

        {/* Detail Modal */}
        <Modal open={openBook !== null} onClose={() => setOpenBook(null)} title={openBook?.title} maxWidth="max-w-xl">
          {openBook && (
            <div className="space-y-4">
              <p className="text-caption text-text-tertiary">{openBook.description}</p>
              <div>
                <div className="text-overline text-text-tertiary/50 font-semibold mb-2">Steps</div>
                <ol className="space-y-2 list-decimal list-inside text-body-sm text-text-secondary">
                  {openBook.steps.map((s, idx) => (
                    <li key={idx} className="leading-relaxed">{s}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </PageTransition>
  )
}
