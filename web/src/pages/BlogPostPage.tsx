import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, Tag, ArrowLeft, ArrowRight, Clock, ShareNetwork } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'
import { posts } from '../data/blog'

const navLinks: NavLinkItem[] = [
  { label: 'Blog', href: '/blog' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
})

// Map of full article content per slug
const articleContent: Record<string, string[]> = {
  'onboarding-hidden-tax-engineering-velocity': [
    'Every engineering leader knows the feeling. You hire a talented developer, they show up on day one excited and ready to contribute, and then the reality of navigating an unfamiliar codebase sets in.',
    'The first week is lost to environment setup, reading scattered documentation (much of it stale), and scheduling 30-minute blocks with senior engineers who already have full calendars. By week two, the new hire might have made their first small commit, but they\'re still unsure how services connect, where business logic lives, or who owns what.',
    'It\'s not that anyone is doing anything wrong. It\'s that codebases are complex, knowledge is tribal, and the onboarding process at most companies is ad-hoc at best. The result is a hidden tax on engineering velocity, one that compounds with every hire.',
    'Research shows that it takes new engineers an average of 3 to 6 months to reach full productivity. For senior hires joining a complex microservices architecture, that timeline can stretch even longer.',
    'The cost is staggering: lost productivity, delayed roadmaps, frustrated new hires, and burned-out senior engineers who end up as de facto onboarding guides. For a team of 10 engineers hiring 4 people in a year, that\'s easily thousands of hours of lost output.',
    'So what can you do? The companies that onboard fastest share a few patterns: they invest in living documentation that stays in sync with the codebase, they provide structured learning paths tailored to each new hire\'s background, and they use tooling that lets engineers self-serve answers instead of blocking senior engineers.',
    'Onramp was built specifically for this problem. By automatically indexing your codebase and generating a live architecture map, it turns weeks of context-gathering into a guided, self-serve experience. New hires can ask questions in natural language and get answers grounded in your actual code, with file and line references they can explore immediately.',
    'The result? Our users report that new engineers ship their first meaningful PR in days, not weeks. And senior engineers get back the hours they used to spend answering the same questions on repeat.',
    'The hidden tax on onboarding is real, but it doesn\'t have to be permanent.',
  ],
  'introducing-architecture-drift-detection': [
    'Every codebase has a ghost story: the architecture diagram that lives in a Google Doc, last updated two years ago, that nobody trusts anymore. Meanwhile, the actual system has evolved: services split, databases were swapped, new dependencies emerged.',
    'This gap between documented architecture and reality is called architecture drift, and it\'s one of the most insidious problems in software engineering. New hires follow stale docs and get confused. Senior engineers carry the full map in their heads. Decisions get made based on outdated assumptions.',
    'Today, we\'re shipping architecture drift detection in Onramp. Here\'s how it works.',
    'On every push to your connected repositories, Onramp re-indexes the codebase and compares the current architecture against the last known state. It tracks changes across four dimensions: service boundaries, dependency graphs, data flows, and module ownership.',
    'When drift is detected (a new service appears, a dependency shifts, or a data flow changes), Onramp flags it. You get a clear diff showing what changed, when it changed, and which files are affected. From there, you can accept the drift (updating the documented architecture) or investigate further.',
    'What makes this different from standard CI checks is context. Onramp doesn\'t just tell you something changed; it shows you the architectural impact. Did a new database dependency get introduced? Is a service boundary being violated? Are there circular dependencies forming?',
    'For engineering leaders, drift detection provides a continuous audit trail of how the architecture evolves over time. For new hires, it means the architecture map they see on day one is the same map the team trusts on day one hundred.',
    'Drift detection is available now on all Team and Enterprise plans. Connect your repository, and Onramp will start tracking your architecture from the next push.',
  ],
  'how-we-built-codebase-aware-ai-mentor': [
    'When we set out to build Onramp, we knew the core challenge wasn\'t just about parsing code; it was about understanding context. A codebase isn\'t a flat collection of files; it\'s a living system with relationships, ownership patterns, and architectural decisions embedded in its structure.',
    'Building an AI mentor that can answer questions about a codebase requires solving three problems: indexing, grounding, and retrieval.',
    'Indexing: We parse every supported file in the repository to build a rich graph of symbols, types, imports, exports, and function signatures. This isn\'t just text search; we understand the semantic structure of the code. When we index a Python file, we know which classes inherit from which, which functions are called where, and how data flows between modules.',
    'Grounding: Every answer the AI mentor generates must be traceable back to specific files and lines in the codebase. We achieve this by annotating each chunk of indexed code with its provenance. When the LLM generates a response, we insert file references directly into the output, so developers can click through to see the actual source.',
    'Retrieval: When a developer asks a question, we don\'t just dump the entire codebase into the prompt. We use a multi-stage retrieval pipeline that first identifies the most relevant modules and functions, then selects the specific code chunks needed to answer the question. This keeps responses fast, focused, and within token limits.',
    'A critical design decision was privacy. We process source code to build the indexed graph, but we discard raw source files after analysis. The indexed representation is sufficient to answer questions without storing the original code. This means we can offer the AI mentor\'s capabilities while respecting customer data.',
    'The result is an AI mentor that feels like it actually knows the codebase. It cites sources. It understands relationships. And because it re-indexes on every push, it stays current with the evolving architecture.',
    'This is just the beginning. We\'re working on multi-repository awareness, deeper semantic understanding of test patterns, and support for monorepo structures with independent service boundaries.',
  ],
  'measuring-time-to-first-pr': [
    'Time-to-first-PR is the single most important metric for engineering onboarding velocity. It measures how long it takes a new hire to go from their first commit to a merged pull request that delivers meaningful value to the codebase.',
    'Why first PR and not first commit? Because committing a typo fix in the README doesn\'t demonstrate that a developer understands the codebase, the team\'s workflow, or the deployment pipeline. A meaningful PR requires understanding the architecture, writing tests, following conventions, and navigating code review.',
    'Here\'s a framework for measuring and improving time-to-first-PR across your organization.',
    'First, establish the baseline. Look at your last 10 hires and calculate the average time from start date to their first meaningful merged PR. Segment by seniority level. A senior engineer should ideally ship their first PR within the first week, while a junior might take two to three weeks.',
    'Second, identify bottlenecks. Where are new hires getting stuck? Common bottlenecks include: unclear coding conventions, complex local development setup, unclear ownership of code areas, lack of good first issues, and slow code review cycles.',
    'Third, invest in structured onboarding. The teams with the fastest time-to-first-PR don\'t leave onboarding to chance. They provide: a curated list of first issues with clear scope, automated dev environment setup, paired architecture walkthroughs, and documented decision records for architectural choices.',
    'Finally, measure and iterate. Track time-to-first-PR as a continuous metric. Set targets (e.g., first PR within 5 days for senior hires) and review progress monthly. When the metric trends up, investigate what changed in your onboarding process.',
    'At Onramp, we\'ve seen teams reduce time-to-first-PR by 60% after adopting structured onboarding tooling. The key is making codebase context accessible without blocking senior engineers, letting new hires explore, ask questions, and understand the architecture on their own schedule.',
  ],
  'onramp-achieves-soc-2-type-ii-certification': [
    'We\'re proud to announce that Onramp has successfully completed its SOC 2 Type II audit. This certification demonstrates our commitment to the highest standards of security, availability, and confidentiality for customer data.',
    'SOC 2 Type II is one of the most rigorous auditing standards for SaaS companies. Unlike Type I, which assesses the design of controls at a single point in time, Type II evaluates the operational effectiveness of those controls over an extended period, in our case a full 6-month period.',
    'The audit, conducted by an independent third party, examined our controls across security, availability, and confidentiality categories. Areas assessed included: access controls, data encryption at rest and in transit, incident response procedures, change management, vendor management, and employee security training.',
    'Key highlights from the audit include: all customer data encrypted with AES-256 at rest and TLS 1.2+ in transit, production access limited to a small set of engineers with multi-factor authentication, quarterly access reviews and penetration tests, automated vulnerability scanning on every deployment, and a documented incident response plan tested through tabletop exercises.',
    'For our customers, this certification means you can trust Onramp with your source code metadata and team data. We\'ve implemented controls that meet the standards expected by the most security-conscious organizations, including financial institutions and healthcare technology companies.',
    'SOC 2 compliance is just one part of our security program. We also maintain: GDPR compliance for European customers, a dedicated security page with current status and policies, regular third-party penetration testing, and a responsible disclosure program for security researchers.',
    'If you need a copy of our SOC 2 report for your own compliance program, please contact security@onramp.ai. We\'re happy to share it under NDA.',
  ],
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const post = posts.find((p) => p.slug === slug)

  if (!post) {
    return <Navigate to="/blog" replace />
  }

  const content = articleContent[post.slug] ?? [
    'This is a placeholder article. Full content will be published soon.',
  ]

  // Find adjacent posts for back/forward navigation
  const currentIndex = posts.findIndex((p) => p.slug === slug)
  const prevPost = currentIndex > 0 ? posts[currentIndex - 1] : null
  const nextPost = currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null

  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: `${post.title} | Onramp Blog`, description: post.excerpt, path: `/blog/${post.slug}`, type: 'article' }}
    >
      <article className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        {/* Back link */}
        <motion.div {...fadeUp(0)}>
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] transition-colors mb-8"
          >
            <ArrowLeft size={14} weight="bold" />
            Back to blog
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div {...fadeUp(0.04)} className="mb-10">
          <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))] mb-4">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] font-semibold">
              <Tag size={11} weight="fill" />
              {post.category}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={12} />
              {post.date}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {post.readTime}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-[1.08]">
            {post.title}
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--muted-foreground))] leading-relaxed">
            {post.excerpt}
          </p>
        </motion.div>

        {/* Divider */}
        <motion.div {...fadeUp(0.08)} className="mb-10 h-px bg-[hsl(var(--border))]" />

        {/* Content */}
        <motion.div {...fadeUp(0.12)} className="prose prose-sm max-w-none">
          {content.map((paragraph, i) => (
            <p
              key={i}
              className="text-[hsl(var(--muted-foreground))] leading-[1.75] mb-5 text-[15px]"
            >
              {paragraph}
            </p>
          ))}
        </motion.div>

        {/* Share */}
        <motion.div {...fadeUp(0.16)} className="mt-12 pt-6 border-t border-[hsl(var(--border))]">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <ShareNetwork size={15} weight="duotone" />
              Share this article
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { try { navigator.clipboard.writeText(window.location.href) } catch {} } }
                className="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--accent))]/30 transition-all"
              >
                Copy link
              </button>
            </div>
          </div>
        </motion.div>

        {/* Adjacent posts */}
        <motion.div {...fadeUp(0.2)} className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prevPost && (
            <Link
              to={`/blog/${prevPost.slug}`}
              className="group p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
            >
              <span className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">
                <ArrowLeft size={11} weight="bold" className="inline mr-1" />
                Previous
              </span>
              <span className="text-sm font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors line-clamp-2">
                {prevPost.title}
              </span>
            </Link>
          )}
          {nextPost && (
            <Link
              to={`/blog/${nextPost.slug}`}
              className="group p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md sm:text-right"
            >
              <span className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">
                Next
                <ArrowRight size={11} weight="bold" className="inline ml-1" />
              </span>
              <span className="text-sm font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors line-clamp-2">
                {nextPost.title}
              </span>
            </Link>
          )}
        </motion.div>
      </article>
    </MarketingLayout>
  )
}
