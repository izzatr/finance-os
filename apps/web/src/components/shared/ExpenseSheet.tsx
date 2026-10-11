import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Users } from 'lucide-react'
import {
  ApiError,
  createSharedExpense,
  getCategories,
  getRecentTransactions,
  getSplitFriends,
  getSplitGroup,
  getSplitGroups,
  getWallets,
  pickableWallets,
  updateSharedExpense,
  type RepeatInterval,
  type SharedCategory,
  type SharedExpense,
  type SplitGroup,
  type SplitMe,
} from '@/lib/api'
import { splitKeys, invalidateShared, useSplitMe } from '@/hooks/use-split'
import { buildExpensePayload, draftFromExpense, iPaid, newExpenseDraft, type ExpenseDraft } from '@/lib/expenseDraft'
import { emptySplitDraft, formatAmount } from '@/lib/split'
import { localDateKey } from '@/lib/money'
import { PaidByView, SplitView, paidSplitSentence, type Participant } from './SplitEditor'
import { Avatar, ErrorText, Field, FullSheet, fieldClass, primaryButton } from './ui'
import { DateField, DropdownField } from './DropdownField'
import { autoUserCategory } from '@/lib/sharedCategories'

export type ExpenseSheetMode =
  | { kind: 'new'; groupId?: string | null; friendIds?: string[] }
  | { kind: 'edit'; expense: SharedExpense }

const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'IDR', 'JPY', 'CHF', 'SGD', 'AUD', 'CAD', 'THB', 'MYR', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'INR', 'CNY', 'HKD', 'KRW', 'MXN', 'BRL', 'ZAR']

export const REPEAT_OPTIONS: Array<{ value: RepeatInterval; label: string }> = [
  { value: 'never', label: 'Does not repeat' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export function groupCategories(categories: SharedCategory[]) {
  const groups = new Map<string, SharedCategory[]>()
  for (const c of categories) groups.set(c.group, [...(groups.get(c.group) ?? []), c])
  return [...groups.entries()]
}

function currencyOptions(extra: string[]): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : []
  return [...new Set([...extra, ...COMMON_CURRENCIES, ...all])]
}

const currencyNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'currency' }) : null

/** Currency options with their English names, so "yen" or "krone" finds the code. */
export function currencyDropdown(extra: string[]) {
  return currencyOptions(extra).map((c) => {
    const name = currencyNames?.of(c) ?? c
    return { value: c, label: c, hint: name !== c ? name : undefined, keywords: [name] }
  })
}

/**
 * Add or edit a shared expense. Loads what the form needs first, then mounts the form with its
 * initial state, so nothing has to be synced into state after the fact.
 */
