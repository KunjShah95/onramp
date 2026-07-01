import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ShaderBackground from '../components/ui/ShaderBackground'
import Spotlight from '../components/ui/spotlight'
import CardSpotlight from '../components/ui/card-spotlight'
import CodeWindow from '../components/ui/code-window'
import { TerminalDemo } from '../components/ui/typewriter'

export default function LandingPageV2() {
  const [repoUrl, setRepoUrl] = useState('')
  const [activeFaq, setActiveFaq] = useState<number | null>(null)
  const navigate = useNavigate()

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault()
    if (repoUrl.trim()) {
      // Navigate to explore page with the repo URL in state or search param
      navigate(`/explore?repo=${encodeURIComponent(repoUrl.trim())}`)
    } else {
      navigate('/explore')
    }
  }

  const handleQuickSelect = (url: string) => {
    setRepoUrl(url)
  }

  const faqs = [
    {
      q: 'How does CodeFlow analyze codebases?',
      a: 'CodeFlow parses your codebase structure, imports, and AST to map how files, functions, and services interact. It identifies key entry points, dependency cycles, and complex hotspots automatically.'
    },
    {
      q: 'Do you support private repositories?',
      a: 'Yes, with our secure GitHub App integration, you can grant read-only access to private repositories. CodeFlow complies with industry-standard SOC2 security practices to keep your IP safe.'
    },
    {
      q: 'What languages are supported?',
      a: 'We support TypeScript, JavaScript, Python, Go, Rust, Java, C++, Ruby, Swift, and PHP. Support for other languages is updated continuously.'
    },
    {
      q: 'Can CodeFlow integrate with our Slack or CI/CD?',
      a: 'Absolutely. CodeFlow can run as a GitHub Action to automatically comment on pull requests with code maps and AI-generated PR summaries.'
    }
  ]

  return (
    <div className="text-[#EBF0FF] font-body bg-[#050810] antialiased selection:bg-[#FF8C00]/30 selection:text-[#FF8C00] relative max-w-full overflow-x-hidden">
      {/* Floating Navigation */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#070B14]/80 backdrop-blur-xl border border-white/10 rounded-full shadow-lg">
        <div className="flex items-center gap-3">
          <Link to="/test-landing" className="font-display text-xl font-bold tracking-tight text-[#EBF0FF] hover:text-[#FF8C00] transition-colors">
            CodeFlow <span className="text-[10px] bg-[#FF8C00]/25 text-[#FF8C00] px-2 py-0.5 rounded-full font-mono font-bold align-middle ml-1.5">v2-Test</span>
          </Link>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a className="text-[#94A3B8] font-body text-sm hover:text-[#EBF0FF] transition-colors" href="#features">Features</a>
          <a className="text-[#94A3B8] font-body text-sm hover:text-[#EBF0FF] transition-colors" href="#metrics">Code Health</a>
          <a className="text-[#94A3B8] font-body text-sm hover:text-[#EBF0FF] transition-colors" href="#pricing">Pricing</a>
          <a className="text-[#94A3B8] font-body text-sm hover:text-[#EBF0FF] transition-colors" href="#faq">FAQ</a>
          <Link to="/docs" className="text-[#94A3B8] font-body text-sm hover:text-[#EBF0FF] transition-colors">Docs</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-[#94A3B8] hover:text-[#EBF0FF] font-body text-sm font-medium transition-colors">Log In</Link>
          <Link to="/register" className="bg-gradient-cta text-[#390C00] px-5 py-2.5 rounded-full font-body text-sm font-bold hover:brightness-110 transition-all shadow-md">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ── Hero Section ── */}
      <section className="relative min-h-screen flex items-center justify-center pt-36 pb-20 overflow-hidden bg-gradient-ambient">
        <ShaderBackground />
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#FF8C00" />

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjA1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-[0.03] z-0" />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-6 md:px-12 flex flex-col lg:flex-row items-center gap-12">
          {/* Left Hero Column */}
          <div className="flex-1 flex flex-col items-start text-left gap-6 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#162544] border border-[#FF8C00]/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
              <span className="font-mono text-[10px] text-[#FF8C00] uppercase tracking-wider font-bold">Free Public Sandbox Live</span>
            </div>

            <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.1] tracking-tight">
              Understand any codebase.<br />
              <span className="bg-gradient-to-r from-[#FF8C00] via-[#FF6B35] to-[#FFB347] bg-clip-text text-transparent">Ship your first PR today.</span>
            </h1>

            <p className="font-body text-base md:text-lg text-[#94A3B8] leading-relaxed">
              Stop drowning in undocumented directories. CodeFlow instantly maps dependency architecture, highlights complex hot paths, and builds guided pathways to onboarding.
            </p>

            {/* Repository Input Analyzer */}
            <form onSubmit={handleAnalyze} className="w-full flex flex-col sm:flex-row gap-3 mt-2">
              <input
                type="text"
                placeholder="Paste a GitHub repository URL..."
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                className="flex-grow bg-[#0C1426] border border-[#1C2D50] hover:border-[#FF8C00]/40 rounded-xl px-4 py-3.5 text-sm text-[#EBF0FF] placeholder-[#64748B] focus:outline-none focus:border-[#FF8C00] transition-all"
              />
              <button
                type="submit"
                className="bg-gradient-cta text-[#390C00] font-bold px-6 py-3.5 rounded-xl text-sm hover:brightness-110 active:scale-95 transition-all shrink-0 shadow-lg shadow-[#FF8C00]/10"
              >
                Analyze Now
              </button>
            </form>

            <div className="flex flex-wrap gap-2 items-center text-xs text-[#64748B]">
              <span>Try:</span>
              <button type="button" onClick={() => handleQuickSelect('https://github.com/vercel/next.js')} className="hover:text-[#FF8C00] underline font-mono">vercel/next.js</button>
              <span>•</span>
              <button type="button" onClick={() => handleQuickSelect('https://github.com/facebook/react')} className="hover:text-[#FF8C00] underline font-mono">facebook/react</button>
              <span>•</span>
              <button type="button" onClick={() => handleQuickSelect('https://github.com/django/django')} className="hover:text-[#FF8C00] underline font-mono">django/django</button>
            </div>

            <div className="flex gap-4 mt-4 w-full sm:w-auto">
              <Link to="/register" className="text-center font-bold px-6 py-3 border border-white/10 rounded-xl text-sm bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all flex-grow sm:flex-grow-0">
                Create Free Account
              </Link>
              <Link to="/docs" className="text-center font-medium px-6 py-3 rounded-xl text-sm text-[#94A3B8] hover:text-[#EBF0FF] hover:underline transition-all flex-grow sm:flex-grow-0">
                Read Docs
              </Link>
            </div>
          </div>

          {/* Right Hero Column: Premium Interactive Code Sandbox Mockup */}
          <div className="flex-1 w-full max-w-xl">
            <CardSpotlight className="bg-[#0C1426]/90 p-5 shadow-2xl relative border border-[#162544]">
              {/* Top Panel Actions */}
              <div className="flex items-center justify-between pb-4 border-b border-[#1C2D50] mb-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  <span className="ml-3 font-mono text-[11px] text-[#94A3B8]">codeflow-cli</span>
                </div>
                <span className="font-mono text-[10px] text-[#FF8C00] bg-[#FF8C00]/10 px-2 py-0.5 rounded border border-[#FF8C00]/20 font-semibold animate-pulse">
                  ● ACTIVE ANALYSIS
                </span>
              </div>

              {/* Terminal Simulation */}
              <div className="mb-4">
                <CodeWindow language="bash" className="bg-[#070B14]/90 border border-[#1C2D50]/80">
                  <TerminalDemo command={repoUrl ? `codeflow analyze ${repoUrl}` : undefined} />
                </CodeWindow>
              </div>

              {/* Graphical dependency structure preview */}
              <div className="bg-[#070B14]/70 border border-[#1C2D50] rounded-xl p-4 relative h-36 overflow-hidden flex items-center justify-center">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHBhdGggZD0iTSAyMCAwIEwgMCAwIDAgMjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjAzIi8+PC9zdmc+')] opacity-20" />
                
                {/* Visual Diagram Elements */}
                <div className="relative flex gap-8 items-center justify-center z-10">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg border border-[#FF8C00]/60 bg-[#FF8C00]/15 flex items-center justify-center shadow-lg shadow-[#FF8C00]/5 hover:scale-105 transition-all">
                      <span className="text-[#FF8C00] font-mono text-[10px] font-bold">App</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#94A3B8] mt-1">entry.ts</span>
                  </div>

                  <svg className="w-12 h-6" viewBox="0 0 48 24" fill="none">
                    <path d="M0 12H44M44 12L38 6M44 12L38 18" stroke="#FF8C00" strokeWidth="1.5" strokeDasharray="3 3" className="animate-[shimmer_2s_infinite]" />
                  </svg>

                  <div className="flex flex-col gap-2">
                    <div className="w-16 py-1 px-2 rounded border border-white/10 bg-[#111D35] flex items-center gap-1.5 justify-center hover:border-white/30 transition-all">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span className="font-mono text-[8px]">Router</span>
                    </div>
                    <div className="w-16 py-1 px-2 rounded border border-white/10 bg-[#111D35] flex items-center gap-1.5 justify-center hover:border-white/30 transition-all">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="font-mono text-[8px]">AuthService</span>
                    </div>
                  </div>

                  <svg className="w-12 h-6" viewBox="0 0 48 24" fill="none">
                    <path d="M0 12H44M44 12L38 6M44 12L38 18" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  </svg>

                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-lg border border-white/10 bg-[#0C1426] flex items-center justify-center">
                      <span className="text-white/40 font-mono text-[10px]">Redis</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#64748B] mt-1">cache.db</span>
                  </div>
                </div>
              </div>
            </CardSpotlight>
          </div>
        </div>
      </section>

      {/* ── Stats / Credibility Section ── */}
      <section className="py-16 border-y border-white/5 bg-[#070B14]">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="text-center font-mono text-[10px] text-[#FF8C00] mb-8 uppercase tracking-widest font-bold">Empowering Fast-Moving Product Teams</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: '5 Minutes', sub: 'Average Setup Time' },
              { label: '94% Faster', sub: 'First PR Delivery' },
              { label: '12+ Langs', sub: 'Parsed Out-of-Box' },
              { label: '0 Config', sub: 'No Configuration Required' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center text-center p-6 bg-[#0C1426]/60 rounded-xl border border-white/5 hover:border-[#FF8C00]/25 transition-all">
                <span className="font-display text-3xl font-bold text-[#FF8C00]">{s.label}</span>
                <span className="font-mono text-[11px] text-[#94A3B8] uppercase tracking-wider mt-2">{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* ── Product Video Walkthrough & Concepts Section ── */}
      <section id="walkthrough" className="py-24 bg-[#070B14] relative border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(#FF8C00_0.8px,transparent_0.8px)] [background-size:24px_24px] opacity-5 pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-6 md:px-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16 flex flex-col gap-4">
            <span className="font-mono text-xs text-[#FF8C00] uppercase tracking-wider font-bold">Product Walkthrough</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#EBF0FF]">
              Watch CodeFlow in Action
            </h2>
            <p className="text-[#94A3B8] text-sm md:text-base">
              Learn how to map complex repositories, run static intelligence analysis, and generate interactive onboarding routes in under 5 minutes.
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-12 items-center">
            {/* Left: Product Preview */}
            <div className="w-full lg:w-3/5">
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-[#050810] shadow-[0_0_50px_-12px_rgba(255,140,0,0.2)] hover:border-[#FF8C00]/40 transition-all duration-500 flex items-center justify-center">
                <div className="text-center p-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#FF8C00] to-[#FFB347] flex items-center justify-center">
                    <svg className="w-8 h-8 text-[#390C00]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-[#94A3B8] text-sm font-body">Product walkthrough video removed</p>
                  <p className="text-[#64748B] text-xs font-mono mt-1">Visit the docs for a guided tour</p>
                </div>
              </div>
            </div>

            {/* Right: Key Concepts Explanation */}
            <div className="w-full lg:w-2/5 flex flex-col gap-6">
              {[
                {
                  title: 'Visual Topology Maps',
                  desc: 'Auto-scans repository references and packages to construct a clean, interactive graph of your dependencies and components.',
                  icon: '🕸️'
                },
                {
                  title: 'Contextual Codebase AI',
                  desc: 'Talk directly to your codebase. Ask about session logic, database wrappers, or middleware pipelines and receive precise file locations.',
                  icon: '💬'
                },
                {
                  title: 'Guided Onboarding Journeys',
                  desc: 'Generate custom step-by-step playbooks for developers, ensuring they checkout, compile, and merge their first PR on day one.',
                  icon: '🏁'
                },
                {
                  title: 'Complexity & Debt Analytics',
                  desc: 'Track files with high cognitive load and code churn. Identify messy legacy files needing attention before they cause regressions.',
                  icon: '📈'
                }
              ].map((c) => (
                <div key={c.title} className="flex gap-4 p-4 rounded-xl border border-white/5 bg-[#0C1426]/30 hover:bg-[#0C1426]/70 hover:border-[#FF8C00]/20 transition-all group">
                  <div className="text-2xl shrink-0 select-none group-hover:scale-110 transition-transform">
                    {c.icon}
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-[#EBF0FF] text-sm group-hover:text-[#FF8C00] transition-colors">{c.title}</h3>
                    <p className="text-[#94A3B8] text-xs mt-1 leading-relaxed">{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Bento Features Grid ── */}
      <section id="features" className="py-24 bg-[#050810] relative">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16 flex flex-col gap-4">
            <span className="font-mono text-xs text-[#FF8C00] uppercase tracking-wider font-bold">Feature Highlights</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-[#EBF0FF]">
              Everything you need to master your application architecture
            </h2>
            <p className="text-[#94A3B8] text-sm md:text-base">
              Onboarding playbooks, live interactive visualizations, and automated health checks designed for engineering operations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Dependency Graph Bento Card (2 cols) */}
            <div className="md:col-span-2">
              <CardSpotlight className="h-full p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] bg-[#FF8C00]/10 text-[#FF8C00] px-2 py-0.5 rounded border border-[#FF8C00]/20 font-bold">INTERACTIVE VISUALS</span>
                    <span className="text-[11px] text-[#64748B] font-mono">next.js · 847 files</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Live Dependency Graph Mapping</h3>
                  <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">
                    Analyze the entire project topology. Search, zoom, drag nodes, and locate structural dependencies visually. Identify tightly coupled code in seconds.
                  </p>
                </div>
                <div className="bg-[#070B14] border border-[#1C2D50] rounded-xl p-4 h-48 flex items-center justify-center relative overflow-hidden group/graph">
                  <div className="absolute inset-0 bg-[radial-gradient(#FF8C00_1px,transparent_1px)] [background-size:16px_16px] opacity-10" />
                  
                  {/* Graph Graphic */}
                  <svg className="w-full h-full relative z-10" viewBox="0 0 400 160">
                    {/* Edges */}
                    <line x1="200" y1="80" x2="100" y2="40" stroke="rgba(255,140,0,0.4)" strokeWidth="1.5" />
                    <line x1="200" y1="80" x2="300" y2="40" stroke="rgba(148,163,184,0.2)" strokeWidth="1.5" />
                    <line x1="200" y1="80" x2="80"  y2="120" stroke="rgba(148,163,184,0.2)" strokeWidth="1.5" />
                    <line x1="200" y1="80" x2="320" y2="120" stroke="rgba(148,163,184,0.2)" strokeWidth="1.5" />
                    
                    {/* Center Core */}
                    <circle cx="200" cy="80" r="16" fill="#0C1426" stroke="#FF8C00" strokeWidth="2.5" />
                    <text x="200" y="83" textAnchor="middle" fill="#FF8C00" fontSize="8" fontFamily="monospace" fontWeight="bold">CORE</text>

                    {/* Nodes */}
                    <circle cx="100" cy="40" r="12" fill="#111D35" stroke="rgba(255,140,0,0.5)" strokeWidth="1.5" className="group-hover/graph:scale-110 transition-transform cursor-pointer" />
                    <text x="100" y="43" textAnchor="middle" fill="#EBF0FF" fontSize="7" fontFamily="monospace">Auth</text>

                    <circle cx="300" cy="40" r="12" fill="#111D35" stroke="rgba(148,163,184,0.4)" strokeWidth="1" />
                    <text x="300" y="43" textAnchor="middle" fill="#94A3B8" fontSize="7" fontFamily="monospace">API</text>

                    <circle cx="80" cy="120" r="12" fill="#111D35" stroke="rgba(148,163,184,0.4)" strokeWidth="1" />
                    <text x="80" y="123" textAnchor="middle" fill="#94A3B8" fontSize="7" fontFamily="monospace">Store</text>

                    <circle cx="320" cy="120" r="12" fill="#111D35" stroke="rgba(148,163,184,0.4)" strokeWidth="1" />
                    <text x="320" y="123" textAnchor="middle" fill="#94A3B8" fontSize="7" fontFamily="monospace">Utils</text>
                  </svg>
                  
                  <div className="absolute bottom-2 right-3 font-mono text-[9px] text-[#64748B]">
                    Click to zoom / inspect
                  </div>
                </div>
              </CardSpotlight>
            </div>

            {/* Codebase Q&A Chat (1 col) */}
            <div>
              <CardSpotlight className="h-full p-6 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] bg-[#FF8C00]/10 text-[#FF8C00] px-2 py-0.5 rounded border border-[#FF8C00]/20 font-bold mb-4 inline-block">AI INTELLIGENCE</span>
                  <h3 className="text-xl font-bold mb-2">Codebase AI Q&A</h3>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    Chat with your codebase as if it were a senior dev. Get immediate, file-specific answers with precise code location pointers.
                  </p>
                </div>
                <div className="space-y-3 mt-6">
                  <div className="bg-[#111D35] border border-white/5 rounded-xl px-3 py-2.5 text-[11px] text-[#EBF0FF] font-body flex items-start gap-2">
                    <span className="text-[#FF8C00]">Q:</span>
                    <span>Where is rate limiting defined?</span>
                  </div>
                  <div className="bg-[#070B14] border border-[#FF8C00]/20 rounded-xl px-3 py-2.5 text-[11px] text-[#EBF0FF]/90 font-body flex items-start gap-2">
                    <span className="text-green-400 font-bold">A:</span>
                    <div>
                      <code className="text-[#FF8C00] font-mono block mb-1">middleware/rateLimit.ts:18</code>
                      <span className="text-[#94A3B8]">Applied globally via Redis sliding window configuration.</span>
                    </div>
                  </div>
                </div>
              </CardSpotlight>
            </div>

            {/* PR Summarizer Bento Card (1 col) */}
            <div>
              <CardSpotlight className="h-full p-6 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10px] bg-[#FF8C00]/10 text-[#FF8C00] px-2 py-0.5 rounded border border-[#FF8C00]/20 font-bold mb-4 inline-block">DEVELOPER VELOCITY</span>
                  <h3 className="text-xl font-bold mb-2">Auto PR Descriptions</h3>
                  <p className="text-sm text-[#94A3B8] leading-relaxed">
                    Instantly summarize code modifications. Auto-generates detailed descriptions, architecture impact logs, and test checklists.
                  </p>
                </div>
                <div className="bg-[#070B14] border border-[#1C2D50] rounded-xl p-4 mt-6">
                  <div className="flex gap-2 items-center mb-2">
                    <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full font-mono">+128</span>
                    <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-full font-mono">−14</span>
                    <span className="text-[9px] font-mono text-[#64748B]">3 files</span>
                  </div>
                  <p className="text-[10px] text-[#FF8C00] font-mono font-bold">feat: Redis session clustering</p>
                  <p className="text-[9px] text-[#94A3B8] font-body mt-1 leading-normal">
                    Replaces standard cookie-based store with distributed Redis cache to prevent session dropouts across instances.
                  </p>
                </div>
              </CardSpotlight>
            </div>

            {/* Onboarding Playbooks Bento Card (2 cols) */}
            <div className="md:col-span-2">
              <CardSpotlight className="h-full p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[10px] bg-[#FF8C00]/10 text-[#FF8C00] px-2 py-0.5 rounded border border-[#FF8C00]/20 font-bold">KNOWLEDGE SYSTEM</span>
                    <span className="text-[11px] text-[#64748B] font-mono">Guided Paths</span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">Guided Developer Paths</h3>
                  <p className="text-sm text-[#94A3B8] leading-relaxed mb-6">
                    Step-by-step onboarding playlists tailored specifically to your codebase. Guides new hires from repository checkout to their first PR deployment with embedded exercises.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-2">
                  {[
                    { title: '1. Repo Checkout', desc: 'Dependencies setup', step: '✓', done: true },
                    { title: '2. Architecture Walkthrough', desc: 'Explore entry points', step: '✓', done: true },
                    { title: '3. Local Debugging', desc: 'Run environment tests', step: '3', active: true },
                    { title: '4. First PR Issue', desc: 'Fix minor ticket', step: '4', done: false },
                  ].map((s) => (
                    <div key={s.title} className={`p-3 rounded-xl border flex flex-col justify-between h-24 ${s.active ? 'border-[#FF8C00]/50 bg-[#FF8C00]/5' : s.done ? 'border-[#1C2D50] bg-[#111D35]/30' : 'border-white/5 bg-[#0C1426]/20'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] ${s.active ? 'bg-[#FF8C00] text-[#390C00] font-bold' : s.done ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-transparent text-white/20 border border-white/10'}`}>
                          {s.step}
                        </span>
                      </div>
                      <div>
                        <p className={`text-[10px] font-bold ${s.active ? 'text-[#FF8C00]' : 'text-[#EBF0FF]'}`}>{s.title}</p>
                        <p className="text-[8px] text-[#94A3B8] mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardSpotlight>
            </div>
          </div>
        </div>
      </section>

      {/* ── Code Health Preview Section ── */}
      <section id="metrics" className="py-24 bg-[#070B14]/80 border-y border-white/5 relative">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQyIiB3aWR0aD0iODAiIGhlaWdodD0iODAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPjxwYXRoIGQ9Ik0gODAgMCBMIDAgMCAwIDgwIiBmaWxsPSJub25lIiBzdHJva2U9IiNGRkZGRkYiIHN0cm9rZS13aWR0aD0iMC4wNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkMikiLz48L3N2Zz4=')] opacity-[0.02]" />
        
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="font-mono text-xs text-[#FF8C00] uppercase tracking-wider font-bold">Static Analysis</span>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#EBF0FF] mt-2 mb-6">
                Quantify Code Complexity & Technical Debt
              </h2>
              <p className="text-[#94A3B8] text-sm md:text-base leading-relaxed mb-6">
                CodeFlow doesn't just display directories — it computes health ratings for every module. Identify risky refactoring zones, monitor cognitive loads, and clean up messy files with automated code scoring.
              </p>
              
              <div className="space-y-4">
                {[
                  { title: 'Cyclomatic Complexity tracking', detail: 'Tracks logical branches to minimize testing paths.' },
                  { title: 'Module Churn & Risk index', detail: 'Correlates commit frequency with code density to flag error hotspots.' },
                  { title: 'Automated Code Health Rating', detail: 'A-F structural grades for every module, folder, and package.' }
                ].map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-5 h-5 rounded border border-[#FF8C00]/30 bg-[#FF8C00]/5 flex items-center justify-center shrink-0 mt-1">
                      <span className="text-[#FF8C00] text-[9px] font-bold">✓</span>
                    </div>
                    <div>
                      <p className="text-sm text-[#EBF0FF] font-semibold">{item.title}</p>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link to="/code-health" className="inline-flex items-center gap-2 text-sm text-[#FF8C00] font-bold hover:underline">
                  Explore Code Health Dashboard →
                </Link>
              </div>
            </div>

            {/* Dashboard Mockup Graph */}
            <div className="bg-[#0C1426] border border-[#1C2D50] rounded-2xl p-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-[#1C2D50] mb-5">
                <span className="font-mono text-xs text-[#EBF0FF] font-semibold">Repository Module Rating</span>
                <span className="text-[10px] text-green-400 font-mono">Clean Codebase</span>
              </div>
              
              <div className="space-y-4">
                {[
                  { module: 'src/services/auth.ts', rating: 'A', score: 94, width: '94%', color: 'bg-green-500' },
                  { module: 'src/pages/Dashboard.tsx', rating: 'B', score: 81, width: '81%', color: 'bg-emerald-500' },
                  { module: 'src/lib/db-client.ts', rating: 'C', score: 72, width: '72%', color: 'bg-yellow-500' },
                  { module: 'src/legacy/parser.js', rating: 'F', score: 28, width: '28%', color: 'bg-red-500' }
                ].map((item) => (
                  <div key={item.module} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-[#94A3B8]">{item.module}</span>
                      <div className="flex gap-2 items-center">
                        <span className="text-[#EBF0FF] font-bold">{item.score}%</span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${item.rating === 'A' || item.rating === 'B' ? 'bg-green-500/10 text-green-400' : item.rating === 'C' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>{item.rating}</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-[#111D35] rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: item.width }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-[#1C2D50] flex items-center justify-between text-xs font-mono text-[#64748B]">
                <span>Analysis Rating: 84 / 100</span>
                <span>Avg Complexity: 6.4</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing Tiers Preview ── */}
      <section id="pricing" className="py-24 bg-[#050810] relative">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#FF8C00] uppercase tracking-wider font-bold">Flexible Plans</span>
            <h2 className="font-display text-3xl font-bold text-[#EBF0FF]">Pricing designed for developers and organizations</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Starter Plan */}
            <CardSpotlight className="p-8 flex flex-col justify-between border border-[#1C2D50] bg-[#0C1426]/50">
              <div>
                <span className="text-xs font-mono text-[#94A3B8] uppercase">Starter</span>
                <div className="flex items-baseline gap-1 mt-4 mb-6">
                  <span className="text-4xl font-bold text-[#EBF0FF] font-display">$0</span>
                  <span className="text-xs text-[#64748B] font-mono">/ free forever</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed mb-6">
                  Perfect for scanning public repositories and trial exploration.
                </p>
                <ul className="space-y-3 border-t border-[#1C2D50] pt-6 mb-8 text-xs text-[#94A3B8]">
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Up to 3 public repositories</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Live dependency mapping</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> AI Q&A codebase queries</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Basic complexity metrics</li>
                </ul>
              </div>
              <Link to="/register" className="block text-center w-full py-3 border border-white/10 rounded-xl bg-white/5 hover:bg-[#070B14] text-xs font-bold transition-all">
                Get Started
              </Link>
            </CardSpotlight>

            {/* Pro Plan */}
            <CardSpotlight className="p-8 flex flex-col justify-between border border-[#FF8C00]/30 bg-[#111D35]/50 relative shadow-[#FF8C00]/5 shadow-xl">
              <div className="absolute top-0 right-8 -translate-y-1/2 bg-[#FF8C00] text-[#390C00] font-mono font-bold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                POPULAR
              </div>
              <div>
                <span className="text-xs font-mono text-[#FF8C00] uppercase font-bold">Pro Developer</span>
                <div className="flex items-baseline gap-1 mt-4 mb-6">
                  <span className="text-4xl font-bold text-[#EBF0FF] font-display">$29</span>
                  <span className="text-xs text-[#64748B] font-mono">/ month</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed mb-6">
                  For active engineers and smaller teams looking to boost shipping velocity.
                </p>
                <ul className="space-y-3 border-t border-[#1C2D50] pt-6 mb-8 text-xs text-[#94A3B8]">
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Unlimited public repositories</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> 10 private repositories</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Auto-generated PR descriptions</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Interactive onboarding paths</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Priority analysis speed</li>
                </ul>
              </div>
              <Link to="/register" className="block text-center w-full py-3 bg-gradient-cta text-[#390C00] rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all">
                Try 14-Day Free Trial
              </Link>
            </CardSpotlight>

            {/* Enterprise Plan */}
            <CardSpotlight className="p-8 flex flex-col justify-between border border-[#1C2D50] bg-[#0C1426]/50">
              <div>
                <span className="text-xs font-mono text-[#94A3B8] uppercase">Team & Enterprise</span>
                <div className="flex items-baseline gap-1 mt-4 mb-6">
                  <span className="text-4xl font-bold text-[#EBF0FF] font-display">Custom</span>
                </div>
                <p className="text-xs text-[#94A3B8] leading-relaxed mb-6">
                  For mid-market and enterprise companies looking for deep codebase analytics.
                </p>
                <ul className="space-y-3 border-t border-[#1C2D50] pt-6 mb-8 text-xs text-[#94A3B8]">
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Unlimited private repositories</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Custom SSO / SAML integration</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Self-hosted option (on-premise)</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Dedicated support engineer</li>
                  <li className="flex items-center gap-2"><span className="text-[#FF8C00]">✓</span> Custom onboarding modules</li>
                </ul>
              </div>
              <Link to="/register" className="block text-center w-full py-3 border border-white/10 rounded-xl bg-white/5 hover:bg-[#070B14] text-xs font-bold transition-all">
                Contact Sales
              </Link>
            </CardSpotlight>
          </div>
        </div>
      </section>

      {/* ── FAQ Section ── */}
      <section id="faq" className="py-24 bg-[#070B14]/80 border-t border-white/5 relative">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-16 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#FF8C00] uppercase tracking-wider font-bold">FAQ</span>
            <h2 className="font-display text-3xl font-bold text-[#EBF0FF]">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="border border-[#1C2D50] bg-[#0C1426]/40 rounded-xl overflow-hidden transition-all"
              >
                <button
                  type="button"
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                  className="w-full flex justify-between items-center px-6 py-4 text-left font-body font-semibold text-sm hover:bg-[#111D35]/30 transition-colors focus:outline-none"
                >
                  <span>{faq.q}</span>
                  <span className="text-[#FF8C00] font-mono text-lg ml-4">
                    {activeFaq === idx ? '−' : '+'}
                  </span>
                </button>
                {activeFaq === idx && (
                  <div className="px-6 pb-5 pt-1 text-xs text-[#94A3B8] leading-relaxed border-t border-[#1C2D50] bg-[#070B14]/50">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom Call-To-Action ── */}
      <section className="py-28 bg-[#050810] text-center relative overflow-hidden border-t border-white/5">
        <Spotlight className="-top-40 left-1/2 -translate-x-1/2" fill="#FF8C00" />
        <div className="relative z-10 max-w-2xl mx-auto px-6 flex flex-col items-center gap-6">
          <h2 className="font-display text-3xl md:text-5xl font-bold text-[#EBF0FF] tracking-tight">
            Stop guessing. Map your codebase.
          </h2>
          <p className="text-[#94A3B8] text-sm md:text-base max-w-lg leading-relaxed">
            Empower your engineers with live dependency mapping, interactive playbook journeys, and deep code health ratings. Start free today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4 justify-center">
            <Link
              to="/register"
              className="bg-gradient-cta text-[#390C00] font-bold px-8 py-3.5 rounded-xl text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#FF8C00]/10 text-center"
            >
              Get Started Free
            </Link>
            <Link
              to="/explore"
              className="px-8 py-3.5 rounded-xl text-sm text-[#EBF0FF] bg-[#111D35] border border-white/10 hover:bg-white/5 transition-colors text-center font-semibold"
            >
              Explore Public Repos
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#050810] border-t border-white/5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 px-6 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="col-span-2 md:col-span-1 flex flex-col gap-4">
            <span className="font-display text-xl font-bold text-[#EBF0FF]">CodeFlow</span>
            <p className="text-xs text-[#94A3B8] leading-relaxed">Systemizing codebase comprehension and static analysis for engineering teams.</p>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FF8C00] uppercase tracking-widest font-bold mb-4">Product</h3>
            <ul className="flex flex-col gap-3 text-xs text-[#94A3B8]">
              <li><a className="hover:text-[#EBF0FF] transition-colors" href="#features">Features</a></li>
              <li><a className="hover:text-[#EBF0FF] transition-colors" href="#metrics">Code Health</a></li>
              <li><a className="hover:text-[#EBF0FF] transition-colors" href="#pricing">Pricing</a></li>
              <li><Link to="/changelog" className="hover:text-[#EBF0FF] transition-colors">Changelog</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FF8C00] uppercase tracking-widest font-bold mb-4">Resources</h3>
            <ul className="flex flex-col gap-3 text-xs text-[#94A3B8]">
              <li><Link to="/docs" className="hover:text-[#EBF0FF] transition-colors">Documentation</Link></li>
              <li><Link to="/docs" className="hover:text-[#EBF0FF] transition-colors">API Reference</Link></li>
              <li><a className="hover:text-[#EBF0FF] transition-colors" href="#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FF8C00] uppercase tracking-widest font-bold mb-4">Developer Account</h3>
            <ul className="flex flex-col gap-3 text-xs text-[#94A3B8]">
              <li><Link to="/login" className="hover:text-[#EBF0FF] transition-colors">Log In</Link></li>
              <li><Link to="/register" className="hover:text-[#EBF0FF] transition-colors">Register Account</Link></li>
              <li><Link to="/waitlist" className="hover:text-[#EBF0FF] transition-colors">Join Waitlist</Link></li>
            </ul>
          </div>
        </div>
        <div className="py-6 border-t border-white/5 text-center text-[10px] text-[#64748B] font-mono">
          © {new Date().getFullYear()} CodeFlow Inc. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
