import { useEffect, useRef } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/Builders/boxBuilder'
import '@babylonjs/core/Meshes/Builders/linesBuilder'
import '@babylonjs/core/Meshes/Builders/textBuilder'

/* ─────────────────────────────────────────────────────────────────────────
 * ArchitectureMap — the interactive product surface.
 *
 * A layered architecture map the visitor can orbit with drag. Each service
 * is a box colored by domain; hovering lights it and shows a dependency
 * readout. A scroll `progress` (0..1) drives the build-up: 0–0.4 services
 * appear, 0.4–0.75 dependency lines draw, 0.75–1 freshness glow pulses.
 * ───────────────────────────────────────────────────────────────────────── */

type Node = {
  label: string
  sub: string
  domain: 'client' | 'api' | 'core' | 'data'
  x: number
  y: number
  z: number
  size: number
  owner: string
  tests: number
  lastCommit: string
}

const DOMAIN_COLORS: Record<Node['domain'], string> = {
  client: '#00D9FF',
  api: '#06B6D4',
  core: '#10B981',
  data: '#5A7D9A',
}

const NODES: Node[] = [
  { label: 'Web App', sub: 'Next.js', domain: 'client', x: -6.6, y: 2.8, z: 0, size: 0.66, owner: '@web-core', tests: 482, lastCommit: '2h ago' },
  { label: 'Mobile', sub: 'React Native', domain: 'client', x: -6.6, y: 0.8, z: 0, size: 0.54, owner: '@web-core', tests: 214, lastCommit: '6h ago' },
  { label: 'Admin', sub: 'Next.js', domain: 'client', x: -6.6, y: -1.2, z: 0, size: 0.52, owner: '@web-core', tests: 158, lastCommit: '1d ago' },
  { label: 'API Gateway', sub: 'Node.js', domain: 'api', x: -2.3, y: 2.2, z: 0, size: 0.64, owner: '@platform', tests: 623, lastCommit: '40m ago' },
  { label: 'Auth', sub: 'Go', domain: 'api', x: -2.3, y: 0.4, z: 0, size: 0.58, owner: '@identity', tests: 391, lastCommit: '3h ago' },
  { label: 'Webhooks', sub: 'Node.js', domain: 'api', x: -2.3, y: -1.4, z: 0, size: 0.52, owner: '@platform', tests: 117, lastCommit: '5h ago' },
  { label: 'Billing', sub: 'Node.js', domain: 'core', x: 2.3, y: 2.7, z: 0, size: 0.6, owner: '@payments', tests: 544, lastCommit: '1h ago' },
  { label: 'User Svc', sub: 'Python', domain: 'core', x: 2.3, y: 1.0, z: 0, size: 0.58, owner: '@identity', tests: 338, lastCommit: '2h ago' },
  { label: 'Search', sub: 'Go', domain: 'core', x: 2.3, y: -0.6, z: 0, size: 0.54, owner: '@search', tests: 209, lastCommit: '4h ago' },
  { label: 'Notify', sub: 'TypeScript', domain: 'core', x: 2.3, y: -2.0, z: 0, size: 0.5, owner: '@platform', tests: 96, lastCommit: '7h ago' },
  { label: 'Postgres', sub: 'Database', domain: 'data', x: 6.6, y: 1.9, z: 0, size: 0.68, owner: '@platform', tests: 0, lastCommit: '1h ago' },
  { label: 'Redis', sub: 'Cache', domain: 'data', x: 6.6, y: 0.2, z: 0, size: 0.56, owner: '@platform', tests: 0, lastCommit: '1h ago' },
  { label: 'Queue', sub: 'Infra', domain: 'data', x: 6.6, y: -1.5, z: 0, size: 0.56, owner: '@infra', tests: 0, lastCommit: '12h ago' },
]

const EDGES: [number, number][] = [
  [0, 3], [1, 3], [2, 3], [3, 4], [3, 5],
  [4, 7], [5, 8], [3, 6],
  [6, 10], [7, 10], [8, 10], [6, 11], [8, 11],
  [4, 11], [5, 12], [7, 12], [9, 12],
]

export interface TooltipInfo {
  label: string
  sub: string
  domain: string
  owner: string
  tests: number
  lastCommit: string
  x: number
  y: number
}

interface ArchitectureMapProps {
  className?: string
  /** Mutable ref the parent updates with scroll progress 0..1. */
  progressRef?: React.MutableRefObject<number>
  onHover?: (info: TooltipInfo | null) => void
}

