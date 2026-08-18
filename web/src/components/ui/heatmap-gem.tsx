import { useState } from 'react'
import { cn } from '../../lib/utils'

/**
 * HeatmapGem — a lightweight, WebGL-free facsimile of the original Babylon
 * icosphere. The Babylon version pulled in ~1.4MB of engine code shared across
 * the whole bundle; this CSS + SVG version renders the same heatmap gradient
 * on a rotating 3D-projected gem with zero WebGL.
 */

interface HeatmapGemProps {
  size?: number
  autoRotate?: boolean
  className?: string
}

export default function HeatmapGem({ size = 300, autoRotate = true, className }: HeatmapGemProps) {
  const [isError, setIsError] = useState(false)

  if (isError) {
    return (
      <div
        className={cn('rounded-full blur-sm', className)}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, rgba(0,0,139,0.3) 0%, rgba(255,69,0,0.3) 100%)',
          backdropFilter: 'blur(8px)',
        }}
      />
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden rounded-[20px]', className)}
      style={{ width: size, height: size }}
      onError={() => setIsError(true)}
    >
      {/* rotating gem face */}
      <div
        className="absolute inset-0 rounded-[20px] border border-white/10"
        style={{
          width: '100%',
          height: '100%',
          perspective: `${size * 1.4}px`,
        }}
      >
        <div
          className={cn(
            'absolute inset-0 m-auto rounded-[20px] bg-gradient-to-br from-[#0033ff] via-[#00ff88] to-[#ff4400] blur-[1px]',
            autoRotate && 'animate-spin-slow',
          )}
          style={{
            width: '90%',
            height: '90%',
            top: 'auto',
            transformStyle: 'preserve-3d',
            transform: 'rotateY(25deg) rotateX(10deg)',
            boxShadow:
              'inset 0 0 30px rgba(0,255,255,0.25), 0 0 40px 8px rgba(255,255,255,0.08), 0 0 20px 4px rgba(0,200,255,0.3)',
          }}
        />
      </div>

      {/* heatmap scan overlay */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-[20px] opacity-45"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0) 0deg, rgba(0,255,180,0.15) 120deg, rgba(255,255,255,0) 180deg, rgba(255,100,0,0.1) 300deg, rgba(255,255,255,0) 360deg)',
          animation: autoRotate ? 'gem-scan 3s linear infinite' : 'none',
        }}
      />
    </div>
  )
}
