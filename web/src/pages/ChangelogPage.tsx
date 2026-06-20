import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import GradientHeading from '../components/ui/gradient-heading'
import PageTransition from '../components/ui/page-transition'

const entries = [
  {
    version: '2.1.0',
    date: 'June 2026',
    tag: 'feature',
    title: 'PR Description Generator',
    items: [
      'Generate full PR descriptions from GitHub diffs — title, summary, file-by-file changes, testing notes, checklist.',
      'Diff stats bar: files changed, additions, deletions.',
      'One-click copy to clipboard in GitHub Markdown format.',
    ],
  },
  {
    version: '2.0.4',
    date: 'May 2026',
    tag: 'feature',
    title: 'Streaming Q&A + Conversation Memory',
    items: [
      'Ask Codebase now streams responses token-by-token — no more waiting for full answer.',
      'Conversation history persisted per repo index. Restore any previous session.',
      'Roast Mode: ask for brutal honest critique of the codebase.',
      'History sidebar with restore and continue actions.',
    ],
  },
  {
    version: '2.0.3',
    date: 'April 2026',
    tag: 'fix',
    title: 'Force Graph & Architecture Explorer',
    items: [
      'Interactive D3 force graph with drag, zoom, and pan.',
      'Node click reveals service name, file count, dependency edges.',
      'Pulse ring animation on graph nodes.',
      'Fixed zoom hijacking node drag events.',
    ],
  },
  {
    version: '2.0.2',
    date: 'March 2026',
    tag: 'fix',
    title: 'Quota enforcement + usage tracking',
    items: [
      'Per-user query quota enforced at API layer.',
      'Usage tracker records token consumption per request.',
      'Graceful 429 with remaining quota shown in UI.',
    ],
  },
  {
    version: '2.0.1',
    date: 'February 2026',
    tag: 'improvement',
    title: 'PostgreSQL backend + API key management',
    items: [
      'Migrated from in-memory store to PostgreSQL.',
      'API key creation, rotation, and revocation.',
      'Team management: invite members, assign roles.',
    ],
  },
  {
    version: '2.0.0',
    date: 'January 2026',
    tag: 'major',
    title: 'CodeFlow 2.0 — full rewrite',
    items: [
      'Multi-tenant architecture with per-org isolation.',
      'AST parsing for Python, JS, TS, Go, Rust, Java.',
      'NetworkX knowledge graph replacing naive file scan.',
      'React 19 frontend with shader hero background.',
    ],
  },
]

const tagStyles: Record<string, string> = {
  major:       'bg-[#FF8C00]/15 text-[#FF8C00] border-[#FF8C00]/25',
  feature:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  improvement: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  fix:         'bg-green-500/10 text-green-400 border-green-500/20',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export default function ChangelogPage() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-[#050505] text-[#FDFBF8] font-body">
        {/* Nav */}
        <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex justify-between items-center px-8 py-4 w-[95%] max-w-5xl bg-[#0A0705]/80 backdrop-blur-xl border border-[#FDFBF8]/10 rounded-full">
          <Link to="/" className="font-display text-xl font-bold tracking-tight">CodeFlow</Link>
          <div className="hidden md:flex items-center gap-8">
            <Link to="/docs" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Docs</Link>
            <Link to="/changelog" className="text-[#FDFBF8] text-sm font-medium">Changelog</Link>
            <Link to="/pricing" className="text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Pricing</Link>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden md:block text-[#FDFBF8]/60 text-sm hover:text-[#FDFBF8] transition-colors">Log in</Link>
            <Link to="/register" className="bg-[#FFB347] text-[#3D1C00] px-5 py-2.5 rounded-full text-sm font-bold hover:bg-[#FF8C00] transition-colors">Get Started</Link>
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 pt-40 pb-32">
          {/* Header */}
          <div className="mb-16">
            <p className="font-mono text-[11px] text-[#FF8C00] uppercase tracking-widest mb-4">Changelog</p>
            <GradientHeading as="h1" className="text-4xl md:text-5xl mb-4">What's new in CodeFlow</GradientHeading>
            <p className="text-[#FDFBF8]/50 text-base leading-relaxed">
              Every release, every fix, every improvement — in one place. Subscribe to{' '}
              <a href="#" className="text-[#FF8C00] hover:underline">release notes</a> to stay current.
            </p>
          </div>

          {/* Entries */}
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-16">
            {entries.map((entry) => (
              <motion.div key={entry.version} variants={itemVariants} className="relative pl-8 border-l border-[#FDFBF8]/6">
                {/* Dot */}
                <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#FF8C00] bg-[#050505]" />

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="font-mono text-xs text-[#FDFBF8]/30">{entry.date}</span>
                  <code className="font-mono text-xs text-[#FDFBF8]/50 bg-[#1A110D] px-2 py-0.5 rounded border border-[#FDFBF8]/8">
                    v{entry.version}
                  </code>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border font-mono ${tagStyles[entry.tag]}`}>
                    {entry.tag}
                  </span>
                </div>

                <h2 className="font-display text-xl font-bold text-[#FDFBF8] mb-4">{entry.title}</h2>

                <ul className="space-y-2.5">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-[#FDFBF8]/55 leading-relaxed">
                      <span className="text-[#FF8C00] mt-0.5 shrink-0">→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </PageTransition>
  )
}
