import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DropdownOption = {
  value: string
  label: string
  /** Optional section heading (options of one group should be adjacent). */
  group?: string
  /** Quiet second line or trailing text, e.g. a currency or balance. */
  hint?: string
  /** Extra words the search matches on. */
  keywords?: string[]
}

type DropdownProps = {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  placeholder?: string
  /** Accessible name when no wrapping <label> names it. */
  'aria-label'?: string
  /** Long lists (currencies, categories, friends) get a search box. */
  searchable?: boolean
  disabled?: boolean
  /** Classes for the trigger button (defaults to the standard field look). */
  className?: string
  /** Custom trigger content (e.g. QuickAdd's wallet pill); defaults to the selected label. */
  trigger?: ReactNode
  /** Width of the popup; defaults to the trigger width (at least 14rem). */
  popupClassName?: string
}

const triggerBase =
  'flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border-medium)] bg-white px-3 text-left text-[15px] text-[var(--text-primary)] outline-none transition-colors focus-visible:border-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/15 disabled:cursor-not-allowed disabled:opacity-50 data-[popup-open]:border-[var(--ink)]'
const popupBase =
  'z-[60] max-h-[min(22rem,var(--available-height))] min-w-[max(14rem,var(--anchor-width))] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-lg bg-white p-1 text-[15px] text-[var(--text-primary)] shadow-[0_8px_28px_rgba(14,23,41,0.16)] ring-1 ring-[var(--border-subtle)] outline-none'
const itemBase =
  'flex min-h-11 w-full cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none select-none data-[highlighted]:bg-[var(--tint)] data-[selected]:font-semibold'
const groupLabel = 'px-2.5 pb-1 pt-2.5 text-[12px] font-semibold text-[var(--text-tertiary)]'

function grouped(options: DropdownOption[]): Array<{ group: string | undefined; items: DropdownOption[] }> {
  const out: Array<{ group: string | undefined; items: DropdownOption[] }> = []
  for (const o of options) {
    const last = out[out.length - 1]
    if (last && last.group === o.group) last.items.push(o)
    else out.push({ group: o.group, items: [o] })
  }
  return out
}

/**
 * The one dropdown for the app (Ink + Cream). Short lists use Base UI Select; long lists add a
 * search box. Both portal to the body above sheets, work with touch and keyboard, and never show
 * the browser's native picker.
 */
export function Dropdown(props: DropdownProps) {
  return props.searchable ? <SearchableDropdown {...props} /> : <SimpleDropdown {...props} />
}

function SimpleDropdown({ value, onChange, options, placeholder = 'Choose', disabled, className, trigger, popupClassName, ...rest }: DropdownProps) {
  const selected = options.find((o) => o.value === value)
  return (
    <SelectPrimitive.Root
      value={selected ? value : null}
      onValueChange={(v) => { if (typeof v === 'string') onChange(v) }}
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      disabled={disabled}
      modal={false}
    >
      <SelectPrimitive.Trigger aria-label={rest['aria-label']} className={cn(trigger ? '' : triggerBase, className)}>
        {trigger ?? (
          <>
            <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-[var(--text-tertiary)]')}>{selected?.label ?? placeholder}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--text-tertiary)]" />
          </>
        )}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner side="bottom" align="start" sideOffset={4} alignItemWithTrigger={false} className="z-[60]">
          <SelectPrimitive.Popup className={cn(popupBase, popupClassName)}>
            <SelectPrimitive.List>
              {grouped(options).map((g, i) => (
                <SelectPrimitive.Group key={`${g.group ?? ''}-${i}`}>
                  {g.group && <SelectPrimitive.GroupLabel className={groupLabel}>{g.group}</SelectPrimitive.GroupLabel>}
                  {g.items.map((o) => (
                    <SelectPrimitive.Item key={o.value} value={o.value} label={o.label} className={itemBase}>
                      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">{o.label}</SelectPrimitive.ItemText>
                      {o.hint && <span className="shrink-0 text-[13px] text-[var(--text-tertiary)]">{o.hint}</span>}
                      <span className="flex size-4 shrink-0 items-center">
                        <SelectPrimitive.ItemIndicator><Check className="size-4 text-[var(--ink)]" /></SelectPrimitive.ItemIndicator>
                      </span>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Group>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function SearchableDropdown({ value, onChange, options, placeholder = 'Choose', disabled, className, trigger, popupClassName, ...rest }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => [o.label, o.value, o.hint ?? '', o.group ?? '', ...(o.keywords ?? [])].some((s) => s.toLowerCase().includes(q)))
  }, [options, query])

  function openChange(next: boolean) {
    setOpen(next)
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
  }

  function choose(o: DropdownOption) {
    onChange(o.value)
    openChange(false)
  }

  function move(delta: number) {
    if (filtered.length === 0) return
    const next = (active + delta + filtered.length) % filtered.length
    setActive(next)
    listRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }

  let index = -1
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={openChange} modal={false}>
      <PopoverPrimitive.Trigger
        disabled={disabled}
        aria-label={rest['aria-label']}
        aria-haspopup="listbox"
        role="combobox"
        aria-expanded={open}
        className={cn(trigger ? '' : triggerBase, className)}
      >
        {trigger ?? (
          <>
            <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-[var(--text-tertiary)]')}>{selected?.label ?? placeholder}</span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-[var(--text-tertiary)]" />
          </>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="bottom" align="start" sideOffset={4} className="z-[60]">
          <PopoverPrimitive.Popup className={cn(popupBase, 'flex max-h-[min(24rem,var(--available-height))] flex-col overflow-hidden p-0', popupClassName)} initialFocus={() => document.getElementById(`${listId}-search`)}>
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
              <Search aria-hidden className="size-4 shrink-0 text-[var(--text-tertiary)]" />
              <input
                id={`${listId}-search`}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
                  else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[active]; if (o) choose(o) }
                }}
                placeholder="Search"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </div>
            <ul ref={listRef} id={listId} role="listbox" aria-label={rest['aria-label'] ?? 'Options'} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
              {filtered.length === 0 && <li className="px-2.5 py-3 text-[14px] text-[var(--text-tertiary)]">Nothing matches</li>}
              {grouped(filtered).map((g, gi) => (
                <li key={`${g.group ?? ''}-${gi}`} role="presentation">
                  {g.group && <p className={groupLabel}>{g.group}</p>}
                  <ul role="presentation">
                    {g.items.map((o) => {
                      index += 1
                      const i = index
                      const isSel = o.value === value
                      return (
                        <li
                          key={o.value}
                          id={`${listId}-${i}`}
                          data-index={i}
                          role="option"
                          aria-selected={isSel}
                          data-highlighted={i === active ? '' : undefined}
                          onPointerMove={() => setActive(i)}
                          onClick={() => choose(o)}
                          className={cn(itemBase, isSel && 'font-semibold')}
                        >
                          <span className="min-w-0 flex-1 truncate">{o.label}</span>
                          {o.hint && <span className="shrink-0 text-[13px] text-[var(--text-tertiary)]">{o.hint}</span>}
                          <span className="flex size-4 shrink-0 items-center">{isSel && <Check className="size-4 text-[var(--ink)]" />}</span>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
