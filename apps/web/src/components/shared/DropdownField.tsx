import type { ComponentProps, ReactNode } from 'react'
import { Dropdown } from '@/components/ui/dropdown'
import { DatePicker } from '@/components/ui/date-picker'

/** A labelled dropdown field; the label names the trigger (no <label> wrapper around a button). */
export function DropdownField({ label, hint, ...props }: { label: string; hint?: ReactNode } & Omit<ComponentProps<typeof Dropdown>, 'aria-label'>) {
  return (
    <div className="grid gap-1.5">
      <span aria-hidden className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <Dropdown aria-label={label} {...props} />
      {hint && <span className="text-[12.5px] text-[var(--text-tertiary)]">{hint}</span>}
    </div>
  )
}

/** A labelled date field (calendar day, YYYY-MM-DD). */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (key: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <span aria-hidden className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <DatePicker aria-label={label} value={value} onChange={onChange} />
    </div>
  )
}
