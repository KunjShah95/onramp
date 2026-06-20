import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageTransition from '../components/ui/page-transition'

const sections = [
  {
    id: 'quickstart',
    title: 'Quickstart',
    items: [
      { id: 'overview',     label: 'Overview' },
      { id: 'analyze-repo', label: 'Analyze a repo' },
      { id: 'ask',          label: 'Ask your codebase' },
    ],
  },
  {
    id: 'features',
    title: 'Features',
    items: [
      { id: 'arch-graph',  label: 'Architecture graph' },
      { id: 'pr-describe', label: 'PR description' },
      { id: 'learn-path',  label: 'Learning paths' },
      { id: 'first-issue', label: 'First issue finder' },
    ],
  },
  {
    id: 'api',
    title: 'API Reference',
    items: [
      { id: 'api-auth',    label: 'Authentication' },
      { id: 'api-analyze', label: 'POST /analyze' },
      { id: 'api-ask',     label: 'POST /ask' },
      { id: 'api-graph',   label: 'GET /graph' },
    ],
  },
  {
    id: 'self-host',
    title: 'Self-hosting',
    items: [
      { id: 'docker',  label: 'Docker Compose' },
      { id: 'env',     label: 'Environment variables' },
      { id: 'llm',     label: 'LLM providers' },
    ],
  },
]

