import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox as InboxIcon } from 'lucide-react'
import { approveProposal, getInbox, getRecentTransactionsPage } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { ProposalCard, asRecent, findDuplicate, invalidateLedger } from '@/components/ProposalCard'
import type { Proposal, RecentTransaction } from '@/lib/api'

export function InboxPage() {
  const qc = useQueryClient()
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox })
  // Recent ledger rows, to warn when a draft was already logged by hand.
  const recentQuery = useQuery({ queryKey: ['recent-page', 'inbox-dupes'], queryFn: () => getRecentTransactionsPage({ limit: 200 }), staleTime: 30_000 })
  const proposals = inboxQuery.data?.data ?? []
  const pending = proposals.filter((p) => p.status === 'pending')
  const resolved = proposals.filter((p) => p.status !== 'pending').slice(0, 30)
  const recent = recentQuery.data?.data ?? []

  // Check each draft against the ledger and against the drafts listed above it.
  const duplicates = new Map<string, RecentTransaction | null>()
  pending.forEach((p, i) => {
    const earlier = pending.slice(0, i).map(asRecent).filter((r): r is RecentTransaction => r !== null)
    duplicates.set(p.id, findDuplicate(p, recent) ?? findDuplicate(p, earlier))
  })
  const approvable = pending.filter((p: Proposal) => p.source !== 'digest' && !duplicates.get(p.id))
  const approveAll = useMutation({
    mutationFn: async () => {
      // One at a time: each approval books a transaction and may race a recurring auto-post.
      for (const p of approvable) await approveProposal(p.id).catch(() => undefined)
    },
    onSettled: () => invalidateLedger(qc),
  })

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-8 pt-6 lg:px-8 lg:pt-10">
      <PageHeader
        title="Inbox"
        description="Drafts from the Assistant, agents and recurring rules. Nothing is booked until you approve it."
        action={approvable.length > 1 ? (
          <button
            type="button"
            onClick={() => approveAll.mutate()}
            disabled={approveAll.isPending}
            className="h-10 rounded-xl bg-[var(--ink)] px-4 text-[14px] font-bold text-[var(--cream)] disabled:opacity-50"
          >
            {approveAll.isPending ? 'Approving…' : `Approve ${approvable.length}`}
          </button>
        ) : undefined}
      />

      {proposals.length === 0 && !inboxQuery.isLoading && (
        <div className="rounded-2xl bg-[var(--tint)] px-6 py-8 text-center">
          <InboxIcon className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-[15px] font-semibold text-[var(--text-primary)]">Nothing to review</p>
          <p className="pt-1 text-[14px] text-[var(--text-secondary)]">When the Assistant or an agent records something, it waits here for you first.</p>
        </div>
      )}

      {pending.length === 0 && proposals.length > 0 && (
        <p className="rounded-2xl bg-[var(--tint)] px-4 py-4 text-[15px] font-semibold">All caught up.</p>
      )}

      <div className="grid gap-3">
        {pending.map((p) => <ProposalCard key={p.id} proposal={p} duplicate={duplicates.get(p.id)} />)}
      </div>

      {resolved.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-[14px] font-semibold text-[var(--text-secondary)]">Recently resolved ({resolved.length})</summary>
          <div className="mt-3 grid gap-2">
            {resolved.map((p) => <ProposalCard key={p.id} proposal={p} compact />)}
          </div>
        </details>
      )}
    </main>
  )
}
