import { useMemo } from 'react'

/**
 * ArchitectureMapStatic — a zero-JavaScript, zero-Babylon stand-in for the
 * interactive 3D architecture map.
 *
 * When a visitor is on a slow network or has Save-Data enabled, the landing
 * page skips the ~1.4MB Babylon.js bundle and renders this lightweight SVG
 * instead. It shows the same layered service topology (client → api → core →
 * data) with colored nodes and dependency edges, so the product surface is
 * still communicated without the multi-MB WebGL download.
 */

type Domain = 'client' | 'api' | 'core' | 'data'

interface ArchitectureNode {
  id: string
  name: string
  sub: string
  domain: Domain
  color: string
  x: number
  y: number
}

interface ArchitectureEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface LayerSpec {
  label: string
  domain: Domain
  nodes: { name: string; sub: string }[]
}

const DOMAIN_COLORS: Record<Domain, string> = {
  client: '#00D9FF',
  api: '#06B6D4',
  core: '#10B981',
  data: '#5A7D9A',
}

const LAYERS: LayerSpec[] = [
  {
    label: 'Client',
    domain: 'client',
    nodes: [
      { name: 'Web App', sub: 'Next.js' },
      { name: 'Mobile', sub: 'React Native' },
      { name: 'Admin', sub: 'Next.js' },
    ],
  },
  {
    label: 'API',
    domain: 'api',
    nodes: [
      { name: 'API Gateway', sub: 'Node.js' },
      { name: 'Auth', sub: 'Go' },
      { name: 'Webhooks', sub: 'Node.js' },
    ],
  },
  {
    label: 'Core',
    domain: 'core',
    nodes: [
      { name: 'Billing', sub: 'Node.js' },
      { name: 'User Svc', sub: 'Python' },
      { name: 'Search', sub: 'Go' },
      { name: 'Notify', sub: 'TypeScript' },
    ],
  },
  {
    label: 'Data',
    domain: 'data',
    nodes: [
      { name: 'Postgres', sub: 'Database' },
      { name: 'Redis', sub: 'Cache' },
      { name: 'Queue', sub: 'Broker' },
    ],
  },
]

// Horizontal centers of the four layer columns (SVG viewBox 0 0 900 520).
const X_POS = [150, 375, 610, 845]
const CENTER_Y = 260
const NODE_SPACING = 48
const NODE_R = 9
const RING_R = 15

function nearestIndex(y: number, ys: number[]): number {
  let best = 0
  let bestDiff = Infinity
  ys.forEach((yy, i) => {
    const d = Math.abs(yy - y)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  })
  return best
}

export interface ArchitectureMapStaticProps {
  className?: string
}

export default function ArchitectureMapStatic({ className = '' }: ArchitectureMapStaticProps) {
  const { nodes, edges } = useMemo(() => {
    const built: ArchitectureNode[] = []
    const layerNodes: ArchitectureNode[][] = []

    LAYERS.forEach((layer, li) => {
      const count = layer.nodes.length
      const start = CENTER_Y - ((count - 1) * NODE_SPACING) / 2
      const thisLayer: ArchitectureNode[] = []
      layer.nodes.forEach((n, ni) => {
        const node: ArchitectureNode = {
          id: `${li}-${ni}`,
          name: n.name,
          sub: n.sub,
          domain: layer.domain,
          color: DOMAIN_COLORS[layer.domain],
          x: X_POS[li],
          y: start + ni * NODE_SPACING,
        }
        built.push(node)
        thisLayer.push(node)
      })
      layerNodes.push(thisLayer)
    })

    const builtEdges: ArchitectureEdge[] = []
    for (let li = 0; li < LAYERS.length - 1; li++) {
      const current = layerNodes[li]
      const next = layerNodes[li + 1]
      const nextYs = next.map((n) => n.y)
      current.forEach((from) => {
        const j = nearestIndex(from.y, nextYs)
        const to = next[j]
        builtEdges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
      })
    }

    return { nodes: built, edges: builtEdges }
  }, [])

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 900 520"
        className="h-full w-full max-w-[900px]"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect x="0" y="0" width="900" height="520" rx="12" fill="#0F1419" />
        {/* dependency edges */}
        {edges.map((e, i) => (
          <line
            key={`edge-${i}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            strokeWidth="1.5"
            stroke="rgba(248,250,252,0.09)"
          />
        ))}
        {/* service nodes */}
        {nodes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={NODE_R} fill={n.color} />
            <circle cx={n.x} cy={n.y} r={RING_R} fill="none" stroke={`${n.color}44`} strokeWidth="1" />
            <text
              x={n.x}
              y={n.y + 26}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(245,249,251,0.55)"
              fontFamily="ui-monospace, 'JetBrains Mono', monospace"
            >
              {n.name}
            </text>
            <text
              x={n.x}
              y={n.y + 40}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(152,161,170,0.5)"
              fontFamily="ui-monospace, 'JetBrains Mono', monospace"
            >
              {n.sub}
            </text>
          </g>
        ))}
        {/* domain layer labels */}
        {LAYERS.map((layer, i) => (
          <text
            key={layer.label}
            x={X_POS[i]}
            y="28"
            textAnchor="middle"
            fontSize="10"
            fontWeight={600}
            letterSpacing="0.06em"
            fill={DOMAIN_COLORS[layer.domain]}
            fontFamily="ui-monospace, 'JetBrains Mono', monospace"
          >
            {layer.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
