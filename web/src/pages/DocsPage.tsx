import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ArrowLeft, Code, Terminal } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

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

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs', active: true },
  { label: 'Changelog', href: '/changelog' },
  { label: 'Pricing', href: '/pricing' },
]

const codeBlock = (label: string, code: string) => (
  <div className="bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
    <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/80">
      <Terminal className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))]/60" />
      <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{label}</span>
    </div>
    <pre className="p-4 font-mono text-xs text-[hsl(var(--accent))] overflow-x-auto leading-relaxed">{code}</pre>
  </div>
)

const content: Record<string, { title: string; body: React.ReactNode }> = {
  overview: {
    title: 'Overview',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>
          Nexora turns any GitHub repository into an interactive knowledge map. Paste a URL, and within 2 minutes you get a live dependency graph, a searchable codebase, and a guided onboarding path — all derived from the actual source code, not documentation.
        </p>
        <h3 className="text-[hsl(var(--foreground))] font-semibold text-base font-display">How it works</h3>
        <p>Nexora runs a 3-stage pipeline on your repository:</p>
        <ol className="space-y-3 list-none">
          {[
            ['Clone', 'Repository is cloned and cached. Only the diff is re-processed on updates.'],
            ['Parse', 'AST parsing extracts files, classes, functions, imports, and call graphs for Python, JS, TS, Go, Rust, and Java.'],
            ['Index', 'A NetworkX knowledge graph is built. Entities become nodes; dependencies, calls, and imports become edges. The LLM annotates each entity with a one-line summary.'],
          ].map(([step, desc], i) => (
            <li key={step} className="flex gap-3">
              <span className="font-mono text-[11px] text-[hsl(var(--accent))] mt-0.5 shrink-0">{String(i+1).padStart(2,'0')}</span>
              <span><strong className="text-[hsl(var(--foreground))] font-semibold">{step}.</strong> {desc}</span>
            </li>
          ))}
        </ol>
        <div className="bg-[hsl(var(--secondary))] border border-[hsl(var(--accent))]/15 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Code className="w-4 h-4 text-[hsl(var(--accent))]" />
            <span className="font-mono text-[11px] text-[hsl(var(--accent))] uppercase tracking-wider">Supported languages</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Python', 'JavaScript', 'TypeScript', 'Go', 'Rust', 'Java'].map((l) => (
              <span key={l} className="font-mono text-xs bg-[hsl(var(--secondary))]/80 border border-[hsl(var(--border))] px-2 py-1 rounded text-[hsl(var(--muted-foreground))]">{l}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  'analyze-repo': {
    title: 'Analyze a repository',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>Go to the <strong className="text-[hsl(var(--foreground))]">Explore</strong> tab and paste a public GitHub URL.</p>
        {codeBlock('Input', `https://github.com/vercel/next.js`)}
        <p>Nexora clones, parses, and builds the graph. Analysis time depends on repo size:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[['Small', '< 500 files', '~30s'], ['Medium', '< 5k files', '~90s'], ['Large', '5k+ files', '2–4 min']].map(([size, files, time]) => (
            <div key={size} className="bg-[hsl(var(--secondary))]/60 border border-[hsl(var(--border))] rounded-xl p-3 text-center">
              <p className="text-[hsl(var(--foreground))] font-semibold text-sm mb-1">{size}</p>
              <p className="text-[hsl(var(--muted-foreground))] font-mono text-[10px]">{files}</p>
              <p className="text-[hsl(var(--accent))] font-mono text-[10px] mt-1">{time}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  ask: {
    title: 'Ask your codebase',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>After indexing, go to <strong className="text-[hsl(var(--foreground))]">Ask Codebase</strong>. Ask questions in plain English — Nexora returns exact file paths and line numbers.</p>
        <p>Example questions:</p>
        <div className="space-y-2">
          {[
            'Where is the webhook signature verified?',
            'Which service handles password reset emails?',
            'What calls the payment processing function?',
            'Where are environment variables validated?',
          ].map((q) => (
            <div key={q} className="flex items-start gap-3 bg-[hsl(var(--secondary))]/60 border border-[hsl(var(--border))] rounded-xl px-4 py-3">
              <ArrowRight className="w-4 h-4 text-[hsl(var(--accent))] shrink-0 mt-0.5" weight="bold" />
              <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{q}</span>
            </div>
          ))}
        </div>
        <p>Enable <strong className="text-[hsl(var(--foreground))]">Roast Mode</strong> to get a blunt critique of code quality, naming, and architecture decisions.</p>
      </div>
    ),
  },
  'api-auth': {
    title: 'API Authentication',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>All API requests require a bearer token. Generate one from <strong className="text-[hsl(var(--foreground))]">Settings → API Keys</strong>.</p>
        {codeBlock('HTTP Header', `Authorization: Bearer nx_live_xxxxxxxxxxxx`)}
        <div className="bg-[hsl(var(--secondary))] border border-[hsl(var(--accent))]/15 rounded-xl p-4 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[hsl(var(--accent))] font-mono text-[11px] uppercase tracking-wider">Note</span>
          </div>
          <p className="text-[hsl(var(--muted-foreground))]">API keys are prefixed <code className="font-mono text-xs bg-[hsl(var(--secondary))]/80 px-1.5 py-0.5 rounded border border-[hsl(var(--border))]">nx_live_</code> for production and <code className="font-mono text-xs bg-[hsl(var(--secondary))]/80 px-1.5 py-0.5 rounded border border-[hsl(var(--border))]">nx_test_</code> for sandbox. Test keys never consume quota.</p>
        </div>
      </div>
    ),
  },
  'api-analyze': {
    title: 'POST /api/v1/analyze',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>Triggers full analysis pipeline on a repository.</p>
        <div className="bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="px-4 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/80 flex items-center gap-3">
            <span className="font-mono text-[10px] bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded">POST</span>
            <span className="font-mono text-[11px] text-[hsl(var(--muted-foreground))]">/api/v1/analyze</span>
          </div>
          <pre className="p-4 font-mono text-xs text-[hsl(var(--muted-foreground))] overflow-x-auto leading-relaxed">
{`{
  "repo_url": "https://github.com/owner/repo",
  "branch": "main"           // optional, default: HEAD
}`}
          </pre>
        </div>
        {codeBlock('Response 200', `{\n  "repo_id": "abc123",\n  "status": "complete",\n  "entities": {\n    "files": 847,\n    "classes": 124,\n    "functions": 1203\n  },\n  "services": [...],\n  "architecture_pattern": "MVC"\n}`)}
      </div>
    ),
  },
  docker: {
    title: 'Docker Compose',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>Self-host Nexora with Docker Compose. Requires Docker 24+ and 4GB RAM minimum.</p>
        {codeBlock('Terminal', `git clone https://github.com/nexora/nexora\ncd nexora\ncp .env.example .env\n# Edit .env with your API keys\ndocker compose up -d`)}
        <p>Services started:</p>
        <div className="space-y-2">
          {[
            ['backend', ':8000', 'FastAPI + knowledge compiler'],
            ['frontend', ':5173', 'React dev server'],
            ['postgres', ':5432', 'PostgreSQL database'],
          ].map(([svc, port, desc]) => (
            <div key={svc} className="flex items-center gap-3 text-xs">
              <code className="font-mono text-[hsl(var(--accent))] bg-[hsl(var(--secondary))]/80 px-2 py-1 rounded border border-[hsl(var(--accent))]/15 w-20 text-center shrink-0">{svc}</code>
              <code className="font-mono text-[hsl(var(--muted-foreground))]/60 w-16 shrink-0">{port}</code>
              <span className="text-[hsl(var(--muted-foreground))]">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  env: {
    title: 'Environment variables',
    body: (
      <div className="space-y-4 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        {codeBlock('.env', `# LLM\nLLM_ENABLED=true\nLLM_PROVIDER=openai          # openai | azure | ollama\nOPENAI_API_KEY=sk-...\n\n# Database\nDATABASE_URL=postgresql://user:pass@localhost:5432/nexora\n\n# Auth\nJWT_SECRET=your-secret-here\n\n# GitHub (for private repos)\nGITHUB_TOKEN=ghp_...`)}
      </div>
    ),
  },
  llm: {
    title: 'LLM providers',
    body: (
      <div className="space-y-6 text-[hsl(var(--muted-foreground))] text-sm leading-relaxed">
        <p>Nexora supports three LLM backends. Set <code className="font-mono text-xs bg-[hsl(var(--secondary))]/80 px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--accent))]">LLM_PROVIDER</code> in your <code className="font-mono text-xs bg-[hsl(var(--secondary))]/80 px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">.env</code>.</p>
        <div className="space-y-3">
          {[
            { provider: 'openai', vars: 'OPENAI_API_KEY', note: 'Recommended for best quality.' },
            { provider: 'azure', vars: 'AZURE_OPENAI_KEY, AZURE_OPENAI_ENDPOINT', note: 'For enterprise Azure tenants.' },
            { provider: 'ollama', vars: 'OLLAMA_BASE_URL (default: localhost:11434)', note: 'Fully local — no data leaves your machine.' },
          ].map((p) => (
            <div key={p.provider} className="bg-[hsl(var(--secondary))]/60 border border-[hsl(var(--border))] rounded-xl p-4">
              <code className="font-mono text-xs text-[hsl(var(--accent))] font-bold">{p.provider}</code>
              <p className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]/60 mt-1 mb-2">{p.vars}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{p.note}</p>
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
    <MarketingLayout navLinks={navLinks} topPadding="pt-0">
      <div className="flex max-w-6xl mx-auto">
        {/* Sidebar */}
        <aside className="hidden md:block w-56 shrink-0 sticky top-[73px] self-start h-[calc(100vh-73px)] overflow-y-auto py-8 pr-4 border-r border-[hsl(var(--border))]">
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {sections.map((sec) => (
              <motion.div key={sec.id} variants={itemVariants} className="mb-6">
                <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]/50 uppercase tracking-widest mb-2 px-3">{sec.title}</p>
                {sec.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActive(item.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      active === item.id
                        ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--accent))] font-medium'
                        : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50'
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
        <main className="flex-1 min-w-0 px-4 sm:px-8 md:px-12 py-8 sm:py-12">
          <div className="max-w-2xl">
            <h1 className="font-display text-3xl font-bold tracking-tight text-[hsl(var(--foreground))] mb-8">{current.title}</h1>
            {current.body}

            {/* Bottom nav */}
            <div className="mt-16 pt-8 border-t border-[hsl(var(--border))] flex items-center justify-between text-sm">
              <Link to="/changelog" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors font-mono text-xs flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Changelog
              </Link>
              <a href="https://github.com" className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors font-mono text-xs flex items-center gap-1.5">
                Edit on GitHub
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </main>
      </div>
    </MarketingLayout>
  )
}
