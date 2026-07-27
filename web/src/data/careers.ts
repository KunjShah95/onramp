export interface CareerRole {
  slug: string
  title: string
  location: string
  type: string
  department: string
  description: string
}

export const openRoles: CareerRole[] = [
  {
    slug: 'senior-frontend-engineer',
    title: 'Senior Frontend Engineer',
    location: 'Remote (US/Europe)',
    type: 'Full-time',
    department: 'Engineering',
    description: 'Build and refine the Onramp web application — from the architecture map visualizations to the AI chat interface.',
  },
  {
    slug: 'backend-engineer-ai-ml',
    title: 'Backend Engineer — AI/ML',
    location: 'Remote (Global)',
    type: 'Full-time',
    department: 'Engineering',
    description: 'Design and scale the systems that parse, index, and analyze codebases using LLMs and graph algorithms.',
  },
  {
    slug: 'developer-advocate',
    title: 'Developer Advocate',
    location: 'Remote (US)',
    type: 'Full-time',
    department: 'Marketing',
    description: 'Help developers succeed with Onramp through tutorials, docs, community engagement, and conference talks.',
  },
  {
    slug: 'product-designer',
    title: 'Product Designer',
    location: 'Remote (US/Europe)',
    type: 'Full-time',
    department: 'Design',
    description: 'Define and design the future of developer onboarding — complex data visualization, AI interactions, and delightful micro-experiences.',
  },
]
