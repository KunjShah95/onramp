import LegalLayout, { type LegalSection } from '../components/layout/LegalLayout'

const sections: LegalSection[] = [
  {
    heading: 'The service',
    paragraphs: [
      'Onramp provides AI-powered developer onboarding: codebase exploration, learning path generation, repository Q&A, first-PR guidance, task management, and related team features. By creating an account or using the service you agree to these terms. If you use Onramp on behalf of an organization, you represent that you have authority to bind that organization.',
    ],
  },
  {
    heading: 'Accounts',
    paragraphs: [
      'You must provide accurate registration information and keep your credentials secure. You are responsible for all activity under your account and API keys. Notify us immediately at security@onramp.ai if you suspect unauthorized access.',
    ],
  },
  {
    heading: 'Acceptable use',
    paragraphs: ['You agree not to:'],
    bullets: [
      'Submit code or repositories you do not have the right to analyze.',
      'Attempt to breach, probe, or circumvent security or rate limits.',
      'Resell or provide the service to third parties without a written agreement.',
      'Use the service to develop a competing product by systematic extraction of outputs.',
      'Use the service for unlawful purposes or to generate malicious code.',
    ],
  },
  {
    heading: 'Your content',
    paragraphs: [
      'You retain all rights to code, repositories, and other content you submit. You grant us a limited license to process that content solely to provide the service — for example, sending relevant snippets to LLM providers to answer your questions. We do not train models on your code.',
    ],
  },
  {
    heading: 'AI output disclaimer',
    paragraphs: [
      'AI-generated answers, learning paths, code reviews, and other outputs may be inaccurate, incomplete, or unsuitable for your purpose. Outputs are provided for guidance only and are not professional advice. You are responsible for reviewing outputs before relying on them, including before merging any AI-suggested code.',
    ],
  },
  {
    heading: 'Billing',
    paragraphs: [
      'Paid plans are billed in advance through Stripe on a monthly or annual cycle and renew automatically until cancelled. Usage-based charges, where applicable, are billed in arrears. You can cancel at any time from the billing page; cancellation takes effect at the end of the current billing period. Fees are non-refundable except where required by law. We may change pricing with at least 30 days notice.',
    ],
  },
  {
    heading: 'API and rate limits',
    paragraphs: [
      'API access is subject to the rate limits and quotas of your plan. We may throttle or suspend access that degrades the service for others. API keys are confidential; do not embed them in client-side code.',
    ],
  },
  {
    heading: 'Termination',
    paragraphs: [
      'You may stop using the service and delete your account at any time. We may suspend or terminate accounts that violate these terms, with notice where practicable. Upon termination, your right to use the service ends; sections that by their nature survive (including disclaimers, limitation of liability, and governing law) remain in effect.',
    ],
  },
  {
    heading: 'Disclaimers and limitation of liability',
    paragraphs: [
      'The service is provided "as is" and "as available" without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement. To the maximum extent permitted by law, our total liability for any claim arising out of or relating to the service is limited to the amounts you paid us in the twelve months preceding the claim. We are not liable for indirect, incidental, special, consequential, or punitive damages.',
    ],
  },
  {
    heading: 'Changes to these terms',
    paragraphs: [
      'We may update these terms from time to time. Material changes will be announced by email or in-app notice at least 14 days before taking effect. Continued use after the effective date constitutes acceptance.',
    ],
  },
  {
    heading: 'Contact',
    paragraphs: [
      'Questions about these terms: legal@onramp.ai.',
    ],
  },
]

export default function TermsPage() {
  return (
    <LegalLayout
      label="Legal"
      title="Terms of Service"
      lastUpdated="July 2, 2026"
      intro="These terms govern your use of Onramp. Please read them carefully — they include limits on our liability and your responsibilities when using AI-generated output."
      sections={sections}
    />
  )
}
