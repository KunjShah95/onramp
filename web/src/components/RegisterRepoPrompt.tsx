import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { GithubLogo, Plus, Spinner } from '@phosphor-icons/react'
import { useAuth } from '../context/AuthContext'
import { registerRepo } from '../lib/api'

const SENIOR_ROLES = ['senior_dev', 'senior', 'admin', 'ceo', 'cto']

/** True when an API error means "this repo isn't registered to your team". */
export function isUnregisteredRepoError(message: string | undefined | null): boolean {
  return /not registered|repository not found|registered for an accessible team/i.test(message || '')
}

/**
 * Inline "add this repo to my team" action for the dead end every repo-backed
 * page hits (Explore, IDE, Code Health) when a repository isn't registered.
 * Registration needs a senior team role; each repo belongs to one team.
 */
export default function RegisterRepoPrompt({ owner, repo, onRegistered }: {
  owner: string
  repo: string
  onRegistered: () => void
}) {
  const { role, activeTeamId } = useAuth()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canRegister = !!role && SENIOR_ROLES.includes(role)

  async function register() {
    setBusy(true); setError('')
    try {
      await registerRepo({ owner, name: repo, url: `https://github.com/${owner}/${repo}`, team_id: activeTeamId ?? undefined })
      await queryClient.invalidateQueries({ queryKey: ['repos'] })
      onRegistered()
    } catch (e: any) {
      const msg: string = e?.message || 'Could not register the repository.'
      setError(/already tracked/i.test(msg)
        ? `${owner}/${repo} already belongs to another team — ask that team's admin to add you.`
        : msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[3px] border border-mission/25 bg-mission/5 px-3 py-2.5">
      <GithubLogo size={16} className="text-mission shrink-0" />
      <span className="text-[13px] text-ink-secondary flex-1 min-w-[200px]">
        <span className="font-code text-ink">{owner}/{repo}</span> isn&apos;t registered to your team yet.
        {!canRegister && ' Ask a senior on your team to add it.'}
      </span>
      {canRegister && (
        <button type="button" onClick={register} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-[3px] bg-mission px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
          {busy ? <Spinner size={12} className="animate-spin" /> : <Plus size={12} weight="bold" />}
          Add to my team
        </button>
      )}
      {error && <span className="w-full text-[12px] text-abort">{error}</span>}
    </div>
  )
}
