import { useEffect, useRef, useState } from 'react'

interface TerminalLine {
  text: string
  className?: string
}

interface TerminalMockupProps {
  tab?: string
  lines: TerminalLine[]
  animate?: boolean
}

export function TerminalMockup({ tab, lines, animate = true }: TerminalMockupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!animate)

  useEffect(() => {
    if (!animate || !ref.current) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [animate])

  return (
    <div ref={ref} className="terminal-mockup">
      <div className="terminal-mockup-header">
        <div className="terminal-mockup-dots">
          <span className="dot-red" />
          <span className="dot-yellow" />
          <span className="dot-green" />
        </div>
        {tab && <span className="terminal-mockup-tab">{tab}</span>}
      </div>
      <div className="terminal-mockup-body">
        {lines.map((line, i) => (
          <span
            key={i}
            className={`terminal-mockup-line ${visible ? 'visible' : ''}`}
            style={visible && animate ? { animationDelay: `${i * 0.15}s` } : undefined}
            dangerouslySetInnerHTML={{ __html: line.text || '&nbsp;' }}
          />
        ))}
      </div>
    </div>
  )
}
