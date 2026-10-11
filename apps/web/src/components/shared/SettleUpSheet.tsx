import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import {
  ApiError,
  createSharedExpense,
  getExchangeRates,
  getSplitFriend,
  getSplitFriends,
  getWallets,
  pickableWallets,
  updateSharedExpense,
  type SharedExpense,
  type SharedExpenseInput,
  type SplitFriend,
  type SplitMe,
} from '@/lib/api'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { localDateKey, parseAmountInput } from '@/lib/money'
import { currencyPrecision, formatAmount, SplitMathError, toMinor } from '@/lib/split'
import { Avatar, ErrorText, Field, FullSheet, Segmented, fieldClass, primaryButton } from './ui'
import { DateField, DropdownField } from './DropdownField'
import { currencyDropdown } from './ExpenseSheet'

export type SettlePrefill = {
  friendId?: string
  groupId?: string | null
  fromPersonId?: string
  toPersonId?: string
  currency?: string
  amount?: string
  /** Names for a suggested payment between two other people. */
  names?: Record<string, string>
}

export type PaymentDraft = {
  fromPersonId: string
  toPersonId: string
  amount: string
  currency: string
  date: string
  groupId: string | null
  walletId: string | null
  fundingAmount: string
}

/** Builds the POST/PATCH body for a payment; null + message when something is missing. */
export function buildPaymentPayload(d: PaymentDraft, mePersonId: string, walletCurrency: string | null): { body: SharedExpenseInput } | { error: string } {
  const cost = parseAmountInput(d.amount)
  if (!cost) return { error: 'Enter an amount greater than zero' }
  try {
    toMinor(cost, currencyPrecision(d.currency))
  } catch (err) {
    return { error: err instanceof SplitMathError ? err.message : 'Check the amount' }
  }
  if (!d.fromPersonId || !d.toPersonId) return { error: 'Pick who paid whom' }
  if (d.fromPersonId === d.toPersonId) return { error: 'Someone cannot pay themselves' }
  const body: SharedExpenseInput = {
    kind: 'payment',
    groupId: d.groupId,
    cost,
    currency: d.currency,
    date: new Date(`${d.date}T12:00:00.000Z`).toISOString(),
    payment: { fromPersonId: d.fromPersonId, toPersonId: d.toPersonId },
  }
  const meInvolved = d.fromPersonId === mePersonId || d.toPersonId === mePersonId
  if (meInvolved) {
    let fundingAmount: string | null = null
    if (d.walletId && walletCurrency && walletCurrency !== d.currency) {
      fundingAmount = parseAmountInput(d.fundingAmount)
      if (!fundingAmount) return { error: `Enter the amount in ${walletCurrency}` }
    }
    body.myBooks = { fundingWalletId: d.walletId, fundingAmount }
  }
  return { body }
}

type Rates = Record<string, number> | null

/** Value of an amount in the default currency via EUR-based rates, or null when a rate is missing. */
export function inDefault(amount: number, currency: string, defaultCurrency: string, rates: Rates): number | null {
  if (currency === defaultCurrency) return amount
  if (!rates) return null
  const from = currency === 'EUR' ? 1 : rates[currency]
  const to = defaultCurrency === 'EUR' ? 1 : rates[defaultCurrency]
  if (!from || !to) return null
  return (amount / from) * to
}

/**
 * The friend's biggest open balance by value in the default currency (so IDR 1,921,000 does not
 * beat AUD 128.40). Without rates: the default currency first, then the first listed.
 */
export function biggestBalance(balances: Array<{ currency: string; amount: string }>, opts: { preferred?: string; defaultCurrency?: string; rates?: Rates } = {}) {
  const open = balances.filter((b) => Number(b.amount) !== 0)
  const preferred = open.find((b) => b.currency === opts.preferred)
  if (preferred) return preferred
  const def = opts.defaultCurrency ?? ''
  const valued = open.map((b) => ({ b, v: inDefault(Math.abs(Number(b.amount)), b.currency, def, opts.rates ?? null) }))
  if (valued.length > 0 && valued.every((x) => x.v !== null) && opts.rates) {
    return [...valued].sort((x, y) => y.v! - x.v!)[0].b
  }
  return open.find((b) => b.currency === def) ?? open[0]
}

