import type { ReactNode } from 'react'
import { categoryIcon } from '@/lib/categoryIcon'
import { formatSigned, groupByDay } from '@/lib/format'

export type ActivityItem = {
  id: string
  transactionDate: string
  type: string
  description: string
  categoryName: string | null
  amount: number
  currency: string
  walletName?: string | null
}

interface ActivityListProps<T extends ActivityItem> {
  transactions: T[]
  /** Optional trailing control per row (edit/delete on the Activity page). */
  renderActions?: (tx: T) => ReactNode
  /** Make a whole row clickable. */
  onSelect?: (tx: T) => void
  /** Limit which rows are clickable (default: all, when onSelect is set). */
  selectable?: (tx: T) => boolean
  emptyLabel?: string
  now?: Date
}

function amountClass(tx: ActivityItem) {
  if (tx.type === 'transfer') return 'text-[var(--text-tertiary)]'
  return tx.amount >= 0 ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]'
}

export function ActivityRow<T extends ActivityItem>({ tx, renderActions, onSelect, selectable }: { tx: T } & Pick<ActivityListProps<T>, 'renderActions' | 'onSelect' | 'selectable'>) {
  const Icon = categoryIcon(tx.categoryName, tx.type)
  const isIncome = tx.type === 'income' || (tx.type !== 'transfer' && tx.amount > 0)
  const meta = [tx.type === 'transfer' ? 'Transfer' : tx.categoryName, tx.walletName].filter(Boolean).join(' · ')
  const body = (
    <>
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
          isIncome ? 'bg-[rgba(18,137,90,0.1)] text-[var(--positive)]' : 'bg-[var(--tint)] text-[var(--ink)]'
        }`}
      >
        <Icon className="size-[18px]" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-tight text-[var(--text-primary)]">{tx.description}</span>
        {meta && <span className="mt-0.5 block truncate text-[13px] text-[var(--text-tertiary)]">{meta}</span>}
      </span>
      <span className={`tabular shrink-0 text-[15px] font-semibold ${amountClass(tx)}`}>{formatSigned(tx.amount, tx.currency)}</span>
    </>
  )
  return (
    <li className="flex items-center gap-2">
      {onSelect && (selectable?.(tx) ?? true) ? (
        <button
          type="button"
          onClick={() => onSelect(tx)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2.5 text-left transition-colors hover:bg-[var(--tint)]/60 focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5">{body}</div>
      )}
      {renderActions?.(tx)}
    </li>
  )
}

/** Transactions grouped by calendar day, with the day's net per currency on the band. */
export function ActivityList<T extends ActivityItem>({ transactions, renderActions, onSelect, selectable, emptyLabel = 'No transactions yet', now }: ActivityListProps<T>) {
  if (transactions.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">{emptyLabel}</p>
  }
  const groups = groupByDay(transactions, now)
  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="-mx-4 flex items-baseline justify-between gap-3 bg-[var(--tint)] px-4 py-1.5 text-[12.5px] font-semibold text-[var(--text-tertiary)] lg:-mx-3 lg:rounded-lg lg:px-3">
            <span>{group.label}</span>
            {group.totals.length > 0 && (
              <span className="tabular truncate">{group.totals.map((t) => formatSigned(t.amount, t.currency)).join(' · ')}</span>
            )}
          </h3>
          <ul className="pb-2">
            {group.items.map((tx) => (
              <ActivityRow key={tx.id} tx={tx} renderActions={renderActions} onSelect={onSelect} selectable={selectable} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
