import type { ReactNode } from 'react'

interface SectionDividerProps {
  title: string
  /** Quiet context on the right, e.g. "4 wallets". */
  badge?: string
  /** A link or button on the right; wins over `badge`. */
  action?: ReactNode
  className?: string
}

/** Section title row: bold title left, quiet context or an action right. No rules, no eyebrows. */
export function SectionDivider({ title, badge, action, className = 'mb-3' }: SectionDividerProps) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <h2 className="text-[18px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
      {action ?? (badge && <span className="text-[13px] font-semibold text-[var(--text-tertiary)]">{badge}</span>)}
    </div>
  )
}