export default function ArchitectureMap({ className, progressRef, onHover }: ArchitectureMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, alpha: true })
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 0)

    const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.2, 16, Vector3.Zero(), scene)
    camera.fov = 0.6
    camera.lowerRadiusLimit = 11
    camera.upperRadiusLimit = 24
    camera.minZ = 0.1
    camera.wheelDeltaPercentage = 0.012
    camera.panningSensibility = 0

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0.35), scene)
    hemi.intensity = 0.5

    const point = new PointLight('point', new Vector3(2, 3, -6), scene)
    point.intensity = 0.7

    const glow = new GlowLayer('glow', scene)
    glow.intensity = 0.5

    const highlight = new HighlightLayer('hl', scene)

    const nodeMeshes: Mesh[] = NODES.map((n, i) => {
      const box = MeshBuilder.CreateBox(`node-${i}`, { size: n.size }, scene)
      const mat = new StandardMaterial(`mat-${i}`, scene)
      mat.diffuseColor = Color3.FromHexString(DOMAIN_COLORS[n.domain])
      mat.emissiveColor = Color3.FromHexString(DOMAIN_COLORS[n.domain]).scale(0.3)
      mat.specularColor = new Color3(0.12, 0.12, 0.12)
      mat.alpha = 0.94
      box.material = mat
      box.position = new Vector3(n.x, n.y, n.z)
      box.rotation = new Vector3(0, i % 2 === 0 ? 0.14 : -0.14, 0)
      box.metadata = { index: i }
      box.isPickable = true
      return box
    })

    const edgeLines: LinesMesh[] = EDGES.map(([a, b], idx) => {
      const line = MeshBuilder.CreateLines(
        `edge-${idx}`,
        { points: [nodeMeshes[a].position, nodeMeshes[b].position] },
        scene,
      )
      line.color = Color3.FromHexString('#22D3EE')
      line.alpha = 0
      return line
    })

    // keep edges glued to nodes while orbiting
    scene.onBeforeRenderObservable.add(() => {
      edgeLines.forEach((line, idx) => {
        const [a, b] = EDGES[idx]
        MeshBuilder.CreateLines(line.name, {
          points: [nodeMeshes[a].position, nodeMeshes[b].position],
          instance: line,
        })
      })
    })

    // scroll-driven reveal
    const revealEdges = () => {
      edgeLines.forEach((line) => {
        const start = 0.4
        const end = 0.78
        const p = Math.min(1, Math.max(0, (progressRef?.current ?? 1) - start) / (end - start))
        line.alpha = p * 0.42
      })
    }

    // build-up: nodes scale in, edges draw, then a freshness pulse glow
    scene.onBeforeRenderObservable.add(() => {
      const prog = progressRef?.current ?? 1
      const nodeWindow = 0.38
      nodeMeshes.forEach((mesh, i) => {
        const nodeP = Math.min(1, Math.max(0, (prog - i * 0.006) / nodeWindow))
        const s = 0.2 + nodeP * 0.8
        mesh.scaling = new Vector3(s, s, s)
      })
      if (prog > 0.4) revealEdges()
      if (prog > 0.8 && !reduceMotion) {
        const pulse = 0.5 + Math.sin(performance.now() * 0.004) * 0.5
        glow.intensity = 0.35 + pulse * 0.25
      } else {
        glow.intensity = 0.5
      }
    })

    // idle float
    let floatT = 0
    scene.onBeforeRenderObservable.add(() => {
      floatT += 0.008
      if (reduceMotion) return
      nodeMeshes.forEach((mesh, i) => {
        mesh.position.y = NODES[i].y + Math.sin(floatT * 0.6 + i * 1.3) * 0.12
      })
    })

    // hover picking → highlight + tooltip
    let hovered: Mesh | null = null
    const pickObserver = scene.onPointerObservable.add((evt) => {
      if (evt.type !== PointerEventTypes.POINTERMOVE && evt.type !== PointerEventTypes.POINTERUP) return
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => nodeMeshes.includes(m as Mesh))
      const picked = pick?.pickedMesh as Mesh | null
      if (hovered && hovered !== picked) highlight.removeMesh(hovered)
      if (picked && picked !== hovered) {
        highlight.addMesh(picked, Color3.FromHexString('#00D9FF'))
        const info: TooltipInfo = {
          label: NODES[picked.metadata.index as number].label,
          sub: NODES[picked.metadata.index as number].sub,
          domain: NODES[picked.metadata.index as number].domain,
          owner: NODES[picked.metadata.index as number].owner,
          tests: NODES[picked.metadata.index as number].tests,
          lastCommit: NODES[picked.metadata.index as number].lastCommit,
          x: evt.event.clientX,
          y: evt.event.clientY,
        }
        onHover?.(info)
      } else if (!picked) {
        onHover?.(null)
      }
      hovered = picked ?? null
    })

    const onPointerLeave = () => {
      if (hovered) highlight.removeMesh(hovered)
      hovered = null
      onHover?.(null)
    }
    container.addEventListener('pointerleave', onPointerLeave)

    let unobserve: (() => void) | undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          engine.runRenderLoop(() => scene.render())
          io.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    io.observe(container)
    unobserve = () => io.disconnect()

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      container.removeEventListener('pointerleave', onPointerLeave)
      scene.onPointerObservable.remove(pickObserver)
      unobserve?.()
      scene.dispose()
      engine.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-full w-full outline-none" aria-hidden />
    </div>
  )
}
