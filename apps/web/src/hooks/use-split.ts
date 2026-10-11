import { useQuery, type QueryClient } from '@tanstack/react-query'
import { getSplitMe } from '@/lib/api'

/** Query keys for shared expenses. Everything lives under ['split', ...] so one call refreshes it all. */
export const splitKeys = {
  all: ['split'] as const,
  me: ['split', 'me'] as const,
  friends: ['split', 'friends'] as const,
  friend: (id: string) => ['split', 'friend', id] as const,
  groups: ['split', 'groups'] as const,
  deletedGroups: ['split', 'groups', 'deleted'] as const,
  group: (id: string) => ['split', 'group', id] as const,
  expenses: (filters: { groupId?: string; friendId?: string; q?: string }) => ['split', 'expenses', filters] as const,
  expense: (id: string) => ['split', 'expense', id] as const,
  comments: (id: string) => ['split', 'comments', id] as const,
  activity: ['split', 'activity'] as const,
}

/** Personal-books aggregates that a shared write can change (it projects into the user's ledger). */
const LEDGER_KEYS = [
  'wallets', 'wallet', 'wallet-transactions', 'recent', 'recent-page', 'transactions', 'dashboard', 'summary',
  'summary-monthly', 'categories', 'monthly-trend', 'asset-growth', 'net-worth', 'month-report',
]

/** After any shared write: refresh shared state and every aggregate of the user's own books. */
export function invalidateShared(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: splitKeys.all })
  for (const key of LEDGER_KEYS) qc.invalidateQueries({ queryKey: [key] })
}

export function useSplitMe(enabled = true) {
  return useQuery({ queryKey: splitKeys.me, queryFn: getSplitMe, staleTime: 60_000, enabled })
}

/** Unread shared activity, for the nav badge. */
export function useSplitUnread(): number {
  return useSplitMe().data?.data.unreadActivity ?? 0
}
