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
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import { Animation } from '@babylonjs/core/Animations/animation'
import { CubicEase, EasingFunction } from '@babylonjs/core/Animations/easing'
import '@babylonjs/core/Meshes/Builders/boxBuilder'
import '@babylonjs/core/Meshes/Builders/linesBuilder'
import '@babylonjs/core/Rendering/edgesRenderer'
import '@babylonjs/core/Animations/animatable'

/* ─────────────────────────────────────────────────────────────────────────
 * ArchitectureScene — the product, rendered.
 *
 * Six service nodes scatter at random positions (the state of an unmapped
 * repo), then animate into the same layered layout MapPreview draws in 2D
 * (the state after Onramp indexes it). Edges fade in once nodes land.
 * Reads --go / --mission from the active CSS theme so it never fights the
 * page's own palette across light/dark/forest/etc.
 * ───────────────────────────────────────────────────────────────────────── */

type Node = { label: string; sub: string; x: number; y: number; z: number }

const LAYOUT: Node[] = [
  { label: 'Web App', sub: 'Next.js', x: -3.2, y: 1.1, z: 0 },
  { label: 'API Gateway', sub: 'Node.js', x: -0.9, y: 1.5, z: 0 },
  { label: 'Auth Service', sub: 'Go', x: 1.6, y: 1.7, z: 0 },
  { label: 'User Service', sub: 'Python', x: 1.6, y: -0.4, z: 0 },
  { label: 'Billing', sub: 'Node.js', x: 1.6, y: -2.2, z: 0 },
  { label: 'Postgres', sub: 'Database', x: -0.9, y: -2.2, z: 0 },
]

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
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

export default function ArchitectureScene({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // StrictMode double-invokes effects in dev: mount → cleanup → mount, on
    // the same <canvas>. Disposing a Babylon Engine mid-init loses the GL
    // context before the real engine can claim it, freezing the render.
    // Deferring setup past that synchronous cycle means the phantom mount's
    // cleanup cancels the timer before any WebGL context is ever created.
    let cancelled = false
    let disposeScene: (() => void) | undefined
    const timer = window.setTimeout(() => {
      if (cancelled) return
      disposeScene = setup(canvas, container)
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      disposeScene?.()
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="h-full w-full outline-none" aria-hidden />
    </div>
  )
}

function setup(canvas: HTMLCanvasElement, container: HTMLDivElement): () => void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const engine = new Engine(canvas, true, { stencil: true, alpha: true })
    // Babylon sets canvas.tabIndex = engine.canvasTabIndex (default 1) when
    // input attaches; this canvas is decorative (aria-hidden) so keep it out
    // of the tab order at the engine level.
    engine.canvasTabIndex = -1
    canvas.tabIndex = -1
    const scene = new Scene(engine)
    scene.clearColor = new Color4(0, 0, 0, 0)

    const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2.15, 11, Vector3.Zero(), scene)
    camera.fov = 0.65
    camera.inputs.clear() // driven by pointer, not orbit drag

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0.3), scene)
    hemi.intensity = 0.55

    const goColor = readCssColor('--go-lit', '#17A34A')
    const missionColor = readCssColor('--mission-lit', '#2472C4')
    const inkColor = readCssColor('--ink-tertiary', '#6C716A')

    const point = new PointLight('point', new Vector3(0, 2, -4), scene)
    point.diffuse = goColor
    point.intensity = 0.6

    const glow = new GlowLayer('glow', scene)
    glow.intensity = 0.5

    const rand = seededRandom(42)
    const nodeMeshes = LAYOUT.map((_n, i) => {
      const box = MeshBuilder.CreateBox(`node-${i}`, { size: 0.55 }, scene)
      const mat = new StandardMaterial(`mat-${i}`, scene)
      const isAccent = i === 0 || i === 2
      mat.diffuseColor = isAccent ? goColor : inkColor
      mat.emissiveColor = (isAccent ? goColor : missionColor).scale(0.35)
      mat.specularColor = new Color3(0.1, 0.1, 0.1)
      mat.alpha = 0.92
      box.material = mat

      // chaos: scattered start position
      box.position = new Vector3(
        (rand() - 0.5) * 12,
        (rand() - 0.5) * 8,
        (rand() - 0.5) * 6,
      )
      box.rotation = new Vector3(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
      return box
    })

    const edgeLines: LinesMesh[] = []

    const settleEase = new CubicEase()
    settleEase.setEasingMode(EasingFunction.EASINGMODE_EASEOUT)

    const buildEdges = () => {
      EDGES.forEach(([a, b]) => {
        const line = MeshBuilder.CreateLines(
          `edge-${a}-${b}`,
          { points: [nodeMeshes[a].position, nodeMeshes[b].position] },
          scene,
        )
        line.color = missionColor
        line.alpha = 0
        edgeLines.push(line)
        Animation.CreateAndStartAnimation(
          `edge-in-${a}-${b}`,
          line,
          'alpha',
          30,
          20,
          0,
          0.45,
          Animation.ANIMATIONLOOPMODE_CONSTANT,
        )
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
          55,
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
          55,
          mesh.rotation,
          new Vector3(0, i % 2 === 0 ? 0.15 : -0.15, 0),
          Animation.ANIMATIONLOOPMODE_CONSTANT,
          settleEase,
        )
      })
    }

    // rebuild edges each frame to follow settling nodes, cheap for 5 lines
    scene.onBeforeRenderObservable.add(() => {
      edgeLines.forEach((line, idx) => {
        const [a, b] = EDGES[idx]
        const updated = MeshBuilder.CreateLines(
          line.name,
          { points: [nodeMeshes[a].position, nodeMeshes[b].position], instance: line },
        )
        void updated
      })
    })

    let unobserve: (() => void) | undefined
    const start = () => {
      if (reduceMotion) {
        nodeMeshes.forEach((mesh, i) => {
          const target = LAYOUT[i]
          mesh.position = new Vector3(target.x, target.y, target.z)
          mesh.rotation = new Vector3(0, 0, 0)
        })
        buildEdges()
        edgeLines.forEach((l) => (l.alpha = 0.45))
      } else {
        buildEdges()
        window.setTimeout(settle, 400)
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          start()
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(container)
    unobserve = () => io.disconnect()

    // subtle pointer-driven parallax on the camera
    let targetAlpha = -Math.PI / 2
    let targetBeta = Math.PI / 2.15
    const onPointerMove = (e: PointerEvent) => {
      if (reduceMotion) return
      const rect = container.getBoundingClientRect()
      const nx = (e.clientX - rect.left) / rect.width - 0.5
      const ny = (e.clientY - rect.top) / rect.height - 0.5
      targetAlpha = -Math.PI / 2 + nx * 0.5
      targetBeta = Math.PI / 2.15 + ny * 0.3
    }
    container.addEventListener('pointermove', onPointerMove)

    scene.onBeforeRenderObservable.add(() => {
      camera.alpha += (targetAlpha - camera.alpha) * 0.04
      camera.beta += (targetBeta - camera.beta) * 0.04
    })

    engine.runRenderLoop(() => scene.render())
    const onResize = () => engine.resize()
    window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
    container.removeEventListener('pointermove', onPointerMove)
    unobserve?.()
    scene.dispose()
    engine.dispose()
  }
}
