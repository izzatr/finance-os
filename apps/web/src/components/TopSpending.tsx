import type { CategoryBreakdown } from '../lib/api'
import { usePersonalIcons } from '@/hooks/use-category-icons'

interface TopSpendingProps {
  categories: CategoryBreakdown[]
  currency: string
  formatCurrency: (amount: number, currency: string) => string
}

export function TopSpending({ categories, currency, formatCurrency }: TopSpendingProps) {
  const categoryIcon = usePersonalIcons()
  const maxTotal = categories.length > 0 ? Math.max(...categories.map((c) => c.total)) : 1

  return (
    <ul className="grid gap-1">
      {categories.map((cat) => {
        const Icon = categoryIcon(cat.categoryName, 'expense')
        return (
          <li key={`${cat.categorySlug}-${cat.currency}`} className="flex items-center gap-3 py-1.5">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
              <Icon className="size-[18px]" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[15px] font-semibold">
                  {cat.categoryName}
                  <span className="ml-1.5 text-[13px] font-medium text-[var(--text-tertiary)]">{cat.count} tx</span>
                </span>
                <span className="tabular shrink-0 text-[15px] font-semibold">{formatCurrency(cat.total, currency)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--tint)]">
                <div
                  className="h-full rounded-full bg-[var(--ink)]"
                  style={{ width: `${(cat.total / maxTotal) * 100}%`, minWidth: 4 }}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
