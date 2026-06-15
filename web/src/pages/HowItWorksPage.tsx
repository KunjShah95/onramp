import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

export default function HowItWorksPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />
      
      <div className="h-24"></div>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-16 relative z-10 animate-in fade-in duration-700">
        <div className="bg-white/90 backdrop-blur-md border border-black/10 rounded-[24px] p-8 md:p-12 shadow-sm text-[#212121]">
          <h1 className="font-['Instrument_Serif'] text-[48px] md:text-[64px] leading-[1.1] tracking-tight mb-6">
            How it <span className="italic bg-clip-text text-transparent inline-block" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #368CFB 0%, #5CAEFE 30%, #85BDE0 47.5%, #AECDC2 65%, #D6DCA3 82.5%, #FFEB85 100%)', paddingRight: '0.1em' }}>works</span>
          </h1>
          
          <p className="font-['Manrope'] text-[20px] text-[#212121]/70 leading-relaxed mb-16 max-w-3xl">
            CodeFlow is a deterministic pipeline paired with a generative AI layer. We don't just prompt an LLM with your code; we compile it into a knowledge graph that an AI can navigate deterministically.
          </p>

          <div className="space-y-12 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-black/10 before:to-transparent">
            
            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                1
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-white shadow-sm border border-black/5">
                <h3 className="font-['Instrument_Sans'] text-xl font-bold mb-2">Ingestion & AST Construction</h3>
                <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed text-sm">
                  Once you provide a repository URL, our background workers clone the codebase into an isolated, ephemeral sandbox. We run language-specific parsers (like Babel for JS/TS, or AST modules for Python/Go) to strip syntax and construct a pure Abstract Syntax Tree.
                </p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                2
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-white shadow-sm border border-black/5">
                <h3 className="font-['Instrument_Sans'] text-xl font-bold mb-2">Dependency Graph Generation</h3>
                <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed text-sm">
                  We recursively map internal and external dependencies. Every function call, class instantiation, and variable import is traced. This creates a directed acyclic graph (DAG) representing the absolute truth of how data flows through your system.
                </p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                3
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-white shadow-sm border border-black/5">
                <h3 className="font-['Instrument_Sans'] text-xl font-bold mb-2">Vectorization & AI Alignment</h3>
                <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed text-sm">
                  Code chunks, docstrings, and graph relations are embedded using high-dimensional dense vector models. These embeddings are stored in a specialized vector database. When you ask a question, we use RAG (Retrieval-Augmented Generation) constrained strictly to your graph bounds to eliminate hallucinations.
                </p>
              </div>
            </div>

            <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-500 text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                4
              </div>
              <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-2xl bg-white shadow-sm border border-black/5">
                <h3 className="font-['Instrument_Sans'] text-xl font-bold mb-2">Interactive Wiki Rendering</h3>
                <p className="font-['Manrope'] text-[#212121]/70 leading-relaxed text-sm">
                  Finally, the data is served to our React frontend. Complex architectural patterns are automatically translated into visual, interactive Mermaid diagrams. Deep links are generated, turning static code into a Wikipedia-style reading experience.
                </p>
              </div>
            </div>

          </div>

          <div className="text-center mt-16 pt-8 border-t border-black/5">
            <h2 className="font-['Instrument_Sans'] text-2xl font-bold mb-6">Ready to see it in action?</h2>
            <Link 
              to="/explore"
              className="inline-flex h-[52px] px-8 rounded-[12px] font-['Instrument_Sans'] font-medium text-[16px] text-white items-center justify-center transition-opacity hover:opacity-90"
              style={{
                background: 'linear-gradient(180deg, #444444 0%, #292929 100%)',
                border: '1px solid #000000',
                boxShadow: '0px 4px 4px rgba(0, 0, 0, 0.25), 0px 1px 2px rgba(0, 0, 0, 0.31), inset 0px 2px 1px rgba(255, 255, 255, 0.51), inset 1px 1px 0.25px rgba(255, 255, 255, 0.3)'
              }}
            >
              Start Analysis
            </Link>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
