import { motion } from 'framer-motion'
import { ArrowRight, Rss, GitPullRequest, ChartBar, ArrowCounterClockwise, Star } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const entries = [
  {
    version: '2.1.0',
    date: 'June 2026',
    tag: 'feature' as const,
    icon: GitPullRequest,
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
    tag: 'feature' as const,
    icon: ChartBar,
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
    tag: 'fix' as const,
    icon: Star,
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
    tag: 'fix' as const,
    icon: ArrowCounterClockwise,
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
    tag: 'improvement' as const,
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
    tag: 'major' as const,
    icon: Star,
    title: 'Nexora 2.0 — full rewrite',
    items: [
      'Multi-tenant architecture with per-org isolation.',
      'AST parsing for Python, JS, TS, Go, Rust, Java.',
      'NetworkX knowledge graph replacing naive file scan.',
      'React 19 frontend with modern design system.',
    ],
  },
]

const tagStyles: Record<string, string> = {
  major:       'bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] border-[hsl(var(--accent))]/25',
  feature:     'bg-blue-50 text-blue-700 border-blue-200',
  improvement: 'bg-purple-50 text-purple-700 border-purple-200',
  fix:         'bg-green-50 text-green-700 border-green-200',
}

const tagIcons: Record<string, string> = {
  major: '●',
  feature: '✦',
  improvement: '▲',
  fix: '⬡',
}

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: '/changelog', active: true },
  { label: 'Pricing', href: '/pricing' },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

export default function ChangelogPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-2xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Rss className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest">Changelog</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl mb-3 font-bold tracking-tight text-[hsl(var(--foreground))]">
            What's new in Nexora
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] text-sm leading-relaxed font-body">
            Every release, every fix, every improvement — in one place. Subscribe to{' '}
            <a href="#" className="text-[hsl(var(--accent))] hover:underline font-medium">release notes</a> to stay current.
          </p>
        </div>

        {/* Entries */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-12">
          {entries.map((entry) => (
            <motion.div key={entry.version} variants={itemVariants} className="relative pl-7 border-l border-[hsl(var(--border))]">
              {/* Dot */}
              <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--accent))] bg-[hsl(var(--background))]" />

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{entry.date}</span>
                <code className="font-mono text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-2 py-0.5 rounded border border-[hsl(var(--border))]">
                  v{entry.version}
                </code>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border font-mono flex items-center gap-1 ${tagStyles[entry.tag]}`}>
                  <span>{tagIcons[entry.tag]}</span>
                  {entry.tag}
                </span>
              </div>

              <h2 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-3">{entry.title}</h2>

              <ul className="space-y-2">
                {entry.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-[hsl(var(--muted-foreground))] leading-relaxed font-body">
                    <ArrowRight className="w-3.5 h-3.5 text-[hsl(var(--accent))] mt-0.5 shrink-0" weight="bold" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
