import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Inbox } from 'lucide-react'
import { getInbox } from '@/lib/api'

export function InboxNudge() {
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox, staleTime: 60_000 })
  const pending = (inboxQuery.data?.data ?? []).filter((p) => p.status === 'pending').length
  if (pending === 0) return null

  return (
    <Link
      to="/inbox"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-[var(--accent-blue)]/30 bg-[var(--accent-dim)] px-5 py-3.5 no-underline transition-colors hover:bg-[var(--bg-ice-light)]"
    >
      <Inbox className="size-5 shrink-0 text-[var(--accent-blue)]" />
      <p className="flex-1 text-sm font-medium text-[var(--text-primary)]">
        {pending === 1 ? '1 transaction is waiting for your approval' : `${pending} transactions are waiting for your approval`}
      </p>
      <ArrowRight className="size-4 shrink-0 text-[var(--accent-blue)]" />
    </Link>
  )
}
