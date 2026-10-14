import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, HandCoins, Pencil, Repeat, Trash2, Undo2 } from 'lucide-react'
import {
  addSplitComment,
  deleteSharedExpense,
  deleteSplitComment,
  getCategories,
  getSharedExpense,
  getSplitComments,
  getWallets,
  restoreSharedExpense,
} from '@/lib/api'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { useSharedCategoryIcon } from '@/hooks/use-category-icons'
import { formatAmount, isZeroAmount } from '@/lib/split'
import { relativeTime } from '@/lib/splitActivity'
import { ExpenseSheet, REPEAT_OPTIONS } from '@/components/shared/ExpenseSheet'
import { shortDate } from '@/components/shared/ExpenseFeed'
import { SettleUpSheet } from '@/components/shared/SettleUpSheet'
import { Avatar, ErrorText, dangerButton, fieldClass, secondaryButton } from '@/components/shared/ui'

function longDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function ExpensePage() {
  const { expenseId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useSplitMe().data?.data
  const query = useQuery({ queryKey: splitKeys.expense(expenseId), queryFn: () => getSharedExpense(expenseId) })
  const commentsQuery = useQuery({ queryKey: splitKeys.comments(expenseId), queryFn: () => getSplitComments(expenseId) })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [comment, setComment] = useState('')

  const del = useMutation({ mutationFn: () => deleteSharedExpense(expenseId), onSuccess: () => { setConfirmDelete(false); invalidateShared(qc) } })
  const restore = useMutation({ mutationFn: () => restoreSharedExpense(expenseId), onSuccess: () => invalidateShared(qc) })
  const addComment = useMutation({
    mutationFn: () => addSplitComment(expenseId, comment.trim()),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: splitKeys.comments(expenseId) }); qc.invalidateQueries({ queryKey: splitKeys.activity }) },
  })
  const removeComment = useMutation({
    mutationFn: deleteSplitComment,
    onSuccess: () => qc.invalidateQueries({ queryKey: splitKeys.comments(expenseId) }),
  })

  const e = query.data?.data
  const isPayment = e?.kind === 'payment'
  const CategoryIcon = useSharedCategoryIcon(e?.category)
  const Icon = isPayment ? HandCoins : CategoryIcon
  const category = me?.categories.find((c) => c.slug === e?.category)
  const wallet = walletsQuery.data?.data.find((w) => w.id === e?.myBooks?.fundingWalletId)
  const myCategory = categoriesQuery.data?.data.find((c) => c.id === e?.myBooks?.categoryId)
  const net = e?.me ? Number(e.me.net) : 0

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-8 lg:pt-8">
      <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/shared'))} className="-ml-1 mb-2 inline-flex h-10 items-center gap-0.5 text-[14px] font-semibold text-[var(--text-secondary)]">
        <ChevronLeft className="size-5" /> Back
      </button>
      {query.isLoading && <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>}
      {query.error && <ErrorText>{query.error.message}</ErrorText>}
      {e && (
        <>
          {e.deletedAt && (
            <div role="status" className="mb-4 flex items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--negative)_8%,white)] px-3.5 py-2.5">
              <span className="min-w-0 flex-1 text-[14px] font-medium text-[var(--negative)]">This {isPayment ? 'payment' : 'expense'} was deleted.</span>
              <button type="button" className={`${secondaryButton} h-9 bg-white`} disabled={restore.isPending} onClick={() => restore.mutate()}>
                <Undo2 className="size-4" /> {restore.isPending ? 'Restoring…' : 'Restore'}
              </button>
            </div>
          )}
          <ErrorText>{restore.error?.message}</ErrorText>

          <header className="mb-5 flex items-start gap-3.5">
            <span aria-hidden className={`flex size-14 shrink-0 items-center justify-center rounded-lg ${isPayment ? 'bg-[rgba(18,137,90,0.1)] text-[var(--positive)]' : 'bg-[var(--tint)] text-[var(--ink)]'}`}>
              <Icon className="size-7" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">{isPayment ? 'Payment' : e.description}</h1>
              <p className="tabular mt-0.5 text-[28px] font-bold leading-tight">{formatAmount(e.cost, e.currency)}</p>
              <p className="mt-1 text-[13px] text-[var(--text-tertiary)]">
                {longDate(e.date)}
                {e.groupId && e.groupName && <> · <Link to={`/shared/groups/${e.groupId}`} className="font-semibold text-[var(--text-secondary)]">{e.groupName}</Link></>}
              </p>
            </div>
          </header>

          {!e.deletedAt && (
            <div className="mb-6 grid grid-cols-2 gap-2">
              <button type="button" className={secondaryButton} onClick={() => setEditing(true)} disabled={!me}><Pencil className="size-4" /> Edit</button>
              {!confirmDelete ? (
                <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /> Delete</button>
              ) : (
                <button type="button" className={dangerButton} onClick={() => del.mutate()} disabled={del.isPending}>{del.isPending ? 'Deleting…' : 'Tap to confirm'}</button>
              )}
            </div>
          )}
          <ErrorText>{del.error?.message}</ErrorText>

          {e.me && !isZeroAmount(e.me.net) && (
            <p className={`mb-4 text-[15px] font-bold ${net > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {isPayment ? (net > 0 ? `You paid ${formatAmount(net, e.currency)}` : `You received ${formatAmount(-net, e.currency)}`) : net > 0 ? `You lent ${formatAmount(net, e.currency)}` : `You borrowed ${formatAmount(-net, e.currency)}`}
            </p>
          )}

          <section aria-label="Who paid and who owes" className="mb-6">
            <ul className="grid gap-1">
              {e.shares.map((s) => {
                const who = s.personId === me?.personId ? 'You' : s.name
                const parts = isPayment
                  ? [Number(s.paid) > 0 ? `paid ${formatAmount(s.paid, e.currency)}` : `received ${formatAmount(s.owed, e.currency)}`]
                  : [
                      Number(s.paid) > 0 ? `paid ${formatAmount(s.paid, e.currency)}` : null,
                      Number(s.owed) > 0 ? `${who === 'You' ? 'owe' : 'owes'} ${formatAmount(s.owed, e.currency)}` : null,
                    ].filter(Boolean)
                return (
                  <li key={s.personId} className="flex min-h-12 items-center gap-3">
                    <Avatar name={s.name} size={34} tone={s.personId === me?.personId ? 'ink' : 'tint'} />
                    <span className="min-w-0 flex-1 text-[14.5px]"><span className="font-semibold">{who}</span> {parts.join(' and ')}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <dl className="mb-6 grid gap-2.5 rounded-lg bg-[var(--tint)] px-4 py-3.5 text-[14px]">
            {!isPayment && (
              <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Category</dt><dd className="text-right font-semibold">{category?.label ?? e.category}</dd></div>
            )}
            {e.repeatInterval !== 'never' && (
              <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Repeats</dt><dd className="flex flex-wrap items-center justify-end gap-x-1 text-right font-semibold"><Repeat className="size-3.5" />{REPEAT_OPTIONS.find((r) => r.value === e.repeatInterval)?.label}{e.nextRepeatAt && !e.deletedAt && <span className="font-normal text-[var(--text-secondary)]">· next {shortDate(e.nextRepeatAt)}</span>}</dd></div>
            )}
            {e.myBooks && (
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-tertiary)]">In my books</dt>
                <dd className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">
                  {e.myBooks.linkedTransactionId ? 'Linked to a transaction' : wallet ? `${isPayment && net < 0 ? 'Into' : 'From'} ${wallet.name}${e.myBooks.fundingAmount ? ` · ${formatAmount(e.myBooks.fundingAmount, wallet.currency)}` : ''}` : 'Friends balance only'}
                  {myCategory && !isPayment ? ` · ${myCategory.name}` : ''}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Added</dt><dd className="text-right">{e.createdBy.personId === me?.personId ? 'You' : e.createdBy.name}, {relativeTime(e.createdAt)}</dd></div>
            {e.updatedBy && e.updatedAt !== e.createdAt && (
              <div className="flex justify-between gap-3"><dt className="text-[var(--text-tertiary)]">Updated</dt><dd className="text-right">{e.updatedBy.personId === me?.personId ? 'You' : e.updatedBy.name}, {relativeTime(e.updatedAt)}</dd></div>
            )}
          </dl>

          {e.notes && (
            <section aria-label="Notes" className="mb-6">
              <h2 className="mb-1 text-[15px] font-bold">Notes</h2>
              <p className="whitespace-pre-wrap text-[14.5px] text-[var(--text-secondary)] [overflow-wrap:anywhere]">{e.notes}</p>
            </section>
          )}

          <section aria-label="Comments">
            <h2 className="mb-2 text-[18px] font-bold">Comments</h2>
            {commentsQuery.data?.data.length === 0 && <p className="mb-3 text-[13.5px] text-[var(--text-tertiary)]">No comments yet.</p>}
            <ul className="mb-3 grid gap-2">
              {commentsQuery.data?.data.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.name} size={30} />
                  <div className="min-w-0 flex-1 rounded-lg bg-[var(--tint)] px-3 py-2">
                    <p className="text-[12.5px] font-semibold text-[var(--text-secondary)]">{c.isMine ? 'You' : c.name} · {relativeTime(c.createdAt)}</p>
                    <p className="whitespace-pre-wrap text-[14.5px] [overflow-wrap:anywhere]">{c.body}</p>
                  </div>
                  {c.isMine && (
                    <button type="button" aria-label="Delete comment" disabled={removeComment.isPending} onClick={() => removeComment.mutate(c.id)} className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] active:bg-[var(--tint)]">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (comment.trim()) addComment.mutate() }}>
              <input className={fieldClass} value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="Add a comment" aria-label="Add a comment" maxLength={1000} />
              <button type="submit" className={secondaryButton} disabled={!comment.trim() || addComment.isPending}>Post</button>
            </form>
            <ErrorText>{addComment.error?.message ?? removeComment.error?.message}</ErrorText>
          </section>

          {isPayment ? (
            <SettleUpSheet open={editing} onClose={() => setEditing(false)} edit={e} />
          ) : (
            <ExpenseSheet open={editing} mode={{ kind: 'edit', expense: e }} onClose={() => setEditing(false)} />
          )}
        </>
      )}
    </main>
  )
}
