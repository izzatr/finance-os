import { useEffect, useRef } from 'react'
import { prepareWithSegments } from '@chenglou/pretext'

const FONT_SIZE = 14
const LINE_HEIGHT = 16
const PROP_FAMILY = "'Cormorant Garamond', Georgia, 'Times New Roman', serif"
const FIELD_OVERSAMPLE = 2
const PARTICLE_N = 100
const SPRITE_R = 14
const ATTRACTOR_R = 12
const LARGE_ATTRACTOR_R = 28
const ATTRACTOR_FORCE_1 = 0.2
const ATTRACTOR_FORCE_2 = 0.05
const FIELD_DECAY = 0.82
const CHARSET = ' .,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$'
const WEIGHTS = [300, 500] as const
const STYLES = ['normal', 'italic'] as const
const MONO_RAMP = ' .`-_:,;^=+/|)\\!?0oOQ#%@'

type FontStyleVariant = typeof STYLES[number]
type PaletteEntry = { char: string; weight: number; style: FontStyleVariant; font: string; width: number; brightness: number }

function estimateBrightness(ch: string, font: string, ctx: CanvasRenderingContext2D): number {
  const size = 28
  ctx.clearRect(0, 0, size, size)
  ctx.font = font
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(ch, 1, size / 2)
  const data = ctx.getImageData(0, 0, size, size).data
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i]!
  return sum / (255 * size * size)
}

function measureWidth(ch: string, font: string): number {
  const prepared = prepareWithSegments(ch, font)
  return prepared.widths.length > 0 ? prepared.widths[0]! : 0
}

