import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

export default function Product() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      
      <div className="h-24"></div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-16 relative z-10 animate-in fade-in duration-700">
        <div className="bg-white/90 backdrop-blur-md border border-black/10 rounded-[24px] p-8 md:p-12 shadow-sm text-[#212121]">
          <h1 className="font-['Instrument_Serif'] text-[48px] md:text-[64px] leading-[1.1] tracking-tight mb-6">
            CodeFlow <span className="italic bg-clip-text text-transparent inline-block" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #368CFB 0%, #5CAEFE 30%, #85BDE0 47.5%, #AECDC2 65%, #D6DCA3 82.5%, #FFEB85 100%)', paddingRight: '0.1em' }}>Product</span>
          </h1>
          
          <p className="font-['Manrope'] text-[20px] text-[#212121]/70 leading-relaxed mb-12 max-w-3xl">
            A developer's time is best spent building, not archaeologizing through legacy code. 
            CodeFlow is the definitive intelligent workspace for codebases, turning thousands of undocumented files into an interactive, structured, and deeply context-aware developer wiki in seconds.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="font-['Instrument_Sans'] text-2xl font-semibold mb-3">Semantic AST Parsing</h3>
              <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed">
                We don't just read strings; our engine builds a complete Abstract Syntax Tree (AST) of your repository. 
                We resolve cross-file dependencies, infer types, and establish relationship graphs so you can navigate code semantically.
              </p>
            </div>
            
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5">
              <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-['Instrument_Sans'] text-2xl font-semibold mb-3">Instant Architecture Mapping</h3>
              <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed">
                Visually explore module interactions. Our AI dynamically generates interactive architecture diagrams, automatically categorizing business logic, data layers, and UI components into a digestible map.
              </p>
            </div>
            
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-['Instrument_Sans'] text-2xl font-semibold mb-3">Contextual LLM Embeddings</h3>
              <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed">
                By vectorizing every function and comment, CodeFlow equips you with a chat interface that truly understands the "why" behind the code, providing answers rooted strictly in your repository's context.
              </p>
            </div>
            
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5">
              <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="font-['Instrument_Sans'] text-2xl font-semibold mb-3">Living Documentation</h3>
              <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed">
                Forget stale READMEs. The wiki stays synchronized with every commit. It intelligently identifies breaking changes, deprecated utilities, and automatically updates integration guides.
              </p>
            </div>
          </div>
          
          <div className="text-center mt-12">
            <Link 
              to="/explore"
              className="inline-flex h-[52px] px-8 rounded-[12px] font-['Instrument_Sans'] font-medium text-[16px] text-white items-center justify-center transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(180deg, #444444 0%, #292929 100%)',
                border: '1px solid #000000',
                boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25), 0px 1px 2px rgba(0, 0, 0, 0.31), inset 0px 2px 1px rgba(255, 255, 255, 0.51), inset 1px 1px 0.25px rgba(255, 255, 255, 0.3)'
              }}
            >
              Analyze a Repository Now
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
