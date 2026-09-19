
import { Link, NavLink } from 'react-router-dom'
import { Compass, House, BookOpenText, ArrowLeft } from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'
import Seo from '../components/seo/Seo'
import { useLandingTheme } from '../hooks/useLandingTheme'

export default function NotFoundPage() {
  const { lightClass } = useLandingTheme()

  return (
    <PageTransition>
      <div data-theme="landing" className={`landing-premium${lightClass} min-h-screen bg-room text-ink antialiased`}>
      <Seo title="Page Not Found · Onramp" description="The page you're looking for doesn't exist or may have moved." path="/404" noindex />
      <div className="min-h-screen flex px-4 items-center justify-center p-6">
        <div className="text-center max-w-md w-full">
          <div className="w-16 h-16 rounded-card bg-go/10 border border-go/20 flex items-center justify-center mx-auto mb-6">
            <Compass className="w-7 h-7 text-go" weight="duotone" />
          </div>

          <p className="font-code text-caption uppercase tracking-[0.2em] text-ink-tertiary mb-2">
            Error 404
          </p>
          <h1 className="font-display text-display-lg font-medium text-ink mb-3">
            Page not found
          </h1>
          <p className="text-body text-ink-tertiary mb-8 leading-relaxed">
            This page doesn't exist. It may have been moved, or the link might be wrong.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <NavLink
              to="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-go text-white text-body-sm font-medium hover:opacity-90 transition-opacity w-full sm:w-auto justify-center"
            >
              <House size={16} weight="fill" />
              Back to Dashboard
            </NavLink>
            <NavLink
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-seam text-ink-secondary hover:text-ink hover:bg-well/40 transition-colors w-full sm:w-auto justify-center"
            >
              <ArrowLeft size={16} />
              Go to Home
            </NavLink>
          </div>

          <div className="mt-8 pt-6 border-t border-[rgb(var(--border-rgb)/0.5)]">
            <p className="text-caption text-ink-tertiary mb-3">Looking for something specific?</p>
            <div className="flex items-center justify-center gap-5">
              <Link to="/explore" className="text-caption font-medium text-go hover:underline underline-offset-4">
                Explore
              </Link>
              <Link to="/docs" className="inline-flex items-center gap-1 text-caption font-medium text-go hover:underline underline-offset-4">
                <BookOpenText size={13} />
                Docs
              </Link>
              <Link to="/support" className="text-caption font-medium text-go hover:underline underline-offset-4">
                Support
              </Link>
            </div>
          </div>
        </div>
      </div>
      </div>
    </PageTransition>
  )
}
