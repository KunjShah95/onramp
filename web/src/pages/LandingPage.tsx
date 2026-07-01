import { Link } from 'react-router-dom'
import ShaderBackground from '../components/ui/ShaderBackground'
import Spotlight from '../components/ui/spotlight'

export default function LandingPage() {
  return (
    <div className="text-[#FDFBF8] font-body bg-[#050505] antialiased selection:bg-[#FF8C00]/30 selection:text-[#FF8C00] relative max-w-full overflow-x-hidden">
      {/* Floating Nav */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#features">Product</a>
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#how">How it works</a>
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#pricing">Pricing</a>
          <Link to="/waitlist" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Waitlist</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/waitlist" className="bg-[#FFB347] text-[#3D1C00] px-5 py-2.5 rounded-full font-body text-sm font-bold hover:bg-[#FF8C00] transition-colors">Join Waitlist</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[92vh] flex items-center justify-center pt-32 pb-20 overflow-hidden">
        <ShaderBackground />
        {/* Aceternity-style spotlight in accent color */}
        <Spotlight
          className="-top-40 left-0 md:-top-20 md:left-60"
          fill="#FF8C00"
        />

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjI1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-[0.02] z-0" />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 flex flex-col items-center text-center gap-8">
          {/* Status pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1A110D] border border-[#FF8C00]/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
            <span className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold">AI-Powered Developer Onboarding</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight max-w-4xl">
            Understand any codebase.{' '}
            <br />
            <span className="text-[#FDFBF8]/55">Ship your first PR today.</span>
          </h1>

          <p className="font-body text-lg md:text-xl text-[#FDFBF8]/65 max-w-2xl leading-relaxed">
            Stop reading outdated wikis. CodeFlow maps your running architecture, finds critical files, and generates a guided learning path for any repository — in seconds.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
            <Link
              to="/waitlist"
              className="bg-[#FFB347] text-[#3D1C00] px-8 py-3.5 rounded text-sm font-bold hover:bg-[#FF8C00] transition-colors w-full sm:w-auto text-center"
            >
              Join the Waitlist →
            </Link>
            <Link
              to="/docs"
              className="px-8 py-3.5 rounded text-sm text-[#FDFBF8] bg-[#1A110D] border border-[#FDFBF8]/10 hover:bg-[#2A1D16] transition-colors w-full sm:w-auto text-center font-medium"
            >
              View Documentation
            </Link>
          </div>

          {/* Hero — Embedded YouTube Demo Video */}
          <div className="w-full max-w-3xl mt-8 rounded-xl border border-[#FDFBF8]/10 bg-[#0A0705] overflow-hidden shadow-2xl">
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/l4i3FqeqidU?rel=0&modestbranding=1"
                title="CodeFlow Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{ border: 'none' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Used by ── */}
      <section className="py-16 border-y border-[#FDFBF8]/5 bg-[#0A0705]">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="text-center font-mono text-[10px] text-[#FDFBF8]/40 mb-8 uppercase tracking-widest font-bold">Designed for engineering teams that move fast</p>
          <div className="flex justify-center items-center gap-6 flex-wrap">
            {[
              { label: '< 2 min', sub: 'avg onboard time' },
              { label: '94%', sub: 'faster first PR' },
              { label: '12+', sub: 'languages parsed' },
              { label: 'Zero', sub: 'manual diagramming' },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center px-8 py-4 bg-[#1A110D]/60 rounded-lg border border-[#FF8C00]/10">
                <span className="font-display text-2xl font-bold text-[#FF8C00]">{s.label}</span>
                <span className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-wider mt-1">{s.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section id="features" className="py-28 bg-[#050505]">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-16 items-center mb-28">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#FDFBF8] leading-tight mb-6">
                New engineer. Day one.<br />
                <span className="text-[#FDFBF8]/40">Where do they even start?</span>
              </h2>
              <p className="font-body text-[#FDFBF8]/55 text-lg leading-relaxed mb-8">
                Most codebases have no map. Wikis are months out of date. Senior engineers spend their first week answering the same questions on Slack. That time costs real money and kills velocity.
              </p>
              <div className="space-y-4">
                {[
                  { pain: 'Onboarding takes 2–4 weeks before first meaningful commit' },
                  { pain: 'Architecture docs drift from reality immediately after writing' },
                  { pain: 'Senior engineers lose 30–40% of time to context-sharing' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded border border-red-500/30 bg-red-500/5 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-red-400 text-[10px]">✕</span>
                    </div>
                    <p className="text-sm text-[#FDFBF8]/55 font-body">{item.pain}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Terminal: a real Slack convo dev pain */}
            <div className="rounded-xl border border-[#FDFBF8]/8 bg-[#0A0705] overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#FDFBF8]/5 bg-[#0D0906]">
                <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#3D332D]" />
                <span className="ml-2 font-mono text-[11px] text-[#FDFBF8]/25">#engineering-help</span>
              </div>
              <div className="p-5 space-y-4 font-body text-sm">
                {[
                  { user: 'sarah_new', color: 'text-blue-400', msg: 'where is the auth token refresh logic? I\'ve been searching for 2 hours 😅' },
                  { user: 'alex_senior', color: 'text-green-400', msg: 'it\'s split across 3 files — middleware/auth.ts, lib/session.ts, and there\'s a util in utils/token.js. Long story.' },
                  { user: 'sarah_new', color: 'text-blue-400', msg: 'why is it split like that?' },
                  { user: 'alex_senior', color: 'text-green-400', msg: 'legacy reasons, the original auth was written before we moved to JWTs. I can walk you through it after standup' },
                ].map((line, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="w-7 h-7 rounded-md bg-[#1A110D] border border-[#FDFBF8]/5 flex items-center justify-center shrink-0 font-mono text-[9px] text-[#FDFBF8]/40">
                      {line.user.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className={`text-[11px] font-semibold font-mono ${line.color}`}>{line.user}</span>
                      <p className="text-[#FDFBF8]/50 text-xs mt-0.5 leading-relaxed">{line.msg}</p>
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t border-[#FDFBF8]/5 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#FDFBF8]/20">This conversation repeats 12× per week.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bento product grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Large: dependency graph */}
            <div className="md:col-span-2 rounded-2xl border border-[#FDFBF8]/8 bg-[#0A0705] overflow-hidden group hover:border-[#FF8C00]/20 transition-colors duration-300 shadow-xl">
              <div className="p-5 border-b border-[#FDFBF8]/5 flex items-center justify-between">
                <div>
                  <p className="text-[#FDFBF8] font-body text-sm font-semibold">Dependency Graph</p>
                  <p className="text-[#FDFBF8]/40 font-mono text-[11px] mt-0.5">vercel/next.js · 847 files</p>
                </div>
                <span className="font-mono text-[10px] text-[#FF8C00] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF8C00] animate-pulse inline-block" />live
                </span>
              </div>
              <div className="p-5 relative h-52">
                {/* Graph nodes */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 480 200" fill="none">
                  {/* Edges */}
                  <line x1="240" y1="100" x2="100" y2="50"  stroke="rgba(255,140,0,0.3)"  strokeWidth="1.5" />
                  <line x1="240" y1="100" x2="380" y2="50"  stroke="rgba(253,251,248,0.1)" strokeWidth="1.5" />
                  <line x1="240" y1="100" x2="60"  y2="140" stroke="rgba(253,251,248,0.1)" strokeWidth="1.5" />
                  <line x1="240" y1="100" x2="420" y2="140" stroke="rgba(253,251,248,0.1)" strokeWidth="1.5" />
                  <line x1="240" y1="100" x2="170" y2="170" stroke="rgba(253,251,248,0.07)" strokeWidth="1" />
                  <line x1="240" y1="100" x2="310" y2="170" stroke="rgba(253,251,248,0.07)" strokeWidth="1" />
                  <line x1="100" y1="50"  x2="60"  y2="140" stroke="rgba(253,251,248,0.05)" strokeWidth="1" />
                  <line x1="380" y1="50"  x2="420" y2="140" stroke="rgba(253,251,248,0.05)" strokeWidth="1" />
                  {/* Center node */}
                  <rect x="215" y="78" width="50" height="44" rx="8" fill="rgba(255,140,0,0.12)" stroke="rgba(255,140,0,0.5)" strokeWidth="1.5" />
                  <text x="240" y="105" textAnchor="middle" fill="#FF8C00" fontSize="9" fontFamily="monospace" fontWeight="600">App</text>
                  {/* Satellite nodes */}
                  <rect x="74"  y="32"  width="52" height="36" rx="6" fill="#1A110D" stroke="rgba(253,251,248,0.15)" strokeWidth="1" />
                  <text x="100" y="54"  textAnchor="middle" fill="rgba(253,251,248,0.55)" fontSize="8" fontFamily="monospace">Auth</text>
                  <rect x="354" y="32"  width="52" height="36" rx="6" fill="#1A110D" stroke="rgba(253,251,248,0.15)" strokeWidth="1" />
                  <text x="380" y="54"  textAnchor="middle" fill="rgba(253,251,248,0.55)" fontSize="8" fontFamily="monospace">Router</text>
                  <rect x="34"  y="122" width="52" height="36" rx="6" fill="#1A110D" stroke="rgba(253,251,248,0.1)" strokeWidth="1" />
                  <text x="60"  y="144" textAnchor="middle" fill="rgba(253,251,248,0.4)"  fontSize="8" fontFamily="monospace">DB</text>
                  <rect x="394" y="122" width="52" height="36" rx="6" fill="#1A110D" stroke="rgba(253,251,248,0.1)" strokeWidth="1" />
                  <text x="420" y="144" textAnchor="middle" fill="rgba(253,251,248,0.4)"  fontSize="8" fontFamily="monospace">Queue</text>
                  <rect x="144" y="155" width="52" height="32" rx="6" fill="#0A0705" stroke="rgba(253,251,248,0.07)" strokeWidth="1" />
                  <text x="170" y="175" textAnchor="middle" fill="rgba(253,251,248,0.3)"  fontSize="7" fontFamily="monospace">Cache</text>
                  <rect x="284" y="155" width="52" height="32" rx="6" fill="#0A0705" stroke="rgba(253,251,248,0.07)" strokeWidth="1" />
                  <text x="310" y="175" textAnchor="middle" fill="rgba(253,251,248,0.3)"  fontSize="7" fontFamily="monospace">CDN</text>
                </svg>
              </div>
              <div className="px-5 py-3 border-t border-[#FDFBF8]/5 grid grid-cols-3 gap-4">
                {[['6', 'services'], ['24', 'dep edges'], ['3', 'critical paths']].map(([n, l]) => (
                  <div key={l}>
                    <span className="font-display text-base font-bold text-[#FDFBF8]">{n}</span>
                    <span className="font-mono text-[10px] text-[#FDFBF8]/35 ml-1.5">{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tall right col: two stacked */}
            <div className="flex flex-col gap-4">

              {/* Ask codebase */}
              <div className="rounded-2xl border border-[#FDFBF8]/8 bg-[#0A0705] overflow-hidden group hover:border-[#FF8C00]/20 transition-colors duration-300 flex-1">
                <div className="p-4 border-b border-[#FDFBF8]/5">
                  <p className="text-[#FDFBF8] font-body text-sm font-semibold">Ask Codebase</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="bg-[#1A110D] rounded-lg px-3 py-2 text-[11px] text-[#FDFBF8]/60 font-body">
                    Where is rate limiting applied?
                  </div>
                  <div className="bg-[#2A1D16] border border-[#FF8C00]/15 rounded-lg px-3 py-2 text-[11px] text-[#FDFBF8]/80 font-body leading-relaxed">
                    <code className="text-[#FF8C00] font-mono">middleware/rateLimit.ts:18</code>
                    <span className="text-[#FDFBF8]/50"> — applied per-IP using Redis sliding window.</span>
                  </div>
                </div>
              </div>

              {/* PR Describe */}
              <div className="rounded-2xl border border-[#FDFBF8]/8 bg-[#0A0705] overflow-hidden group hover:border-[#FF8C00]/20 transition-colors duration-300 flex-1">
                <div className="p-4 border-b border-[#FDFBF8]/5">
                  <p className="text-[#FDFBF8] font-body text-sm font-semibold">PR Description</p>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full">+142</span>
                    <span className="text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">−31</span>
                    <span className="text-[10px] font-mono text-[#FDFBF8]/30">4 files</span>
                  </div>
                  <p className="text-[11px] text-[#FF8C00] font-mono font-semibold">feat: add Redis-backed session store</p>
                  <p className="text-[10px] text-[#FDFBF8]/45 font-body leading-relaxed">Replaces in-memory session storage with Redis. Fixes session loss on server restart. Tested with 10k concurrent users.</p>
                </div>
              </div>
            </div>

            {/* Bottom row: two cells */}
            <div className="rounded-2xl border border-[#FDFBF8]/8 bg-[#0A0705] p-5 group hover:border-[#FF8C00]/20 transition-colors duration-300">
              <p className="text-[#FDFBF8] font-body text-sm font-semibold mb-3">Critical Files</p>
              <div className="space-y-2">
                {[
                  { file: 'auth/middleware.ts', badge: 'entry point', hot: true },
                  { file: 'lib/db.ts',          badge: '14 callers', hot: false },
                  { file: 'api/payments.ts',    badge: 'critical',   hot: false },
                ].map((f) => (
                  <div key={f.file} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-[11px] ${f.hot ? 'border-[#FF8C00]/25 bg-[#FF8C00]/5' : 'border-[#FDFBF8]/5 bg-[#1A110D]/30'}`}>
                    <code className={`font-mono ${f.hot ? 'text-[#FF8C00]' : 'text-[#FDFBF8]/50'}`}>{f.file}</code>
                    <span className="text-[#FDFBF8]/30 font-mono text-[9px]">{f.badge}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 rounded-2xl border border-[#FDFBF8]/8 bg-[#0A0705] p-5 group hover:border-[#FF8C00]/20 transition-colors duration-300">
              <p className="text-[#FDFBF8] font-body text-sm font-semibold mb-3">First Issue Path</p>
              <div className="flex items-center gap-0">
                {[
                  { label: 'Clone & run', done: true },
                  { label: 'Read auth flow', done: true },
                  { label: 'Find issue #847', active: true },
                  { label: 'Open PR', done: false },
                ].map((s, i, arr) => (
                  <div key={s.label} className="flex items-center flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono shrink-0 ${s.active ? 'bg-[#FF8C00]/15 border border-[#FF8C00]/50 text-[#FF8C00]' : s.done ? 'bg-[#FF8C00] text-[#3D1C00]' : 'border border-[#FDFBF8]/15 text-[#FDFBF8]/25'}`}>
                        {s.done ? '✓' : i + 1}
                      </div>
                      <span className={`font-mono text-[9px] text-center leading-tight px-1 ${s.active ? 'text-[#FF8C00]' : s.done ? 'text-[#FDFBF8]/50' : 'text-[#FDFBF8]/25'}`}>{s.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`h-px w-full mx-1 mb-5 ${s.done ? 'bg-[#FF8C00]/30' : 'bg-[#FDFBF8]/8'}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-32 bg-[#050505] text-center relative overflow-hidden">
        <Spotlight className="-top-40 left-1/2 -translate-x-1/2" fill="#FF8C00" />
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-[#FDFBF8] mb-6 tracking-tight">
            From repo to ready — in minutes.
          </h2>
          <p className="font-body text-[#FDFBF8]/55 text-lg mb-10 max-w-xl mx-auto">
            Stop losing senior engineers to onboarding. Let CodeFlow handle it.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/waitlist" className="bg-[#FFB347] text-[#3D1C00] px-8 py-3.5 rounded text-sm font-bold hover:bg-[#FF8C00] transition-colors w-full sm:w-auto text-center">
              Join the Waitlist →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-[#050505] border-t border-[#FDFBF8]/5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 px-6 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="col-span-2 md:col-span-1">
            <span className="font-display text-xl font-bold text-[#FDFBF8] mb-4 block tracking-tight">CodeFlow</span>
            <p className="font-body text-sm text-[#FDFBF8]/40 leading-relaxed">Systemizing codebase comprehension for engineering teams.</p>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Product</h3>
            <ul className="flex flex-col gap-3">
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#features">Features</a></li>
              <Link to="/pricing" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Pricing</Link>
              <Link to="/changelog" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Changelog</Link>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Resources</h3>
            <ul className="flex flex-col gap-3">
              <li><Link to="/docs" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Documentation</Link></li>
              <li><Link to="/docs" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">API Reference</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Company</h3>
            <ul className="flex flex-col gap-3">
              <li><Link to="/waitlist" className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Join Waitlist</Link></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
