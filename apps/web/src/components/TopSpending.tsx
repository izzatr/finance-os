import type { CategoryBreakdown } from '../lib/api'

interface TopSpendingProps {
  categories: CategoryBreakdown[]
  currency: string
  formatCurrency: (amount: number, currency: string) => string
}

export function TopSpending({ categories, currency, formatCurrency }: TopSpendingProps) {
  const maxTotal = categories.length > 0 ? Math.max(...categories.map((c) => c.total)) : 1

  return (
    <div className="mb-14">
      {categories.map((cat) => (
        <div
          key={`${cat.categorySlug}-${cat.currency}`}
          className="grid grid-cols-[150px_1fr_auto] gap-4 items-center py-2.5 px-4 rounded-lg transition-colors hover:bg-white/70"
        >
          <div>
            <div className="text-[13px] font-normal text-foreground">{cat.categoryName}</div>
            <div className="text-[11px] font-light text-muted-foreground mt-0.5">{cat.count} transactions</div>
          </div>
          <div className="h-[3px] rounded-full bg-border/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#5ba4d4] to-[#c6e2f5] transition-all duration-500"
              style={{ width: `${(cat.total / maxTotal) * 100}%`, minWidth: 4 }}
            />
          </div>
          <div className="font-mono text-[13px] font-medium text-foreground text-right whitespace-nowrap min-w-20">
            {formatCurrency(cat.total, currency)}
          </div>
        </div>
      ))}
    </div>
  )
}
