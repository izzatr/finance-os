import { useQuery } from '@tanstack/react-query'
import { getInbox } from '@/lib/api'

/** Pending approvals, shared by the sidebar badge, the More tab dot and the Home nudge. */
export function usePendingInbox(): number {
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox, staleTime: 60_000 })
  return (inboxQuery.data?.data ?? []).filter((p) => p.status === 'pending').length
}
