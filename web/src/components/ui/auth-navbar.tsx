import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function AuthNavbar() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-seam/20 bg-panel/80 backdrop-blur-md"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-[3px] bg-gradient-to-br from-go to-go-lit flex items-center justify-center">
            <span className="text-[10px] font-display font-bold text-white">OR</span>
          </div>
          <span className="font-display text-sm font-bold text-[hsl(var(--foreground))]">Onramp</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/why-onramp" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            Why Onramp
          </Link>
          <Link to="/pricing" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            Pricing
          </Link>
          <Link to="/" className="text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            Home
          </Link>
        </div>
      </div>
    </motion.nav>
  )
}
