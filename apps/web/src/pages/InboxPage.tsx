import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Inbox as InboxIcon, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { approveProposal, getInbox, rejectProposal, type Proposal } from '@/lib/api'

function proposalSummary(p: Proposal): { title: string; amount: string | null } {
  if (p.source === 'digest') {
    return { title: (p.payload as { digest?: string | null }).digest ?? 'Your weekly money recap is ready.', amount: null }
  }
  const tx = p.payload.transaction
  const amount = tx?.entries?.[0]?.amount ?? null
  return { title: tx?.description ?? 'Transaction proposal', amount }
}

function sourceBadge(source: string): string {
  switch (source) {
    case 'recurring_draft': return 'Recurring'
    case 'ai_chat': return 'AI assistant'
    case 'mcp': return 'Agent'
    case 'digest': return 'Digest'
    case 'draft': return 'Draft'
    default: return source
  }
}

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const qc = useQueryClient()
  const invalidate = () => {
    for (const key of [
      'inbox', 'wallets', 'recent', 'transactions', 'dashboard', 'summary', 'summary-monthly',
      'categories', 'monthly-trend', 'asset-growth', 'net-worth', 'shared-balances',
    ]) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
  const approve = useMutation({
    mutationFn: () => approveProposal(proposal.id),
    onSettled: invalidate, // 409s (already booked / resolved) also refresh the list
  })
  const reject = useMutation({ mutationFn: () => rejectProposal(proposal.id), onSettled: invalidate })

  const { title, amount } = proposalSummary(proposal)
  const pending = proposal.status === 'pending'

  return (
    <div className={`rounded-xl bg-white px-4 py-3 shadow-[var(--shadow-card)] ${pending ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--accent-dim)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-blue)]">
              {sourceBadge(proposal.source)}
            </span>
            <span className="truncate text-xs text-[var(--text-tertiary)]">{proposal.actorLabel}</span>
          </div>
          <p className="truncate pt-1 text-sm font-medium text-[var(--text-primary)]">{title}</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {new Date(proposal.createdAt).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
            {proposal.status !== 'pending' && ` · ${proposal.status}`}
          </p>
        </div>
        {amount && (
          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
            {amount}
          </span>
        )}
      </div>
      {pending && (
        <div className="flex gap-2 pt-3">
          {proposal.source !== 'digest' && (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => approve.mutate()}
              disabled={approve.isPending || reject.isPending}
            >
              <CheckCircle2 className="size-4" /> Approve
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onClick={() => reject.mutate()}
            disabled={approve.isPending || reject.isPending}
          >
            <XCircle className="size-4" /> {proposal.source === 'digest' ? 'Dismiss' : 'Reject'}
          </Button>
        </div>
      )}
      {approve.isError && (
        <p className="pt-2 text-xs text-[var(--negative)]" role="alert">{(approve.error as Error).message}</p>
      )}
    </div>
  )
}

export function InboxPage() {
  const inboxQuery = useQuery({ queryKey: ['inbox'], queryFn: getInbox })
  const proposals = inboxQuery.data?.data ?? []
  const pending = proposals.filter((p) => p.status === 'pending')
  const resolved = proposals.filter((p) => p.status !== 'pending')

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
      <header className="pb-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Inbox</h1>
        <p className="text-xs text-[var(--text-tertiary)]">Drafts from recurring rules and agents wait here for your approval.</p>
      </header>

      {proposals.length === 0 && !inboxQuery.isLoading && (
        <div className="rounded-xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <InboxIcon className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-sm font-medium text-[var(--text-primary)]">Nothing to review</p>
          <p className="pt-1 text-xs text-[var(--text-tertiary)]">
            Recurring drafts and agent proposals will ask for approval here before touching your ledger.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        {pending.map((p) => <ProposalCard key={p.id} proposal={p} />)}
      </div>

      {resolved.length > 0 && (
        <details className="pt-5">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Resolved ({resolved.length})
          </summary>
          <div className="grid gap-2 pt-2">
            {resolved.map((p) => <ProposalCard key={p.id} proposal={p} />)}
          </div>
        </details>
      )}
    </div>
  )
}