export function AsciiArt({ cols = 60, rows = 20 }: { cols?: number; rows?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const TARGET_ROW_W = cols * 8
    const CANVAS_W = 220
    const CANVAS_H = Math.round(CANVAS_W * ((rows * LINE_HEIGHT) / TARGET_ROW_W))
    const FIELD_COLS = cols * FIELD_OVERSAMPLE
    const FIELD_ROWS = rows * FIELD_OVERSAMPLE
    const FIELD_SCALE_X = FIELD_COLS / CANVAS_W
    const FIELD_SCALE_Y = FIELD_ROWS / CANVAS_H

    // Build palette
    const bCanvas = document.createElement('canvas')
    bCanvas.width = 28
    bCanvas.height = 28
    const bCtx = bCanvas.getContext('2d', { willReadFrequently: true })!

    const palette: PaletteEntry[] = []
    for (const style of STYLES) {
      for (const weight of WEIGHTS) {
        const font = `${style === 'italic' ? 'italic ' : ''}${weight} ${FONT_SIZE}px ${PROP_FAMILY}`
        for (const ch of CHARSET) {
          if (ch === ' ') continue
          const width = measureWidth(ch, font)
          if (width <= 0) continue
          const brightness = estimateBrightness(ch, font, bCtx)
          palette.push({ char: ch, weight, style, font, width, brightness })
        }
      }
    }

    const maxBrightness = Math.max(...palette.map(e => e.brightness))
    if (maxBrightness > 0) {
      for (const entry of palette) entry.brightness /= maxBrightness
    }
    palette.sort((a, b) => a.brightness - b.brightness)
    const targetCellW = TARGET_ROW_W / cols

    function findBest(targetBrightness: number): PaletteEntry {
      let lo = 0, hi = palette.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (palette[mid]!.brightness < targetBrightness) lo = mid + 1
        else hi = mid
      }
      let bestScore = Infinity
      let best = palette[lo]!
      const start = Math.max(0, lo - 15)
      const end = Math.min(palette.length, lo + 15)
      for (let i = start; i < end; i++) {
        const entry = palette[i]!
        const bErr = Math.abs(entry.brightness - targetBrightness) * 2.5
        const wErr = Math.abs(entry.width - targetCellW) / targetCellW
        const score = bErr + wErr
        if (score < bestScore) { bestScore = score; best = entry }
      }
      return best
    }

    // Build brightness lookup
    type BEntry = { monoChar: string; propHtml: string }
    const brightnessLookup: BEntry[] = []
    for (let b = 0; b < 256; b++) {
      const br = b / 255
      const monoChar = MONO_RAMP[Math.min(MONO_RAMP.length - 1, (br * MONO_RAMP.length) | 0)]!
      if (br < 0.03) { brightnessLookup.push({ monoChar, propHtml: ' ' }); continue }
      const match = findBest(br)
      const alphaIdx = Math.max(1, Math.min(10, Math.round(br * 10)))
      const wCls = match.weight === 300 ? 'w3' : 'w5'
      const sCls = match.style === 'italic' ? ` it` : ''
      const esc = match.char === '<' ? '&lt;' : match.char === '>' ? '&gt;' : match.char === '&' ? '&amp;' : match.char
      brightnessLookup.push({ monoChar, propHtml: `<span class="${wCls}${sCls} a${alphaIdx}">${esc}</span>` })
    }

    // Init particles
    type Particle = { x: number; y: number; vx: number; vy: number }
    const particles: Particle[] = []
    for (let i = 0; i < PARTICLE_N; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * 40 + 20
      particles.push({
        x: CANVAS_W / 2 + Math.cos(angle) * radius,
        y: CANVAS_H / 2 + Math.sin(angle) * radius,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
      })
    }

    const brightnessField = new Float32Array(FIELD_COLS * FIELD_ROWS)

    function spriteAlphaAt(d: number): number {
      if (d >= 1) return 0
      if (d <= 0.35) return 0.45 + (0.15 - 0.45) * (d / 0.35)
      return 0.15 * (1 - (d - 0.35) / 0.65)
    }

    function createStamp(radiusPx: number) {
      const frx = radiusPx * FIELD_SCALE_X, fry = radiusPx * FIELD_SCALE_Y
      const rx = Math.ceil(frx), ry = Math.ceil(fry)
      const sx = rx * 2 + 1, sy = ry * 2 + 1
      const values = new Float32Array(sx * sy)
      for (let y = -ry; y <= ry; y++)
        for (let x = -rx; x <= rx; x++)
          values[(y + ry) * sx + x + rx] = spriteAlphaAt(Math.sqrt((x / frx) ** 2 + (y / fry) ** 2))
      return { rx, ry, sx, values }
    }

    function splat(cx: number, cy: number, stamp: ReturnType<typeof createStamp>) {
      const gx = Math.round(cx * FIELD_SCALE_X), gy = Math.round(cy * FIELD_SCALE_Y)
      for (let y = -stamp.ry; y <= stamp.ry; y++) {
        const gridY = gy + y
        if (gridY < 0 || gridY >= FIELD_ROWS) continue
        for (let x = -stamp.rx; x <= stamp.rx; x++) {
          const gridX = gx + x
          if (gridX < 0 || gridX >= FIELD_COLS) continue
          const v = stamp.values[(y + stamp.ry) * stamp.sx + x + stamp.rx]!
          if (v === 0) continue
          const idx = gridY * FIELD_COLS + gridX
          brightnessField[idx] = Math.min(1, brightnessField[idx]! + v)
        }
      }
    }

    const particleStamp = createStamp(SPRITE_R)
    const largeStamp = createStamp(LARGE_ATTRACTOR_R)
    const smallStamp = createStamp(ATTRACTOR_R)

    // Create row elements
    const propBox = container
    propBox.innerHTML = ''
    const rowEls: HTMLDivElement[] = []
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div')
      row.className = 'ascii-row'
      row.style.height = row.style.lineHeight = `${LINE_HEIGHT}px`
      propBox.appendChild(row)
      rowEls.push(row)
    }

    let raf: number
    function render(now: number) {
      const a1x = Math.cos(now * 0.0007) * CANVAS_W * 0.25 + CANVAS_W / 2
      const a1y = Math.sin(now * 0.0011) * CANVAS_H * 0.3 + CANVAS_H / 2
      const a2x = Math.cos(now * 0.0013 + Math.PI) * CANVAS_W * 0.2 + CANVAS_W / 2
      const a2y = Math.sin(now * 0.0009 + Math.PI) * CANVAS_H * 0.25 + CANVAS_H / 2

      for (const p of particles) {
        const d1x = a1x - p.x, d1y = a1y - p.y
        const d2x = a2x - p.x, d2y = a2y - p.y
        const dist1 = d1x * d1x + d1y * d1y
        const dist2 = d2x * d2x + d2y * d2y
        const ax = dist1 < dist2 ? d1x : d2x
        const ay = dist1 < dist2 ? d1y : d2y
        const dist = Math.sqrt(Math.min(dist1, dist2)) + 1
        const force = dist1 < dist2 ? ATTRACTOR_FORCE_1 : ATTRACTOR_FORCE_2
        p.vx += ax / dist * force + (Math.random() - 0.5) * 0.25
        p.vy += ay / dist * force + (Math.random() - 0.5) * 0.25
        p.vx *= 0.97; p.vy *= 0.97
        p.x += p.vx; p.y += p.vy
        if (p.x < -SPRITE_R) p.x += CANVAS_W + SPRITE_R * 2
        if (p.x > CANVAS_W + SPRITE_R) p.x -= CANVAS_W + SPRITE_R * 2
        if (p.y < -SPRITE_R) p.y += CANVAS_H + SPRITE_R * 2
        if (p.y > CANVAS_H + SPRITE_R) p.y -= CANVAS_H + SPRITE_R * 2
      }

      for (let i = 0; i < brightnessField.length; i++) brightnessField[i]! *= FIELD_DECAY
      for (const p of particles) splat(p.x, p.y, particleStamp)
      splat(a1x, a1y, largeStamp)
      splat(a2x, a2y, smallStamp)

      for (let row = 0; row < rows; row++) {
        let html = ''
        const fieldRowStart = row * FIELD_OVERSAMPLE * FIELD_COLS
        for (let col = 0; col < cols; col++) {
          let brightness = 0
          const fieldColStart = col * FIELD_OVERSAMPLE
          for (let sy = 0; sy < FIELD_OVERSAMPLE; sy++) {
            const off = fieldRowStart + sy * FIELD_COLS + fieldColStart
            for (let sx = 0; sx < FIELD_OVERSAMPLE; sx++) brightness += brightnessField[off + sx]!
          }
          const b = Math.min(255, ((brightness / (FIELD_OVERSAMPLE * FIELD_OVERSAMPLE)) * 255) | 0)
          html += brightnessLookup[b]!.propHtml
        }
        rowEls[row]!.innerHTML = html
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [cols, rows])

  return (
    <div
      ref={containerRef}
      className="ascii-art-container"
      style={{
        fontFamily: PROP_FAMILY,
        fontSize: `${FONT_SIZE}px`,
        lineHeight: `${LINE_HEIGHT}px`,
        whiteSpace: 'pre',
        letterSpacing: 0,
        color: '#5ba4d4',
      }}
    />
  )
}
