import { useEffect, useRef, useCallback, useState } from 'react'
import * as d3Force from 'd3-force'
import { drag as d3Drag, type D3DragEvent } from 'd3-drag'
import { select as d3Select } from 'd3-selection'
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom'

export interface GraphNode {
  id: string
  group: string
  files?: string[]
  description?: string
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  vx?: number
  vy?: number
}

export interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  width?: number
  height?: number
  onNodeClick?: (node: GraphNode) => void
  selectedNodeId?: string | null
  searchQuery?: string
  activeGroups?: Set<string> | null
}

const PALETTE = [
  '#FF8C00', '#4DA8DA', '#E16A6A', '#6BCB77',
  '#A78BFA', '#F472B6', '#34D399', '#FBBF24',
  '#60A5FA', '#FB923C',
]

function getColor(_group: string, index: number): string {
  return PALETTE[index % PALETTE.length]
}

function computeGroupIndex(nodes: GraphNode[]): Map<string, number> {
  const seen = new Map<string, number>()
  let idx = 0
  for (const n of nodes) {
    if (!seen.has(n.group)) seen.set(n.group, idx++)
  }
  return seen
}

export default function ForceGraph({
  nodes: rawNodes,
  edges: rawEdges,
  width,
  height,
  onNodeClick,
  selectedNodeId,
  searchQuery,
  activeGroups,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const simRef = useRef<d3Force.Simulation<GraphNode, GraphEdge> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipData, setTooltipData] = useState<{ node: GraphNode; x: number; y: number } | null>(null)

  // Store the group→color mapping so the tooltip can use it
  const groupColorsRef = useRef<Map<string, string>>(new Map())

  const handleResize = useCallback(() => {
    const c = containerRef.current
    const s = svgRef.current
    if (!c || !s) return
    const rect = c.getBoundingClientRect()
    s.setAttribute('width', String(rect.width))
    s.setAttribute('height', String(rect.height || 500))
  }, [])

  useEffect(() => {
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  // Reset tooltip and update group colors on data change
  useEffect(() => {
    setTooltipData(null)
    const groupIdx = computeGroupIndex(rawNodes)
    const colors = new Map<string, string>()
    for (const [group, i] of groupIdx) {
      colors.set(group, getColor(group, i))
    }
    groupColorsRef.current = colors
  }, [rawNodes, rawEdges])

  useEffect(() => {
    if (!svgRef.current || rawNodes.length === 0) return

    const rect = containerRef.current?.getBoundingClientRect()
    const w = width ?? rect?.width ?? 800
    const h = height ?? rect?.height ?? 500

    const svg = d3Select(svgRef.current)
    svg.selectAll('*').remove()

    // ── Zoom ──────────────────────────────────────────────
    const g = svg.append('g')
    const zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .filter((event) => {
        if (event.type === 'mousedown' && (event.target as Element)?.closest?.('[data-node="true"]')) {
          return false
        }
        return !event.button && event.type !== 'dblclick'
      })
      .on('zoom', (event) => { g.attr('transform', event.transform) })
    svg.call(zoom)
    svg.call(zoom.transform, zoomIdentity.translate(w / 2, h / 2))

    // ── Group colors (use the shared mapping computed above) ──
    const groupColors = groupColorsRef.current

    // ── Clone data ────────────────────────────────────────
    const nodes: GraphNode[] = rawNodes.map((n) => ({ ...n }))
    const edges: GraphEdge[] = rawEdges.map((e) => ({
      source: typeof e.source === 'string' ? e.source : (e.source as GraphNode).id,
      target: typeof e.target === 'string' ? e.target : (e.target as GraphNode).id,
    }))

    // ── Edges ─────────────────────────────────────────────
    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', '#FDFBF8')
      .attr('stroke-opacity', 0.1)
      .attr('stroke-width', 1.2)

    // ── Nodes ─────────────────────────────────────────────
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('data-node', 'true')
      .style('cursor', 'pointer')

    // ── Drag ──────────────────────────────────────────────
    const drag = d3Drag<SVGGElement, GraphNode>()
      .on('start', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        if (!event.active && simRef.current) simRef.current.alphaTarget(0.3).restart()
        d.fx = d.x ?? 0
        d.fy = d.y ?? 0
      })
      .on('drag', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) => {
        if (!event.active && simRef.current) simRef.current.alphaTarget(0)
        d.fx = null
        d.fy = null
      })
    ;(node as any).call(drag)

    // ── Node circles ──────────────────────────────────────
    // Outer glow
    node
      .append('circle')
      .attr('r', (d) => Math.max(8, Math.min(16, (d.files?.length ?? 1) * 1.2)))
      .attr('fill', 'none')
      .attr('stroke', (d) => groupColors.get(d.group) ?? '#666')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.2)
      .attr('class', 'node-glow')

    // Main circle
    node
      .append('circle')
      .attr('r', (d) => Math.max(6, Math.min(14, (d.files?.length ?? 1) * 1.2)))
      .attr('fill', (d) => groupColors.get(d.group) ?? '#666')
      .attr('stroke', '#1C1C1E')
      .attr('stroke-width', 2)

    // Label
    node
      .append('text')
      .text((d) => (d.id.length > 22 ? d.id.slice(0, 20) + '…' : d.id))
      .attr('x', (d) => Math.max(10, Math.min(18, (d.files?.length ?? 1) * 1.2 + 4)))
      .attr('y', 4)
      .attr('fill', '#FDFBF8')
      .attr('font-size', 10)
      .attr('font-family', 'monospace')
      .attr('opacity', 0.7)

    // ── Apply search highlight / dim ──────────────────────
    const lowerQuery = searchQuery?.toLowerCase() ?? ''
    const hasSearch = lowerQuery.length > 0

    node.each(function (d: GraphNode) {
      const el = d3Select(this)
      const matches = hasSearch ? d.id.toLowerCase().includes(lowerQuery) : true
      const isVisible = !activeGroups || activeGroups.has(d.group)

      el.attr('opacity', isVisible ? (hasSearch ? (matches ? 1 : 0.12) : 1) : 0.06)
        .attr('pointer-events', isVisible ? 'auto' : 'none')
    })

    link.each(function (d: GraphEdge) {
      const sourceId = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
      const targetId = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
      const sourceVisible = !activeGroups || activeGroups.has(
        rawNodes.find((n) => n.id === sourceId)?.group ?? ''
      )
      const targetVisible = !activeGroups || activeGroups.has(
        rawNodes.find((n) => n.id === targetId)?.group ?? ''
      )
      const el = d3Select(this)
      if (!sourceVisible || !targetVisible || (hasSearch &&
        !sourceId.toLowerCase().includes(lowerQuery) &&
        !targetId.toLowerCase().includes(lowerQuery))) {
        el.attr('stroke-opacity', 0.02)
      } else {
        el.attr('stroke-opacity', 0.1)
      }
    })

    // ── Selected node styling ─────────────────────────────
    if (selectedNodeId) {
      node.each(function (d: GraphNode) {
        const el = d3Select(this)
        const isSelected = d.id === selectedNodeId
        if (isSelected) {
          el.select('.node-glow')
            .attr('stroke-opacity', 0.6)
            .attr('stroke-width', 3)
          el.select('circle:last-of-type')
            .attr('stroke', '#FFF')
            .attr('stroke-width', 3)
          el.select('text')
            .attr('font-weight', 'bold')
            .attr('opacity', 1)
        }
      })
    }

    // ── Click → select ────────────────────────────────────
    let clickTimer: ReturnType<typeof setTimeout> | null = null
    node.on('mousedown', () => {
      clickTimer = setTimeout(() => { clickTimer = null }, 200)
    })
    node.on('mouseup', (_event: unknown, d: GraphNode) => {
      if (clickTimer) {
        clearTimeout(clickTimer)
        clickTimer = null
        onNodeClick?.(d)
      }
    })

    // ── Hover tooltip ────────────────────────────────────
    node.on('mouseenter', (event: MouseEvent, d: GraphNode) => {
      const containerRect = containerRef.current?.getBoundingClientRect()
      if (!containerRect) return
      setTooltipData({
        node: d,
        x: event.clientX - containerRect.left + 16,
        y: event.clientY - containerRect.top - 8,
      })
    })
    node.on('mousemove', (event: MouseEvent) => {
      setTooltipData((prev) => {
        if (!prev || !containerRef.current) return prev
        const cr = containerRef.current.getBoundingClientRect()
        return { ...prev, x: event.clientX - cr.left + 16, y: event.clientY - cr.top - 8 }
      })
    })
    node.on('mouseleave', () => {
      setTooltipData(null)
    })

    // ── Simulation ─────────────────────────────────────────
    const sim = d3Force.forceSimulation<GraphNode>(nodes)
      .force('link', d3Force.forceLink<GraphNode, GraphEdge>(edges).id((d) => d.id).distance(140))
      .force('charge', d3Force.forceManyBody<GraphNode>().strength(-400))
      .force('center', d3Force.forceCenter<GraphNode>(0, 0))
      .force('collision', d3Force.forceCollide<GraphNode>().radius(40))

    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    simRef.current = sim

    return () => { sim.stop() }
  }, [rawNodes, rawEdges, width, height, onNodeClick, selectedNodeId, searchQuery, activeGroups])

  return (
    <div ref={containerRef} className="w-full h-full min-h-[400px] relative">
      <svg ref={svgRef} className="w-full h-full" />

      {/* Rich tooltip */}
      {tooltipData && (
        <div
          ref={tooltipRef}
          className="absolute z-50 pointer-events-none"
          style={{ left: tooltipData.x, top: tooltipData.y }}
        >
          <div className="bg-[#1C1C1E] border border-[#FDFBF8]/10 rounded-xl p-3 shadow-2xl backdrop-blur-xl max-w-[260px]">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: groupColorsRef.current.get(tooltipData.node.group) ?? '#FF8C00',
                }}
              />
              <span className="text-[13px] font-semibold text-[#FDFBF8] truncate">
                {tooltipData.node.id}
              </span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-[#FDFBF8]/50">
                <span>Group</span>
                <span className="text-[#FDFBF8]/70 font-mono">{tooltipData.node.group}</span>
              </div>
              <div className="flex justify-between text-[#FDFBF8]/50">
                <span>Files</span>
                <span className="text-[#FDFBF8]/70 font-mono">{tooltipData.node.files?.length ?? 0}</span>
              </div>
              {tooltipData.node.description && (
                <p className="text-[#FDFBF8]/40 text-[10px] leading-relaxed mt-1.5 pt-1.5 border-t border-[#FDFBF8]/5">
                  {tooltipData.node.description}
                </p>
              )}
              {tooltipData.node.files && tooltipData.node.files.length > 0 && (
                <div className="pt-1.5 border-t border-[#FDFBF8]/5">
                  <div className="text-[#FDFBF8]/30 text-[9px] uppercase tracking-wider mb-1">Files</div>
                  <div className="max-h-[100px] overflow-y-auto space-y-0.5 custom-scrollbar">
                    {tooltipData.node.files.slice(0, 8).map((f, i) => (
                      <div key={i} className="text-[#FDFBF8]/40 font-mono text-[10px] truncate">{f}</div>
                    ))}
                    {tooltipData.node.files.length > 8 && (
                      <div className="text-[#FDFBF8]/20 text-[9px]">+{tooltipData.node.files.length - 8} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-ring {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.05; }
        }
        .node-glow { animation: pulse-ring 3s ease-in-out infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  )
}
