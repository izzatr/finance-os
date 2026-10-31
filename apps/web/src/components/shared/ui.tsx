import type { ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { Money } from '@/lib/api'
import { formatAmount } from '@/lib/split'

/** Round initial avatar for a person or group. */
export function Avatar({ name, size = 40, tone = 'tint' }: { name: string; size?: number; tone?: 'tint' | 'ink' }) {
  const letter = name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
        tone === 'ink' ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-[var(--tint)] text-[var(--ink)]'
      }`}
    >
      {letter}
    </span>
  )
}

/**
 * "owes you €40.00" lines for a friend (positive = they owe me), or "settled up". In lists
 * (`compact`), several currencies collapse into one converted net line plus a count.
 */
export function FriendBalance({ balances, align = 'right', compact, total }: {
  balances: Money[]
  align?: 'left' | 'right'
  compact?: boolean
  total?: { currency: string; net: number | string } | null
}) {
  if (balances.length === 0) return <span className="text-[13px] text-[var(--text-tertiary)]">settled up</span>
  if (compact && balances.length > 1) {
    const net = total ? Number(total.net) : null
    const owesMe = net !== null ? net >= 0 : balances.every((b) => Number(b.amount) > 0)
    return (
      <span className={`flex flex-col ${align === 'right' ? 'items-end text-right' : ''}`}>
        <span className="whitespace-nowrap text-[13px] leading-snug">
          <span className="text-[var(--text-tertiary)]">{owesMe ? 'owes you ' : 'you owe '}</span>
          {net !== null && (
            <span className={`tabular font-bold ${owesMe ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              ≈{formatAmount(Math.abs(net), total!.currency)}
            </span>
          )}
        </span>
        <span className="text-[12px] text-[var(--text-tertiary)]">in {balances.length} currencies</span>
      </span>
    )
  }
  return (
    <span className={`flex flex-col ${align === 'right' ? 'items-end text-right' : ''}`}>
      {balances.map((b) => {
        const owesMe = Number(b.amount) > 0
        return (
          <span key={b.currency} className="whitespace-nowrap text-[13px] leading-snug">
            <span className="text-[var(--text-tertiary)]">{owesMe ? 'owes you ' : 'you owe '}</span>
            <span className={`tabular font-bold ${owesMe ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {formatAmount(Math.abs(Number(b.amount)), b.currency)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** "you are owed €40.00" / "you owe €12.00" for my balance in a group. */
export function MyBalance({ balances, align = 'right' }: { balances: Money[]; align?: 'left' | 'right' }) {
  if (balances.length === 0) return <span className="text-[13px] text-[var(--text-tertiary)]">settled up</span>
  return (
    <span className={`flex flex-col ${align === 'right' ? 'items-end text-right' : ''}`}>
      {balances.map((b) => {
        const owed = Number(b.amount) > 0
        return (
          <span key={b.currency} className="whitespace-nowrap text-[13px] leading-snug">
            <span className="text-[var(--text-tertiary)]">{owed ? 'you are owed ' : 'you owe '}</span>
            <span className={`tabular font-bold ${owed ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {formatAmount(Math.abs(Number(b.amount)), b.currency)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: Array<{ value: T; label: ReactNode; ariaLabel?: string }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full bg-[var(--tint)] p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
          className={`h-9 min-w-0 flex-1 rounded-full px-2 text-[13px] font-semibold transition-colors ${
            value === o.value ? 'bg-[var(--ink)] text-[var(--cream)]' : 'text-[var(--text-secondary)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[var(--text-primary)]">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-[var(--text-tertiary)]">{description}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" aria-label={label} />
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ink)] ${checked ? 'bg-[var(--ink)]' : 'bg-[var(--tint-strong)]'}`}
      >
        <span className={`absolute top-1 size-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
    </label>
  )
}

export const fieldClass =
  'h-11 w-full min-w-0 rounded-lg border border-[var(--border-medium)] bg-white px-3 text-[15px] text-[var(--text-primary)] outline-none focus-visible:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/15'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-[var(--text-tertiary)]">{hint}</span>}
    </label>
  )
}

export const primaryButton =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-[15px] font-bold text-[var(--cream)] transition-opacity active:opacity-90 disabled:bg-[var(--tint-strong)] disabled:text-[var(--text-tertiary)]'
export const secondaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--tint)] px-4 text-[14px] font-semibold text-[var(--text-primary)] transition-colors active:bg-[var(--tint-strong)] disabled:opacity-50'
export const dangerButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--negative)_10%,white)] px-4 text-[14px] font-semibold text-[var(--negative)] disabled:opacity-50'

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p role="alert" className="text-[13px] font-medium text-[var(--negative)]">{children}</p>
}

/**
 * Full-screen sheet on phones, a centred panel on desktop. Header with back/close, a scrolling
 * body and a pinned footer so Save never hides behind the keyboard or a short viewport.
 */
export function FullSheet({ open, onClose, title, description, onBack, footer, children, headerAction }: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** When set, the leading button goes back (a sub-view) instead of closing. */
  onBack?: () => void
  footer?: ReactNode
  headerAction?: ReactNode
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        scrollable={false}
        // The primitive positions side="bottom" sheets with data-[side=bottom] rules, which outrank
        // plain utilities; every override here uses the same variant so it actually applies.
        // Phones: full screen. Desktop (sm+): a centred 520px panel, fully on screen.
        className="flex min-h-0 flex-col gap-0 overflow-hidden border-0 bg-white p-0 data-[side=bottom]:inset-x-0 data-[side=bottom]:top-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-[100dvh] data-[side=bottom]:max-h-[100dvh] data-[side=bottom]:w-full data-[side=bottom]:border-t-0 sm:data-[side=bottom]:left-[max(1rem,calc(50%-260px))] sm:data-[side=bottom]:right-auto sm:data-[side=bottom]:top-[max(1rem,5dvh)] sm:data-[side=bottom]:bottom-auto sm:data-[side=bottom]:h-auto sm:data-[side=bottom]:max-h-[calc(100dvh-max(1rem,5dvh)-1rem)] sm:data-[side=bottom]:w-[min(520px,calc(100vw-2rem))] sm:data-[side=bottom]:rounded-lg sm:data-[side=bottom]:shadow-xl"
      >
        <div className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] lg:pt-2">
          <button
            type="button"
            onClick={onBack ?? onClose}
            aria-label={onBack ? 'Back' : 'Close'}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--text-primary)] active:bg-[var(--tint)]"
          >
            {onBack ? <ChevronLeft className="size-6" /> : <X className="size-5" />}
          </button>
          <SheetTitle className="min-w-0 flex-1 truncate text-[17px] font-bold text-[var(--text-primary)]">{title}</SheetTitle>
          {description && <SheetDescription className="sr-only">{description}</SheetDescription>}
          {headerAction ?? <span className="size-11 shrink-0" />}
        </div>
        <div data-slot="sheet-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)] lg:px-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-[var(--border-subtle)] bg-white px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 lg:px-5">{footer}</div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg bg-[var(--tint)] px-5 py-6 text-center">
      <p className="text-[15px] font-bold text-[var(--text-primary)]">{title}</p>
      {children && <div className="mt-1 text-[13.5px] text-[var(--text-secondary)]">{children}</div>}
    </div>
  )
}
