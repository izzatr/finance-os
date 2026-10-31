import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { getSplitActivity, patchSplitMe, type ActivityCursor } from '@/lib/api'
import { splitKeys } from '@/hooks/use-split'
import { activityLink, activitySentence, relativeTime } from '@/lib/splitActivity'
import { formatAmount } from '@/lib/split'
import { Avatar } from './ui'

/**
 * Shared activity, newest first. Loading the first page while the tab is on screen is what
 * "viewing" means, so the fetch itself marks activity as seen (no effect needed).
 */
export function ActivityFeed() {
  const qc = useQueryClient()
  const query = useInfiniteQuery({
    queryKey: splitKeys.activity,
    queryFn: async ({ pageParam }) => {
      const page = await getSplitActivity({ before: pageParam, limit: 30 })
      if (!pageParam && page.data.some((a) => a.unread)) {
        await patchSplitMe({ activitySeen: true }).catch(() => undefined)
        void qc.invalidateQueries({ queryKey: splitKeys.me })
      }
      return page
    },
    initialPageParam: undefined as ActivityCursor | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
  })
  if (query.isLoading) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>
  if (query.error) return <p role="alert" className="py-10 text-center text-sm text-[var(--negative)]">{query.error.message}</p>
  const items = query.data?.pages.flatMap((p) => p.data) ?? []
  if (items.length === 0) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Nothing has happened yet.</p>
  return (
    <div>
      <ul className="grid gap-1">
        {items.map((a) => {
          const link = activityLink(a)
          const cost = typeof a.data.cost === 'string' ? a.data.cost : null
          const currency = typeof a.data.currency === 'string' ? a.data.currency : null
          const body = (
            <>
              <Avatar name={a.isMine ? 'You' : a.actorName ?? '?'} size={36} tone={a.unread ? 'ink' : 'tint'} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[14.5px] leading-snug ${a.unread ? 'font-bold' : 'font-medium'} text-[var(--text-primary)] [overflow-wrap:anywhere]`}>{activitySentence(a)}</span>
                <span className="mt-0.5 block text-[12.5px] text-[var(--text-tertiary)]">
                  {relativeTime(a.createdAt)}
                  {cost && currency && a.kind.startsWith('expense.') ? ` · ${formatAmount(cost, currency)}` : ''}
                </span>
              </span>
              {a.unread && <span aria-label="New" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-[var(--negative)]" />}
            </>
          )
          const cls = `flex items-start gap-3 rounded-lg px-2 py-2.5 ${a.unread ? 'bg-[var(--tint)]' : ''}`
          return (
            <li key={a.id}>
              {link ? <Link to={link} className={`${cls} no-underline active:bg-[var(--tint-strong)]`}>{body}</Link> : <div className={cls}>{body}</div>}
            </li>
          )
        })}
      </ul>
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
