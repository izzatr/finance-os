import { IconPicker } from '@/components/IconPicker'
import { categoryIcon } from '@/lib/categoryIcon'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dropdown } from '@/components/ui/dropdown'
import { CornerDownRight, Plus, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createCategory, getCategories, patchCategory, type Category, type CategoryType } from '@/lib/api'

const TYPE_LABELS: Record<CategoryType, string> = {
  expense: 'Expenses',
  income: 'Income',
  transfer: 'Transfers',
}

function useInvalidateCategories() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['category-list'] })
    qc.invalidateQueries({ queryKey: ['categories'] }) // breakdown analytics
    for (const key of ['recent', 'recent-page', 'transactions', 'wallet-transactions', 'dashboard', 'month-report', 'summary', 'summary-monthly']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

function ReviewRow({ category }: { category: Category }) {
  const invalidate = useInvalidateCategories()
  const mutation = useMutation({
    mutationFn: (type: CategoryType) => patchCategory(category.id, { type }),
    onSuccess: invalidate,
  })
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-3.5 py-2.5">
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{category.name}</p>
      {(['expense', 'income', 'transfer'] as const).map((t) => (
        <button
          key={t}
          onClick={() => mutation.mutate(t)}
          disabled={mutation.isPending}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
            category.type === t
              ? 'bg-[var(--accent-blue)] text-white'
              : 'border border-[var(--border-medium)] bg-white text-[var(--text-secondary)]'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function AddCategoryDialog({ categories, category, onClose }: { categories: Category[]; category?: Category; onClose: () => void }) {
  const invalidate = useInvalidateCategories()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null)
  const [type, setType] = useState<CategoryType>(category?.type ?? 'expense')
  const [parentId, setParentId] = useState(category?.parentId ?? '')
  const [error, setError] = useState<string | null>(null)

  const parents = categories.filter((c) => c.type === type && !c.parentId && c.id !== category?.id)

  const mutation = useMutation({
    mutationFn: () => category ? patchCategory(category.id, { name: name.trim(), type, icon, parentId: parentId || null }) : createCategory({ name: name.trim(), type, icon, parentId: parentId || undefined }),
    onSuccess: () => { invalidate(); onClose() },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5">
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <div className="grid grid-cols-2 gap-2.5">
            <Dropdown
              aria-label="Type"
              value={type}
              onChange={(v) => { setType(v as CategoryType); setParentId('') }}
              options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' }]}
            />
            <Dropdown
              aria-label="Parent category"
              searchable={parents.length > 8}
              value={parentId}
              onChange={setParentId}
              options={[{ value: '', label: 'Top level' }, ...parents.map((p) => ({ value: p.id, label: `Under ${p.name}` }))]}
            />
          </div>
          <IconPicker value={icon} onChange={setIcon} automaticIcon={categoryIcon(name, type)} label="Category icon" />
          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : category ? 'Save category' : 'Create category'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CategoryButton({ category, onEdit }: { category: Category; onEdit: () => void }) {
  const Icon = categoryIcon(category.name, category.type, category.icon)
  return <button type="button" onClick={onEdit} aria-label={`Edit ${category.name}`} className="flex min-h-11 w-full items-center gap-3 text-left text-sm font-medium">
    <Icon aria-hidden className="size-5 shrink-0 text-[var(--ink)]" /><span className="min-w-0 flex-1 truncate">{category.name}</span><span className="text-xs text-[var(--text-tertiary)]">Edit</span>
  </button>
}

export function CategoriesPage() {
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const categories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data])
  const needsReview = categories.filter((c) => c.needsReview)

  const grouped = useMemo(() => {
    const byType = new Map<CategoryType, { parents: Category[]; children: Map<string, Category[]> }>()
    for (const t of ['expense', 'income', 'transfer'] as const) {
      const ofType = categories.filter((c) => c.type === t)
      const children = new Map<string, Category[]>()
      for (const c of ofType) {
        if (c.parentId) {
          children.set(c.parentId, [...(children.get(c.parentId) ?? []), c])
        }
      }
      byType.set(t, { parents: ofType.filter((c) => !c.parentId), children })
    }
    return byType
  }, [categories])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Categories</h1>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add
        </Button>
      </header>

      {needsReview.length > 0 && (
        <section className="pb-5" aria-label="Needs review">
          <h2 className="pb-1.5 text-[15px] font-bold text-[var(--negative)]">
            Review these ({needsReview.length})
          </h2>
          <p className="pb-2 text-xs text-[var(--text-tertiary)]">
            These categories had mixed activity — confirm the right type and they leave this list.
          </p>
          <div className="grid gap-1.5">
            {needsReview.map((c) => <ReviewRow key={c.id} category={c} />)}
          </div>
        </section>
      )}

      {categories.length === 0 && !categoriesQuery.isLoading && (
        <div className="rounded-2xl bg-[var(--tint)] px-6 py-8 text-center">
          <Tags className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-sm font-medium text-[var(--text-primary)]">No categories yet</p>
          <p className="pt-1 text-xs text-[var(--text-tertiary)]">Categories make reports meaningful — add your first.</p>
        </div>
      )}

      {(['expense', 'income', 'transfer'] as const).map((t) => {
        const group = grouped.get(t)
        if (!group || group.parents.length === 0) return null
        return (
          <section key={t} className="pb-5" aria-label={TYPE_LABELS[t]}>
            <h2 className="pb-1.5 text-[15px] font-bold text-[var(--text-primary)]">
              {TYPE_LABELS[t]}
            </h2>
            <div className="grid gap-1.5">
              {group.parents.map((parent) => (
                <div key={parent.id}>
                  <div className="flex min-h-12 items-center rounded-xl border border-[var(--border-subtle)] bg-white px-3.5 py-2.5">
                    <CategoryButton category={parent} onEdit={() => setEditing(parent)} />
                  </div>
                  {(group.children.get(parent.id) ?? []).map((child) => (
                    <div key={child.id} className="ml-5 mt-1 flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-white px-3 py-2">
                      <CornerDownRight className="size-3.5 text-[var(--text-tertiary)]" />
                      <CategoryButton category={child} onEdit={() => setEditing(child)} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {editing && <AddCategoryDialog key={editing.id} categories={categories} category={editing} onClose={() => setEditing(null)} />}
      {adding && <AddCategoryDialog categories={categories} onClose={() => setAdding(false)} />}
    </div>
  )
}
