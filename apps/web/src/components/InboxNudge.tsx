import { Link } from 'react-router-dom'
import { ArrowRight, Inbox } from 'lucide-react'
import { usePendingInbox } from '@/hooks/use-pending-inbox'

export function InboxNudge() {
  const pending = usePendingInbox()
  if (pending === 0) return null

  return (
    <Link
      to="/inbox"
      className="mb-6 flex items-center gap-3 rounded-2xl bg-[var(--tint)] px-4 py-3.5 no-underline transition-colors hover:bg-[var(--tint-strong)]"
    >
      <Inbox className="size-5 shrink-0 text-[var(--ink)]" />
      <p className="flex-1 text-sm font-medium text-[var(--text-primary)]">
        {pending === 1 ? '1 transaction is waiting for your approval' : `${pending} transactions are waiting for your approval`}
      </p>
      <ArrowRight className="size-4 shrink-0 text-[var(--ink)]" />
    </Link>
  )
}
