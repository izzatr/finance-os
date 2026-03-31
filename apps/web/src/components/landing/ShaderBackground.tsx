import { useEffect, useRef } from 'react'

const VERT_SRC = `
  attribute vec2 a_position;
  void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

const FRAG_SRC = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_resolution;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m; m = m*m;
    vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x_) - 0.5;
    vec3 ox = floor(x_ + 0.5);
    vec3 a0 = x_ - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;
    float t = u_time * 0.12;

    float n1 = snoise(uv * 1.8 + vec2(t * 0.3, t * 0.2));
    float n2 = snoise(uv * 3.0 + vec2(-t * 0.25, t * 0.35));
    float n3 = snoise(uv * 0.8 + vec2(t * 0.15, -t * 0.1));
    float n4 = snoise(uv * 5.0 + vec2(t * 0.4, t * 0.1));

    float blend = (n1 + n2 * 0.5 + n3 * 0.7 + n4 * 0.15) * 0.4 + 0.5;

    vec3 base     = vec3(0.957, 0.976, 0.988);
    vec3 ice      = vec3(0.776, 0.886, 0.961);
    vec3 iceLight = vec3(0.867, 0.933, 0.976);
    vec3 accent   = vec3(0.357, 0.643, 0.824);
    vec3 white    = vec3(1.0, 1.0, 1.0);

    vec3 color;
    if (blend < 0.3) {
      color = mix(base, iceLight, blend / 0.3);
    } else if (blend < 0.55) {
      color = mix(iceLight, ice, (blend - 0.3) / 0.25);
    } else if (blend < 0.8) {
      color = mix(ice, accent, (blend - 0.55) / 0.25 * 0.35);
    } else {
      color = mix(mix(ice, accent, 0.35), iceLight, (blend - 0.8) / 0.2);
    }

    float glow1 = smoothstep(0.7, 0.0, length(uv - vec2(0.3, 0.7)));
    float glow2 = smoothstep(0.8, 0.0, length(uv - vec2(0.75, 0.25)));
    color = mix(color, ice, glow1 * 0.15);
    color = mix(color, accent, glow2 * 0.06);
    color = mix(color, white, 0.35);

    gl_FragColor = vec4(color, 1.0);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

export function ShaderBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) return

    function resize() {
      const dpr = Math.min(window.devicePixelRatio, 1.5)
      canvas!.width = window.innerWidth * dpr * 0.5
      canvas!.height = window.innerHeight * dpr * 0.5
      gl!.viewport(0, 0, canvas!.width, canvas!.height)
    }

    window.addEventListener('resize', resize)

    const prog = gl.createProgram()!
    gl.attachShader(prog, createShader(gl, gl.VERTEX_SHADER, VERT_SRC))
    gl.attachShader(prog, createShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC))
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const pos = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes = gl.getUniformLocation(prog, 'u_resolution')

    resize()

    let raf: number
    function render(t: number) {
      gl!.uniform1f(uTime, t * 0.001)
      gl!.uniform2f(uRes, canvas!.width, canvas!.height)
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
