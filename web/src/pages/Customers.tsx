import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

export default function Customers() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      
      <div className="h-24"></div>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-16 relative z-10 animate-in fade-in duration-700">
        <div className="bg-white/90 backdrop-blur-md border border-black/10 rounded-[24px] p-8 md:p-12 shadow-sm text-[#212121]">
          <div className="text-center mb-16">
            <h1 className="font-['Instrument_Serif'] text-[48px] md:text-[64px] leading-[1.1] tracking-tight mb-6">
              Trusted by <span className="italic bg-clip-text text-transparent inline-block" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #368CFB 0%, #5CAEFE 30%, #85BDE0 47.5%, #AECDC2 65%, #D6DCA3 82.5%, #FFEB85 100%)', paddingRight: '0.1em' }}>engineering teams</span>
            </h1>
            <p className="font-['Manrope'] text-[20px] text-[#212121]/70 leading-relaxed max-w-3xl mx-auto">
              From open-source maintainers to enterprise architecture teams, see how CodeFlow is transforming how developers understand code.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {/* Metric 1 */}
            <div className="text-center p-6 border-r border-black/5 last:border-0">
              <div className="text-5xl font-bold font-['Instrument_Sans'] text-blue-600 mb-2">70%</div>
              <div className="text-[#212121]/70 font-['Manrope'] font-medium">Faster Developer Onboarding</div>
            </div>
            {/* Metric 2 */}
            <div className="text-center p-6 border-r border-black/5 last:border-0">
              <div className="text-5xl font-bold font-['Instrument_Sans'] text-purple-600 mb-2">1M+</div>
              <div className="text-[#212121]/70 font-['Manrope'] font-medium">Files Analyzed Weekly</div>
            </div>
            {/* Metric 3 */}
            <div className="text-center p-6 border-r border-black/5 last:border-0">
              <div className="text-5xl font-bold font-['Instrument_Sans'] text-green-600 mb-2">0</div>
              <div className="text-[#212121]/70 font-['Manrope'] font-medium">Manual Docs Written</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
            {/* Case Study 1 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-black/5">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white font-bold font-['Instrument_Serif'] text-xl">
                  OS
                </div>
                <div>
                  <h3 className="font-bold font-['Instrument_Sans'] text-lg">OpenSource Foundation</h3>
                  <p className="text-sm text-[#212121]/60">15,000+ Contributors</p>
                </div>
              </div>
              <p className="font-['Manrope'] text-[#212121]/80 leading-relaxed italic mb-6">
                "We had a massive bottleneck in PR reviews because our core architecture wasn't documented. 
                CodeFlow generated an instant wiki that mapped our entire service mesh. New contributors now submit perfect PRs without asking for context."
              </p>
              <div className="text-sm font-['Manrope'] font-bold text-blue-600 uppercase tracking-wider">
                View Case Study &rarr;
              </div>
            </div>

            {/* Case Study 2 */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-black/5">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold font-['Instrument_Serif'] text-xl">
                  FT
                </div>
                <div>
                  <h3 className="font-bold font-['Instrument_Sans'] text-lg">FinTech Scaleup</h3>
                  <p className="text-sm text-[#212121]/60">Monolith to Microservices</p>
                </div>
              </div>
              <p className="font-['Manrope'] text-[#212121]/80 leading-relaxed italic mb-6">
                "During our transition to microservices, no one knew where dependencies lived. 
                CodeFlow's AST dependency graph allowed our architects to safely deprecate legacy code. It felt like turning on the lights in a dark room."
              </p>
              <div className="text-sm font-['Manrope'] font-bold text-blue-600 uppercase tracking-wider">
                View Case Study &rarr;
              </div>
            </div>
          </div>

          <div className="text-center mt-12 bg-blue-50 rounded-2xl p-12 border border-blue-100">
            <h2 className="font-['Instrument_Sans'] text-3xl font-bold mb-4">Join 2,000+ engineering teams</h2>
            <p className="font-['Manrope'] text-[#212121]/70 mb-8 max-w-2xl mx-auto">
              Stop guessing how the codebase works. Let CodeFlow generate your single source of truth today.
            </p>
            <Link 
              to="/register"
              className="inline-flex h-[52px] px-8 rounded-[12px] font-['Instrument_Sans'] font-medium text-[16px] text-white items-center justify-center transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(180deg, #444444 0%, #292929 100%)',
                border: '1px solid #000000',
                boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25), 0px 1px 2px rgba(0, 0, 0, 0.31), inset 0px 2px 1px rgba(255, 255, 255, 0.51), inset 1px 1px 0.25px rgba(255, 255, 255, 0.3)'
              }}
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
