import { useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { DatePicker } from '@/components/ui/date-picker'
import { Dropdown } from '@/components/ui/dropdown'
import { AlertTriangle, Check, Pencil, X } from 'lucide-react'
import {
  approveProposal,
  editProposal,
  getCategories,
  getWallets,
  rejectProposal,
  type Proposal,
  type RecentTransaction,
} from '@/lib/api'
import { categoryIcon } from '@/lib/categoryIcon'
import { dayLabel, formatSigned } from '@/lib/format'

/** Everything an approval can change; refresh it all so Home, Activity and Reports agree. */
export function invalidateLedger(qc: QueryClient) {
  for (const key of [
    'inbox', 'wallets', 'wallet', 'recent', 'recent-page', 'transactions', 'dashboard', 'summary', 'summary-monthly',
    'categories', 'monthly-trend', 'asset-growth', 'net-worth', 'month-report', 'split', 'wallet-transactions',
  ]) {
    qc.invalidateQueries({ queryKey: [key] })
  }
}

export function sourceLabel(p: Proposal): string {
  switch (p.source) {
    case 'ai_chat': return 'From the Assistant'
    case 'mcp': return p.actorLabel ? `From ${p.actorLabel}` : 'From an agent'
    case 'recurring_draft': return 'Recurring draft'
    case 'digest': return 'Weekly recap'
    case 'draft': return p.actorLabel ? `Draft from ${p.actorLabel}` : 'Draft'
    default: return p.actorLabel || p.source
  }
}

/** A pending draft as a ledger-like row, so drafts can be checked against each other. */
export function asRecent(p: Proposal): RecentTransaction | null {
  const tx = p.payload.transaction
  const amount = Number(tx?.entries?.[0]?.amount)
  if (!tx?.transactionDate || !tx.description || !Number.isFinite(amount)) return null
  return { id: p.id, entryId: p.id, transactionDate: tx.transactionDate, type: tx.type ?? 'expense', description: tx.description, notes: null, categoryName: null, amount, currency: '', walletName: '' }
}

/** Same amount, similar description, within 3 days: probably already logged. */
export function findDuplicate(p: Proposal, recent: RecentTransaction[]): RecentTransaction | null {
  const tx = p.payload.transaction
  const amount = Number(tx?.entries?.[0]?.amount)
  const date = tx?.transactionDate?.slice(0, 10)
  const desc = (tx?.description ?? '').trim().toLowerCase()
  if (!tx || !Number.isFinite(amount) || !date || !desc) return null
  const day = Date.parse(`${date}T12:00:00Z`)
  return recent.find((r) => {
    if (Math.abs(Math.abs(r.amount) - Math.abs(amount)) > 0.005) return false
    if (Math.abs(Date.parse(r.transactionDate) - day) > 3 * 86_400_000) return false
    const other = r.description.trim().toLowerCase()
    return other === desc || other.includes(desc) || desc.includes(other)
  }) ?? null
}

const field = 'h-11 w-full min-w-0 rounded-xl border border-[var(--border-medium)] bg-white px-3 text-[15px] outline-none focus-visible:border-[var(--ink)]'

export function ProposalCard({ proposal, duplicate, compact = false }: { proposal: Proposal; duplicate?: RecentTransaction | null; compact?: boolean }) {
  const qc = useQueryClient()
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets, staleTime: 60_000 })
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories, staleTime: 60_000 })
  const [editing, setEditing] = useState(false)

  const tx = proposal.payload.transaction
  const entry = tx?.entries?.[0]
  const wallets = walletsQuery.data?.data ?? []
  const categories = categoriesQuery.data?.data ?? []
  const wallet = wallets.find((w) => w.id === entry?.walletId)
  const category = categories.find((c) => c.id === tx?.categoryId)
  const pending = proposal.status === 'pending'
  const isDigest = proposal.source === 'digest'
  const editable = pending && !isDigest && tx?.entries?.length === 1 && (tx.type === 'expense' || tx.type === 'income')

  const approve = useMutation({ mutationFn: () => approveProposal(proposal.id), onSettled: () => invalidateLedger(qc) })
  const reject = useMutation({ mutationFn: () => rejectProposal(proposal.id), onSettled: () => invalidateLedger(qc) })
  const busy = approve.isPending || reject.isPending
  const error = (approve.error ?? reject.error) as Error | null

  if (isDigest) {
    return (
      <article className="rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-4">
        <p className="text-[13px] font-semibold text-[var(--text-tertiary)]">{sourceLabel(proposal)}</p>
        <p className="mt-1 whitespace-pre-wrap text-[15px] text-[var(--text-primary)]">{proposal.payload.digest ?? 'Your weekly money recap is ready.'}</p>
        {pending && (
          <button type="button" onClick={() => reject.mutate()} disabled={busy} className="mt-3 h-10 rounded-xl bg-[var(--tint)] px-4 text-[14px] font-semibold">
            Dismiss
          </button>
        )}
      </article>
    )
  }

  const Icon = categoryIcon(category?.name, tx?.type)
  const amount = entry ? Number(entry.amount) : null
  const date = tx?.transactionDate?.slice(0, 10)
  const meta = [wallet?.name, category?.name ?? (tx?.type === 'transfer' ? 'Transfer' : 'No category'), date ? dayLabel(date) : null].filter(Boolean).join(' · ')

  return (
    <article className={`rounded-2xl border border-[var(--border-subtle)] bg-white ${compact ? 'px-3.5 py-3' : 'px-4 py-4'} ${pending ? '' : 'opacity-70'}`}>
      {!compact && <p className="text-[13px] font-semibold text-[var(--text-tertiary)]">{sourceLabel(proposal)}</p>}
      <div className={`flex items-center gap-3 ${compact ? '' : 'mt-2'}`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{tx?.description ?? 'Transaction'}</p>
          <p className="truncate text-[13px] text-[var(--text-tertiary)]">{meta}</p>
        </div>
        {amount !== null && Number.isFinite(amount) && (
          <span className={`tabular shrink-0 text-[15px] font-semibold ${amount > 0 ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]'}`}>
            {formatSigned(amount, wallet?.currency ?? '')}
          </span>
        )}
      </div>

      {(tx?.splits?.length ?? 0) > 0 && (
        <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Split: others owe {tx!.splits!.reduce((s, x) => s + Number(x.amount), 0).toFixed(2)} of this.</p>
      )}

      {pending && duplicate && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--tint)] px-3 py-2 text-[13px] text-[var(--text-secondary)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--negative)]" />
          <span>
            {duplicate.entryId === duplicate.id && duplicate.walletName === ''
              ? <>Same as another draft above. Approve only one of them.</>
              : <>Looks like <b className="font-semibold text-[var(--text-primary)]">{duplicate.description}</b> ({dayLabel(duplicate.transactionDate.slice(0, 10))}) is already logged.</>}
          </span>
        </p>
      )}

      {editing && editable && tx && entry && (
        <EditForm
          proposal={proposal}
          initial={{
            description: tx.description ?? '',
            amount: String(Math.abs(Number(entry.amount))),
            date: date ?? '',
            walletId: entry.walletId ?? '',
            categoryId: tx.categoryId ?? '',
          }}
          type={tx.type as 'expense' | 'income'}
          onDone={() => setEditing(false)}
        />
      )}

      {pending && !editing && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => approve.mutate()}
            disabled={busy}
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] text-[14px] font-bold text-[var(--cream)] disabled:opacity-50"
          >
            <Check className="size-4" strokeWidth={2.4} /> {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
          {editable && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label="Edit before approving"
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[var(--tint)] px-4 text-[14px] font-semibold disabled:opacity-50"
            >
              <Pencil className="size-4" /> Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => reject.mutate()}
            disabled={busy}
            aria-label="Reject"
            className="flex h-11 items-center justify-center rounded-xl bg-[var(--tint)] px-4 text-[14px] font-semibold disabled:opacity-50"
          >
            <X className="size-4" /> {compact ? '' : <span className="ml-1.5">Reject</span>}
          </button>
        </div>
      )}
      {!pending && <p className="mt-2 text-[13px] font-semibold capitalize text-[var(--text-tertiary)]">{proposal.status}</p>}
      {error && <p className="mt-2 text-[13px] text-[var(--negative)]" role="alert">{error.message}</p>}
    </article>
  )
}

