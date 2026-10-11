import { useState } from 'react'
import { ICON_IDS, type IconId } from '@finance-os/domain/src/icons'
import { ICONS, storedIcon } from '@/lib/icons'
import { ChevronDown, Tag } from 'lucide-react'

/** Inline disclosure avoids nested modals/portals, including inside mobile sheets. */
export function IconPicker({ value, onChange, label = 'Icon', automaticIcon: Automatic = Tag, disabled = false }: {
  value?: string | null; onChange: (value: IconId | null) => void; label?: string; automaticIcon?: typeof Tag; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const Current = storedIcon(value) ?? Automatic
  const choose = (id: IconId | null) => { onChange(id); setOpen(false); setSearch('') }
  const options = ICON_IDS.filter((id) => id.replaceAll('-', ' ').includes(search.trim().toLowerCase()))
  return <div className="min-w-0 grid gap-2">
    <button type="button" disabled={disabled} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-medium)] px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--ink)] disabled:opacity-50">
      <Current aria-hidden className="size-5" /><span>{label}</span><span className="ml-auto text-xs text-[var(--text-tertiary)]">{value ? value.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase()) : 'Automatic'}</span><ChevronDown aria-hidden className="size-4 shrink-0" />
    </button>
    {open && <div className="grid gap-2 rounded-lg bg-[var(--tint)] p-2" role="group" aria-label={`${label} choices`}>
      <input type="search" aria-label="Search icons" placeholder="Search icons" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 min-w-0 w-full rounded-lg bg-white px-3 text-sm" />
      <button type="button" aria-pressed={!value} onClick={() => choose(null)} className="flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 text-sm"><Automatic aria-hidden className="size-5" /> Automatic (reset)</button>
      <div className="grid max-h-56 grid-cols-5 gap-1 overflow-y-auto">
        {options.map((id) => { const Icon = ICONS[id]; const name = id.replaceAll('-', ' '); return <button key={id} type="button" title={name} aria-label={`Use ${name} icon`} aria-pressed={value === id} onClick={() => choose(id)}
          className={`flex min-h-11 items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--ink)] ${value === id ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-white text-[var(--ink)]'}`}><Icon aria-hidden className="size-5" /></button> })}
      </div>
      {options.length === 0 && <p className="text-sm">No matching icons.</p>}
    </div>}
  </div>
}
