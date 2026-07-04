import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  }
}

function ReviewRow({ category }: { category: Category }) {
  const invalidate = useInvalidateCategories()
  const mutation = useMutation({
    mutationFn: (type: CategoryType) => patchCategory(category.id, { type }),
    onSuccess: invalidate,
  })
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-[var(--shadow-card)]">
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

function AddCategoryDialog({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const invalidate = useInvalidateCategories()
  const [name, setName] = useState('')
  const [type, setType] = useState<CategoryType>('expense')
  const [parentId, setParentId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parents = categories.filter((c) => c.type === type && !c.parentId)

  const mutation = useMutation({
    mutationFn: () => createCategory({ name: name.trim(), type, parentId: parentId || undefined }),
    onSuccess: () => { invalidate(); onClose() },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New category</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5">
          <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <div className="grid grid-cols-2 gap-2.5">
            <select value={type} onChange={(e) => { setType(e.target.value as CategoryType); setParentId('') }} aria-label="Type" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} aria-label="Parent category" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">Top level</option>
              {parents.map((p) => <option key={p.id} value={p.id}>Under {p.name}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create category'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function CategoriesPage() {
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })
  const [adding, setAdding] = useState(false)

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
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Categories</h1>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add
        </Button>
      </header>

      {needsReview.length > 0 && (
        <section className="pb-5" aria-label="Needs review">
          <h2 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--negative)]">
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
        <div className="rounded-xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
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
            <h2 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {TYPE_LABELS[t]}
            </h2>
            <div className="grid gap-1.5">
              {group.parents.map((parent) => (
                <div key={parent.id}>
                  <div className="flex items-center rounded-lg bg-white px-3 py-2 shadow-[var(--shadow-card)]">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{parent.name}</p>
                  </div>
                  {(group.children.get(parent.id) ?? []).map((child) => (
                    <div key={child.id} className="ml-5 mt-1 flex items-center gap-2 rounded-lg bg-white/70 px-3 py-1.5">
                      <CornerDownRight className="size-3.5 text-[var(--text-tertiary)]" />
                      <p className="text-sm text-[var(--text-secondary)]">{child.name}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )
      })}

      {adding && <AddCategoryDialog categories={categories} onClose={() => setAdding(false)} />}
    </div>
  )
}