const content: Record<string, { title: string; body: React.ReactNode }> = {
  overview: {
    title: 'Overview',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>
          CodeFlow turns any GitHub repository into an interactive knowledge map. Paste a URL, and within 2 minutes you get a live dependency graph, a searchable codebase, and a guided onboarding path — all derived from the actual source code, not documentation.
        </p>
        <h3 className="text-[#FDFBF8] font-semibold text-base font-display">How it works</h3>
        <p>CodeFlow runs a 3-stage pipeline on your repository:</p>
        <ol className="space-y-3 list-none">
          {[
            ['Clone', 'Repository is cloned and cached. Only the diff is re-processed on updates.'],
            ['Parse', 'AST parsing extracts files, classes, functions, imports, and call graphs for Python, JS, TS, Go, Rust, and Java.'],
            ['Index', 'A NetworkX knowledge graph is built. Entities become nodes; dependencies, calls, and imports become edges. The LLM annotates each entity with a one-line summary.'],
          ].map(([step, desc], i) => (
            <li key={step} className="flex gap-4">
              <span className="font-mono text-[11px] text-[#FF8C00] mt-0.5 shrink-0">{String(i+1).padStart(2,'0')}</span>
              <span><strong className="text-[#FDFBF8] font-semibold">{step}.</strong> {desc}</span>
            </li>
          ))}
        </ol>
        <div className="bg-[#1A110D] border border-[#FF8C00]/15 rounded-lg p-4">
          <p className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-wider mb-2">Supported languages</p>
          <div className="flex flex-wrap gap-2">
            {['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java'].map((l) => (
              <span key={l} className="font-mono text-xs bg-[#FDFBF8]/5 border border-[#FDFBF8]/8 px-2 py-1 rounded text-[#FDFBF8]/60">{l}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  'analyze-repo': {
    title: 'Analyze a repository',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>Go to the <strong className="text-[#FDFBF8]">Explore</strong> tab and paste a public GitHub URL.</p>
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09]">
            <span className="font-mono text-[10px] text-[#FDFBF8]/30">Input</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FF8C00] overflow-x-auto">
{`https://github.com/vercel/next.js`}
          </pre>
        </div>
        <p>CodeFlow clones, parses, and builds the graph. Analysis time depends on repo size:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[['Small', '< 500 files', '~30s'], ['Medium', '< 5k files', '~90s'], ['Large', '5k+ files', '2–4 min']].map(([size, files, time]) => (
            <div key={size} className="bg-[#1A110D]/60 border border-[#FDFBF8]/6 rounded-lg p-3 text-center">
              <p className="text-[#FDFBF8] font-semibold text-sm mb-1">{size}</p>
              <p className="text-[#FDFBF8]/40 font-mono text-[10px]">{files}</p>
              <p className="text-[#FF8C00] font-mono text-[10px] mt-1">{time}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  ask: {
    title: 'Ask your codebase',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>After indexing, go to <strong className="text-[#FDFBF8]">Ask Codebase</strong>. Ask questions in plain English — CodeFlow returns exact file paths and line numbers.</p>
        <p>Example questions:</p>
        <div className="space-y-2">
          {[
            'Where is the webhook signature verified?',
            'Which service handles password reset emails?',
            'What calls the payment processing function?',
            'Where are environment variables validated?',
          ].map((q) => (
            <div key={q} className="flex items-start gap-3 bg-[#1A110D]/60 border border-[#FDFBF8]/6 rounded-lg px-4 py-3">
              <span className="text-[#FF8C00] shrink-0 mt-0.5">→</span>
              <span className="font-mono text-xs text-[#FDFBF8]/60">{q}</span>
            </div>
          ))}
        </div>
        <p>Enable <strong className="text-[#FDFBF8]">Roast Mode</strong> to get a blunt critique of code quality, naming, and architecture decisions.</p>
      </div>
    ),
  },
  'api-auth': {
    title: 'API Authentication',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>All API requests require a bearer token. Generate one from <strong className="text-[#FDFBF8]">Settings → API Keys</strong>.</p>
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09]">
            <span className="font-mono text-[10px] text-[#FDFBF8]/30">HTTP Header</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FDFBF8]/70 overflow-x-auto">
{`Authorization: Bearer cf_live_xxxxxxxxxxxx`}
          </pre>
        </div>
        <div className="bg-[#1A110D] border border-[#FF8C00]/15 rounded-lg p-4 text-sm">
          <p className="text-[#FF8C00] font-mono text-[11px] uppercase tracking-wider mb-1">Note</p>
          <p>API keys are prefixed <code className="font-mono text-xs bg-[#FDFBF8]/5 px-1 rounded">cf_live_</code> for production and <code className="font-mono text-xs bg-[#FDFBF8]/5 px-1 rounded">cf_test_</code> for sandbox. Test keys never consume quota.</p>
        </div>
      </div>
    ),
  },
  'api-analyze': {
    title: 'POST /api/v1/analyze',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>Triggers full analysis pipeline on a repository.</p>
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09] flex items-center gap-3">
            <span className="font-mono text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">POST</span>
            <span className="font-mono text-[11px] text-[#FDFBF8]/50">/api/v1/analyze</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FDFBF8]/70 overflow-x-auto leading-relaxed">
{`{
  "repo_url": "https://github.com/owner/repo",
  "branch": "main"           // optional, default: HEAD
}`}
          </pre>
        </div>
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09]">
            <span className="font-mono text-[10px] text-[#FDFBF8]/30">Response 200</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FDFBF8]/70 overflow-x-auto leading-relaxed">
{`{
  "repo_id": "abc123",
  "status": "complete",
  "entities": {
    "files": 847,
    "classes": 124,
    "functions": 1203
  },
  "services": [...],
  "architecture_pattern": "MVC"
}`}
          </pre>
        </div>
      </div>
    ),
  },
  docker: {
    title: 'Docker Compose',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>Self-host CodeFlow with Docker Compose. Requires Docker 24+ and 4GB RAM minimum.</p>
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09]">
            <span className="font-mono text-[10px] text-[#FDFBF8]/30">Terminal</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FDFBF8]/70 overflow-x-auto leading-relaxed">
{`git clone https://github.com/codeflow/codeflow
cd codeflow
cp .env.example .env
# Edit .env with your API keys
docker compose up -d`}
          </pre>
        </div>
        <p>Services started:</p>
        <div className="space-y-2">
          {[
            ['backend', ':8000', 'FastAPI + knowledge compiler'],
            ['frontend', ':5173', 'React dev server'],
            ['postgres', ':5432', 'PostgreSQL database'],
          ].map(([svc, port, desc]) => (
            <div key={svc} className="flex items-center gap-3 text-xs">
              <code className="font-mono text-[#FF8C00] bg-[#1A110D] px-2 py-1 rounded border border-[#FF8C00]/15 w-20 text-center shrink-0">{svc}</code>
              <code className="font-mono text-[#FDFBF8]/40 w-16 shrink-0">{port}</code>
              <span className="text-[#FDFBF8]/45">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  env: {
    title: 'Environment variables',
    body: (
      <div className="space-y-4 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <div className="bg-[#0D0906] border border-[#FDFBF8]/8 rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-[#FDFBF8]/5 bg-[#140D09]">
            <span className="font-mono text-[10px] text-[#FDFBF8]/30">.env</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[#FDFBF8]/70 overflow-x-auto leading-relaxed">
{`# LLM
LLM_ENABLED=true
LLM_PROVIDER=openai          # openai | azure | ollama
OPENAI_API_KEY=sk-...

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/codeflow

# Auth
JWT_SECRET=your-secret-here

# GitHub (for private repos)
GITHUB_TOKEN=ghp_...`}
          </pre>
        </div>
      </div>
    ),
  },
  llm: {
    title: 'LLM providers',
    body: (
      <div className="space-y-6 text-[#FDFBF8]/65 text-sm leading-relaxed">
        <p>CodeFlow supports three LLM backends. Set <code className="font-mono text-xs bg-[#1A110D] px-1 rounded border border-[#FDFBF8]/8 text-[#FF8C00]">LLM_PROVIDER</code> in your <code className="font-mono text-xs bg-[#1A110D] px-1 rounded border border-[#FDFBF8]/8 text-[#FDFBF8]/60">.env</code>.</p>
        <div className="space-y-3">
          {[
            { provider: 'openai', vars: 'OPENAI_API_KEY', models: 'gpt-4o, gpt-4o-mini', note: 'Recommended for best quality.' },
            { provider: 'azure', vars: 'AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT', models: 'Your deployed model name', note: 'For enterprise Azure tenants.' },
            { provider: 'ollama', vars: 'OLLAMA_BASE_URL (default: localhost:11434)', models: 'llama3, mistral, codellama', note: 'Fully local — no data leaves your machine.' },
          ].map((p) => (
            <div key={p.provider} className="bg-[#1A110D]/60 border border-[#FDFBF8]/6 rounded-lg p-4">
              <code className="font-mono text-xs text-[#FF8C00] font-bold">{p.provider}</code>
              <p className="text-[10px] font-mono text-[#FDFBF8]/35 mt-1 mb-2">{p.vars}</p>
              <p className="text-xs text-[#FDFBF8]/50">{p.note}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
}

const defaultSection = 'overview'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function DocsPage() {
  const [active, setActive] = useState(defaultSection)
  const current = content[active] ?? content[defaultSection]

  return (
    <div className="min-h-screen bg-[#050505] text-[#FDFBF8] font-body max-w-full overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 py-4 bg-[#050505]/90 backdrop-blur-xl border-b border-[#FDFBF8]/5">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
          <div className="hidden md:flex items-center gap-6">
            <Link to="/docs" className="text-[#FDFBF8] text-sm font-medium">Docs</Link>
            <Link to="/changelog" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Changelog</Link>
            <Link to="/pricing" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Pricing</Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Log in</Link>
          <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-4 py-2 rounded-full text-sm font-bold hover:bg-[#FF8C00] transition-colors">Get Started</Link>
        </div>
      </nav>

      <div className="flex pt-16 max-w-6xl mx-auto">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 shrink-0 sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto py-8 pr-4 border-r border-[#FDFBF8]/5">
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {sections.map((sec) => (
              <motion.div key={sec.id} variants={itemVariants} className="mb-6">
                <p className="font-mono text-[10px] text-[#FDFBF8]/30 uppercase tracking-widest mb-2 px-3">{sec.title}</p>
                {sec.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      active === item.id
                        ? 'bg-[#1A110D] text-[#FF8C00] font-medium'
                        : 'text-[#FDFBF8]/50 hover:text-[#FDFBF8] hover:bg-[#1A110D]/40'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </motion.div>
            ))}
          </motion.div>
        </aside>

        {/* Content */}
        <PageTransition>
          <main className="flex-1 min-w-0 px-4 sm:px-8 md:px-12 py-8 sm:py-12">
            <div className="max-w-2xl">
              <h1 className="font-display text-3xl font-bold text-[#FDFBF8] mb-8">{current.title}</h1>
              {current.body}

              {/* Bottom nav */}
              <div className="mt-16 pt-8 border-t border-[#FDFBF8]/5 flex items-center justify-between text-sm">
                <Link to="/changelog" className="text-[#FDFBF8]/40 hover:text-[#FDFBF8] transition-colors font-mono text-xs">
                  ← Changelog
                </Link>
                <a href="https://github.com" className="text-[#FDFBF8]/40 hover:text-[#FDFBF8] transition-colors font-mono text-xs">
                  Edit on GitHub →
                </a>
              </div>
            </div>
          </main>
        </PageTransition>
      </div>
    </div>
  )
}
