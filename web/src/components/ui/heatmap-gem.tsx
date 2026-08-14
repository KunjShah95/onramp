import { useEffect, useRef, useState } from 'react'
import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { PointLight } from '@babylonjs/core/Lights/pointLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Effect } from '@babylonjs/core/Materials/effect'
import { Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import '@babylonjs/core/Meshes/Builders/icoSphereBuilder'

interface HeatmapGemProps {
  size?: number
  autoRotate?: boolean
}

export default function HeatmapGem({ size = 300, autoRotate = true }: HeatmapGemProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    try {
      // Check WebGL availability
      const testCanvas = document.createElement('canvas')
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('webgl2')
      if (!gl) {
        console.warn('WebGL not available, gem will not render')
        setIsError(true)
        return
      }

      // Create engine with error handling
      const canvas = document.createElement('canvas')
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.display = 'block'
      containerRef.current.appendChild(canvas)

      let engine: Engine
      try {
        engine = new Engine(canvas, true, {
          stencil: true
        })
        // Babylon applies engine.canvasTabIndex (default 1) to the canvas on
        // input attach; keep this decorative gem out of the tab order.
        engine.canvasTabIndex = -1
      } catch (e) {
        console.error('Babylon engine creation failed:', e)
        canvas.remove()
        setIsError(true)
        return
      }

      // Create scene
      const scene = new Scene(engine)
      scene.clearColor = new Color4(0, 0, 0, 0)

      // Camera
      const camera = new ArcRotateCamera(
        'camera',
        Math.PI / 4,
        Math.PI / 2.5,
        350,
        Vector3.Zero(),
        scene
      )
      camera.attachControl(containerRef.current, true)
      // attachControl sets canvas.tabIndex = 1 for keyboard input; the gem is
      // decorative and pointer-drag only, so pull it out of the tab order.
      canvas.tabIndex = -1
      camera.inertia = 0.7
      camera.angularSensibilityX = 1000
      camera.angularSensibilityY = 1000

      // Lights
      const light1 = new PointLight('light1', new Vector3(50, 50, 50), scene)
      light1.intensity = 1.2
      light1.range = 500

      const light2 = new PointLight('light2', new Vector3(-50, -50, 30), scene)
      light2.intensity = 0.8
      light2.range = 500

      const ambientLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene)
      ambientLight.intensity = 0.5

      // Gem
      const gem = MeshBuilder.CreateIcoSphere('gem', { radius: 60, subdivisions: 4 }, scene)

      // Shaders
      Effect.ShadersStore['heatmapVertexShader'] = `
        precision highp float;
        attribute vec3 position;
        attribute vec3 normal;
        uniform mat4 worldViewProjection;
        uniform mat4 world;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vPosition = position;
          vNormal = normalize(normal);
          gl_Position = worldViewProjection * vec4(position, 1.0);
          vWorldPos = vec3(world * vec4(position, 1.0));
        }
      `

      Effect.ShadersStore['heatmapFragmentShader'] = `
        precision highp float;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vWorldPos;

        vec3 heatmap(float t) {
          if (t < 0.25) {
            return mix(vec3(0.0, 0.0, 0.8), vec3(0.0, 0.8, 1.0), t * 4.0);
          } else if (t < 0.5) {
            return mix(vec3(0.0, 0.8, 1.0), vec3(0.0, 1.0, 0.0), (t - 0.25) * 4.0);
          } else if (t < 0.75) {
            return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (t - 0.5) * 4.0);
          } else {
            return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.2, 0.0), (t - 0.75) * 4.0);
          }
        }

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(-vWorldPos);
          float t = (vPosition.y / 120.0 + 1.0) * 0.5;
          t += 0.1 * (normal.x + normal.z);
          t = clamp(t, 0.0, 1.0);
          vec3 baseColor = heatmap(t);
          float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
          vec3 glowColor = mix(baseColor, vec3(1.0), fresnel * 0.4);
          vec3 lightPos = vec3(50.0, 50.0, 50.0);
          vec3 lightDir = normalize(lightPos - vWorldPos);
          float diffuse = max(dot(normal, lightDir), 0.0);
          vec3 finalColor = glowColor * (0.6 + diffuse * 0.6);
          gl_FragColor = vec4(finalColor, 0.95);
        }
      `

      const customMat = new ShaderMaterial(
        'heatmap',
        scene,
        {
          // Babylon resolves store keys as `<name>VertexShader` /
          // `<name>FragmentShader`, so the base name must be 'heatmap' to
          // match the Effect.ShadersStore registrations above.
          vertex: 'heatmap',
          fragment: 'heatmap',
        },
        {
          attributes: ['position', 'normal'],
          uniforms: ['worldViewProjection', 'world', 'time'],
        }
      )

      gem.material = customMat

      // Animation
      let rotationSpeed = 0.003
      scene.registerBeforeRender(() => {
        if (autoRotate) {
          gem.rotation.y += rotationSpeed
          gem.rotation.x += rotationSpeed * 0.3
        }
      })

      // Resize handler
      const handleResize = () => {
        engine.resize()
      }
      window.addEventListener('resize', handleResize)

      // Render loop
      engine.runRenderLoop(() => {
        scene.render()
      })

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize)
        scene.dispose()
        engine.dispose()
        canvas.remove()
      }
    } catch (err) {
      console.error('HeatmapGem error:', err)
      setIsError(true)
    }
  }, [autoRotate])

  if (isError) {
    return (
      <div
        ref={containerRef}
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, rgba(0,0,139,0.3) 0%, rgba(255,69,0,0.3) 100%)',
          borderRadius: '50%',
          backdropFilter: 'blur(8px)',
        }}
      />
    )
  }

  return <div ref={containerRef} style={{ width: size, height: size, background: 'transparent' }} />
}
