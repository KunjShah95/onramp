import { Link } from 'react-router-dom';
import LandingNavbar from '../components/landing/LandingNavbar';
import Footer from '../components/landing/Footer';

export default function Docs() {
  return (
    <div className="flex flex-col min-h-screen">
      <LandingNavbar />

      <div className="h-24"></div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 relative z-10 animate-in fade-in duration-700 flex flex-col md:flex-row gap-8">

        {/* Sidebar Nav */}
        <aside className="w-full md:w-64 shrink-0 bg-white/90 backdrop-blur-md rounded-2xl border border-black/10 p-6 h-fit shadow-sm sticky top-32">
          <div className="font-['Instrument_Sans'] font-bold text-lg mb-4 text-[#212121]">Documentation</div>

          <nav className="space-y-6">
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Getting Started</div>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm font-['Manrope'] text-blue-600 hover:underline">Quickstart Guide</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">Connecting GitHub</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">Supported Languages</a></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Core Concepts</div>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">AST Generation</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">Dependency Graphs</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">Context Vectors</a></li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Integrations</div>
              <ul className="space-y-2">
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">GitHub Actions CI/CD</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">Slack Bot</a></li>
                <li><a href="#" className="text-sm font-['Manrope'] text-[#212121]/70 hover:text-[#212121]">REST API</a></li>
              </ul>
            </div>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 bg-white/90 backdrop-blur-md border border-black/10 rounded-[24px] p-8 md:p-12 shadow-sm text-[#212121]">
          <h1 className="font-['Instrument_Serif'] text-[48px] leading-[1.1] tracking-tight mb-4">
            Quickstart Guide
          </h1>
          <p className="font-['Manrope'] text-[18px] text-[#212121]/70 leading-relaxed mb-8">
            Learn how to turn any repository into a fully interactive developer wiki using CodeFlow's parsing engine.
          </p>

          <div className="prose prose-slate max-w-none prose-headings:font-['Instrument_Sans'] prose-p:font-['Manrope'] prose-p:text-[#212121]/80">

            <h3>1. Authenticate with GitHub</h3>
            <p>
              To analyze private repositories, you need to grant CodeFlow read access to your GitHub account.
              We use granular OAuth scopes (strictly <code>repo:read</code>) and never store your code on our servers longer than it takes to generate the Abstract Syntax Tree (AST).
            </p>
            <div className="bg-slate-900 text-slate-50 p-4 rounded-xl font-mono text-sm mb-6">
              # You can also use our CLI to generate wikis locally <br />
              npm install -g @codeflow/cli <br />
              codeflow login <br />
              codeflow analyze ./my-local-repo
            </div>

            <h3>2. Provide a Repository URL</h3>
            <p>
              From the dashboard or landing page, simply paste the URL of the repository you want to analyze.
              CodeFlow will immediately queue a worker.
            </p>
            <ul>
              <li><strong>Small Repos (&lt; 100 files):</strong> ~5 seconds</li>
              <li><strong>Medium Repos (100 - 1,000 files):</strong> ~30 seconds</li>
              <li><strong>Large Monorepos (10k+ files):</strong> ~2-3 minutes</li>
            </ul>

            <h3>3. How the AI Contextualizes Code</h3>
            <p>
              Once the AST is generated, CodeFlow recursively walks the tree to identify module boundaries, exports, and function calls.
              It generates a Mermaid.js diagram of your architecture. Next, our embedding model processes the docstrings and functional logic,
              storing dense vectors in Pinecone. This powers the <strong>"Ask anything"</strong> chat feature, which uses Retrieval-Augmented Generation (RAG)
              to provide highly accurate, hallucination-free answers about your codebase.
            </p>

            <div className="p-6 bg-blue-50 border border-blue-100 rounded-xl mt-8">
              <h4 className="text-blue-800 font-bold mt-0 mb-2 font-['Instrument_Sans']">Pro Tip: Adding the GitHub Action</h4>
              <p className="text-blue-900/80 mb-0 text-sm">
                To keep your Wiki constantly updated, add the CodeFlow GitHub Action to your repository. It will re-trigger AST parsing and update the context vectors upon every merge to <code>main</code>.
              </p>
            </div>

          </div>

          <div className="mt-12 flex items-center justify-between border-t border-black/10 pt-8">
            <span className="text-sm text-gray-500">Last updated: Today</span>
            <Link to="#" className="text-sm font-bold text-blue-600 hover:underline">
              Next: Connecting GitHub &rarr;
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
