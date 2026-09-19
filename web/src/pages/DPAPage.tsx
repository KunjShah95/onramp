
import { FileText, Download, ShieldCheck, Clock, CheckCircle } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import MarketingLayout from '../components/layout/MarketingLayout'
import type { NavLinkItem } from '../components/layout/MarketingNav'

const navLinks: NavLinkItem[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Changelog', href: '/changelog' },
]


const sections = [
  {
    title: 'What is a DPA?',
    content: 'A Data Processing Agreement (DPA) is a legally binding contract that governs how we process your data. It ensures that Onramp handles personal data in compliance with GDPR, CCPA, and other data protection regulations. The DPA defines the scope of processing, data security measures, sub-processors, and your rights as the data controller.',
  },
  {
    title: 'Who needs to sign?',
    content: 'If your organization operates in the EU, UK, or California, or processes personal data of individuals in those jurisdictions, you need a signed DPA with us. We provide a standard DPA that covers all Onramp services. Enterprise customers may request custom terms as part of their contract.',
  },
  {
    title: 'Our commitments',
    content: 'Onramp acts as a data processor under GDPR. We process personal data only on your documented instructions, implement appropriate technical and organizational measures, assist with data subject rights requests, notify you of any data breaches within 72 hours, and delete or return all personal data upon termination of services.',
  },
]

const subprocessors = [
  'Amazon Web Services (AWS) · Cloud infrastructure (US, EU)',
  'Google Cloud Platform (GCP) · Cloud infrastructure (US, EU)',
  'Vercel Inc. · Frontend hosting',
  'Railway Corp. · Backend hosting',
  'Neon Inc. · Database hosting',
  'Razorpay Inc. · Payment processing',
]

const steps = [
  'Review the standard DPA template below',
  'Fill in your organization details',
  'Send the completed DPA to security@onramp.ai',
  'Our team signs and returns it within 5 business days',
]

export default function DPAPage() {
  return (
    <MarketingLayout
      navLinks={navLinks}
      seo={{ title: 'Data Processing Agreement · Onramp', description: 'Onramp Data Processing Agreement (DPA) governing how customer data is processed and protected.', path: '/dpa' }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <div className="mb-16">
          <div className="flex items-center gap-2 text-[hsl(var(--accent))] mb-4">
            <FileText className="w-4 h-4" weight="fill" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-[hsl(var(--foreground))]">DPA</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl mb-4 font-bold tracking-tight text-[hsl(var(--foreground))]">
            Data Processing <span className="italic text-[hsl(var(--accent))]">Agreement.</span>
          </h1>
          <p className="text-lg text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            Our standard Data Processing Agreement outlines how we handle, process, and protect your personal data.
            It's available for all customers, with no procurement delays.
          </p>
        </div>

        {/* Download CTA */}
        <div className="p-6 rounded-lg border border-[hsl(var(--accent))]/30 bg-[hsl(var(--accent))]/5 mb-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-semibold text-[hsl(var(--foreground))]">Standard DPA Template</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Last updated: July 2026 · PDF, 245 KB</p>
          </div>
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all shrink-0">
            <Download size={16} weight="bold" />
            Download DPA
          </button>
        </div>

        {/* Sections */}
        <div className="space-y-6 mb-12">
          {sections.map((s) => (
            <div key={s.title} className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/30">
              <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))] mb-3">{s.title}</h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>

        {/* How to get it signed */}
        <div className="p-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 mb-12">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]">
              <CheckCircle size={18} weight="duotone" />
            </span>
            <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">How to get your DPA signed</h2>
          </div>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))] text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-[hsl(var(--muted-foreground))] pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Sub-processors */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]">
              <Clock size={18} weight="duotone" />
            </span>
            <h2 className="font-display text-lg font-semibold text-[hsl(var(--foreground))]">Sub-processors</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {subprocessors.map((sp) => (
              <div key={sp} className="flex items-start gap-2.5 p-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]/20 text-sm text-[hsl(var(--muted-foreground))]">
                <ShieldCheck size={14} className="text-[hsl(var(--accent))] mt-0.5 shrink-0" weight="duotone" />
                <span>{sp}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Questions */}
        <div className="text-center p-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]/50">
          <h2 className="font-display text-xl font-bold text-[hsl(var(--foreground))] mb-3">Questions about the DPA?</h2>
          <p className="text-[hsl(var(--muted-foreground))] mb-6 max-w-md mx-auto">
            If you need custom terms, have questions about data processing, or want to report a security concern.
          </p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all"
          >
            Contact our DPO
          </Link>
        </div>
      </div>
    </MarketingLayout>
  )
}
