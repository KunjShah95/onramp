export interface BlogPost {
  title: string
  slug: string
  category: string
  date: string
  /** ISO 8601 date for schema.org */
  dateISO: string
  /** ISO 8601 date for schema.org (last modified) */
  dateModifiedISO?: string
  excerpt: string
  readTime: string
  /** Author name for schema.org */
  author?: string
  /** Author URL for schema.org */
  authorUrl?: string
}

export const posts: BlogPost[] = [
  {
    title: 'Why onboarding is the hidden tax on engineering velocity',
    slug: 'onboarding-hidden-tax-engineering-velocity',
    category: 'Engineering',
    date: 'Jul 22, 2026',
    dateISO: '2026-07-22',
    dateModifiedISO: '2026-07-22',
    excerpt: 'Every new hire spends their first weeks piecing together tribal knowledge. Here\'s how that adds up, and what you can do about it.',
    readTime: '6 min read',
    author: 'Onramp Team',
    authorUrl: 'https://onramp.app/about',
  },
  {
    title: 'Introducing architecture drift detection',
    slug: 'introducing-architecture-drift-detection',
    category: 'Product',
    date: 'Jul 15, 2026',
    dateISO: '2026-07-15',
    dateModifiedISO: '2026-07-15',
    excerpt: 'Your codebase evolves. Your docs shouldn\'t lag behind. We\'re shipping real-time drift detection that flags deviations as they happen.',
    readTime: '4 min read',
    author: 'Onramp Team',
    authorUrl: 'https://onramp.app/about',
  },
  {
    title: 'How we built a codebase-aware AI mentor',
    slug: 'how-we-built-codebase-aware-ai-mentor',
    category: 'Engineering',
    date: 'Jul 8, 2026',
    dateISO: '2026-07-08',
    dateModifiedISO: '2026-07-08',
    excerpt: 'Behind the scenes of Onramp\'s AI: how we parse, index, and ground answers in real repository structure, with tenant-scoped derived context.',
    readTime: '12 min read',
    author: 'Onramp Team',
    authorUrl: 'https://onramp.app/about',
  },
  {
    title: 'Measuring time-to-first-PR: a framework for onboarding velocity',
    slug: 'measuring-time-to-first-pr',
    category: 'Best Practices',
    date: 'Jun 30, 2026',
    dateISO: '2026-06-30',
    dateModifiedISO: '2026-06-30',
    excerpt: 'If you can\'t measure it, you can\'t improve it. Here\'s how to benchmark and reduce the time between a developer\'s first commit and first merged PR.',
    readTime: '8 min read',
    author: 'Onramp Team',
    authorUrl: 'https://onramp.app/about',
  },
  {
    title: 'Onramp SOC 2 Type II: work in progress',
    slug: 'onramp-achieves-soc-2-type-ii-certification',
    category: 'Company',
    date: 'Jun 18, 2026',
    dateISO: '2026-06-18',
    dateModifiedISO: '2026-06-18',
    excerpt: 'SOC 2 Type II is in progress and not yet certified. This post tracks scope and timeline; see /security for current status.',
    readTime: '3 min read',
    author: 'Onramp Team',
    authorUrl: 'https://onramp.app/about',
  },
]