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
import { Animation } from '@babylonjs/core/Animations/animation'
import { CubicEase, EasingFunction } from '@babylonjs/core/Animations/easing'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import '@babylonjs/core/Meshes/Builders/boxBuilder'
import '@babylonjs/core/Meshes/Builders/linesBuilder'

/* ─────────────────────────────────────────────────────────────────────────
 * HeroScene — chaos → clarity.
 *
 * Fourteen service nodes start scattered across a wide volume, tumbling with
 * random rotations and flat neutral colors (an unmapped repo). After a 2s
 * hold they settle into layered rows, recolored by domain, and dependency
 * edges draw in as glowing teal lines. The camera drifts with the pointer.
 * ───────────────────────────────────────────────────────────────────────── */

type Node = {
  label: string
  domain: 'client' | 'api' | 'core' | 'data'
  x: number
  y: number
  z: number
  size: number
}

const DOMAIN_COLORS: Record<Node['domain'], string> = {
  client: '#00D9FF',
  api: '#06B6D4',
  core: '#10B981',
  data: '#5A7D9A',
}

const LAYOUT: Node[] = [
  // client layer
  { label: 'Web App', domain: 'client', x: -6.4, y: 2.6, z: 0, size: 0.62 },
  { label: 'Mobile', domain: 'client', x: -6.4, y: 0.9, z: 0, size: 0.52 },
  { label: 'Admin', domain: 'client', x: -6.4, y: -0.8, z: 0, size: 0.5 },
  // api layer
  { label: 'API Gateway', domain: 'api', x: -2.2, y: 2.1, z: 0, size: 0.62 },
  { label: 'Auth', domain: 'api', x: -2.2, y: 0.4, z: 0, size: 0.58 },
  { label: 'Webhooks', domain: 'api', x: -2.2, y: -1.3, z: 0, size: 0.5 },
  // core layer
  { label: 'Billing', domain: 'core', x: 2.2, y: 2.6, z: 0, size: 0.58 },
  { label: 'User Svc', domain: 'core', x: 2.2, y: 1.0, z: 0, size: 0.58 },
  { label: 'Search', domain: 'core', x: 2.2, y: -0.6, z: 0, size: 0.54 },
  { label: 'Notify', domain: 'core', x: 2.2, y: -2.0, z: 0, size: 0.5 },
  // data layer
  { label: 'Postgres', domain: 'data', x: 6.4, y: 1.8, z: 0, size: 0.66 },
  { label: 'Redis', domain: 'data', x: 6.4, y: 0.2, z: 0, size: 0.56 },
  { label: 'Queue', domain: 'data', x: 6.4, y: -1.4, z: 0, size: 0.56 },
]

const EDGES: [number, number][] = [
  [0, 3], [1, 3], [2, 3], [3, 4], [3, 5],
  [4, 7], [5, 8], [3, 6],
  [6, 10], [7, 10], [8, 10], [6, 11], [8, 11],
  [4, 11], [5, 12], [7, 12], [9, 12],
]

