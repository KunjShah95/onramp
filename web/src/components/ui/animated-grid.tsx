'use client'
import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

interface AnimatedGridProps {
  className?: string
  cellSize?: number
  fade?: boolean
}

export default function AnimatedGrid({ className, cellSize = 64, fade = true }: AnimatedGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    const draw = () => {
      t += 0.002
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cols = Math.ceil(canvas.width / cellSize)
      const rows = Math.ceil(canvas.height / cellSize)

      for (let x = 0; x <= cols; x++) {
        for (let y = 0; y <= rows; y++) {
          const px = x * cellSize
          const py = ((y * cellSize) + (t * cellSize * 0.15)) % (canvas.height + cellSize) - cellSize

          const dist = Math.hypot(px - canvas.width / 2, py - canvas.height / 2)
          const maxDist = Math.hypot(canvas.width / 2, canvas.height / 2)
          const alpha = fade ? Math.max(0, 1 - dist / maxDist) * 0.08 : 0.06

          ctx.fillStyle = `rgba(255, 140, 0, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, 1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    draw()
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [cellSize, fade])

  return <canvas ref={canvasRef} className={cn('absolute inset-0 w-full h-full pointer-events-none', className)} aria-hidden="true" />
}