function EditForm({
  proposal,
  initial,
  type,
  onDone,
}: {
  proposal: Proposal
  initial: { description: string; amount: string; date: string; walletId: string; categoryId: string }
  type: 'expense' | 'income'
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(initial)
  const wallets = (useQuery({ queryKey: ['wallets'], queryFn: getWallets }).data?.data ?? []).filter((w) => (w.isActive && !w.systemRole) || w.id === initial.walletId)
  const categories = (useQuery({ queryKey: ['category-list'], queryFn: getCategories }).data?.data ?? []).filter((c) => c.type === type)
  const save = useMutation({
    mutationFn: () =>
      editProposal(proposal.id, {
        description: form.description.trim(),
        amount: form.amount.replace(',', '.'),
        date: form.date,
        walletId: form.walletId,
        categoryId: form.categoryId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox'] })
      onDone()
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const valid = form.description.trim() !== '' && /^\d+([.,]\d+)?$/.test(form.amount) && /^\d{4}-\d{2}-\d{2}$/.test(form.date) && form.walletId !== ''

  return (
    <form
      className="mt-3 grid gap-2.5 border-t border-[var(--border-subtle)] pt-3"
      onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate() }}
    >
      <label className="grid gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
        Description
        <input className={field} value={form.description} onChange={set('description')} />
      </label>
      <div className="grid grid-cols-2 gap-2.5">
        <label className="grid gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
          Amount
          <input className={`${field} tabular`} inputMode="decimal" value={form.amount} onChange={set('amount')} />
        </label>
        <div className="grid gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
          <span aria-hidden>Date</span>
          <DatePicker aria-label="Date" value={form.date} onChange={(v) => set('date')({ target: { value: v } })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="grid gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
          <span aria-hidden>Wallet</span>
          <Dropdown aria-label="Wallet" value={form.walletId} onChange={(v) => set('walletId')({ target: { value: v } })} options={wallets.map((w) => ({ value: w.id, label: w.name, hint: w.currency }))} />
        </div>
        <div className="grid gap-1 text-[13px] font-semibold text-[var(--text-secondary)]">
          <span aria-hidden>Category</span>
          <Dropdown aria-label="Category" searchable value={form.categoryId} onChange={(v) => set('categoryId')({ target: { value: v } })} options={[{ value: '', label: 'No category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
      </div>
      {save.isError && <p className="text-[13px] text-[var(--negative)]" role="alert">{(save.error as Error).message}</p>}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={!valid || save.isPending} className="h-11 flex-1 rounded-xl bg-[var(--ink)] text-[14px] font-bold text-[var(--cream)] disabled:opacity-50">
          {save.isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onDone} className="h-11 rounded-xl bg-[var(--tint)] px-4 text-[14px] font-semibold">Cancel</button>
      </div>
    </form>
  )
}
