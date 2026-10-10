import { useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getRecentTransactionsPage, searchTransactions } from '@/lib/api'
import { ActivityList } from '@/components/ActivityList'

const PAGE_SIZE = 50
const TYPE_FILTERS = ['all', 'expense', 'income', 'transfer'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

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

  // One row per wallet entry: a transfer shows both legs.
  const items = useMemo(() => rows.map((r) => ({ ...r, id: r.entryId })), [rows])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] lg:px-8 lg:pt-8">
      <header className="pb-4">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Activity</h1>
      </header>

      {/* Filters */}
      <div className="sticky top-0 z-10 -mx-4 bg-[var(--bg-base)]/95 px-4 pb-3  lg:-mx-8 lg:px-8">
        <div className="relative pb-2">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-[18px] text-[var(--text-tertiary)]" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions"
            className="h-11 rounded-xl border-0 bg-[var(--tint)] pl-10 text-[15px]"
            aria-label="Search transactions"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Filter by type">
          {TYPE_FILTERS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold capitalize transition-colors ${
                typeFilter === t
                  ? 'bg-[var(--ink)] text-[var(--cream)]'
                  : 'bg-[var(--tint)] text-[var(--text-secondary)]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {listQuery.isLoading || searchQuery.isLoading ? (
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>
      ) : (
        <ActivityList
          transactions={items}
          emptyLabel={searching ? 'No transactions match your search.' : 'No transactions yet. Tap + to add your first.'}
        />
      )}

      {!searching && listQuery.hasNextPage && (
        <div className="flex justify-center pt-5">
          <Button
            variant="outline"
            className="h-11 rounded-xl px-5"
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
