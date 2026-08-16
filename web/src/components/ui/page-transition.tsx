import { motion } from 'framer-motion'
import { type ReactNode } from 'react'

const variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.14, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
