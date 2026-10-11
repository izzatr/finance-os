import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { IconPicker } from '@/components/IconPicker'
import { patchSharedCategoryIcon, type SharedCategory } from '@/lib/api'
import { categoryIcon } from '@/lib/categoryIcon'
import { invalidateShared } from '@/hooks/use-split'

function CategoryPreference({ category }: { category: SharedCategory }) {
  const qc = useQueryClient()
  const mutation = useMutation({ mutationFn: (icon: string | null) => patchSharedCategoryIcon(category.slug, icon), onSuccess: () => invalidateShared(qc) })
  return <div className="grid gap-1">
    <IconPicker label={category.label} value={category.icon} automaticIcon={categoryIcon(category.slug, 'expense')} onChange={(icon) => mutation.mutate(icon)} disabled={mutation.isPending} />
    {mutation.isPending && <p role="status" className="text-xs">Saving {category.label} icon…</p>}
    {mutation.isSuccess && <p role="status" className="text-xs text-[var(--positive)]">{category.label} icon saved</p>}
    {mutation.error && <p role="alert" className="text-xs text-[var(--negative)]">{mutation.error.message}</p>}
  </div>
}
export function SharedCategoryIcons({ categories }: { categories: SharedCategory[] }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const visible = categories.filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="grid gap-2" aria-label="My shared category icons">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 items-center justify-between text-left text-[15px] font-bold">Customize shared category icons<ChevronDown aria-hidden className="size-4" /></button>
    <p className="text-[13.5px] text-[var(--text-secondary)]">Only changes what you see. Icons save immediately; other members keep their own icons and category choices.</p>
    {open && <div className="grid gap-2">
      <input type="search" aria-label="Search shared categories" placeholder="Search categories" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 min-w-0 w-full rounded-lg border border-[var(--border-medium)] px-3 text-sm" />
      {visible.map((category) => <CategoryPreference key={category.slug} category={category} />)}
      {visible.length === 0 && <p className="text-sm">No matching categories.</p>}
    </div>}
  </section>
}
