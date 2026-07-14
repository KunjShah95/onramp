import { Link } from 'react-router-dom'

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Changelog', href: '/changelog' },
      { label: 'Documentation', href: '/docs' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Log In', href: '/login' },
      { label: 'Register', href: '/register' },
    ],
  },
]

export default function MarketingFooter() {
  return (
    <footer className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <span className="text-lg font-display font-bold tracking-tight text-[hsl(var(--foreground))]">
              Onramp
            </span>
            <p className="text-xs text-[hsl(var(--muted-foreground))]/60 mt-2 leading-relaxed max-w-[200px] font-body">
              AI-powered developer onboarding for modern engineering teams.
            </p>
          </div>

          {/* Link columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h3 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]/50 uppercase tracking-widest mb-4 font-body">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors font-body"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-[hsl(var(--border))] py-5">
        <p className="text-center text-[10px] text-[hsl(var(--muted-foreground))]/40 font-mono">
          &copy; {new Date().getFullYear()} Onramp Inc. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
