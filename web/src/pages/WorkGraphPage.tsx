/*
 * Work Graph — codebase architecture linked to the developers who built it,
 * split senior vs junior. Data is generated offline from git history + source
 * imports (backend/scripts/generate_work_graph.py --store) and served by
 * GET /repos/{owner}/{repo}/work-graph.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import * as d3Force from 'd3-force'
import { drag as d3Drag } from 'd3-drag'
import { select as d3Select } from 'd3-selection'
import { zoom as d3Zoom } from 'd3-zoom'
import { Graph, GitBranch, Terminal } from '@phosphor-icons/react'
import { cn } from '../lib/utils'
import ConsolePanel from '../components/ui/console-panel'
import { EmptyState } from '../components/ui/empty-state'
import { PageHeader } from '../components/ui/page-header'
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table'
import { useThemeSignals } from '../hooks/useThemeSignals'
import { fetchRepos, fetchWorkGraph } from '../lib/api'
import type { WorkGraph, WorkTier } from '../lib/api'

const LAYER_COLOR: Record<string, string> = { backend: '#A78BFA', frontend: '#FB923C', sdk: '#F472B6' }
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
const shortLabel = (label: string) => label.split(':')[1] ?? label

type SimNode = d3Force.SimulationNodeDatum & {
  id: string
  kind: 'dev' | 'mod'
  r: number
  label: string
  color: string
  stroke: string
  layer?: string
}
type SimLink = d3Force.SimulationLinkDatum<SimNode> & { kind: 'dep' | 'work'; w: number; color: string }

function useTierColors() {
  const sig = useThemeSignals()
  return useMemo<Record<WorkTier, string>>(
    () => ({ senior: sig.blue, junior: sig.go, unknown: sig.axis }),
    [sig],
  )
}

function WorkGraphCanvas({ data, onHover }: { data: WorkGraph; onHover: (text: string | null) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tierColor = useTierColors()
  const sig = useThemeSignals()

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return
    const W = svgEl.clientWidth || 900
    const H = svgEl.clientHeight || 600
    const svg = d3Select(svgEl)
    svg.selectAll('*').remove()
    const g = svg.append('g')
    svg.call(d3Zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on('zoom', (e) => g.attr('transform', e.transform)))

    const tierOf = new Map(data.developers.map((d) => [d.login, d.tier]))
    const maxLoc = Math.max(1, ...data.modules.map((m) => m.loc))
    const maxLines = Math.max(1, ...data.contributions.map((c) => c.lines))

    const nodes: SimNode[] = [
      ...data.developers.map((d) => ({
        id: `dev:${d.login}`, kind: 'dev' as const, r: 24, label: d.name || d.login,
        color: tierColor[d.tier], stroke: 'transparent',
      })),
      ...data.modules.map((m) => ({
        id: m.id, kind: 'mod' as const, r: 6 + 16 * Math.sqrt(m.loc / maxLoc), label: shortLabel(m.label),
        color: LAYER_COLOR[m.layer] ?? sig.axis, stroke: m.owner_tier ? tierColor[m.owner_tier] : 'transparent', layer: m.layer,
      })),
    ]
    const ids = new Set(nodes.map((n) => n.id))
    const links: SimLink[] = [
      ...data.module_edges.filter((e) => ids.has(e.source) && ids.has(e.target))
        .map((e) => ({ source: e.source, target: e.target, kind: 'dep' as const, w: e.weight, color: sig.axis })),
      ...data.contributions.filter((c) => ids.has(c.module))
        .map((c) => ({ source: `dev:${c.dev}`, target: c.module, kind: 'work' as const, w: c.lines, color: tierColor[tierOf.get(c.dev) ?? 'unknown'] })),
    ]

    const sim = d3Force.forceSimulation(nodes)
      .force('link', d3Force.forceLink<SimNode, SimLink>(links).id((n) => n.id)
        .distance((l) => (l.kind === 'work' ? 160 : 80))
        .strength((l) => (l.kind === 'work' ? 0.08 + 0.5 * Math.sqrt(l.w / maxLines) : 0.05)))
      .force('charge', d3Force.forceManyBody<SimNode>().strength((n) => (n.kind === 'dev' ? -800 : -160)))
      .force('collide', d3Force.forceCollide<SimNode>((n) => n.r + 6))
      .force('center', d3Force.forceCenter(W / 2, H / 2))
      .force('y', d3Force.forceY<SimNode>(H / 2).strength(0.05))
      .force('x', d3Force.forceX<SimNode>((n) => (n.kind === 'mod' ? (n.layer === 'backend' ? W * 0.33 : W * 0.67) : W / 2)).strength(0.06))

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', (l) => l.color)
      .attr('stroke-opacity', (l) => (l.kind === 'work' ? 0.45 : 0.25))
      .attr('stroke-dasharray', (l) => (l.kind === 'dep' ? '3 3' : null))
      .attr('stroke-width', (l) => (l.kind === 'work' ? 1 + 8 * Math.sqrt(l.w / maxLines) : Math.min(2.5, 0.5 + Math.log10(l.w + 1))))

    const node = g.append('g').selectAll<SVGGElement, SimNode>('g').data(nodes).join('g')
      .style('cursor', 'grab')
      .call(d3Drag<SVGGElement, SimNode>()
        .on('start', (e, n) => { if (!e.active) sim.alphaTarget(0.3).restart(); n.fx = n.x; n.fy = n.y })
        .on('drag', (e, n) => { n.fx = e.x; n.fy = e.y })
        .on('end', (e, n) => { if (!e.active) sim.alphaTarget(0); n.fx = null; n.fy = null }))

    node.append('circle')
      .attr('r', (n) => n.r)
      .attr('fill', (n) => n.color)
      .attr('fill-opacity', (n) => (n.kind === 'dev' ? 1 : 0.85))
      .attr('stroke', (n) => n.stroke)
      .attr('stroke-width', 2.5)
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (n) => (n.kind === 'dev' ? n.r + 16 : n.r + 12))
      .attr('fill', 'rgb(var(--text-primary))')
      .style('font-size', (n) => (n.kind === 'dev' ? '12px' : '10px'))
      .style('font-weight', (n) => (n.kind === 'dev' ? 700 : 500))
      .style('font-family', 'IBM Plex Mono, ui-monospace, monospace')
      .text((n) => n.label)

    const devBy = new Map(data.developers.map((d) => [`dev:${d.login}`, d]))
    const modBy = new Map(data.modules.map((m) => [m.id, m]))
    node
      .on('mouseenter', (_e, n) => {
        const d = devBy.get(n.id)
        if (d) { onHover(`${d.name} (@${d.login}) · ${d.role ?? 'no role'} · ${d.commits} commits · ${fmt(d.lines)} lines`); return }
        const m = modBy.get(n.id)
        if (!m) return
        const who = data.contributions.filter((c) => c.module === m.id).sort((a, b) => b.lines - a.lines)
          .map((c) => `${c.dev} ${fmt(c.lines)}`).join(' · ')
        onHover(`${m.label} · ${m.files} files · ${fmt(m.loc)} LOC${who ? ` · ${who}` : ''}`)
      })
      .on('mouseleave', () => onHover(null))

    sim.on('tick', () => {
      link
        .attr('x1', (l) => (l.source as SimNode).x ?? 0).attr('y1', (l) => (l.source as SimNode).y ?? 0)
        .attr('x2', (l) => (l.target as SimNode).x ?? 0).attr('y2', (l) => (l.target as SimNode).y ?? 0)
      node.attr('transform', (n) => `translate(${n.x ?? 0},${n.y ?? 0})`)
    })
    return () => { sim.stop() }
  }, [data, tierColor, sig, onHover])

  return <svg ref={svgRef} className="block w-full h-[560px] md:h-[640px]" role="img" aria-label="Work graph" />
}

export default function WorkGraphPage() {
  const [params, setParams] = useSearchParams()
  const tierColor = useTierColors()
  const [hover, setHover] = useState<string | null>(null)

  const { data: reposData } = useQuery({ queryKey: ['repos'], queryFn: fetchRepos, staleTime: 60_000 })
  const repos = reposData?.repos ?? []
  const owner = params.get('owner') ?? repos[0]?.owner ?? ''
  const repo = params.get('repo') ?? repos[0]?.name ?? ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['work-graph', owner, repo],
    queryFn: () => fetchWorkGraph(owner, repo),
    enabled: Boolean(owner && repo),
    retry: false,
    staleTime: 5 * 60_000,
  })

  const tiers = (['senior', 'junior', 'unknown'] as const).filter((t) => (data?.summary[t]?.developers ?? 0) > 0)
  const totalLines = data ? tiers.reduce((s, t) => s + data.summary[t].lines, 0) || 1 : 1
  const modulesByWork = useMemo(
    () => (data ? [...data.modules].filter((m) => m.senior_lines + m.junior_lines > 0)
      .sort((a, b) => b.senior_lines + b.junior_lines - (a.senior_lines + a.junior_lines)) : []),
    [data],
  )

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-full overflow-x-hidden">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <PageHeader
          eyebrow="Folio · Work graph"
          title="Work Graph"
          subtitle="The codebase's modules and dependencies, linked to the senior and junior developers who built them."
        />
        {repos.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-ink-tertiary">
            <GitBranch size={14} />
            <select
              value={`${owner}/${repo}`}
              onChange={(e) => { const [o, r] = e.target.value.split('/'); setParams({ owner: o, repo: r }) }}
              className="h-9 rounded-[5px] border border-seam bg-panel px-2.5 text-[13px] text-ink"
            >
              {repos.map((r) => <option key={r.id} value={`${r.owner}/${r.name}`}>{r.owner}/{r.name}</option>)}
            </select>
          </label>
        )}
      </header>

      {!owner && (
        <ConsolePanel rail="Awaiting" status="idle">
          <EmptyState icon={<Graph size={26} className="text-ink-disabled" weight="duotone" />} eyebrow="Work graph" title="No repository tracked" description="Add a repository from Explore first." />
        </ConsolePanel>
      )}

      {isLoading && <div className="py-24 text-center font-code text-[13px] text-ink-secondary">Loading work graph…</div>}

      {error && (
        <ConsolePanel rail="Not generated" designator={`${owner}/${repo}`} status="caution">
          <p className="text-[13px] text-ink-secondary mb-3">{(error as Error).message}</p>
          <div className="flex items-start gap-2 rounded-[3px] border border-seam bg-base px-3 py-2.5 font-code text-[12px] text-ink overflow-x-auto">
            <Terminal size={14} className="mt-0.5 shrink-0 text-ink-tertiary" />
            <code className="whitespace-nowrap">cd backend &amp;&amp; python scripts/generate_work_graph.py --store</code>
          </div>
        </ConsolePanel>
      )}

      {data && (
        <div className="space-y-6">
          {/* Tier summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tiers.map((t) => {
              const s = data.summary[t]
              const devs = data.developers.filter((d) => d.tier === t)
              const share = (s.lines / totalLines) * 100
              return (
                <ConsolePanel key={t} rail={`${t[0].toUpperCase()}${t.slice(1)} developers`} designator={devs.map((d) => d.name || d.login).join(' · ')}>
                  <div className="flex flex-wrap gap-6 mb-3">
                    {[['commits', s.commits], ['lines changed', fmt(s.lines)], ['modules', s.modules]].map(([k, v]) => (
                      <div key={k as string}>
                        <div className="font-display text-2xl font-bold tabular-nums" style={{ color: tierColor[t] }}>{v}</div>
                        <div className="font-code text-[11px] text-ink-tertiary">{k}</div>
                      </div>
                    ))}
                  </div>
                  <div className="h-1.5 rounded-[2px] bg-well overflow-hidden mb-1">
                    <div className="h-full" style={{ width: `${share}%`, backgroundColor: tierColor[t] }} />
                  </div>
                  <div className="font-code text-[11px] text-ink-tertiary mb-3">{share.toFixed(1)}% of all changes</div>
                  <ol className="space-y-1">
                    {s.top_modules.map((m, i) => (
                      <li key={m.module} className="flex justify-between gap-3 text-[12.5px]">
                        <span className="text-ink-secondary truncate"><span className="font-code text-ink-tertiary mr-2">{String(i + 1).padStart(2, '0')}</span>{m.label}</span>
                        <span className="font-code tabular-nums text-ink shrink-0">{fmt(m.lines)}</span>
                      </li>
                    ))}
                  </ol>
                </ConsolePanel>
              )
            })}
          </div>

          {/* Graph */}
          <ConsolePanel
            rail="Graph"
            designator={`${data.owner}/${data.repo} · ${data.commit}`}
            pad="none"
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 py-2.5 border-b border-seam font-code text-[11px] text-ink-tertiary">
              {(['senior', 'junior'] as const).map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: tierColor[t] }} />{t} dev</span>
              ))}
              {Object.entries(LAYER_COLOR).map(([k, c]) => (
                <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />{k} module</span>
              ))}
              <span>ring = tier that wrote most of it · thick = lines changed · dashed = imports</span>
            </div>
            <WorkGraphCanvas data={data} onHover={setHover} />
            <div className={cn('px-5 py-2 border-t border-seam font-code text-[11.5px] min-h-[2.25rem]', hover ? 'text-ink' : 'text-ink-tertiary')}>
              {hover ?? 'Hover a node for detail · drag to rearrange · scroll to zoom'}
            </div>
          </ConsolePanel>

          {/* Module ownership table */}
          <ConsolePanel rail="Module ownership" designator={`${modulesByWork.length} MODULES`} pad="none">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Module</TH>
                    <TH className="text-right">Files</TH>
                    <TH className="text-right">Senior lines</TH>
                    <TH className="text-right">Junior lines</TH>
                    <TH className="w-[30%]">Split</TH>
                  </TR>
                </THead>
                <TBody>
                  {modulesByWork.map((m) => {
                    const tot = m.senior_lines + m.junior_lines || 1
                    return (
                      <TR key={m.id}>
                        <TD className="font-code text-[12px]">{m.label}</TD>
                        <TD className="text-right tabular-nums">{m.files}</TD>
                        <TD className="text-right tabular-nums">{fmt(m.senior_lines)}</TD>
                        <TD className="text-right tabular-nums">{fmt(m.junior_lines)}</TD>
                        <TD>
                          <div className="flex h-1.5 rounded-[2px] overflow-hidden bg-well">
                            <div style={{ width: `${(m.senior_lines / tot) * 100}%`, backgroundColor: tierColor.senior }} />
                            <div style={{ width: `${(m.junior_lines / tot) * 100}%`, backgroundColor: tierColor.junior }} />
                          </div>
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </div>
          </ConsolePanel>

          <p className="font-code text-[11px] text-ink-tertiary">
            Generated {new Date(data.generated_at).toLocaleString()} from git history and source imports.
          </p>
        </div>
      )}
    </div>
  )
}
