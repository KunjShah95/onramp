export interface BlogPost {
  title: string
  slug: string
  category: string
  date: string
  excerpt: string
  readTime: string
}

export const posts: BlogPost[] = [
  {
    title: 'Why onboarding is the hidden tax on engineering velocity',
    slug: 'onboarding-hidden-tax-engineering-velocity',
    category: 'Engineering',
    date: 'Jul 22, 2026',
    excerpt: 'Every new hire spends their first weeks piecing together tribal knowledge. Here\'s how that adds up, and what you can do about it.',
    readTime: '6 min read',
  },
  {
    title: 'Introducing architecture drift detection',
    slug: 'introducing-architecture-drift-detection',
    category: 'Product',
    date: 'Jul 15, 2026',
    excerpt: 'Your codebase evolves. Your docs shouldn\'t lag behind. We\'re shipping real-time drift detection that flags deviations as they happen.',
    readTime: '4 min read',
  },
  {
    title: 'How we built a codebase-aware AI mentor',
    slug: 'how-we-built-codebase-aware-ai-mentor',
    category: 'Engineering',
    date: 'Jul 8, 2026',
    excerpt: 'Behind the scenes of Onramp\'s AI: how we parse, index, and ground answers in real repository structure, without storing source code.',
    readTime: '12 min read',
  },
  {
    title: 'Measuring time-to-first-PR: a framework for onboarding velocity',
    slug: 'measuring-time-to-first-pr',
    category: 'Best Practices',
    date: 'Jun 30, 2026',
    excerpt: 'If you can\'t measure it, you can\'t improve it. Here\'s how to benchmark and reduce the time between a developer\'s first commit and first merged PR.',
    readTime: '8 min read',
  },
  {
    title: 'Onramp achieves SOC 2 Type II certification',
    slug: 'onramp-achieves-soc-2-type-ii-certification',
    category: 'Company',
    date: 'Jun 18, 2026',
    excerpt: 'We\'re proud to announce that Onramp has completed its SOC 2 Type II audit, reinforcing our commitment to security and data protection.',
    readTime: '3 min read',
  },
]