function readCssColor(varName: string, fallback: string): Color3 {
  if (typeof window === 'undefined') return Color3.FromHexString(fallback)
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  try {
    return raw ? Color3.FromHexString(raw) : Color3.FromHexString(fallback)
  } catch {
    return Color3.FromHexString(fallback)
  }
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

export default function HeroScene({ className }: { className?: string }) {
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

    const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.25, 17, Vector3.Zero(), scene)
    camera.fov = 0.62
    camera.inputs.clear()

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0.35), scene)
    hemi.intensity = 0.5

    const point = new PointLight('point', new Vector3(2, 3, -6), scene)
    point.intensity = 0.75

    const glow = new GlowLayer('glow', scene)
    glow.intensity = 0.55

    const rand = seededRandom(1337)
    const nodeMeshes: Mesh[] = LAYOUT.map((n, i) => {
      const box = MeshBuilder.CreateBox(`node-${i}`, { size: n.size }, scene)
      const mat = new StandardMaterial(`mat-${i}`, scene)
      mat.diffuseColor = Color3.FromHexString(DOMAIN_COLORS[n.domain])
      mat.emissiveColor = Color3.FromHexString(DOMAIN_COLORS[n.domain]).scale(0.28)
      mat.specularColor = new Color3(0.12, 0.12, 0.12)
      mat.alpha = 0.94
      box.material = mat
      // chaos start
      box.position = new Vector3(
        (rand() - 0.5) * 22,
        (rand() - 0.5) * 12,
        (rand() - 0.5) * 8,
      )
      box.rotation = new Vector3(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
      return box
    })

    const edgeLines: LinesMesh[] = []
    const settleEase = new CubicEase()
    settleEase.setEasingMode(EasingFunction.EASINGMODE_EASEOUT)

    const buildEdges = () => {
      EDGES.forEach(([a, b], idx) => {
        const line = MeshBuilder.CreateLines(
          `edge-${idx}`,
          { points: [nodeMeshes[a].position, nodeMeshes[b].position] },
          scene,
        )
        line.color = readCssColor('--mission-lit', '#22D3EE')
        line.alpha = 0
        edgeLines.push(line)
      })
    }

    const settle = () => {
      nodeMeshes.forEach((mesh, i) => {
        const target = LAYOUT[i]
        Animation.CreateAndStartAnimation(
          `settle-pos-${i}`,
          mesh,
          'position',
          30,
          70,
          mesh.position,
          new Vector3(target.x, target.y, target.z),
          Animation.ANIMATIONLOOPMODE_CONSTANT,
          settleEase,
        )
        Animation.CreateAndStartAnimation(
          `settle-rot-${i}`,
          mesh,
          'rotation',
          30,
          70,
          mesh.rotation,
          new Vector3(0, i % 2 === 0 ? 0.12 : -0.12, 0),
          Animation.ANIMATIONLOOPMODE_CONSTANT,
          settleEase,
        )
      })
    }

    // keep edges glued to nodes (cheap, 17 lines)
    scene.onBeforeRenderObservable.add(() => {
      edgeLines.forEach((line, idx) => {
        const [a, b] = EDGES[idx]
        MeshBuilder.CreateLines(line.name, {
          points: [nodeMeshes[a].position, nodeMeshes[b].position],
          instance: line,
        })
      })
    })

    // chaos: erratic tumble until settle
    const chaosUntil = reduceMotion ? 0 : performance.now() + 2200
    let settled = reduceMotion
    if (reduceMotion) {
      nodeMeshes.forEach((mesh, i) => {
        const target = LAYOUT[i]
        mesh.position = new Vector3(target.x, target.y, target.z)
        mesh.rotation = new Vector3(0, 0, 0)
      })
    }
    scene.onBeforeRenderObservable.add(() => {
      if (!settled && performance.now() > chaosUntil) {
        settled = true
        buildEdges()
        window.setTimeout(settle, 50)
        return
      }
      if (!settled) {
        nodeMeshes.forEach((mesh) => {
          mesh.position.y += Math.sin(performance.now() * 0.003 + mesh.position.x) * 0.012
          mesh.rotation.x += 0.008
          mesh.rotation.y += 0.006
        })
      }
    })

    // edges fade in once nodes land
    let edgeTimer: ReturnType<typeof setTimeout> | undefined
    const fadeEdges = () => {
      edgeLines.forEach((l) => {
        Animation.CreateAndStartAnimation(
          `edge-in-${l.name}`,
          l,
          'alpha',
          30,
          30,
          0,
          0.42,
          Animation.ANIMATIONLOOPMODE_CONSTANT,
        )
      })
    }

    let startEdgeFade = false
    scene.onBeforeRenderObservable.add(() => {
      if (settled && !startEdgeFade) {
        startEdgeFade = true
        edgeTimer = setTimeout(fadeEdges, 1100)
      }
    })

    // pointer parallax on camera
    let targetAlpha = -Math.PI / 2
    let targetBeta = Math.PI / 2.25
    const onPointerMove = (e: PointerEvent) => {
      if (reduceMotion) return
      const rect = container.getBoundingClientRect()
      const nx = (e.clientX - rect.left) / rect.width - 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5
      targetAlpha = -Math.PI / 2 + nx * 0.55
      targetBeta = Math.PI / 2.25 + ny * 0.28
    }
    container.addEventListener('pointermove', onPointerMove)

    scene.onBeforeRenderObservable.add(() => {
      camera.alpha += (targetAlpha - camera.alpha) * 0.045
      camera.beta += (targetBeta - camera.beta) * 0.045
    })

    let unobserve: (() => void) | undefined
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          engine.runRenderLoop(() => scene.render())
          io.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    io.observe(container)
    unobserve = () => io.disconnect()

    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      container.removeEventListener('pointermove', onPointerMove)
      unobserve?.()
      if (edgeTimer) clearTimeout(edgeTimer)
      scene.dispose()
      engine.dispose()
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-full w-full outline-none" aria-hidden />
    </div>
  )
}
