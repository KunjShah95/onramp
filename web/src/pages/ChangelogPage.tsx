import { ArrowRight, GitPullRequest, ChartBar, ArrowCounterClockwise, Star, Megaphone, Plus, CaretUp, Hexagon } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const entries = [
  {
    version: '2.1.0',
    date: 'June 2026',
    dateISO: '2026-06-15',
    tag: 'feature' as const,
    icon: GitPullRequest,
    title: 'PR Description Generator',
    items: [
      'Generate full PR descriptions from GitHub diffs. Title, summary, file-by-file changes, testing notes, checklist.',
      'Diff stats bar: files changed, additions, deletions.',
      'One-click copy to clipboard in GitHub Markdown format.',
    ],
  },
  {
    version: '2.0.4',
    date: 'May 2026',
    dateISO: '2026-05-20',
    tag: 'feature' as const,
    icon: ChartBar,
    title: 'Streaming Q&A + Conversation Memory',
    items: [
      'Ask Codebase now streams responses token-by-token. No more waiting for full answer.',
      'Conversation history persisted per repo index. Restore any previous session.',
      'Roast Mode: ask for brutal honest critique of the codebase.',
      'History sidebar with restore and continue actions.',
    ],
  },
  {
    version: '2.0.3',
    date: 'April 2026',
    dateISO: '2026-04-18',
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
    dateISO: '2026-03-22',
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
    dateISO: '2026-02-14',
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
    dateISO: '2026-01-20',
    tag: 'major' as const,
    icon: Star,
    title: 'Onramp 2.0 - full rewrite',
    items: [
      'Multi-tenant architecture with per-org isolation.',
      'AST parsing for Python, JS, TS, Go, Rust, Java.',
      'NetworkX knowledge graph replacing naive file scan.',
      'React 19 frontend with modern design system.',
    ],
  },
]

const tagStyles: Record<string, string> = {
  major:       'bg-go/10 text-foreground border-go/25',
  // Hardcoded light-theme hex values fail contrast on the dark landing
  // surface — use the semantic info/success tokens so badges adapt per theme.
  feature:     'bg-mission/10 text-mission border-mission/25',
  improvement: 'bg-mission/10 text-mission border-mission/25',
  fix:         'bg-go/10 text-go border-go/25',
}

const tagIcons = {
  major: Megaphone,
  feature: Plus,
  improvement: CaretUp,
  fix: Hexagon,
} as const

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Changelog', href: '/changelog', active: true },
  { label: 'Pricing', href: '/#pricing' },
]

/** Build ChangelogPage schema */
function buildChangelogSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Onramp Changelog',
    description: 'Product updates and release notes for Onramp — the AI-powered developer onboarding platform.',
    url: 'https://onramp.app/changelog',
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'SoftwareVersion',
        name: `Onramp ${entry.version}`,
        version: entry.version,
        datePublished: entry.dateISO,
        description: entry.items.join(' '),
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
      },
    })),
  }
}

/** Build BreadcrumbList schema for Changelog page */
function buildChangelogBreadcrumbSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://onramp.app/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Changelog',
        item: 'https://onramp.app/changelog',
      },
    ],
  }
}

export default function ChangelogPage() {
  const changelogSchema = buildChangelogSchema()
  const breadcrumbSchema = buildChangelogBreadcrumbSchema()

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{
        title: 'Changelog · Onramp',
        description: 'Product updates and release notes for Onramp · the AI-powered developer onboarding platform.',
        path: '/changelog',
        schema: [changelogSchema, breadcrumbSchema],
      }}
    >
      <div className="max-w-2xl mx-auto px-6 pt-10 pb-24">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-body text-3xl md:text-4xl mb-3 font-bold tracking-[-0.02em] text-ink">
            What's new in Onramp
          </h1>
          <p className="text-[15px] leading-[1.6] text-ink-secondary">
            Every release, every fix, every improvement, in one place.
          </p>
        </div>

        {/* Entries */}
        <div className="space-y-12">
          {entries.map((entry) => (
            <div key={entry.version} className="relative pl-7 border-l border-[hsl(var(--border))]">
              {/* Dot */}
              <div className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[hsl(var(--accent))] bg-[hsl(var(--background))]" />

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{entry.date}</span>
                <code className="font-mono text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--secondary))] px-2 py-0.5 rounded border border-[hsl(var(--border))]">
                  v{entry.version}
                </code>
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border font-mono inline-flex items-center gap-1 ${tagStyles[entry.tag]}`}>
                  {(() => {
                    const TagIcon = tagIcons[entry.tag as keyof typeof tagIcons]
                    return TagIcon ? <TagIcon size={12} weight="bold" aria-hidden className="shrink-0" /> : null
                  })()}
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
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  )
}