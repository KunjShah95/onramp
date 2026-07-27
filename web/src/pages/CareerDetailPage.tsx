import { Link, useParams, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  SuitcaseSimple,
  MapPin,
  Clock,
  ArrowLeft,
  ArrowRight,
  Envelope,
} from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'
import { openRoles } from './CareersPage'

const navLinks: NavLinkItem[] = [
  { label: 'Careers', href: '/careers' },
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/pricing' },
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
})

const roleDetails: Record<string, { responsibilities: string[]; qualifications: string[]; about: string }> = {
  'senior-frontend-engineer': {
    about:
      'The frontend is the face of Onramp — it\'s where developers explore architecture maps, interact with the AI mentor, and track their onboarding progress. We\'re looking for an engineer who cares deeply about UX, performance, and building accessible interfaces that feel delightful to use.',
    responsibilities: [
      'Architect and build new features across the Onramp web application using React, TypeScript, and Tailwind CSS',
      'Own the architecture map visualization — an interactive graph that renders thousands of nodes with smooth pan, zoom, and filtering',
      'Work closely with design to prototype and ship complex UI interactions including drag-and-drop, real-time collaboration, and data-heavy dashboards',
      'Optimize bundle size, rendering performance, and loading states for a global user base',
      'Mentor junior frontend engineers and contribute to our component library and design system',
    ],
    qualifications: [
      '6+ years of professional frontend engineering experience',
      'Deep expertise in React, TypeScript, and modern CSS (Tailwind, CSS modules, or similar)',
      'Experience building complex data visualizations (D3, visx, or custom canvas/SVG rendering)',
      'Strong understanding of web performance, accessibility (WCAG 2.1 AA+), and cross-browser compatibility',
      'Excellent communication skills and experience working in a distributed, async-first team',
    ],
  },
  'backend-engineer-ai-ml': {
    about:
      'Onramp\'s backend is where the magic happens — parsing codebases, building knowledge graphs, orchestrating LLM calls, and serving results in milliseconds. As a Backend Engineer on the AI/ML team, you\'ll design and scale the systems that make codebase understanding possible.',
    responsibilities: [
      'Design and build the code indexing pipeline that parses repositories and builds semantic knowledge graphs',
      'Develop and optimize retrieval-augmented generation (RAG) pipelines for code-aware AI responses',
      'Build and maintain high-throughput APIs serving millions of requests across web app, IDE plugins, and API clients',
      'Own the performance, reliability, and cost-efficiency of our LLM inference infrastructure',
      'Collaborate with the research team to evaluate and integrate new model providers and embedding strategies',
    ],
    qualifications: [
      '5+ years of backend engineering experience, with 2+ years in AI/ML-related infrastructure',
      'Strong proficiency in Python and experience with async frameworks (FastAPI, asyncio)',
      'Experience with vector databases (pgvector, Pinecone, or Weaviate) and embedding models',
      'Familiarity with code parsing and AST manipulation (tree-sitter, ANTLR, or similar)',
      'Experience with LLM APIs (OpenAI, Anthropic, or open-source models via vLLM/TGI) and prompt engineering',
    ],
  },
  'developer-advocate': {
    about:
      'Onramp is a developer tool, and developers are our most important audience. As Developer Advocate, you\'ll be the voice of Onramp in the engineering community — creating content, speaking at conferences, building sample projects, and gathering feedback that shapes the product roadmap.',
    responsibilities: [
      'Create tutorials, blog posts, videos, and sample projects that demonstrate Onramp\'s capabilities',
      'Speak at developer conferences, meetups, and webinars to grow awareness and adoption',
      'Engage with the developer community on GitHub, Discord, Twitter, and Hacker News',
      'Gather and synthesize community feedback to inform product decisions',
      'Build and maintain the developer docs, SDK examples, and API reference',
    ],
    qualifications: [
      '4+ years in developer relations, developer advocacy, or technical content creation',
      'Strong software engineering background — you can write production-quality code in at least one language',
      'Excellent written and verbal communication skills with a portfolio of published content',
      'Active presence in developer communities with a genuine passion for helping developers succeed',
      'Experience with video creation, live streaming, or podcasting is a plus',
    ],
  },
  'product-designer': {
    about:
      'Onramp tackles some of the hardest UX challenges in developer tools: making complex architecture understandable, designing AI interactions that inspire trust, and creating onboarding experiences that adapt to each developer\'s context. As Product Designer, you\'ll define how developers experience Onramp.',
    responsibilities: [
      'Own the end-to-end design process for key features — from user research and wireframes to high-fidelity mockups and prototype',
      'Design complex data visualizations that make architecture maps, dependency graphs, and health metrics intuitive at a glance',
      'Design AI interaction patterns that help developers trust and verify AI-generated answers',
      'Contribute to and maintain our design system, ensuring visual and interaction consistency',
      'Conduct user research with developers and engineering leaders to validate design decisions',
    ],
    qualifications: [
      '5+ years of product design experience, preferably in developer tools or B2B SaaS',
      'Strong portfolio demonstrating complex interaction design and data visualization',
      'Proficiency in Figma (components, variants, auto-layout, prototyping)',
      'Understanding of frontend development (HTML, CSS, React) — you can speak the same language as our engineers',
      'Experience designing AI-powered features or working with LLM-based products is a strong plus',
    ],
  },
}

