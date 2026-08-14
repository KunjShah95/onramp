import { motion } from 'framer-motion'
import { Envelope, MapPin, ChatCircle } from '@phosphor-icons/react'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

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

interface ContactItem {
  label: string
  href?: string
  value: string
}

const contactMethods: {
  icon: React.ComponentType<{ size?: number; weight?: 'duotone'; className?: string }>
  title: string
  items: ContactItem[]
}[] = [
  {
    icon: Envelope,
    title: 'Email us',
    items: [
      { label: 'General inquiries', href: 'mailto:hello@onramp.ai', value: 'hello@onramp.ai' },
      { label: 'Sales', href: 'mailto:sales@onramp.ai', value: 'sales@onramp.ai' },
      { label: 'Support', href: 'mailto:support@onramp.ai', value: 'support@onramp.ai' },
      { label: 'Press', href: 'mailto:press@onramp.ai', value: 'press@onramp.ai' },
    ],
  },
  {
    icon: ChatCircle,
    title: 'Social',
    items: [
      { label: 'GitHub', href: 'https://github.com/onramp', value: 'github.com/onramp' },
      { label: 'X (Twitter)', href: 'https://x.com/onramp', value: '@onramp' },
      { label: 'LinkedIn', href: 'https://linkedin.com/company/onramp', value: '/company/onramp' },
      { label: 'Discord', href: 'https://discord.gg/onramp', value: 'discord.gg/onramp' },
    ],
  },
  {
    icon: MapPin,
    title: 'Office',
    items: [
      { label: 'Location', value: 'San Francisco, CA' },
      { label: 'Time zone', value: 'Pacific Time (PT)' },
    ],
  },
]

export default function ContactPage() {
  return (
    <MarketingLayout navLinks={navLinks}>
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <motion.div {...fadeUp(0)} className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <Envelope className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">Contact</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Get in <span className="italic text-[hsl(var(--accent))]">touch.</span>
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-xl">
            Have a question, want a demo, or just want to say hi? We'd love to hear from you.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {contactMethods.map((method, i) => (
            <motion.div
              key={method.title}
              {...fadeUp(0.08 * i)}
              className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30 transition-all duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--accent))]/30 hover:shadow-md"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] mb-4">
                <method.icon size={20} weight="duotone" />
              </span>
              <h2 className="font-display text-base font-semibold text-[hsl(var(--foreground))] mb-4">{method.title}</h2>
              <ul className="space-y-3">
                {method.items.map((item) => (
                  <li key={item.label}>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] block mb-0.5">
                      {item.label}
                    </span>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-sm text-[hsl(var(--accent))] hover:underline font-medium"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <span className="text-sm text-[hsl(var(--foreground))]">{item.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        {/* Contact form */}
        <motion.div {...fadeUp(0.3)} className="mt-12 p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-6">Send us a message</h2>
          <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Name</label>
                <input
                  type="text"
                  name="name"
                  placeholder="Your name"
                  className="w-full px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Email</label>
                <input
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  className="w-full px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Subject</label>
              <input
                type="text"
                name="subject"
                placeholder="How can we help?"
                className="w-full px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1.5">Message</label>
              <textarea
                name="message"
                rows={4}
                placeholder="Tell us more..."
                className="w-full px-4 py-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/30 resize-none"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
            >
              Send message
            </button>
          </form>
        </motion.div>
      </div>
    </MarketingLayout>
  )
}
