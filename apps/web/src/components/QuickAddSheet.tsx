import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, Delete, PencilLine, Sparkles, Users, Wallet as WalletIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  createTransaction,
  getAiStatus,
  getCategories,
  getPeople,
  getRecentTransactions,
  getWallets,
  parseTransactionText,
  type Category,
  type RecentTransaction,
  type Wallet,
} from '@/lib/api'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { localDateKey, parseAmountInput } from '@/lib/money'
import { categoryIcon } from '@/lib/categoryIcon'
import { currencySymbol, dayLabel } from '@/lib/format'
import { currencyDecimals, groupAmountDisplay, pressKey, type KeypadKey } from '@/lib/keypad'

const LAST_WALLET_KEY = 'finance-os-quick-add-wallet'
const CATEGORY_SLOTS = 8
const RECENT_MERCHANTS = 4

type TxKind = 'expense' | 'income'

/**
 * Phones get the on-screen keypad (no OS keyboard jumping over the sheet); desktops type into
 * a normal input. Read at render: it only changes if the device itself changes.
 */
function prefersKeypad(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 767px)').matches
}

function readRememberedWallet(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET_KEY)
  } catch {
    return null
  }
}

/** The most-used categories of the right kind in the recent window, most used first. */
function rankCategories(kind: TxKind, categories: Category[] | undefined, recent: RecentTransaction[]) {
  if (!categories) return []
  const usage = new Map<string, number>()
  for (const tx of recent) if (tx.categoryName) usage.set(tx.categoryName, (usage.get(tx.categoryName) ?? 0) + 1)
  return categories
    .filter((c) => c.type === kind)
    .sort((a, b) => (usage.get(b.name) ?? 0) - (usage.get(a.name) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, CATEGORY_SLOTS)
}

/** Distinct recent descriptions for this kind, newest first, so one tap refills a repeat purchase. */
function recentMerchants(kind: TxKind, recent: RecentTransaction[]) {
  const seen = new Set<string>()
  const out: RecentTransaction[] = []
  for (const tx of recent) {
    if (tx.type !== kind) continue
    const key = tx.description.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(tx)
    if (out.length === RECENT_MERCHANTS) break
  }
  return out
}

const KEYS_DECIMAL: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']
const KEYS_WHOLE: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back']

const pillClass =
  'relative inline-flex h-9 max-w-[46%] items-center gap-1.5 rounded-full bg-[var(--tint)] px-3 text-[13px] font-semibold text-[var(--text-primary)] focus-within:outline-2 focus-within:outline-[var(--ink)]'

export function QuickAddSheet() {
  const { isOpen, closeQuickAdd } = useQuickAdd()
  const qc = useQueryClient()
  const useKeypad = prefersKeypad()

  const [kind, setKind] = useState<TxKind>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [date, setDate] = useState(localDateKey)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitPersonId, setSplitPersonId] = useState<string | null>(null)
  const [splitAmount, setSplitAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [magicText, setMagicText] = useState('')
  const [parsing, setParsing] = useState(false)

  const aiStatusQuery = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus, enabled: isOpen, staleTime: 5 * 60_000 })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets, enabled: isOpen })
  // NOTE: existing pages use ['categories'] for the category BREAKDOWN — this is the raw list.
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories, enabled: isOpen })
  const recentQuery = useQuery({ queryKey: ['recent'], queryFn: getRecentTransactions, enabled: isOpen, staleTime: 60_000 })
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: getPeople, enabled: isOpen && splitOpen })

  const recent = recentQuery.data?.data ?? []
  const categories = categoriesQuery.data?.data
  const chips = useMemo(() => rankCategories(kind, categories, recent), [kind, categories, recent])
  const merchants = useMemo(() => recentMerchants(kind, recent), [kind, recent])

  const wallets = (walletsQuery.data?.data ?? []).filter((w) => w.isActive)
  // Picked wallet, else the one used last time, else the first. Derived, so no sync effect.
  const remembered = isOpen ? readRememberedWallet() : null
  const wallet: Wallet | undefined =
    wallets.find((w) => w.id === walletId) ?? wallets.find((w) => w.id === remembered) ?? wallets[0]
  const decimals = currencyDecimals(wallet?.currency)
  const selectedCategory = categories?.find((c) => c.id === categoryId)

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
    setNoteOpen(false)
    setCategoryId(null)
    setSplitOpen(false)
    setSplitPersonId(null)
    setSplitAmount('')
    setError(null)
    setDate(localDateKey())
  }

  function press(key: KeypadKey) {
    setAmount((a) => pressKey(a, key, decimals))
    setError(null)
  }

  function pickMerchant(tx: RecentTransaction) {
    setDescription(tx.description)
    const match = categories?.find((c) => c.name === tx.categoryName && c.type === kind)
    if (match) setCategoryId(match.id)
  }

  async function magicFill() {
    const text = magicText.trim()
    if (!text || parsing) return
    setParsing(true)
    setError(null)
    try {
      const { data } = await parseTransactionText(text)
      setKind(data.type)
      setAmount(data.amount)
      setDescription(data.description)
      if (data.walletName) {
        const match = wallets.find((w) => w.name.toLowerCase() === data.walletName!.toLowerCase())
        if (match) setWalletId(match.id)
      }
      if (data.categoryName) {
        const match = (categories ?? []).find((cat) => cat.name.toLowerCase() === data.categoryName!.toLowerCase())
        setCategoryId(match?.id ?? null)
      }
      setMagicText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse that')
    } finally {
      setParsing(false)
    }
  }

  function submit() {
    if (!wallet) return
    const value = parseAmountInput(amount.replace(/\.$/, ''))
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
      description: description.trim() || selectedCategory?.name || (kind === 'expense' ? 'Expense' : 'Income'),
      categoryId: categoryId ?? undefined,
      entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: signed }],
      splits,
    })
  }

  const symbol = wallet ? currencySymbol(wallet.currency) : ''
  const amountTone = kind === 'income' ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]'

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { reset(); closeQuickAdd() } }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[94dvh] gap-0 overflow-y-auto rounded-t-[28px] border-0 bg-white px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-2.5 lg:bottom-auto lg:top-16 lg:mx-auto lg:max-w-md lg:rounded-[28px]"
      >
        <div aria-hidden className="mx-auto mb-3.5 h-[5px] w-10 shrink-0 rounded-full bg-[var(--tint-strong)] lg:hidden" />
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Add transaction</SheetTitle>
          <div className="flex rounded-xl bg-[var(--tint)] p-[3px]" role="tablist" aria-label="Transaction type">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => { setKind(k); setCategoryId(null) }}
                className={`h-9 flex-1 rounded-[9px] text-sm font-semibold capitalize transition-colors ${
                  kind === k ? 'bg-white text-[var(--text-primary)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-[var(--text-tertiary)]'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* Natural-language quick fill (needs OPENROUTER_API_KEY on the server) */}
        {aiStatusQuery.data?.data.enabled && (
          <div className="mt-3 flex gap-1.5">
            <input
              value={magicText}
              onChange={(e) => setMagicText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void magicFill() } }}
              placeholder='Try "kopi 35k cash"'
              aria-label="Describe the transaction"
              className="h-10 min-w-0 flex-1 rounded-full border border-dashed border-[var(--border-medium)] bg-transparent px-4 text-sm outline-none focus-visible:border-[var(--ink)]"
            />
            <button
              type="button"
              onClick={() => void magicFill()}
              disabled={parsing || !magicText.trim()}
              aria-label="Fill from text"
              className="flex size-10 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)] transition-transform active:scale-95 disabled:opacity-40"
            >
              <Sparkles className={`size-4 ${parsing ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        )}

        {/* Amount — the hero */}
        <div className="flex items-baseline justify-center gap-1.5 pb-2 pt-5">
          <span className={`text-[30px] font-semibold ${amount ? 'text-[var(--text-tertiary)]' : 'text-[var(--border-medium)]'}`}>{symbol}</span>
          {useKeypad ? (
            <output aria-label="Amount" aria-live="polite" className={`tabular text-[56px] font-bold leading-none tracking-[-0.03em] ${amount ? amountTone : 'text-[var(--border-medium)]'}`}>
              {groupAmountDisplay(amount, wallet?.currency)}
            </output>
          ) : (
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              aria-label="Amount"
              style={{ width: `${Math.max(1, amount.length) + 0.3}ch` }}
              className={`tabular min-w-[1ch] max-w-[11ch] bg-transparent text-left text-[56px] font-bold leading-none tracking-[-0.03em] outline-none placeholder:text-[var(--border-medium)] ${amountTone}`}
            />
          )}
        </div>

        {/* Wallet · date · note */}
        <div className="flex flex-wrap justify-center gap-2">
          <label className={pillClass}>
            <WalletIcon className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate">{wallet ? wallet.name : 'No wallet'}</span>
            <ChevronDown className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <select
              value={wallet?.id ?? ''}
              onChange={(e) => setWalletId(e.target.value)}
              aria-label="Wallet"
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name} · {w.currency}</option>
              ))}
            </select>
          </label>
          <label className={pillClass}>
            <CalendarDays className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? dayLabel(date) : 'Pick date'}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            aria-expanded={noteOpen}
            className={pillClass}
          >
            <PencilLine className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
            <span className="truncate">{description.trim() || 'Note'}</span>
          </button>
        </div>

        {noteOpen && (
          <Input
            autoFocus
            className="mt-3 h-11 rounded-xl"
            placeholder={kind === 'expense' ? 'What was it for?' : 'Where is it from?'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setNoteOpen(false) }}
            aria-label="Description"
          />
        )}

        {/* Category grid */}
        {chips.length > 0 && (
          <div className="mt-5 grid grid-cols-4 gap-y-3" role="group" aria-label="Category">
            {chips.map((c) => {
              const Icon = categoryIcon(c.name, kind)
              const selected = categoryId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(selected ? null : c.id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-col items-center gap-1.5 px-0.5"
                >
                  <span
                    className={`flex size-[50px] items-center justify-center rounded-full transition-colors ${
                      selected
                        ? 'bg-[var(--ink)] text-[var(--cream)] shadow-[0_0_0_2.5px_#fff,0_0_0_4.5px_var(--ink)]'
                        : 'bg-[var(--tint)] text-[var(--ink)]'
                    }`}
                  >
                    <Icon className="size-[22px]" strokeWidth={1.8} />
                  </span>
                  <span className={`w-full truncate text-center text-[12px] font-semibold ${selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}`}>
                    {c.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Recent merchants */}
        {merchants.length > 0 && (
          <div className="-mx-5 mt-4 flex items-center gap-2 overflow-x-auto px-5 pb-0.5 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none]">
            <span className="shrink-0 text-[13px] font-semibold text-[var(--text-tertiary)]">Recent</span>
            {merchants.map((tx) => (
              <button
                key={tx.entryId}
                type="button"
                onClick={() => pickMerchant(tx)}
                className="h-8 shrink-0 rounded-full bg-[var(--tint)] px-3 text-[13px] font-semibold text-[var(--text-primary)] transition-colors active:bg-[var(--tint-strong)]"
              >
                {tx.description}
              </button>
            ))}
          </div>
        )}

        {/* Split with a person */}
        <button
          type="button"
          onClick={() => setSplitOpen((v) => !v)}
          aria-expanded={splitOpen}
          className="mt-4 flex items-center gap-2 self-start text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <Users className="size-4" /> {splitOpen ? 'Remove split' : 'Split with someone'}
        </button>
        {splitOpen && (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <select
              value={splitPersonId ?? ''}
              onChange={(e) => setSplitPersonId(e.target.value || null)}
              aria-label="Split with"
              className="h-11 rounded-xl border border-input bg-transparent px-3 text-sm"
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
              className="h-11 rounded-xl"
            />
          </div>
        )}

        {/* Keypad (phones) */}
        {useKeypad && (
          <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="Keypad">
            {(decimals === 0 ? KEYS_WHOLE : KEYS_DECIMAL).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                aria-label={key === 'back' ? 'Delete digit' : key === '.' ? 'Decimal point' : key}
                className="tabular flex h-[52px] items-center justify-center rounded-full bg-[var(--tint)] text-[24px] font-semibold text-[var(--text-primary)] transition-colors active:bg-[var(--tint-strong)]"
              >
                {key === 'back' ? (
                  <Delete className="size-6" strokeWidth={1.8} />
                ) : key === '.' ? (
                  <span aria-hidden className="size-[7px] rounded-full bg-current" />
                ) : (
                  key
                )}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-center text-[13px] font-medium text-[var(--negative)]" role="alert">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || !wallet || amount === ''}
          className="mt-3 h-14 shrink-0 rounded-2xl bg-[var(--ink)] text-base font-bold text-[var(--cream)] transition-colors active:opacity-90 disabled:bg-[var(--tint-strong)] disabled:text-[var(--text-tertiary)]"
        >
          {mutation.isPending ? 'Saving…' : kind === 'expense' ? 'Save expense' : 'Save income'}
        </button>
      </SheetContent>
    </Sheet>
  )
}
