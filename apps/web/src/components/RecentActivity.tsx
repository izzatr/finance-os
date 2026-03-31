import { Badge } from '@/components/ui/badge'
import type { RecentTransaction } from '../lib/api'

interface RecentActivityProps {
  transactions: RecentTransaction[]
  formatCurrency: (amount: number, currency: string) => string
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const TYPE_STYLES: Record<string, string> = {
  income: 'bg-[rgba(58,172,106,0.08)] text-[var(--positive)]',
  expense: 'bg-[rgba(217,80,80,0.08)] text-[var(--negative)]',
  transfer: 'bg-[rgba(91,164,212,0.08)] text-[#5ba4d4]',
}

export function RecentActivity({ transactions, formatCurrency }: RecentActivityProps) {
  return (
    <div className="flex flex-col gap-px mb-14">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="grid grid-cols-[72px_1fr_auto] gap-4 items-center py-3 px-4 rounded-lg transition-colors hover:bg-white/70"
        >
          <div className="text-xs font-light text-muted-foreground">
            {formatShortDate(tx.transactionDate)}
          </div>
          <div>
            <div className="text-[13px] font-normal text-foreground">
              <Badge
                variant="outline"
                className={`mr-1.5 text-[9px] font-medium tracking-[0.1em] uppercase px-1.5 py-0 border-0 ${TYPE_STYLES[tx.type] ?? ''}`}
              >
                {tx.type}
              </Badge>
              {tx.description}
            </div>
            <div className="text-[11px] font-light text-muted-foreground mt-0.5">
              {tx.categoryName ? `${tx.categoryName} · ` : ''}{tx.walletName}
            </div>
          </div>
          <div
            className={`font-mono text-[13px] font-medium text-right whitespace-nowrap ${
              tx.amount >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
            }`}
          >
            {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
          </div>
        </div>
      ))}
    </div>
  )
}