export default function CareerDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const role = openRoles.find((r) => r.slug === slug)

  if (!role) {
    return <Navigate to="/careers" replace />
  }

  const details = roleDetails[role.slug] ?? {
    about: 'Details about this position will be available soon.',
    responsibilities: ['Responsibility details coming soon.'],
    qualifications: ['Qualification details coming soon.'],
  }

  const currentIndex = openRoles.findIndex((r) => r.slug === slug)
  const prevRole = currentIndex > 0 ? openRoles[currentIndex - 1] : null
  const nextRole = currentIndex < openRoles.length - 1 ? openRoles[currentIndex + 1] : null

  return (
    <MarketingLayout navLinks={navLinks}>
      <article className="max-w-3xl mx-auto px-6 pt-16 pb-24">
        {/* Back link */}
        <motion.div {...fadeUp(0)}>
          <Link
            to="/careers"
            className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] transition-colors mb-8"
          >
            <ArrowLeft size={14} weight="bold" />
            Back to careers
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div {...fadeUp(0.04)} className="mb-10">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <SuitcaseSimple className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Careers</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-[hsl(var(--foreground))] leading-[1.08]">
            {role.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-4 text-sm text-[hsl(var(--muted-foreground))]">
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} weight="fill" />
              {role.location}
            </span>
            <span className="w-1 h-1 rounded-full bg-[hsl(var(--border))]" />
            <span className="inline-flex items-center gap-1.5">
              <Clock size={14} weight="fill" />
              {role.type}
            </span>
            <span className="w-1 h-1 rounded-full bg-[hsl(var(--border))]" />
            <span className="px-2.5 py-0.5 rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] text-xs font-semibold uppercase tracking-wider">
              {role.department}
            </span>
          </div>
        </motion.div>

        {/* Apply CTA */}
        <motion.div {...fadeUp(0.08)} className="mb-10 flex flex-wrap gap-3">
          <a
            href="mailto:careers@onramp.ai"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
          >
            <Envelope size={14} weight="fill" />
            Apply for this role
          </a>
        </motion.div>

        {/* Divider */}
        <motion.div {...fadeUp(0.1)} className="mb-10 h-px bg-[hsl(var(--border))]" />

        {/* About this role */}
        <motion.div {...fadeUp(0.12)} className="mb-10">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-4">About this role</h2>
          <p className="text-[hsl(var(--muted-foreground))] leading-[1.75] text-[15px]">{details.about}</p>
        </motion.div>

        {/* Responsibilities */}
        <motion.div {...fadeUp(0.16)} className="mb-10">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-4">Responsibilities</h2>
          <ul className="space-y-3">
            {details.responsibilities.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-[hsl(var(--muted-foreground))] text-[15px] leading-relaxed">
                <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--accent))]" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Qualifications */}
        <motion.div {...fadeUp(0.2)} className="mb-10">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-4">Qualifications</h2>
          <ul className="space-y-3">
            {details.qualifications.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-[hsl(var(--muted-foreground))] text-[15px] leading-relaxed">
                <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--accent))]" />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Divider */}
        <motion.div {...fadeUp(0.24)} className="mb-10 h-px bg-[hsl(var(--border))]" />

        {/* Apply footer */}
        <motion.div {...fadeUp(0.28)} className="mb-12 p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 text-center">
          <h3 className="font-display text-lg font-bold text-[hsl(var(--foreground))] mb-2">Interested?</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mb-5 max-w-md mx-auto">
            Send your resume and a brief note about why you're interested to our careers email.
          </p>
          <a
            href="mailto:careers@onramp.ai"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
          >
            <Envelope size={14} weight="fill" />
            careers@onramp.ai
            <ArrowRight size={14} weight="bold" />
          </a>
        </motion.div>

        {/* Adjacent roles */}
        <motion.div {...fadeUp(0.32)} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prevRole && (
            <Link
              to={`/careers/${prevRole.slug}`}
              className="group p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
            >
              <span className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">
                <ArrowLeft size={11} weight="bold" className="inline mr-1" />
                Previous role
              </span>
              <span className="text-sm font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors line-clamp-2">
                {prevRole.title}
              </span>
            </Link>
          )}
          {nextRole && (
            <Link
              to={`/careers/${nextRole.slug}`}
              className="group p-5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md sm:text-right"
            >
              <span className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">
                Next role
                <ArrowRight size={11} weight="bold" className="inline ml-1" />
              </span>
              <span className="text-sm font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--accent))] transition-colors line-clamp-2">
                {nextRole.title}
              </span>
            </Link>
          )}
        </motion.div>
      </article>
    </MarketingLayout>
  )
}
