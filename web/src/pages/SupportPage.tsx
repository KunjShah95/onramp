import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { BookOpenText, Envelope, ChatCircle, ArrowUpRight } from '@phosphor-icons/react'
import { PageHeader } from '../components/ui/page-header'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'

const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

const channels = [
  {
    title: 'Documentation',
    description: 'Guides, API references and setup walkthroughs for the whole platform.',
    Icon: BookOpenText,
    href: '/docs',
    cta: 'Browse docs',
  },
  {
    title: 'Talk to the team',
    description: 'Use the contact form and we will get back to you within one business day.',
    Icon: ChatCircle,
    href: '/contact',
    cta: 'Contact us',
  },
  {
    title: 'Email support',
    description: 'Prefer email? Write to us directly with as much detail as you can.',
    Icon: Envelope,
    href: 'mailto:support@onramp.dev',
    cta: 'support@onramp.dev',
  },
]

export default function SupportPage() {
  return (
    <PageTransition>
      <Seo title="Support — Onramp" description="How can we help? Pick a channel and we usually respond within one business day." path="/support" />
      <div className="min-h-screen px-4 sm:px-6 py-16 sm:py-24 flex items-center justify-center relative overflow-hidden">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="w-full max-w-2xl text-center"
        >
          <motion.div variants={item}>
            <PageHeader
              eyebrow="Folio · Support"
              title="How can we help?"
              subtitle="Pick a channel below — we usually respond within one business day."
            />
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
            {channels.map(({ title, description, Icon, href, cta }) => {
              const isExternal = href.startsWith('http') || href.startsWith('mailto')
              const card = (
                <>
                  <div className="w-9 h-9 rounded-xl bg-go/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-go" weight="fill" />
                  </div>
                  <h2 className="font-display text-body-sm font-bold text-ink">{title}</h2>
                  <p className="text-caption text-ink-tertiary mt-1.5 flex-1 leading-relaxed">{description}</p>
                  <span className="inline-flex items-center gap-1 text-caption font-semibold text-go mt-4 group-hover:underline underline-offset-4">
                    {cta}
                    <ArrowUpRight size={13} weight="bold" />
                  </span>
                </>
              )
              const cls =
                'group rounded-2xl border border-seam bg-panel hover:border-go/40 hover:bg-well/50 transition-colors p-5 text-left flex flex-col'
              return isExternal ? (
                <a key={title} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>
                  {card}
                </a>
              ) : (
                <Link key={title} to={href} className={cls}>
                  {card}
                </Link>
              )
            })}
          </motion.div>

          <motion.div variants={item} className="mt-10">
            <p className="text-caption text-ink-tertiary">
              Something urgent?{' '}
              <Link to="/docs" className="text-go font-semibold hover:underline underline-offset-4">
                Check the docs first
              </Link>
              {' '}— or head back to your{' '}
              <Link to="/dashboard" className="text-go font-semibold hover:underline underline-offset-4">
                dashboard
              </Link>.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </PageTransition>
  )
}
