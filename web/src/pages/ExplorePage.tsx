import { useState } from 'react'
import { analyzeArchitecture } from '../lib/api'
import { cn } from '../lib/utils'

import type { ArchitectureResult } from '../lib/types'

export default function ExplorePage() {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ArchitectureResult | null>(null)
  const [error, setError] = useState('')

  async function handleAnalyze() {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await analyzeArchitecture(repoUrl)
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Failed to analyze repository.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-in w-full h-full min-h-[calc(100vh-4rem)] p-8 font-mono text-[#FDFBF8]">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Architecture Explorer</h1>
          <p className="text-[#FDFBF8]/60 text-[15px]">Deep codebase analysis and structural mapping.</p>
        </div>
        
        {/* Search Input */}
        <div className="relative w-full md:w-[480px]">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg className="w-[18px] h-[18px] text-[#FDFBF8]/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            placeholder="Enter GitHub repository URL..."
            className="w-full bg-[#1A110D] border border-[#FDFBF8]/10 text-[#FDFBF8] text-[15px] rounded-lg pl-12 pr-16 py-3 focus:outline-none focus:border-[#FF8C00]/50 transition-colors placeholder:text-[#FDFBF8]/30"
          />
          <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            <kbd className="inline-flex items-center gap-1 bg-[#2A1D16] border border-[#FDFBF8]/5 rounded-md px-1.5 py-1 text-xs font-medium text-[#FDFBF8]/40 font-mono shadow-sm">
              <svg width="10" height="10" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.5 6C5.32843 6 6 5.32843 6 4.5C6 3.67157 5.32843 3 4.5 3C3.67157 3 3 3.67157 3 4.5C3 5.32843 3.67157 6 4.5 6ZM4.5 6V9M4.5 9C5.32843 9 6 9.67157 6 10.5C6 11.3284 5.32843 12 4.5 12C3.67157 12 3 11.3284 3 10.5C3 9.67157 3.67157 9 4.5 9ZM4.5 9H9M9 9C8.17157 9 7.5 9.67157 7.5 10.5C7.5 11.3284 8.17157 12 9 12C9.82843 12 10.5 11.3284 10.5 10.5C10.5 9.67157 9.82843 9 9 9ZM9 9V6M9 6C8.17157 6 7.5 5.32843 7.5 4.5C7.5 3.67157 8.17157 3 9 3C9.82843 3 10.5 3.67157 10.5 4.5C10.5 5.32843 9.82843 6 9 6ZM9 6H4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              K
            </kbd>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-500/50 text-red-400 font-mono text-sm">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-wider font-semibold text-[#FDFBF8]/40 mb-1">TOTAL FILES</div>
            <div className="font-display text-3xl font-normal text-[#FDFBF8]">{result ? result.entities.files.length : '—'}</div>
          </div>
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="#2A1D16" strokeWidth="3" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="#FF8C00" strokeWidth="3" strokeDasharray="113.09" strokeDashoffset="28" />
          </svg>
        </div>

        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-wider font-semibold text-[#FDFBF8]/40 mb-1">CLASSES</div>
            <div className="font-display text-3xl font-normal text-[#FDFBF8]">{result ? result.entities.classes.length : '—'}</div>
          </div>
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="#2A1D16" strokeWidth="3" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="#E16A6A" strokeWidth="3" strokeDasharray="113.09" strokeDashoffset="45" />
          </svg>
        </div>

        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-wider font-semibold text-[#FDFBF8]/40 mb-1">FUNCTIONS</div>
            <div className="font-display text-3xl font-normal text-[#FDFBF8]">{result ? result.entities.functions.length : '—'}</div>
          </div>
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="#2A1D16" strokeWidth="3" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="#4DA8DA" strokeWidth="3" strokeDasharray="113.09" strokeDashoffset="15" />
          </svg>
        </div>

        <div className="bg-[#1A110D] border border-[#FDFBF8]/5 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-[11px] tracking-wider font-semibold text-[#FDFBF8]/40 mb-1">CIRCULAR DEPS</div>
            <div className="font-display text-3xl font-normal text-[#FDFBF8]">{result ? result.circular_dependencies.length : '—'}</div>
          </div>
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="18" fill="none" stroke="#2A1D16" strokeWidth="3" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="#8C8C8C" strokeWidth="3" strokeDasharray="113.09" strokeDashoffset="95" />
          </svg>
        </div>
      </div>

      {/* Main Terminal Window */}
      <div className="rounded-xl border border-[#FDFBF8]/5 bg-[#0D0906] shadow-2xl overflow-hidden flex flex-col h-[500px]">
        {/* Window Chrome */}
        <div className="h-10 border-b border-[#FDFBF8]/5 bg-[#140D09] flex items-center px-4 relative">
          <div className="flex gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]"></div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[#FDFBF8]/30 text-xs font-medium tracking-wide">arch_graph.viz</span>
          </div>
        </div>

        {/* Content Area with Grid */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-8 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzFBMTEwRCIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] overflow-auto">
          
          <div className="flex flex-col items-center text-center max-w-2xl z-10 w-full">
            {!result && !loading && (
              <>
                <svg className="w-10 h-10 text-[#FDFBF8]/20 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
                <p className="text-[#FDFBF8]/60 text-sm mb-2 font-mono leading-relaxed">
                  Interactive dependency graph will render here.<br/>
                  Enter a GitHub URL above to analyze the codebase.
                </p>
                <button 
                  onClick={handleAnalyze}
                  className={cn(
                    "mt-8 px-6 py-2.5 rounded text-sm border transition-all font-mono",
                    loading 
                      ? "bg-[#FDFBF8]/5 border-[#FDFBF8]/10 text-[#FDFBF8]/40" 
                      : "bg-transparent border-[#FDFBF8]/20 text-[#FDFBF8]/80 hover:bg-[#FDFBF8]/5 hover:text-[#FDFBF8]"
                  )}
                  disabled={loading}
                >
                  Initialize Graph Rendering
                </button>
              </>
            )}

            {loading && (
              <div className="flex flex-col items-center">
                <svg className="w-8 h-8 animate-spin text-[#FF8C00] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-[#FDFBF8]/60 text-sm font-mono animate-pulse">Cloning repository and analyzing AST...</p>
              </div>
            )}

            {result && !loading && (
              <div className="w-full text-left bg-[#140D09] border border-[#FDFBF8]/10 rounded-lg p-6">
                <h3 className="text-[#FF8C00] font-mono text-sm mb-4">Architecture Insight: {result.architecture_pattern}</h3>
                <div className="mb-6">
                  <h4 className="text-[#FDFBF8]/80 text-xs tracking-widest font-semibold mb-3">IDENTIFIED SERVICES</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.services && result.services.length > 0 ? (
                      result.services.map((srv, idx) => (
                        <div key={idx} className="bg-[#FDFBF8]/5 border border-[#FDFBF8]/10 rounded px-3 py-1.5 text-sm text-[#FDFBF8]/90">
                          <span className="font-semibold">{srv.name}</span>
                          <p className="text-[#FDFBF8]/50 text-xs mt-1">{srv.description}</p>
                        </div>
                      ))
                    ) : (
                      <span className="text-[#FDFBF8]/50 text-xs">No distinct services identified.</span>
                    )}
                  </div>
                </div>
                <div>
                  <h4 className="text-[#FDFBF8]/80 text-xs tracking-widest font-semibold mb-2">DIAGRAM (MERMAID)</h4>
                  <pre className="text-xs text-[#FDFBF8]/60 bg-[#0D0906] p-4 rounded overflow-x-auto border border-[#FDFBF8]/5">
                    {result.architecture_diagram || 'No diagram generated.'}
                  </pre>
                </div>
              </div>
            )}
          </div>
          
          {/* Subtle vignette over the grid */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#0D0906_100%)] pointer-events-none"></div>
        </div>
      </div>
      
    </div>
  )
}
