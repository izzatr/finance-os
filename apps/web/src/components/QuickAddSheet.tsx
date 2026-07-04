import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createTransaction,
  getCategories,
  getPeople,
  getRecentTransactions,
  getWallets,
  type Category,
  type Wallet,
} from '@/lib/api'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { localDateKey, parseAmountInput } from '@/lib/money'

const LAST_WALLET_KEY = 'finance-os-quick-add-wallet'

type TxKind = 'expense' | 'income'

function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(1)
    return parts.find((p) => p.type === 'currency')?.value ?? code
  } catch {
    return code
  }
}

/** The 8 most-used categories of the right kind in the recent window, most used first. */
function useRecentCategoryChips(kind: TxKind, categories: Category[] | undefined, enabled: boolean) {
  const recentQuery = useQuery({
    queryKey: ['recent'],
    queryFn: getRecentTransactions,
    enabled,
    staleTime: 60_000,
  })
  return useMemo(() => {
    if (!categories) return []
    const wanted = categories.filter((c) => c.type === kind)
    const usage = new Map<string, number>()
    for (const tx of recentQuery.data?.data ?? []) {
      if (tx.categoryName) usage.set(tx.categoryName, (usage.get(tx.categoryName) ?? 0) + 1)
    }
    return [...wanted]
      .sort((a, b) => (usage.get(b.name) ?? 0) - (usage.get(a.name) ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 8)
  }, [categories, kind, recentQuery.data])
}

export function QuickAddSheet() {
  const { isOpen, closeQuickAdd } = useQuickAdd()
  const qc = useQueryClient()

  const [kind, setKind] = useState<TxKind>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [date, setDate] = useState(localDateKey)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPersonId, setSplitPersonId] = useState<string | null>(null)
  const [splitAmount, setSplitAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets, enabled: isOpen })
  // NOTE: existing pages use ['categories'] for the category BREAKDOWN — this is the raw list.
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories, enabled: isOpen })
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: getPeople, enabled: isOpen && splitOpen })
  const chips = useRecentCategoryChips(kind, categoriesQuery.data?.data, isOpen)

  const wallets = walletsQuery.data?.data ?? []
  const wallet: Wallet | undefined = wallets.find((w) => w.id === walletId) ?? wallets[0]

  // Default wallet: last used, else first
  useEffect(() => {
    if (!isOpen || walletId || wallets.length === 0) return
    const remembered = localStorage.getItem(LAST_WALLET_KEY)
    setWalletId(wallets.some((w) => w.id === remembered) ? remembered : wallets[0].id)
  }, [isOpen, walletId, wallets])

  const mutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      for (const key of [
        'wallets', 'recent', 'transactions', 'dashboard', 'summary', 'summary-monthly',
        'categories', 'monthly-trend', 'asset-growth', 'net-worth', 'shared-balances',
      ]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      if (wallet) localStorage.setItem(LAST_WALLET_KEY, wallet.id)
      reset()
      closeQuickAdd()
    },
    onError: (err: Error) => setError(err.message),
  })

  function reset() {
    setAmount('')
    setDescription('')
    setCategoryId(null)
    setSplitOpen(false)
    setSplitPersonId(null)
    setSplitAmount('')
    setError(null)
  }

  function submit() {
    if (!wallet) return
    const value = parseAmountInput(amount)
    if (!value) {
      setError('Enter an amount greater than zero')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a date')
      return
    }
    // A split that is open but incomplete must never save silently — the user
    // believes the debt was recorded.
    let splits: Array<{ personId: string; amount: string }> | undefined
    if (splitOpen) {
      const share = parseAmountInput(splitAmount)
      if (!splitPersonId || !share) {
        setError('Pick a person and their share, or remove the split')
        return
      }
      if (Number(share) > Number(value)) {
        setError('Their share cannot exceed the amount')
        return
      }
      splits = [{ personId: splitPersonId, amount: share }]
    }
    const signed = kind === 'expense' ? `-${value}` : value
    mutation.mutate({
      transactionDate: new Date(`${date}T12:00:00.000Z`).toISOString(),
      type: kind,
      description: description.trim() || (kind === 'expense' ? 'Expense' : 'Income'),
      categoryId: categoryId ?? undefined,
      entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: signed }],
      splits,
    })
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { reset(); closeQuickAdd() } }}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl bg-[var(--bg-elevated)] px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] lg:mx-auto lg:max-w-md lg:rounded-2xl lg:bottom-auto lg:top-24 lg:border"
      >
        <SheetHeader className="px-0 pb-0">
          <SheetTitle className="sr-only">Add transaction</SheetTitle>
          {/* Type toggle */}
          <div className="mx-auto flex rounded-full bg-[var(--accent-dim)] p-1" role="tablist" aria-label="Transaction type">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => { setKind(k); setCategoryId(null) }}
                className={`rounded-full px-5 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  kind === k ? 'bg-white text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)]'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* Amount — the hero */}
        <div className="flex items-baseline justify-center gap-2 py-2">
          <span className="text-xl font-medium text-[var(--text-tertiary)]">{wallet ? currencySymbol(wallet.currency) : ''}</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            aria-label="Amount"
            className={`w-44 bg-transparent text-center font-mono text-5xl font-semibold tabular-nums outline-none placeholder:text-[var(--border-medium)] ${
              kind === 'expense' ? 'text-[var(--negative)]' : 'text-[var(--positive)]'
            }`}
          />
        </div>

        {/* Category chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {chips.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                aria-pressed={categoryId === c.id}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  categoryId === c.id
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)] text-white'
                    : 'border-[var(--border-medium)] bg-white text-[var(--text-secondary)]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Details row */}
        <div className="grid gap-2.5 pt-1">
          <Input
            placeholder={kind === 'expense' ? 'What was it for?' : 'Where is it from?'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <select
              value={wallet?.id ?? ''}
              onChange={(e) => setWalletId(e.target.value)}
              aria-label="Wallet"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} · {w.currency}</option>
              ))}
            </select>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          </div>

          {/* Split with a person */}
          <button
            type="button"
            onClick={() => setSplitOpen((v) => !v)}
            aria-expanded={splitOpen}
            className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Users className="size-3.5" /> {splitOpen ? 'Remove split' : 'Split with someone'}
          </button>
          {splitOpen && (
            <div className="grid grid-cols-2 gap-2.5">
              <select
                value={splitPersonId ?? ''}
                onChange={(e) => setSplitPersonId(e.target.value || null)}
                aria-label="Split with"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Who owes you?</option>
                {(peopleQuery.data?.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Input
                inputMode="decimal"
                placeholder="Their share"
                value={splitAmount}
                onChange={(e) => setSplitAmount(e.target.value)}
                aria-label="Their share"
              />
            </div>
          )}

          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}

          <Button onClick={submit} disabled={mutation.isPending || !wallet} className="h-11 text-sm font-semibold">
            {mutation.isPending ? 'Saving…' : kind === 'expense' ? 'Save expense' : 'Save income'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
