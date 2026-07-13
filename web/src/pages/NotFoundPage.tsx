import { motion } from 'framer-motion'
import { NavLink } from 'react-router-dom'
import { Compass } from '@phosphor-icons/react'
import PageTransition from '../components/ui/page-transition'

export default function NotFoundPage() {
  return (
    <PageTransition>
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent-muted border border-accent/20 flex items-center justify-center mx-auto mb-6">
            <Compass className="w-7 h-7 text-accent-from" weight="duotone" />
          </div>
          <h1 className="text-display-lg font-display font-medium text-text-primary mb-2">404</h1>
          <p className="text-body text-text-tertiary mb-8">
            This page doesn't exist. It might have been moved or the link might be wrong.
          </p>
          <NavLink
            to="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-from text-white text-body-sm font-medium hover:opacity-90 transition-opacity"
          >
            Go home
          </NavLink>
        </motion.div>
      </div>
    </PageTransition>
  )
}
