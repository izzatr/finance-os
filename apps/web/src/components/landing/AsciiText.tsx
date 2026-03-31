import { useEffect, useRef } from 'react'

const FONT_SIZE = 12
const LINE_HEIGHT = 14
const FONT_FAMILY = "'Cormorant Garamond', Georgia, serif"
const CHARSET = '.,:;!+-=*#@%&abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$'
const RAMP = ' .`\'-_:,;^=+/|)\\!?0oOQ#%@'

interface AsciiTextProps {
  text: string
  fontSize?: number
  cols?: number
  rows?: number
  color?: string
  animate?: boolean
}

export function AsciiText({
  text,
  fontSize = 72,
  cols = 60,
  rows = 16,
  color = '#5ba4d4',
  animate = true,
}: AsciiTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Render text at high resolution, then downsample to ASCII grid
    const SCALE = 8
    const hiResW = cols * SCALE
    const hiResH = rows * SCALE
    const renderCanvas = document.createElement('canvas')
    renderCanvas.width = hiResW
    renderCanvas.height = hiResH
    const rCtx = renderCanvas.getContext('2d')!

    rCtx.fillStyle = '#000'
    rCtx.fillRect(0, 0, hiResW, hiResH)
    rCtx.fillStyle = '#fff'
    rCtx.font = `italic 500 ${fontSize}px ${FONT_FAMILY}`
    rCtx.textBaseline = 'top'

    // Scale font to fit the high-res canvas
    const metrics = rCtx.measureText(text)
    const targetW = hiResW * 0.9
    const scaledFontSize = Math.min(fontSize, fontSize * (targetW / metrics.width))
    rCtx.clearRect(0, 0, hiResW, hiResH)
    rCtx.fillStyle = '#000'
    rCtx.fillRect(0, 0, hiResW, hiResH)
    rCtx.fillStyle = '#fff'
    rCtx.font = `italic 500 ${scaledFontSize}px ${FONT_FAMILY}`
    const scaledMetrics = rCtx.measureText(text)
    const x = (hiResW - scaledMetrics.width) / 2
    const y = (hiResH - scaledFontSize * 0.85) / 2
    rCtx.fillText(text, x, y)

    const imageData = rCtx.getImageData(0, 0, hiResW, hiResH)
    const pixels = imageData.data

    // Downsample: average brightness per ASCII cell
    const grid: number[][] = []
    for (let row = 0; row < rows; row++) {
      const rowData: number[] = []
      for (let col = 0; col < cols; col++) {
        let sum = 0
        const startY = row * SCALE
        const startX = col * SCALE
        for (let sy = 0; sy < SCALE; sy++) {
          for (let sx = 0; sx < SCALE; sx++) {
            const px = ((startY + sy) * hiResW + (startX + sx)) * 4
            sum += pixels[px]! / 255
          }
        }
        rowData.push(sum / (SCALE * SCALE))
      }
      grid.push(rowData)
    }

    // Build character palette with brightness estimation
    const bCanvas = document.createElement('canvas')
    bCanvas.width = 20
    bCanvas.height = 20
    const bCtx = bCanvas.getContext('2d', { willReadFrequently: true })!

    type CharEntry = { char: string; brightness: number; weight: number; italic: boolean }
    const charPalette: CharEntry[] = []

    for (const weight of [300, 500]) {
      for (const italic of [false, true]) {
        const font = `${italic ? 'italic ' : ''}${weight} ${FONT_SIZE}px ${FONT_FAMILY}`
        for (const ch of CHARSET) {
          bCtx.clearRect(0, 0, 20, 20)
          bCtx.font = font
          bCtx.fillStyle = '#fff'
          bCtx.textBaseline = 'middle'
          bCtx.fillText(ch, 2, 10)
          const data = bCtx.getImageData(0, 0, 20, 20).data
          let sum = 0
          for (let i = 3; i < data.length; i += 4) sum += data[i]!
          const brightness = sum / (255 * 400)
          if (brightness > 0.01) {
            charPalette.push({ char: ch, brightness, weight, italic })
          }
        }
      }
    }

    const maxB = Math.max(...charPalette.map(e => e.brightness))
    if (maxB > 0) for (const e of charPalette) e.brightness /= maxB
    charPalette.sort((a, b) => a.brightness - b.brightness)

    function findChar(targetBrightness: number): CharEntry {
      let lo = 0, hi = charPalette.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (charPalette[mid]!.brightness < targetBrightness) lo = mid + 1
        else hi = mid
      }
      return charPalette[Math.min(lo, charPalette.length - 1)]!
    }

    function esc(ch: string) {
      if (ch === '<') return '&lt;'
      if (ch === '>') return '&gt;'
      if (ch === '&') return '&amp;'
      return ch
    }

    // Create row elements
    container.innerHTML = ''
    const rowEls: HTMLDivElement[] = []
    for (let r = 0; r < rows; r++) {
      const el = document.createElement('div')
      el.className = 'ascii-row'
      el.style.height = el.style.lineHeight = `${LINE_HEIGHT}px`
      container.appendChild(el)
      rowEls.push(el)
    }

    // Animation state
    let phase = 0
    let raf: number

    function render() {
      phase += 0.015

      for (let row = 0; row < rows; row++) {
        let html = ''
        for (let col = 0; col < cols; col++) {
          const baseBrightness = grid[row]![col]!

          if (baseBrightness < 0.05) {
            // Background: subtle animated noise
            if (animate) {
              const noise = Math.sin(col * 0.3 + row * 0.5 + phase * 2) * 0.5 + 0.5
              const shimmer = noise * 0.08
              if (shimmer > 0.03) {
                const entry = findChar(shimmer)
                const alphaIdx = Math.max(1, Math.min(3, Math.round(shimmer * 30)))
                const wCls = entry.weight === 300 ? 'w3' : 'w5'
                const iCls = entry.italic ? ' it' : ''
                html += `<span class="${wCls}${iCls} a${alphaIdx}">${esc(entry.char)}</span>`
              } else {
                html += ' '
              }
            } else {
              html += ' '
            }
          } else {
            // Text area: use brightness with optional shimmer
            let brightness = baseBrightness
            if (animate) {
              const wave = Math.sin(col * 0.15 + row * 0.2 + phase) * 0.1
              brightness = Math.max(0, Math.min(1, brightness + wave))
            }
            const entry = findChar(brightness)
            const alphaIdx = Math.max(1, Math.min(10, Math.round(brightness * 10)))
            const wCls = entry.weight === 300 ? 'w3' : 'w5'
            const iCls = entry.italic ? ' it' : ''
            html += `<span class="${wCls}${iCls} a${alphaIdx}">${esc(entry.char)}</span>`
          }
        }
        rowEls[row]!.innerHTML = html
      }

      if (animate) {
        raf = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [text, fontSize, cols, rows, animate])

  return (
    <div
      ref={containerRef}
      className="ascii-art-container"
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: `${FONT_SIZE}px`,
        lineHeight: `${LINE_HEIGHT}px`,
        whiteSpace: 'pre',
        letterSpacing: 0,
        color,
        overflow: 'hidden',
      }}
    />
  )
}