/** One short line for a friend with several balances: "owes you €40.00 +2" / "owes you in 3 currencies". */
export function balanceSummary(
  balances: Array<{ currency: string; amount: string }>,
  defaultCurrency: string,
  totalInDefault?: { currency: string; net: string | number } | null,
): string {
  const open = balances.filter((b) => Number(b.amount) !== 0)
  if (open.length === 0) return 'settled up'
  const phrase = (b: { currency: string; amount: string }) => `${Number(b.amount) > 0 ? 'owes you' : 'you owe'} ${formatAmount(Math.abs(Number(b.amount)), b.currency)}`
  if (open.length === 1) return phrase(open[0])
  // The server's converted total says it in one amount.
  if (totalInDefault && Number(totalInDefault.net) !== 0) {
    return `${Number(totalInDefault.net) > 0 ? 'owes you' : 'you owe'} ≈${formatAmount(Math.abs(Number(totalInDefault.net)), totalInDefault.currency)} in ${open.length} currencies`
  }
  const def = open.find((b) => b.currency === defaultCurrency)
  if (def) return `${phrase(def)} +${open.length - 1}`
  const allOwe = open.every((b) => Number(b.amount) > 0)
  const allIOwe = open.every((b) => Number(b.amount) < 0)
  return allOwe ? `owes you in ${open.length} currencies` : allIOwe ? `you owe in ${open.length} currencies` : `open in ${open.length} currencies`
}

export function SettleUpSheet({ open, onClose, prefill, edit }: {
  open: boolean
  onClose: () => void
  prefill?: SettlePrefill
  edit?: SharedExpense
}) {
  const meQuery = useSplitMe(open)
  const friendsQuery = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends, enabled: open })
  const ratesQuery = useQuery({ queryKey: ['exchange-rates'], queryFn: getExchangeRates, enabled: open, staleTime: 30 * 60_000 })
  if (!open) return null
  const me = meQuery.data?.data
  const friends = friendsQuery.data?.data
  if (!me || !friends || ratesQuery.isLoading) {
    return (
      <FullSheet open onClose={onClose} title="Settle up">
        <p className="py-16 text-center text-sm text-[var(--text-tertiary)]">{meQuery.error?.message ?? friendsQuery.error?.message ?? 'Loading…'}</p>
      </FullSheet>
    )
  }
  const rates = ratesQuery.data?.rates ?? null
  return <SettleForm key={edit ? `${edit.id}:${edit.version}` : 'new'} me={me} friends={friends} rates={rates} prefill={prefill ?? {}} edit={edit} onClose={onClose} />
}

function initialDraft(me: SplitMe, friends: SplitFriend[], rates: Rates, prefill: SettlePrefill, edit?: SharedExpense): PaymentDraft {
  if (edit) {
    const from = edit.shares.find((s) => Number(s.paid) > 0)?.personId ?? me.personId
    const to = edit.shares.find((s) => Number(s.owed) > 0)?.personId ?? me.personId
    return {
      fromPersonId: from, toPersonId: to, amount: edit.cost, currency: edit.currency, date: edit.date.slice(0, 10), groupId: edit.groupId,
      walletId: edit.myBooks?.fundingWalletId ?? null, fundingAmount: edit.myBooks?.fundingAmount ?? '',
    }
  }
  if (prefill.fromPersonId && prefill.toPersonId) {
    return {
      fromPersonId: prefill.fromPersonId, toPersonId: prefill.toPersonId, amount: prefill.amount ?? '', currency: prefill.currency ?? me.defaultCurrency,
      date: localDateKey(), groupId: prefill.groupId ?? null, walletId: null, fundingAmount: '',
    }
  }
  // Without a friend given, start with the biggest open balance (the server lists friends that way).
  const friend = prefill.friendId
    ? friends.find((f) => f.personId === prefill.friendId)
    : prefill.groupId ? undefined : friends.find((f) => f.balances.some((b) => Number(b.amount) !== 0))
  const balance = biggestBalance(friend?.balances ?? [], { preferred: prefill.currency, defaultCurrency: me.defaultCurrency, rates })
  const theyOwe = balance ? Number(balance.amount) > 0 : true
  const friendId = friend?.personId ?? ''
  return {
    fromPersonId: theyOwe ? friendId : me.personId,
    toPersonId: theyOwe ? me.personId : friendId,
    amount: prefill.amount ?? (balance ? balance.amount.replace('-', '') : ''),
    currency: balance?.currency ?? prefill.currency ?? me.defaultCurrency,
    date: localDateKey(),
    groupId: prefill.groupId ?? null,
    walletId: null,
    fundingAmount: '',
  }
}