export function ExpenseSheet({ open, mode, onClose, onSaved }: {
  open: boolean
  mode: ExpenseSheetMode
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const meQuery = useSplitMe(open)
  const groupId = mode.kind === 'edit' ? mode.expense.groupId : mode.groupId ?? null
  const groupQuery = useQuery({ queryKey: splitKeys.group(groupId ?? 'none'), queryFn: () => getSplitGroup(groupId!), enabled: open && Boolean(groupId) })
  const me = meQuery.data?.data
  const ready = me && (!groupId || groupQuery.data || groupQuery.error)
  const [conflict, setConflict] = useState<string | null>(null)
  const title = mode.kind === 'edit' ? 'Edit expense' : 'Add an expense'

  if (!open) return null
  if (!ready) {
    return (
      <FullSheet open={open} onClose={onClose} title={title}>
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{meQuery.error ? meQuery.error.message : 'Loading…'}</p>
      </FullSheet>
    )
  }
  const key = mode.kind === 'edit' ? `${mode.expense.id}:${mode.expense.version}` : 'new'
  return (
    <ExpenseForm
      key={key}
      me={me}
      mode={mode}
      initialGroup={groupQuery.data?.data ?? null}
      conflict={conflict}
      onConflict={setConflict}
      onClose={() => { setConflict(null); onClose() }}
      onSaved={(id) => { setConflict(null); onSaved?.(id) }}
    />
  )
}

type View = 'main' | 'paid' | 'split' | 'with'

function ExpenseForm({ me, mode, initialGroup, conflict, onConflict, onClose, onSaved }: {
  me: SplitMe
  mode: ExpenseSheetMode
  initialGroup: SplitGroup | null
  conflict: string | null
  onConflict: (msg: string | null) => void
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const qc = useQueryClient()
  const friendsQuery = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends })
  const groupsQuery = useQuery({ queryKey: splitKeys.groups, queryFn: getSplitGroups })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })
  const recentQuery = useQuery({ queryKey: ['recent'], queryFn: getRecentTransactions, staleTime: 60_000 })

  const [group, setGroup] = useState<SplitGroup | null>(initialGroup)
  const [draft, setDraft] = useState<ExpenseDraft>(() => {
    if (mode.kind === 'edit') return draftFromExpense(mode.expense, me.personId)
    const friendIds = mode.friendIds ?? []
    const participants = initialGroup ? initialGroup.members.filter((m) => m.isCurrent).map((m) => m.personId) : [me.personId, ...friendIds]
    return newExpenseDraft({ mePersonId: me.personId, currency: me.defaultCurrency, date: localDateKey(), groupId: initialGroup?.id ?? null, friendIds, participants })
  })
  const [view, setView] = useState<View>('main')
  const [error, setError] = useState<string | null>(null)
  const [pickingGroup, setPickingGroup] = useState<string | null>(null)

  const friends = friendsQuery.data?.data ?? []
  const wallets = pickableWallets(walletsQuery.data?.data ?? [])
  const userCategories = (categoriesQuery.data?.data ?? []).filter((c) => c.type === 'expense')

  const participants: Participant[] = group
    ? group.members.filter((m) => m.isCurrent).map((m) => ({ personId: m.personId, name: m.isMe ? me.displayName : m.name, isMe: m.isMe }))
    : [
        { personId: me.personId, name: me.displayName, isMe: true },
        ...draft.friendIds.map((id) => {
          const f = friends.find((x) => x.personId === id)
          const share = mode.kind === 'edit' ? mode.expense.shares.find((s) => s.personId === id) : undefined
          return { personId: id, name: f?.name ?? share?.name ?? 'Friend', isMe: false }
        }),
      ]
  const ids = participants.map((p) => p.personId)
  const meIn = ids.includes(me.personId)
  const paidByMe = iPaid(draft, me.personId)
  const sentence = paidSplitSentence(draft.paid, draft.split.method, participants)
  const fundingWallet = wallets.find((w) => w.id === draft.books.walletId)
  const linkable = (recentQuery.data?.data ?? []).filter((t) => t.type === 'expense' && !t.friendsWallet && !t.sharedExpenseId && t.amount < 0)
  const walletCurrencies = wallets.map((w) => w.currency)

  const update = (patch: Partial<ExpenseDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }
  const updateBooks = (patch: Partial<ExpenseDraft['books']>) => update({ books: { ...draft.books, ...patch } })

  /** Switching who is in the expense resets payer and split to the new people. */
  function setParticipants(nextGroup: SplitGroup | null, friendIds: string[]) {
    const nextIds = nextGroup ? nextGroup.members.filter((m) => m.isCurrent).map((m) => m.personId) : [me.personId, ...friendIds]
    setGroup(nextGroup)
    setDraft((d) => ({
      ...d,
      groupId: nextGroup?.id ?? null,
      friendIds,
      paid: d.paid.mode === 'single' && nextIds.includes(d.paid.personId) ? d.paid : { mode: 'single', personId: me.personId },
      split: emptySplitDraft(nextIds),
    }))
  }

  async function chooseGroup(id: string) {
    setPickingGroup(id)
    try {
      const g = await qc.fetchQuery({ queryKey: splitKeys.group(id), queryFn: () => getSplitGroup(id) })
      setParticipants(g.data, [])
      setView('main')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that group')
    } finally {
      setPickingGroup(null)
    }
  }

  function toggleFriend(id: string) {
    const next = draft.friendIds.includes(id) ? draft.friendIds.filter((x) => x !== id) : [...draft.friendIds, id]
    setParticipants(null, next)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const built = buildExpensePayload(draft, ids, me.personId, wallets)
      if (!built.ok) throw new Error(built.error)
      if (mode.kind === 'edit') {
        await updateSharedExpense(mode.expense.id, { ...built.body, version: mode.expense.version })
        return mode.expense.id
      }
      return (await createSharedExpense(built.body)).data.id
    },
    onSuccess: (id) => {
      invalidateShared(qc)
      onSaved(id)
      onClose()
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT' && mode.kind === 'edit') {
        onConflict('Someone else changed this expense while you were editing. This is the latest version; make your change again.')
        qc.invalidateQueries({ queryKey: splitKeys.expense(mode.expense.id) })
        qc.invalidateQueries({ queryKey: ['split', 'expenses'] })
        return
      }
      setError(err.message)
    },
  })

  const title = view === 'paid' ? 'Who paid?' : view === 'split' ? 'Split options' : view === 'with' ? 'Split with' : mode.kind === 'edit' ? 'Edit expense' : 'Add an expense'
  const back = view === 'main' ? undefined : () => setView('main')

  const footer = view === 'main' ? (
    <div className="grid gap-2">
      <ErrorText>{error}</ErrorText>
      <button type="button" className={primaryButton} onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : 'Save'}
      </button>
    </div>
  ) : (
    <button type="button" className={primaryButton} onClick={() => setView('main')}>Done</button>
  )

  return (
    <FullSheet open onClose={onClose} onBack={back} title={title} footer={footer}>
      {view === 'paid' && (
        <PaidByView participants={participants} draft={draft.paid} onChange={(paid) => update({ paid })} cost={draft.cost} currency={draft.currency} />
      )}
      {view === 'split' && (
        <SplitView participants={participants} draft={draft.split} onChange={(split) => update({ split })} cost={draft.cost} currency={draft.currency} />
      )}
      {view === 'with' && (
        <div className="grid gap-5">
          {mode.kind === 'edit' && <p className="text-[13px] text-[var(--text-tertiary)]">Changing who is in it resets how it is split.</p>}
          {(groupsQuery.data?.data.length ?? 0) > 0 && (
            <section aria-label="Groups">
              <h3 className="pb-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">Groups</h3>
              <ul className="grid gap-1">
                {groupsQuery.data!.data.map((g) => (
                  <li key={g.id}>
                    <button type="button" role="radio" aria-checked={draft.groupId === g.id} onClick={() => void chooseGroup(g.id)} disabled={pickingGroup !== null}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-1 text-left active:bg-[var(--tint)]">
                      <Avatar name={g.name} size={34} tone={draft.groupId === g.id ? 'ink' : 'tint'} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g.name}</span>
                      {pickingGroup === g.id ? <span className="text-[13px] text-[var(--text-tertiary)]">Loading…</span> : draft.groupId === g.id && <Check className="size-5" />}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Friends">
            <h3 className="pb-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">Friends, outside a group</h3>
            {friends.filter((f) => f.isFriend).length === 0 && <p className="text-[13.5px] text-[var(--text-tertiary)]">Add friends on the Shared page first.</p>}
            <ul className="grid gap-1">
              {friends.filter((f) => f.isFriend).map((f) => {
                const on = !draft.groupId && draft.friendIds.includes(f.personId)
                return (
                  <li key={f.personId}>
                    <button type="button" role="checkbox" aria-checked={on} onClick={() => toggleFriend(f.personId)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-1 text-left active:bg-[var(--tint)]">
                      <Avatar name={f.name} size={34} tone={on ? 'ink' : 'tint'} />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{f.name}</span>
                      {on && <Check className="size-5" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}
      {view === 'main' && (
        <div className="grid gap-5 pt-1">
          {conflict && <p role="alert" className="rounded-lg bg-[color-mix(in_srgb,var(--negative)_8%,white)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--negative)]">{conflict}</p>}
          <button type="button" onClick={() => setView('with')} className="flex min-h-12 items-center gap-3 rounded-lg bg-[var(--tint)] px-3 text-left" aria-label="Split with">
            <Users className="size-5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-[var(--text-tertiary)]">With you and</span>
              <span className="block truncate text-[15px] font-semibold">
                {group ? `Everyone in ${group.name}` : participants.length > 1 ? participants.filter((p) => !p.isMe).map((p) => p.name).join(', ') : 'Pick friends or a group'}
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-[var(--text-tertiary)]" />
          </button>

          <Field label="Description">
            <input className={fieldClass} value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="Dinner, rent, tickets" maxLength={255} />
          </Field>

          <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2">
            <DropdownField label="Currency" searchable value={draft.currency} onChange={(currency) => update({ currency })} options={currencyDropdown([draft.currency, me.defaultCurrency, ...walletCurrencies])} />
            <Field label="Amount">
              <input className={`${fieldClass} tabular text-[17px] font-bold`} inputMode="decimal" value={draft.cost} onChange={(e) => update({ cost: e.target.value })} placeholder="0.00" />
            </Field>
          </div>

          {participants.length > 1 && (
            <p className="flex flex-wrap items-center justify-center gap-1.5 text-[14px] text-[var(--text-secondary)]">
              Paid by
              <button type="button" onClick={() => setView('paid')} className="h-9 rounded-full bg-[var(--ink)] px-3.5 text-[13.5px] font-semibold text-[var(--cream)]" aria-label={`Paid by ${sentence.paidBy}. Change who paid`}>
                {sentence.paidBy}
              </button>
              and split
              <button type="button" onClick={() => setView('split')} className="h-9 rounded-full bg-[var(--ink)] px-3.5 text-[13.5px] font-semibold text-[var(--cream)]" aria-label={`Split ${sentence.split}. Change split options`}>
                {sentence.split}
              </button>
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <DateField label="Date" value={draft.date} onChange={(date) => update({ date })} />
            <DropdownField label="Repeat" value={draft.repeat} onChange={(v) => update({ repeat: v as RepeatInterval })} options={REPEAT_OPTIONS} />
          </div>

          <DropdownField
            label="Category"
            searchable
            value={draft.category}
            onChange={(category) => update({ category })}
            options={groupCategories(me.categories).flatMap(([group, cats]) => cats.map((c) => ({ value: c.slug, label: c.label, group })))}
          />

          <Field label="Notes">
            <textarea className={`${fieldClass} h-20 resize-none py-2`} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} maxLength={2000} />
          </Field>

          {meIn && (
            <section aria-label="In my books" className="grid gap-3 rounded-lg bg-[var(--tint)] p-3.5">
              <h3 className="text-[15px] font-bold">In my books</h3>
              {paidByMe && (
                <div role="radiogroup" aria-label="Where the money came from" className="grid gap-1.5">
                  {([
                    ['none', 'Only track what friends owe'],
                    ['wallet', 'Paid from a wallet'],
                    ['link', 'Link a transaction I already logged'],
                  ] as const).map(([value, label]) => (
                    <label key={value} className="flex min-h-10 items-center gap-2.5 text-[14px] font-medium">
                      <input type="radio" name="books-mode" value={value} checked={draft.books.mode === value} onChange={() => updateBooks({ mode: value })} className="size-4 accent-[var(--ink)]" />
                      {label}
                    </label>
                  ))}
                </div>
              )}
              {paidByMe && draft.books.mode === 'wallet' && (
                <>
                  <DropdownField
                    label="Wallet"
                    placeholder="Pick a wallet"
                    value={draft.books.walletId ?? ''}
                    onChange={(v) => updateBooks({ walletId: v || null })}
                    options={wallets.map((w) => ({ value: w.id, label: w.name, hint: w.currency }))}
                  />
                  {fundingWallet && fundingWallet.currency !== draft.currency && (
                    <Field label={`Charged to ${fundingWallet.name} in ${fundingWallet.currency}`}>
                      <input className={`${fieldClass} tabular`} inputMode="decimal" value={draft.books.fundingAmount} onChange={(e) => updateBooks({ fundingAmount: e.target.value })} placeholder="0.00" />
                    </Field>
                  )}
                </>
              )}
              {paidByMe && draft.books.mode === 'link' && (
                <DropdownField
                  label="Transaction"
                  searchable
                  placeholder="Pick a recent expense"
                  value={draft.books.linkedTransactionId ?? ''}
                  onChange={(v) => updateBooks({ linkedTransactionId: v || null })}
                  options={[
                    ...(draft.books.linkedTransactionId && !linkable.some((t) => t.id === draft.books.linkedTransactionId)
                      ? [{ value: draft.books.linkedTransactionId, label: 'Linked transaction' }]
                      : []),
                    ...linkable.map((t) => ({ value: t.id, label: t.description, hint: `${formatAmount(Math.abs(t.amount), t.currency)} · ${t.transactionDate.slice(5, 10)}` })),
                  ]}
                />
              )}
              <DropdownField
                label="My category"
                searchable
                hint="Only changes how your share shows up in your own reports."
                value={draft.books.categoryId ?? ''}
                onChange={(v) => updateBooks({ categoryId: v || null })}
                options={[
                  { value: '', label: `Automatic · ${autoUserCategory(draft.category, userCategories)?.name ?? 'Uncategorized'}`, keywords: ['automatic'] },
                  ...userCategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </section>
          )}
        </div>
      )}
    </FullSheet>
  )
}
