import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Article, Calendar, ArrowRight, Tag } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'
import { posts } from '../data/blog'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Changelog', href: '/changelog' },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
})

export default function BlogPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Header */}
        <motion.div {...fadeUp(0)} className="mb-12">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Article className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Blog</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-3 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Onramp Blog
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] max-w-xl">
            Thoughts on developer onboarding, codebase analysis, engineering productivity, and building the future of developer tools.
          </p>
        </motion.div>

        {/* Posts */}
        <motion.div className="space-y-8">
          {posts.map((post, i) => (
            <Link key={post.slug} to={`/blog/${post.slug}`} className="block group">
              <motion.article
                {...fadeUp(0.06 * i)}
                className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
              >
                <div className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))] mb-3">
                  <span className="inline-flex items-center gap-1">
                    <Tag size={12} weight="fill" className="text-[hsl(var(--accent))]" />
                    {post.category}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar size={12} />
                    {post.date}
                  </span>
                  <span>{post.readTime}</span>
                </div>
                <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors mb-2">
                  {post.title}
                </h2>
                <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed mb-4">
                  {post.excerpt}
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-[hsl(var(--accent))] opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0">
                  Read more <ArrowRight size={12} weight="bold" />
                </span>
              </motion.article>
            </Link>
          ))}
        </motion.div>

        {/* Newsletter */}
        <motion.div {...fadeUp(0.5)} className="mt-12 p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 text-center">
          <h3 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-2">Stay in the loop</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5 max-w-md mx-auto">
            Get the latest posts delivered to your inbox. No spam, unsubscribe anytime.
          </p>
          <form onSubmit={(e) => e.preventDefault()} className="flex items-center justify-center gap-2 max-w-sm mx-auto">
            <input
              type="email"
              name="email"
              placeholder="you@company.com"
              className="flex-1 px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/30"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
            >
              Subscribe
            </button>
          </form>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
