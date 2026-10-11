import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { HandCoins, Repeat } from 'lucide-react'
import { getSharedExpenses, type ExpenseCursor, type SharedExpense } from '@/lib/api'
import { splitKeys } from '@/hooks/use-split'
import { categoryIcon } from '@/lib/categoryIcon'
import { formatAmount } from '@/lib/split'

const PAGE = 30

function monthLabel(iso: string, now = new Date()) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  return d.toLocaleDateString('en-GB', { month: 'long', ...(d.getUTCFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

/** One line about who paid ("You paid €30.00", "Ana and Bo paid €30.00"). */
export function payerLine(e: SharedExpense, mePersonId: string | undefined): string {
  if (e.kind === 'payment') {
    const from = e.shares.find((s) => Number(s.paid) > 0)
    const to = e.shares.find((s) => Number(s.owed) > 0)
    const n = (s?: { personId: string; name: string }) => (s ? (s.personId === mePersonId ? 'You' : s.name) : 'Someone')
    return `${n(from)} paid ${n(to) === 'You' ? 'you' : n(to)} ${formatAmount(e.cost, e.currency)}`
  }
  const payers = e.shares.filter((s) => Number(s.paid) > 0)
  const names = payers.map((s) => (s.personId === mePersonId ? 'you' : s.name))
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} people`
  return `${who.charAt(0).toUpperCase()}${who.slice(1)} paid ${formatAmount(e.cost, e.currency)}`
}

/** My position on one expense: lent / borrowed / not involved. */
export function myPosition(e: SharedExpense): { label: string; amount: string | null; tone: 'positive' | 'negative' | 'muted' } {
  if (!e.me) return { label: 'not involved', amount: null, tone: 'muted' }
  const net = Number(e.me.net)
  if (Math.abs(net) < 1e-9) return { label: e.kind === 'payment' ? '' : 'no balance', amount: null, tone: 'muted' }
  if (e.kind === 'payment') return net > 0 ? { label: 'you paid', amount: formatAmount(net, e.currency), tone: 'positive' } : { label: 'you received', amount: formatAmount(-net, e.currency), tone: 'negative' }
  return net > 0 ? { label: 'you lent', amount: formatAmount(net, e.currency), tone: 'positive' } : { label: 'you borrowed', amount: formatAmount(-net, e.currency), tone: 'negative' }
}

export function ExpenseRow({ e, mePersonId }: { e: SharedExpense; mePersonId?: string }) {
  const Icon = e.kind === 'payment' ? HandCoins : categoryIcon(e.category, 'expense')
  const pos = myPosition(e)
  const d = new Date(`${e.date.slice(0, 10)}T12:00:00Z`)
  return (
    <li>
      <Link
        to={`/shared/expenses/${e.id}`}
        className="flex min-h-16 items-center gap-3 rounded-lg py-2 text-[var(--text-primary)] no-underline active:bg-[var(--tint)]"
      >
        <span className="flex w-9 shrink-0 flex-col items-center leading-none text-[var(--text-tertiary)]">
          <span className="text-[11px] font-semibold uppercase">{d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
          <span className="tabular mt-0.5 text-[17px] font-bold text-[var(--text-secondary)]">{d.getUTCDate()}</span>
        </span>
        <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${e.kind === 'payment' ? 'bg-[rgba(18,137,90,0.1)] text-[var(--positive)]' : 'bg-[var(--tint)] text-[var(--ink)]'}`}>
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`truncate text-[15px] font-semibold ${e.deletedAt ? 'line-through text-[var(--text-tertiary)]' : ''}`}>{e.kind === 'payment' ? 'Payment' : e.description}</span>
            {e.repeatInterval !== 'never' && <Repeat aria-label="Repeats" className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />}
          </span>
          <span className="block truncate text-[13px] text-[var(--text-tertiary)]">{payerLine(e, mePersonId)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end text-right">
          {pos.label && <span className="text-[12px] text-[var(--text-tertiary)]">{pos.label}</span>}
          {pos.amount && (
            <span className={`tabular whitespace-nowrap text-[14px] font-bold ${pos.tone === 'positive' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{pos.amount}</span>
          )}
        </span>
      </Link>
    </li>
  )
}

/** Shared expenses grouped by month, newest first, loaded page by page. */
export function ExpenseFeed({ groupId, friendId, q, mePersonId, emptyLabel = 'No expenses yet' }: {
  groupId?: string
  friendId?: string
  q?: string
  mePersonId?: string
  emptyLabel?: string
}) {
  const query = useInfiniteQuery({
    queryKey: splitKeys.expenses({ groupId, friendId, q }),
    queryFn: ({ pageParam }) => getSharedExpenses({ groupId, friendId, q: q || undefined, before: pageParam, limit: PAGE }),
    initialPageParam: undefined as ExpenseCursor | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  })
  if (query.isLoading) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>
  if (query.error) return <p role="alert" className="py-10 text-center text-sm text-[var(--negative)]">{query.error.message}</p>
  const items = query.data?.pages.flatMap((p) => p.data) ?? []
  if (items.length === 0) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">{q ? 'Nothing matches that search.' : emptyLabel}</p>

  const months: Array<{ key: string; label: string; items: SharedExpense[] }> = []
  for (const e of items) {
    const key = e.date.slice(0, 7)
    const last = months[months.length - 1]
    if (last?.key === key) last.items.push(e)
    else months.push({ key, label: monthLabel(e.date), items: [e] })
  }
  return (
    <div>
      {months.map((m) => (
        <section key={m.key} aria-label={m.label}>
          <h3 className="pb-1 pt-3 text-[13px] font-bold text-[var(--text-secondary)]">{m.label}</h3>
          <ul>{m.items.map((e) => <ExpenseRow key={e.id} e={e} mePersonId={mePersonId} />)}</ul>
        </section>
      ))}
      {query.hasNextPage && (
        <div className="flex justify-center pt-4">
          <button type="button" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage} className="h-11 rounded-lg bg-[var(--tint)] px-5 text-[14px] font-semibold">
            {query.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </button>
        </div>
      )}
    </div>
  )
}
