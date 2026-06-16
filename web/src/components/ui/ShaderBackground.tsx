import { useEffect, useRef } from 'react'

export default function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function syncSize() {
      if (!canvas) return
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }
    
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncSize)
      observer.observe(canvas)
    }
    syncSize()

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null
    if (!gl) return

    const vs = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`
    const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
varying vec2 v_texCoord;

void main() {
    vec2 uv = v_texCoord;
    vec2 mouse = u_mouse / u_resolution;
    
    // Core brand color: #FF8C00 -> vec3(1.0, 0.55, 0.0)
    vec3 accent = vec3(1.0, 0.55, 0.0);
    vec3 voidBg = vec3(0.02, 0.03, 0.06); // bg-void #050810 approx
    
    // Subtle noise/motion for the "Spotlight" effect
    float dist = distance(uv, vec2(0.5, 0.8) + vec2(sin(u_time * 0.2), cos(u_time * 0.3)) * 0.1);
    float glow = 0.04 / (dist + 0.4);
    
    // Mouse following glow
    float mouseDist = distance(uv, mouse);
    float mouseGlow = 0.02 / (mouseDist + 0.3);
    
    vec3 color = mix(voidBg, accent, glow * 0.15 + mouseGlow * 0.1);
    
    // Subtle scanline pattern for engineering aesthetic
    float scanline = sin(uv.y * 800.0) * 0.015;
    color -= scanline;

    gl_FragColor = vec4(color, 1.0);
}`
    
    function cs(type: number, src: string) {
      if (!gl) return null
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }

    const prog = gl.createProgram()
    if (!prog) return
    const vShader = cs(gl.VERTEX_SHADER, vs)
    const fShader = cs(gl.FRAGMENT_SHADER, fs)
    if (!vShader || !fShader) return
    
    gl.attachShader(prog, vShader)
    gl.attachShader(prog, fShader)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    
    const pos = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes = gl.getUniformLocation(prog, 'u_resolution')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')

    let mouse = { x: canvas.width / 2, y: canvas.height / 2 }
    
    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width && rect.height) {
        const nx = (event.clientX - rect.left) / rect.width
        const ny = 1.0 - (event.clientY - rect.top) / rect.height
        mouse.x = nx * canvas.width
        mouse.y = ny * canvas.height
      }
    }
    window.addEventListener('mousemove', onMouseMove)

    let animationFrameId: number
    const start = performance.now()

    function render() {
      if (!gl || !canvas) return
      const t = performance.now() - start
      
      // We check ResizeObserver, but just in case syncSize isn't called:
      if (typeof ResizeObserver === 'undefined') syncSize()
      
      gl.viewport(0, 0, canvas.width, canvas.height)
      if (uTime) gl.uniform1f(uTime, t * 0.001)
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height)
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y)
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animationFrameId = requestAnimationFrame(render)
    }
    
    render()

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(animationFrameId)
      if (observer) {
        observer.disconnect()
      }
    }
  }, [])

  return (
    <div className="absolute inset-0 w-full h-full z-0 opacity-40" style={{ display: 'block' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  )
}
