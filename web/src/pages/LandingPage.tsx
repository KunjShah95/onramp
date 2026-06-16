import { Link } from 'react-router-dom'
import ShaderBackground from '../components/ui/ShaderBackground'

export default function LandingPage() {
  return (
    <div className="text-[#FDFBF8] font-body bg-[#050505] antialiased selection:bg-[#FF8C00]/30 selection:text-[#FF8C00] relative">
      {/* TopNavBar */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#explore">Product</a>
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#learn">Methodology</a>
          <a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#pricing">Pricing</a>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="hidden md:block text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors">Log in</Link>
          <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-5 py-2.5 rounded-full font-body text-sm font-bold hover:bg-[#FF8C00] transition-colors">Start Building</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center justify-center pt-32 pb-20 overflow-hidden">
        <ShaderBackground />
        
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjI1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-[0.02] z-0"></div>
        <div className="relative z-10 w-full max-w-5xl mx-auto px-6 md:px-12 flex flex-col items-center text-center gap-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1A110D] border border-[#FF8C00]/20 rounded-full">
            <div className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse"></div>
            <span className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold">Developer Onboarding Standard</span>
          </div>
          
          <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight max-w-4xl">
            Understand any codebase. <br/>
            <span className="text-[#FDFBF8]/40">Ship your first PR today.</span>
          </h1>
          
          <p className="font-body text-lg md:text-xl text-[#FDFBF8]/60 max-w-2xl leading-relaxed">
            Stop reading outdated wikis. CodeFlow directly maps your running architecture, finds critical files, and generates linear paths for any repository.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
            <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-8 py-3.5 rounded text-sm font-bold hover:bg-[#FF8C00] transition-colors w-full sm:w-auto text-center">Deploy Your First Instance</Link>
            <Link to="/login" className="px-8 py-3.5 rounded text-sm text-[#FDFBF8] bg-[#1A110D] border border-[#FDFBF8]/10 hover:bg-[#2A1D16] transition-colors w-full sm:w-auto text-center font-medium">View Documentation</Link>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 border-y border-[#FDFBF8]/5 bg-[#0A0705]">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <p className="text-center font-mono text-[10px] text-[#FDFBF8]/40 mb-8 uppercase tracking-widest font-bold">Infrastructure Trusted By</p>
          <div className="flex justify-center items-center gap-12 md:gap-24 opacity-30 grayscale flex-wrap">
            <span className="font-display text-xl font-bold tracking-tight">VERCEL</span>
            <span className="font-display text-xl font-bold tracking-tighter">Linear</span>
            <span className="font-display text-xl font-bold italic tracking-tight">stripe</span>
            <span className="font-display text-xl font-bold tracking-widest">RAYCAST</span>
          </div>
        </div>
      </section>

      {/* Features - Agency Style (Alternating Rows instead of Card Spam) */}
      <section id="explore" className="py-32 relative bg-[#050505]">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          
          {/* Feature 1 */}
          <div className="flex flex-col md:flex-row items-center gap-16 mb-32">
            <div className="flex-1">
              <div className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold mb-4">01 / Architecture Mapping</div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#FDFBF8] mb-6 leading-tight">Visualize the invisible.</h2>
              <p className="font-body text-[#FDFBF8]/60 leading-relaxed text-lg">
                We generate dependency graphs and architecture diagrams directly from your source code. No manual diagramming required. The map is always up to date because the code is the map.
              </p>
            </div>
            <div className="flex-1 w-full relative">
              <div className="aspect-square md:aspect-video rounded-xl border border-[#FDFBF8]/10 bg-[#0A0705] p-6 relative overflow-hidden flex items-center justify-center shadow-2xl">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iI0ZGRkZGRiIgc3Ryb2tlLXdpZHRoPSIwLjI1Ii8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-[0.05]"></div>
                <div className="flex gap-4 items-center z-10">
                  <div className="w-16 h-16 rounded border border-[#FF8C00]/30 bg-[#1A110D] flex items-center justify-center">
                    <span className="text-[#FF8C00] font-mono text-xs">Auth</span>
                  </div>
                  <div className="w-8 h-[1px] bg-[#FDFBF8]/20"></div>
                  <div className="w-16 h-16 rounded border border-[#FDFBF8]/20 bg-[#0A0705] flex items-center justify-center">
                    <span className="text-[#FDFBF8]/60 font-mono text-xs">API</span>
                  </div>
                  <div className="w-8 h-[1px] bg-[#FDFBF8]/20"></div>
                  <div className="w-16 h-16 rounded border border-[#FDFBF8]/20 bg-[#0A0705] flex items-center justify-center">
                    <span className="text-[#FDFBF8]/60 font-mono text-xs">DB</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col md:flex-row-reverse items-center gap-16 mb-32">
            <div className="flex-1">
              <div className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold mb-4">02 / Contextual Search</div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#FDFBF8] mb-6 leading-tight">Ask questions. Get references.</h2>
              <p className="font-body text-[#FDFBF8]/60 leading-relaxed text-lg">
                Query your codebase in plain text. Locate authentication logic, billing webhook handlers, or component registries instantly. Every answer includes direct file paths and line numbers.
              </p>
            </div>
            <div className="flex-1 w-full relative">
              <div className="aspect-square md:aspect-video rounded-xl border border-[#FDFBF8]/10 bg-[#0A0705] p-6 relative overflow-hidden shadow-2xl flex flex-col justify-center gap-4">
                 <div className="bg-[#1A110D] border border-[#FDFBF8]/5 p-4 rounded text-sm text-[#FDFBF8]/80 font-body self-start w-[85%]">
                   Where is the webhook signature verified?
                 </div>
                 <div className="bg-[#2A1D16] border border-[#FF8C00]/20 p-4 rounded text-sm text-[#FDFBF8] font-body self-end w-[90%]">
                   The signature is validated in <code className="font-mono text-[#FF8C00] text-xs mx-1">src/api/webhooks.ts</code> on line 42 using the SDK.
                 </div>
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1">
              <div className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider font-bold mb-4">03 / Guided Learning</div>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#FDFBF8] mb-6 leading-tight">Structured engineering paths.</h2>
              <p className="font-body text-[#FDFBF8]/60 leading-relaxed text-lg">
                Transform new hires into productive contributors. We generate sequential interactive tutorials based on your actual source code, guiding developers from environment setup to their first pull request.
              </p>
            </div>
            <div className="flex-1 w-full relative">
              <div className="aspect-square md:aspect-video rounded-xl border border-[#FDFBF8]/10 bg-[#0A0705] p-6 relative overflow-hidden shadow-2xl flex items-center justify-center">
                <div className="w-full max-w-sm">
                  <div className="flex items-center gap-4 mb-6 opacity-50">
                    <div className="w-6 h-6 rounded-full border border-[#FDFBF8]/20 flex items-center justify-center text-[10px] text-[#FDFBF8]/40 font-mono">1</div>
                    <div className="text-sm font-body text-[#FDFBF8]/40">Environment Setup</div>
                  </div>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-6 h-6 rounded-full border border-[#FF8C00]/50 bg-[#FF8C00]/10 flex items-center justify-center text-[10px] text-[#FF8C00] font-mono">2</div>
                    <div className="text-sm font-body text-[#FDFBF8]">Core Services</div>
                  </div>
                  <div className="flex items-center gap-4 opacity-50">
                    <div className="w-6 h-6 rounded-full border border-[#FDFBF8]/20 flex items-center justify-center text-[10px] text-[#FDFBF8]/40 font-mono">3</div>
                    <div className="text-sm font-body text-[#FDFBF8]/40">First Issue</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Social Proof Quote */}
      <section className="py-24 border-y border-[#FDFBF8]/5 bg-[#0A0705] relative overflow-hidden text-center">
        <div className="max-w-4xl mx-auto px-6 relative z-10">
          <h2 className="font-display text-2xl md:text-3xl font-medium text-[#FDFBF8] leading-relaxed mb-8">
            "Before CodeFlow, onboarding consumed our senior engineers for weeks. Now, hires ship to production on day two without asking a single architectural question."
          </h2>
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="font-bold text-[#FDFBF8] font-body text-sm">Manu Arora</div>
            <div className="text-xs text-[#FDFBF8]/40 font-mono uppercase tracking-widest">VP of Engineering, Aceternity</div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-32 bg-[#050505] text-center">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="font-display text-4xl md:text-5xl font-bold text-[#FDFBF8] mb-6 tracking-tight">
            Standardize your onboarding.
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
            <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-8 py-3.5 rounded text-sm font-bold hover:bg-[#FF8C00] transition-colors w-full sm:w-auto text-center">Deploy Now</Link>
            <Link to="/login" className="px-8 py-3.5 rounded text-sm text-[#FDFBF8] bg-[#1A110D] border border-[#FDFBF8]/10 hover:bg-[#2A1D16] transition-colors w-full sm:w-auto text-center font-medium">Talk to Sales</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#050505] border-t border-[#FDFBF8]/5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 px-6 md:px-12 py-16 max-w-5xl mx-auto">
          <div className="col-span-2 md:col-span-1">
            <span className="font-display text-xl font-bold text-[#FDFBF8] mb-4 block tracking-tight">CodeFlow</span>
            <p className="font-body text-sm text-[#FDFBF8]/40 leading-relaxed">Systemizing codebase comprehension for engineering teams.</p>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Product</h3>
            <ul className="flex flex-col gap-3">
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#explore">Architecture</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#learn">Learning</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#pricing">Pricing</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Resources</h3>
            <ul className="flex flex-col gap-3">
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">Documentation</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">API Reference</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h3 className="font-mono text-[10px] text-[#FDFBF8]/40 uppercase tracking-widest font-bold mb-4">Company</h3>
            <ul className="flex flex-col gap-3">
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">About</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">Careers</a></li>
              <li><a className="text-[#FDFBF8]/60 font-body text-sm hover:text-[#FDFBF8] transition-colors" href="#">Blog</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}
