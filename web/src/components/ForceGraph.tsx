import { useEffect, useRef, useCallback } from 'react'
import * as d3Force from 'd3-force'
import { drag as d3Drag, type D3DragEvent } from 'd3-drag'
import { select as d3Select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'

interface GraphNode {
  id: string
  group: string
  files?: string[]
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  vx?: number
  vy?: number
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
  x?: number
  y?: number
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  onNodeClick?: (node: GraphNode) => void
}

const COLORS = [
  '#FF8C00', '#4DA8DA', '#E16A6A', '#6BCB77',
  '#A78BFA', '#F472B6', '#34D399', '#FBBF24',
  '#60A5FA', '#FB923C',
]

function getColor(_group: string, index: number): string {
  return COLORS[index % COLORS.length]
}

export default function ForceGraph({ nodes: rawNodes, edges: rawEdges, width, height, onNodeClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const simRef = useRef<d3Force.Simulation<GraphNode, GraphEdge> | null>(null)

  const handleResize = useCallback(() => {
    if (!containerRef.current || !svgRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    svgRef.current.setAttribute('width', String(rect.width))
    svgRef.current.setAttribute('height', String(rect.height || 500))
  }, [])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  useEffect(() => {
    if (!svgRef.current || rawNodes.length === 0) return

    const rect = containerRef.current?.getBoundingClientRect()
    const w = width ?? rect?.width ?? 800
    const h = height ?? rect?.height ?? 500

    const svg = d3Select(svgRef.current)
    svg.selectAll('*').remove()

    // Zoom behavior — filter out node drag events so they don't trigger zoom
    const g = svg.append('g')
    const zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .filter((event) => {
        // Don't start zoom/pan when interacting with a node
        if (event.type === 'mousedown' && (event.target as Element)?.closest?.('[data-node="true"]')) {
          return false
        }
        return !event.button && event.type !== 'dblclick'
      })
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)
    // Initial transform to center
    svg.call(zoom.transform, zoomIdentity.translate(w / 2, h / 2))

    // Color map per group
    const groupColors = new Map<string, string>()
    let colorIdx = 0
    for (const n of rawNodes) {
      if (!groupColors.has(n.group)) {
        groupColors.set(n.group, getColor(n.group, colorIdx++))
      }
    }

    // Nodes — deep clone so d3 can mutate positions
    const nodes: GraphNode[] = rawNodes.map((n) => ({ ...n }))
    const edges: GraphEdge[] = rawEdges.map((e) => ({
      source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
    }))

    // Edges
    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#FDFBF8')
      .attr('stroke-opacity', 0.12)
      .attr('stroke-width', 1.2)

    // Nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('data-node', 'true')
      .style('cursor', onNodeClick ? 'pointer' : 'grab')

    // Drag behavior using d3-drag
    const drag = d3Drag<SVGGElement, GraphNode>()
      .on('start', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        if (!event.active && simRef.current) {
          simRef.current.alphaTarget(0.3).restart()
        }
        d.fx = d.x ?? 0
        d.fy = d.y ?? 0
      })
      .on('drag', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        if (!event.active && simRef.current) {
          simRef.current.alphaTarget(0)
        }
        d.fx = null
        d.fy = null
      })

    // Type assertion: d3-drag is designed to be called via .call() on selections
    ;(node as any).call(drag)

    // Click detection (separate from drag)
    let clickTimer: ReturnType<typeof setTimeout> | null = null
    node.on('mousedown', () => {
      clickTimer = setTimeout(() => { clickTimer = null }, 200)
    })
    node.on('mouseup', (_event: unknown, d: GraphNode) => {
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
        // It was a click (no drag happened)
        onNodeClick?.(d)
      }
    })

    node
      .append('circle')
      .attr('r', 8)
      .attr('fill', (d) => groupColors.get(d.group) ?? '#666')
      .attr('stroke', '#FDFBF8')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.2)

    // Pulse animation on circles
    node
      .append('circle')
      .attr('r', 12)
      .attr('fill', 'none')
      .attr('stroke', (d) => groupColors.get(d.group) ?? '#666')
      .attr('stroke-width', 1)
      .attr('stroke-opacity', 0.15)
      .attr('class', 'pulse-ring')

    node
      .append('text')
      .text((d) => d.id.length > 20 ? d.id.slice(0, 18) + '…' : d.id)
      .attr('x', 14)
      .attr('y', 4)
      .attr('fill', '#FDFBF8')
      .attr('font-size', 10)
      .attr('font-family', 'monospace')
      .attr('opacity', 0.7)

    // Tooltip on hover
    node
      .append('title')
      .text((d) => `${d.id}\nGroup: ${d.group}\nFiles: ${d.files?.length ?? 0}`)

    // Simulation
    const sim = d3Force.forceSimulation<GraphNode>(nodes)
      .force('link', d3Force.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(120))
      .force('charge', d3Force.forceManyBody<GraphNode>().strength(-300))
      .force('center', d3Force.forceCenter<GraphNode>(0, 0))
      .force('collision', d3Force.forceCollide<GraphNode>().radius(30))

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    simRef.current = sim

    return () => {
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes, rawEdges, width, height, onNodeClick])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] relative">
      <svg ref={svgRef} className="w-full h-full" />
      <style>{`
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.05; }
        }
        .pulse-ring {
          animation: pulse-ring 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
