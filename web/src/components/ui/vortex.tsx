'use client'
import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

interface VortexProps {
  children?: React.ReactNode
  className?: string
  opacity?: number
}

export default function Vortex({ children, className, opacity = 0.15 }: VortexProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let time = 0

    const resize = () => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }

    const animate = () => {
      time += 0.005
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const centerX = canvas.width / 2
      const centerY = canvas.height / 2
      const maxRad = Math.min(canvas.width, canvas.height) * 0.4

      for (let i = 0; i < 30; i++) {
        const angle = (i / 30) * Math.PI * 2 + time
        const radius = maxRad * (0.3 + 0.7 * ((i / 30) + Math.sin(time + i * 0.5) * 0.2))
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius

        ctx.beginPath()
        ctx.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(139, 92, 246, ${opacity})`
        ctx.fill()
      }

      animationId = requestAnimationFrame(animate)
    }

    resize()
    animate()
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [opacity])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
