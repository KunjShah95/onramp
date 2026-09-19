import { type ReactNode } from 'react'

/* Calm page wrapper — renders children directly with no animation.
 * The previous framer-motion fade/slide on every route change was
 * classic AI bloat: motion on navigation serves no job here.
 * API preserved so all existing imports keep compiling. */
export default function PageTransition({ children }: { children: ReactNode }) {
  return <>{children}</>
}
