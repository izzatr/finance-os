import { useState, type ReactNode } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { CalendarDays } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/** Local calendar key YYYY-MM-DD for a Date (never via UTC, so the day never shifts). */
export function keyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local-midnight Date for a calendar key, only used to drive the calendar grid. */
export function dateFromKey(key: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

function shiftKey(key: string, days: number): string {
  const d = dateFromKey(key)!
  d.setDate(d.getDate() + days)
  return keyFromDate(d)
}

/** "Today", "Yesterday", "Tomorrow", else "Sat, 4 Oct 2026". */
export function readableDate(key: string, now: Date = new Date()): string {
  const today = keyFromDate(now)
  if (key === today) return 'Today'
  if (key === shiftKey(today, -1)) return 'Yesterday'
  if (key === shiftKey(today, 1)) return 'Tomorrow'
  const d = dateFromKey(key)
  if (!d) return 'Pick a date'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/^(\w+) /, '$1, ')
}

/**
 * True on phones (narrow or touch-first); decides bottom sheet vs popover at open time, so it
 * needs no listener.
 */
function prefersSheet(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(max-width: 767px)').matches
}

const triggerBase =
  'flex h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-[var(--border-medium)] bg-white px-3 text-left text-[15px] text-[var(--text-primary)] outline-none focus-visible:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/15 disabled:opacity-50'
const chip = 'h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors'

type DatePickerProps = {
  /** Calendar day as YYYY-MM-DD (the app stores it at 12:00 UTC; this component never converts). */
  value: string
  onChange: (key: string) => void
  'aria-label': string
  className?: string
  /** Custom trigger content (e.g. QuickAdd's pill). */
  trigger?: ReactNode
  disabled?: boolean
}

function Panel({ value, onPick }: { value: string; onPick: (key: string) => void }) {
  const today = keyFromDate(new Date())
  const yesterday = shiftKey(today, -1)
  const selected = dateFromKey(value)
  return (
    <div className="grid gap-2">
      <div className="flex gap-2 px-1" role="group" aria-label="Quick dates">
        {[['Today', today], ['Yesterday', yesterday]].map(([label, key]) => (
          <button key={key} type="button" aria-pressed={value === key} onClick={() => onPick(key)}
            className={cn(chip, value === key ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-[var(--tint)] text-[var(--text-primary)]')}>
            {label}
          </button>
        ))}
      </div>
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        weekStartsOn={1}
        onSelect={(d) => { if (d) onPick(keyFromDate(d)) }}
        className="mx-auto bg-transparent p-0 [--cell-size:--spacing(10)]"
        autoFocus
      />
    </div>
  )
}

/** One date field for the whole app: readable trigger, calendar in a popover (desktop) or sheet (phone). */
export function DatePicker({ value, onChange, className, trigger, disabled, ...rest }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  // Read at render, like QuickAdd's keypad choice: it only changes if the device does.
  const asSheet = prefersSheet()
  const label = rest['aria-label']
  const pick = (key: string) => { onChange(key); setOpen(false) }
  const content = trigger ?? (
    <>
      <CalendarDays aria-hidden className="size-4 shrink-0 text-[var(--text-tertiary)]" />
      <span className="min-w-0 flex-1 truncate">{readableDate(value)}</span>
    </>
  )
  const triggerProps = {
    disabled,
    'aria-label': `${label}: ${readableDate(value)}`,
    'aria-haspopup': 'dialog' as const,
    className: cn(trigger ? '' : triggerBase, className),
  }

  if (asSheet) {
    return (
      <>
        <button type="button" {...triggerProps} aria-expanded={open} onClick={() => setOpen(true)}>{content}</button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="gap-3 rounded-t-lg border-0 bg-white px-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2.5 shadow-[0_-8px_28px_rgba(14,23,41,0.14)]">
            <div aria-hidden className="mx-auto h-[5px] w-10 rounded-full bg-[var(--tint-strong)]" />
            <SheetTitle className="pl-1 pr-11 text-[16px] font-bold">{label}</SheetTitle>
            <Panel value={value} onPick={pick} />
          </SheetContent>
        </Sheet>
      </>
    )
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal={false}>
      <PopoverPrimitive.Trigger {...triggerProps}>{content}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={8} className="z-[60]">
          <PopoverPrimitive.Popup aria-label={label} className="max-h-[var(--available-height)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg bg-white p-3 shadow-[0_8px_28px_rgba(14,23,41,0.16)] ring-1 ring-[var(--border-subtle)] outline-none">
            <Panel value={value} onPick={pick} />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
