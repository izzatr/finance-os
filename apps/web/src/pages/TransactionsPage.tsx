import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getRecentTransactionsPage, searchTransactions, type RecentTransaction } from '@/lib/api'

const PAGE_SIZE = 50
const TYPE_FILTERS = ['all', 'expense', 'income', 'transfer'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

/** Label derived from the UTC day KEY the row was grouped under — keeping grouping
 *  and labeling in one zone so near-midnight rows can't produce mislabeled groups. */
function dayLabel(key: string): string {
  const todayKey = new Date().toISOString().slice(0, 10)
  const yesterdayKey = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (key === todayKey) return 'Today'
  if (key === yesterdayKey) return 'Yesterday'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

type DayGroup = { key: string; label: string; rows: RecentTransaction[]; nets: Map<string, number> }

/** Group by calendar day; each header carries the day's net per currency. */
function groupByDay(rows: RecentTransaction[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()
  for (const row of rows) {
    const key = row.transactionDate.slice(0, 10)
    if (!groups.has(key)) {
      groups.set(key, { key, label: dayLabel(key), rows: [], nets: new Map() })
    }
    const g = groups.get(key)!
    g.rows.push(row)
    // transfer/exchange/adjustment move money between own wallets — not spend or income.
    // (This also prevents double-counting: those are the multi-entry types.)
    if (!['transfer', 'exchange', 'adjustment'].includes(row.type)) {
      g.nets.set(row.currency, (g.nets.get(row.currency) ?? 0) + row.amount)
    }
  }
  return [...groups.values()]
}

function TxRow({ tx }: { tx: RecentTransaction }) {
  const negative = tx.amount < 0
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 shadow-[var(--shadow-card)]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{tx.description}</p>
        <p className="truncate text-xs text-[var(--text-tertiary)]">
          {tx.categoryName ?? 'Uncategorized'} · {tx.walletName}
        </p>
      </div>
      <span
        className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${
          tx.type === 'transfer'
            ? 'text-[var(--text-secondary)]'
            : negative
              ? 'text-[var(--negative)]'
              : 'text-[var(--positive)]'
        }`}
      >
        {negative ? '' : '+'}
        {formatAmount(tx.amount, tx.currency)}
      </span>
    </div>
  )
}

export function TransactionsPage() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const searching = search.trim().length >= 2

  const listQuery = useInfiniteQuery({
    queryKey: ['transactions', 'infinite'],
    queryFn: ({ pageParam }) => getRecentTransactionsPage({ limit: PAGE_SIZE, ...pageParam }),
    initialPageParam: undefined as { before: string; beforeEntryId: string } | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length < PAGE_SIZE) return undefined
      const last = lastPage.data[lastPage.data.length - 1]
      return { before: last.transactionDate, beforeEntryId: last.entryId }
    },
    enabled: !searching,
  })

  const searchQuery = useQuery({
    queryKey: ['transactions', 'search', search],
    queryFn: () => searchTransactions(search.trim()),
    enabled: searching,
  })

  const rows = useMemo(() => {
    const all = searching
      ? (searchQuery.data?.data ?? [])
      : (listQuery.data?.pages.flatMap((p) => p.data) ?? [])
    return typeFilter === 'all' ? all : all.filter((r) => r.type === typeFilter)
  }, [searching, searchQuery.data, listQuery.data, typeFilter])

  const groups = useMemo(() => groupByDay(rows), [rows])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
      <header className="pb-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Transactions</h1>
      </header>

      {/* Filters */}
      <div className="sticky top-0 z-10 -mx-4 bg-[var(--bg-base)]/95 px-4 pb-3 backdrop-blur-sm lg:-mx-8 lg:px-8">
        <div className="relative pb-2">
          <Search className="absolute left-3 top-2.5 size-4 text-[var(--text-tertiary)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions"
            className="pl-9"
            aria-label="Search transactions"
          />
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Filter by type">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                typeFilter === t
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'bg-white text-[var(--text-secondary)] border border-[var(--border-medium)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Day groups */}
      {groups.length === 0 && !listQuery.isLoading && !searchQuery.isLoading && (
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">
          {searching ? 'No transactions match your search.' : 'No transactions yet — tap + to add your first.'}
        </p>
      )}

      <div className="grid gap-4">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <div className="flex items-baseline justify-between px-1 pb-1.5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                {g.label}
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                {[...g.nets.entries()]
                  .map(([cur, net]) => `${net > 0 ? '+' : ''}${formatAmount(net, cur)}`)
                  .join('  ')}
              </span>
            </div>
            <div className="grid gap-1.5">
              {g.rows.map((tx) => (
                <TxRow key={tx.entryId} tx={tx} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {!searching && listQuery.hasNextPage && (
        <div className="flex justify-center pt-5">
          <Button
            variant="outline"
            onClick={() => listQuery.fetchNextPage()}
            disabled={listQuery.isFetchingNextPage}
          >
            {listQuery.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        </div>
      )}
    </div>
  )
}
