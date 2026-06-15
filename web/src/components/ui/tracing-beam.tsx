'use client'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

interface TracingBeamProps {
  children: React.ReactNode
  className?: string
}

export default function TracingBeam({ children, className }: TracingBeamProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollY, setScrollY] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const scrollTop = window.scrollY
        const offsetTop = rect.top + scrollTop
        setScrollY(Math.max(0, scrollTop - offsetTop + window.innerHeight * 0.3))
        setHeight(rect.height)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const progress = Math.min(scrollY / height, 1)

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-border">
        <div
          className="w-full bg-gradient-to-b from-accent-from via-accent-via to-accent-to transition-all duration-150"
          style={{ height: `${progress * 100}%` }}
        />
      </div>
      <div className="ml-8">{children}</div>
    </div>
  )
}
