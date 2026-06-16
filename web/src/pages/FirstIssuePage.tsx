import { useState } from 'react'
import { cn } from '../lib/utils'
import { findIssues } from '../lib/api'
import type { ScoredIssue } from '../lib/types'

export default function FirstIssuePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ScoredIssue[]>([])
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  async function handleFindIssues() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await findIssues(repoUrl, 'junior')
      setIssues(result.issues)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch issues.')
    } finally {
      setLoading(false)
    }
  }

  const filteredIssues = issues.filter(issue => 
    issue.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (issue.body && issue.body.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] p-8 font-mono text-[#FDFBF8]">
      
      {/* Header Section */}
      <div className="max-w-5xl mb-12">
        <div className="inline-flex px-2 py-1 rounded-sm border border-[#FF8C00]/30 bg-[#1A110D] text-[#FF8C00] text-[10px] font-bold tracking-wider mb-4 uppercase">
          Accelerator
        </div>
        
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl font-bold mb-4 tracking-tight text-[#FDFBF8]">First PR Accelerator</h1>
            <p className="text-[#FDFBF8]/70 text-[15px] leading-relaxed font-body">
              Discover beginner-friendly issues curated to help you make your first contribution. High-impact, low-complexity tasks across the ecosystem.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 w-full lg:w-[400px]">
            <div className="flex gap-2">
              <input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFindIssues()}
                placeholder="Enter GitHub repository URL..."
                className="w-full bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-[15px] rounded-lg px-4 py-3 focus:outline-none focus:border-[#FF8C00]/50 transition-colors placeholder:text-[#FDFBF8]/30"
              />
              <button 
                onClick={handleFindIssues}
                disabled={loading}
                className={cn(
                  "px-6 py-3 rounded-lg font-bold text-[15px] transition-all",
                  loading 
                    ? "bg-[#FF8C00]/50 text-[#3D1C00] cursor-not-allowed" 
                    : "bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00]"
                )}
              >
                {loading ? 'Finding...' : 'Find'}
              </button>
            </div>
            
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-[#FDFBF8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              </div>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter issues..."
                className="w-full bg-[#110D0A] border border-[#FDFBF8]/10 text-[#FDFBF8] text-sm rounded-sm pl-9 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FF8C00] transition-colors placeholder:text-[#FDFBF8]/40 font-body font-medium"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mb-12 border-b border-[#FDFBF8]/5 pb-8">
        <div>
          <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Available Issues</div>
          <div className="text-3xl font-bold text-[#FF8C00]">{issues.length}</div>
        </div>
        
        <div>
          <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Languages</div>
          <div className="flex flex-wrap gap-2">
            {Array.from(new Set(issues.flatMap(i => i.labels || []))).slice(0, 4).map(label => (
              <span key={label} className="px-2.5 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8] text-xs font-medium border border-[#FDFBF8]/10">{label}</span>
            ))}
          </div>
        </div>
        
        <div className="md:pr-8">
          <div className="text-[10px] tracking-widest font-semibold text-[#FDFBF8]/40 mb-2 uppercase">Your Progress</div>
          <div className="text-[13px] text-[#FDFBF8] mb-3">0/1 First PR completed</div>
          <div className="h-1.5 w-full bg-[#1A110D] rounded-full overflow-hidden border border-[#FDFBF8]/5">
            <div className="h-full w-0 bg-[#FF8C00]"></div>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mb-8 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {/* Issues Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-12 max-w-5xl">
        {!loading && issues.length === 0 && !error && (
          <div className="col-span-1 md:col-span-2 text-[#FDFBF8]/40 font-mono text-sm italic py-8">
            Enter a repository URL to find beginner-friendly issues.
          </div>
        )}

        {loading && (
          <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-12">
            <svg className="w-8 h-8 animate-spin text-[#FF8C00] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-[#FDFBF8]/60 text-sm font-mono animate-pulse">Scanning repository for accessible issues...</p>
          </div>
        )}

        {filteredIssues.map((issue) => (
          <div key={issue.id} className="flex flex-col border-b border-[#FDFBF8]/5 pb-8 md:border-none md:pb-0">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#FF8C00] text-[13px] font-mono">#{issue.id}</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8]/60 text-[11px] font-medium border border-[#FDFBF8]/5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ~{issue.estimated_hours}hrs
                </span>
                <span className="inline-flex px-2 py-1 rounded-sm bg-[#1A2633] text-[#4DA8DA] text-[10px] font-bold border border-[#4DA8DA]/20 tracking-wide uppercase">
                  Complexity: {issue.complexity_score}/10
                </span>
              </div>
            </div>
            
            <h2 className="font-display text-xl font-bold text-[#FDFBF8] mb-3 leading-snug">{issue.title}</h2>
            
            <p className="text-[#FDFBF8]/60 text-[13px] leading-relaxed mb-6 font-body flex-1">
              {issue.body && issue.body.length > 120 ? issue.body.substring(0, 120) + '...' : issue.body}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-8 mt-auto">
              {issue.labels && issue.labels.map((label, i) => (
                <span key={i} className="px-2 py-1 rounded-sm bg-[#1A110D] text-[#FDFBF8]/50 text-[11px] font-medium font-mono border border-[#FDFBF8]/10">
                  {label}
                </span>
              ))}
            </div>
            
            <div className="flex gap-3 mt-auto">
              <button className="flex-1 bg-transparent border border-[#FDFBF8]/20 text-[#FDFBF8]/80 hover:text-[#FDFBF8] hover:bg-[#FDFBF8]/5 py-2.5 rounded-sm text-[13px] font-medium transition-colors font-body">
                View Guide
              </button>
              <a 
                href={issue.url} 
                target="_blank" 
                rel="noreferrer"
                className="flex-1 bg-[#FFB347] hover:bg-[#FF8C00] text-[#3D1C00] py-2.5 rounded-sm text-[13px] font-bold transition-colors font-body flex items-center justify-center gap-2"
              >
                Open on GitHub
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </a>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