function SettleForm({ me, friends, rates, prefill, edit, onClose }: { me: SplitMe; friends: SplitFriend[]; rates: Rates; prefill: SettlePrefill; edit?: SharedExpense; onClose: () => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<PaymentDraft>(() => initialDraft(me, friends, rates, prefill, edit))
  const [error, setError] = useState<string | null>(null)
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const wallets = pickableWallets(walletsQuery.data?.data ?? [])

  const meInvolved = draft.fromPersonId === me.personId || draft.toPersonId === me.personId
  const friendId = meInvolved ? (draft.fromPersonId === me.personId ? draft.toPersonId : draft.fromPersonId) : ''
  const friend = friends.find((f) => f.personId === friendId)
  const friendDetail = useQuery({ queryKey: splitKeys.friend(friendId || 'none'), queryFn: () => getSplitFriend(friendId), enabled: Boolean(friendId) })
  const iPaid = draft.fromPersonId === me.personId
  const lockedPair = Boolean(edit) || Boolean(prefill.fromPersonId && prefill.toPersonId)
  const wallet = wallets.find((w) => w.id === draft.walletId)

  const nameOf = (id: string) => (id === me.personId ? 'You' : friends.find((f) => f.personId === id)?.name ?? prefill.names?.[id] ?? edit?.shares.find((s) => s.personId === id)?.name ?? 'Someone')
  const update = (patch: Partial<PaymentDraft>) => { setDraft((d) => ({ ...d, ...patch })); setError(null) }

  function pickFriend(id: string) {
    const f = friends.find((x) => x.personId === id)
    const balance = biggestBalance(f?.balances ?? [], { defaultCurrency: me.defaultCurrency, rates })
    const theyOwe = balance ? Number(balance.amount) > 0 : true
    update({
      fromPersonId: theyOwe ? id : me.personId,
      toPersonId: theyOwe ? me.personId : id,
      amount: balance ? balance.amount.replace('-', '') : '',
      currency: balance?.currency ?? draft.currency,
      groupId: null,
    })
  }

  function setDirection(dir: 'they' | 'me') {
    if (!friendId) return
    update(dir === 'me' ? { fromPersonId: me.personId, toPersonId: friendId } : { fromPersonId: friendId, toPersonId: me.personId })
  }

  function pickCurrency(currency: string) {
    const balance = friend?.balances.find((b) => b.currency === currency)
    if (!balance || edit || !friendId) return update({ currency })
    const theyOwe = Number(balance.amount) > 0
    update({
      currency,
      amount: balance.amount.replace('-', ''),
      fromPersonId: theyOwe ? friendId : me.personId,
      toPersonId: theyOwe ? me.personId : friendId,
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const built = buildPaymentPayload(draft, me.personId, wallet?.currency ?? null)
      if ('error' in built) throw new Error(built.error)
      if (edit) {
        await updateSharedExpense(edit.id, { ...built.body, version: edit.version })
        return edit.id
      }
      return (await createSharedExpense(built.body)).data.id
    },
    onSuccess: () => {
      invalidateShared(qc)
      onClose()
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setError('Someone else changed this payment. Close and open it again to see the latest.')
        invalidateShared(qc)
        return
      }
      setError(err.message)
    },
  })

  const currencies = [...new Set([draft.currency, ...(friend?.balances.map((b) => b.currency) ?? []), me.defaultCurrency])]
  const groups = friendDetail.data?.data.sharedGroups ?? []

  return (
    <FullSheet
      open
      onClose={onClose}
      title={edit ? 'Edit payment' : 'Settle up'}
      footer={
        <div className="grid gap-2">
          <ErrorText>{error}</ErrorText>
          <button type="button" className={primaryButton} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving…' : edit ? 'Save payment' : 'Record payment'}
          </button>
        </div>
      }
    >
      <div className="grid gap-5 pt-1">
        {!lockedPair && (
          <DropdownField
            label="Friend"
            searchable
            placeholder="Pick a friend"
            value={friendId}
            onChange={pickFriend}
            options={friends.map((f) => ({ value: f.personId, label: f.name, hint: balanceSummary(f.balances, me.defaultCurrency, f.totalInDefault) }))}
          />
        )}

        {(friendId || lockedPair) && (
          <div className="flex items-center justify-center gap-3 py-2" aria-label={`${nameOf(draft.fromPersonId)} paid ${nameOf(draft.toPersonId)}`}>
            <span className="flex min-w-0 flex-col items-center gap-1.5">
              <Avatar name={nameOf(draft.fromPersonId)} size={52} tone={draft.fromPersonId === me.personId ? 'ink' : 'tint'} />
              <span className="max-w-[8rem] truncate text-[14px] font-semibold">{nameOf(draft.fromPersonId)}</span>
            </span>
            <ArrowRight className="size-6 shrink-0 text-[var(--text-tertiary)]" />
            <span className="flex min-w-0 flex-col items-center gap-1.5">
              <Avatar name={nameOf(draft.toPersonId)} size={52} tone={draft.toPersonId === me.personId ? 'ink' : 'tint'} />
              <span className="max-w-[8rem] truncate text-[14px] font-semibold">{nameOf(draft.toPersonId)}</span>
            </span>
          </div>
        )}

        {meInvolved && friendId && !edit && (
          <Segmented
            label="Direction"
            value={iPaid ? 'me' : 'they'}
            onChange={setDirection}
            options={[{ value: 'they', label: `${friend?.name ?? 'They'} paid me` }, { value: 'me', label: `I paid ${friend?.name ?? 'them'}` }]}
          />
        )}

        <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2">
          <DropdownField label="Currency" searchable value={draft.currency} onChange={pickCurrency} options={currencyDropdown(currencies)} />
          <Field label="Amount">
            <input className={`${fieldClass} tabular text-[17px] font-bold`} inputMode="decimal" value={draft.amount} onChange={(e) => update({ amount: e.target.value })} placeholder="0.00" />
          </Field>
        </div>

        <DateField label="Date" value={draft.date} onChange={(date) => update({ date })} />

        {!lockedPair && groups.length > 0 && (
          <DropdownField label="Group" value={draft.groupId ?? ''} onChange={(v) => update({ groupId: v || null })} options={[{ value: '', label: 'No group' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        )}

        {meInvolved && (
          <section aria-label="In my books" className="grid gap-3 rounded-lg bg-[var(--tint)] p-3.5">
            <h3 className="text-[15px] font-bold">In my books</h3>
            <DropdownField
              label={iPaid ? 'Paid from' : 'Received into'}
              value={draft.walletId ?? ''}
              onChange={(v) => update({ walletId: v || null })}
              options={[{ value: '', label: 'No wallet, just clear the balance' }, ...wallets.map((w) => ({ value: w.id, label: w.name, hint: w.currency }))]}
            />
            {wallet && wallet.currency !== draft.currency && (
              <Field label={`Amount in ${wallet.currency}`}>
                <input className={`${fieldClass} tabular`} inputMode="decimal" value={draft.fundingAmount} onChange={(e) => update({ fundingAmount: e.target.value })} placeholder="0.00" />
              </Field>
            )}
          </section>
        )}
      </div>
    </FullSheet>
  )
}
