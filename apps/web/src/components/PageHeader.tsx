import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  /** Primary page action on the right (e.g. "New wallet"). */
  action?: ReactNode
  className?: string
}

/** Standard page title: bold, left-aligned, one optional line of context and one action. */
export function PageHeader({ title, description, action, className = 'mb-6' }: PageHeaderProps) {
  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>
        {description && <p className="mt-1 text-[14px] text-[var(--text-secondary)]">{description}</p>}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </header>
  )
}
