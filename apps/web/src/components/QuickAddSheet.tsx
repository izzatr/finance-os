import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DatePicker } from '@/components/ui/date-picker'
import { Dropdown } from '@/components/ui/dropdown'
import { CalendarDays, ChevronDown, Delete, PencilLine, Sparkles, Users, Wallet as WalletIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  createSharedExpense,
  createTransaction,
  createWallet,
  getAssets,
  getAiStatus,
  getCategories,
  getRecentTransactions,
  getSplitFriends,
  getWallets,
  parseTransactionText,
  pickableWallets,
  type Category,
  type RecentTransaction,
  type Wallet,
} from '@/lib/api'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { localDateKey, parseAmountInput } from '@/lib/money'
import { categoryIcon } from '@/lib/categoryIcon'
import { currencySymbol, dayLabel } from '@/lib/format'
import { currencyPrecision, toMinor } from '@/lib/split'
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
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
  const [walletName, setWalletName] = useState('')
  const [createdWallet, setCreatedWallet] = useState<Wallet | null>(null)
  const [date, setDate] = useState(localDateKey)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitFriendIds, setSplitFriendIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [magicText, setMagicText] = useState('')
  const [parsing, setParsing] = useState(false)

  const aiStatusQuery = useQuery({ queryKey: ['ai-status'], queryFn: getAiStatus, enabled: isOpen, staleTime: 5 * 60_000 })
  const assetsQuery = useQuery({ queryKey: ['assets'], queryFn: getAssets, enabled: isOpen })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets, enabled: isOpen })
  // NOTE: existing pages use ['categories'] for the category BREAKDOWN — this is the raw list.
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories, enabled: isOpen })
  const recentQuery = useQuery({ queryKey: ['recent'], queryFn: getRecentTransactions, enabled: isOpen, staleTime: 60_000 })
  const friendsQuery = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends, enabled: isOpen && splitOpen })
  const meQuery = useSplitMe(isOpen && splitOpen)
  const splitting = kind === 'expense' && splitOpen

  const recent = recentQuery.data?.data ?? []
  const categories = categoriesQuery.data?.data
  const chips = useMemo(() => rankCategories(kind, categories, recent), [kind, categories, recent])
  const merchants = useMemo(() => recentMerchants(kind, recent), [kind, recent])

  // System wallets (Friends · EUR) are never written directly, so they are not offered here.
  const loadedWallets = walletsQuery.data?.data ?? []
  const wallets = pickableWallets([...loadedWallets, ...(createdWallet && !loadedWallets.some((w) => w.id === createdWallet.id) ? [createdWallet] : [])])
  // Picked wallet, else the one used last time, else the first. Derived, so no sync effect.
  const remembered = isOpen ? readRememberedWallet() : null
  const preferredWallet = wallets.find((w) => w.id === walletId) ?? wallets.find((w) => w.id === remembered) ?? wallets[0]
  const currency = currencyCode ?? preferredWallet?.currency ?? 'USD'
  const wallet: Wallet | undefined = preferredWallet?.currency === currency ? preferredWallet : wallets.find((w) => w.currency === currency)
  const currencyAssets = (assetsQuery.data?.data ?? []).filter((a) => a.type === 'currency')
  const asset = currencyAssets.find((a) => a.code === currency)
  const decimals = currencyDecimals(currency)

  function pickCurrency(code: string) {
    setCurrencyCode(code)
    setError(null)
    setWalletName('')
  }

  const walletMutation = useMutation({
    mutationFn: async () => {
      if (!asset || !walletName.trim()) throw new Error('Enter a wallet name')
      return createWallet({ name: walletName.trim(), walletType: 'cash', assetId: asset.id, isActive: true })
    },
    onSuccess: ({ data }) => {
      setCreatedWallet(data)
      setWalletId(data.id)
      qc.invalidateQueries({ queryKey: ['wallets'] })
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })
  const selectedCategory = categories?.find((c) => c.id === categoryId)

  const mutation = useMutation({
    mutationFn: async (job: { kind: 'transaction'; body: Parameters<typeof createTransaction>[0] } | { kind: 'shared'; body: Parameters<typeof createSharedExpense>[0] }) => {
      if (job.kind === 'shared') await createSharedExpense(job.body)
      else await createTransaction(job.body)
    },
    onSuccess: () => {
      for (const key of [
        'wallets', 'recent', 'transactions', 'dashboard', 'summary', 'summary-monthly',
        'categories', 'monthly-trend', 'asset-growth', 'net-worth',
      ]) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      invalidateShared(qc)
      if (wallet) localStorage.setItem(LAST_WALLET_KEY, wallet.id)
      reset()
      closeQuickAdd()
    },
    onError: (err: Error) => setError(err.message),
  })

  function reset() {
    setAmount('')
    setCurrencyCode(null)
    setWalletName('')
    setWalletId(null)
    setCreatedWallet(null)
    setDescription('')
    setNoteOpen(false)
    setCategoryId(null)
    setSplitOpen(false)
    setSplitFriendIds([])
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
        if (match) { setWalletId(match.id); setCurrencyCode(match.currency) }
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
    if (!wallet && !splitting) { setError(`Create a ${currency} wallet first`); return }
    const value = parseAmountInput(amount.replace(/\.$/, ''))
    if (!value) {
      setError('Enter an amount greater than zero')
      return
    }
    try { toMinor(value, splitting ? currencyPrecision(currency) : asset?.precision ?? decimals) }
    catch (err) { setError(err instanceof Error ? err.message : 'Check the amount'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Pick a date')
      return
    }
    const description_ = description.trim() || selectedCategory?.name || (kind === 'expense' ? 'Expense' : 'Income')
    const isoDate = new Date(`${date}T12:00:00.000Z`).toISOString()
    // A split that is open but incomplete must never save silently: the user believes the debt was recorded.
    if (splitting) {
      const me = meQuery.data?.data
      if (splitFriendIds.length === 0) {
        setError('Pick who you split with, or remove the split')
        return
      }
      if (!me) {
        setError('Still loading your friends, try again in a moment')
        return
      }
      mutation.mutate({
        kind: 'shared',
        body: {
          kind: 'expense',
          description: description_,
          cost: value,
          currency,
          date: isoDate,
          category: 'general',
          paid: { kind: 'single', personId: me.personId },
          split: { method: 'equal', personIds: [me.personId, ...splitFriendIds] },
          myBooks: { fundingWalletId: wallet?.id ?? null, categoryId: categoryId ?? null },
        },
      })
      return
    }
    if (!wallet) return
    const signed = kind === 'expense' ? `-${value}` : value
    mutation.mutate({
      kind: 'transaction',
      body: {
        transactionDate: isoDate,
        type: kind,
        description: description_,
        categoryId: categoryId ?? undefined,
        entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: signed }],
      },
    })
  }

  const symbol = currencySymbol(currency)
  const amountTone = kind === 'income' ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]'

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { reset(); closeQuickAdd() } }}>
      <SheetContent
        side="bottom"
        scrollable={false}
        className="flex max-h-[calc(100dvh-max(env(safe-area-inset-top),8px))] flex-col gap-0 overflow-hidden rounded-t-[28px] border-0 bg-white p-0 lg:data-[side=bottom]:bottom-auto lg:data-[side=bottom]:top-16 lg:mx-auto lg:max-h-[calc(100dvh-5rem)] lg:max-w-md lg:rounded-[28px]"
      >
        <div aria-hidden className="h-[calc(max(env(safe-area-inset-top),0.75rem)+2.75rem)] shrink-0">
          <div className="mx-auto mt-2.5 h-[5px] w-10 rounded-full bg-[var(--tint-strong)] lg:hidden" />
        </div>
        {/* Everything above the keypad scrolls; keypad and Save stay pinned, so short
            viewports (in-app browsers, Safari with toolbars) never hide the Save button. */}
        <div data-slot="sheet-body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Add transaction</SheetTitle>
          <div className="flex rounded-xl bg-[var(--tint)] p-[3px]" role="tablist" aria-label="Transaction type">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => { setKind(k); setCategoryId(null); setSplitOpen(false); setSplitFriendIds([]) }}
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
        <div className="flex items-baseline justify-center gap-1.5 pb-2 pt-5 [@media(max-height:760px)]:pb-1 [@media(max-height:760px)]:pt-3">
          <span className={`text-[30px] font-semibold [@media(max-height:760px)]:text-[24px] ${amount ? 'text-[var(--text-tertiary)]' : 'text-[#bdb3a2]'}`}>{symbol}</span>
          {useKeypad ? (
            <output aria-label="Amount" aria-live="polite" className={`tabular text-[56px] font-bold leading-none tracking-[-0.03em] [@media(max-height:760px)]:text-[44px] ${amount ? amountTone : 'text-[#bdb3a2]'}`}>
              {groupAmountDisplay(amount, currency)}
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
          <Dropdown aria-label="Currency" searchable value={currency} onChange={pickCurrency}
            options={currencyAssets.map((a) => ({ value: a.code, label: a.code, hint: a.name, keywords: [a.name] }))}
            className={pillClass} />
          <Dropdown
            aria-label="Wallet"
            value={wallet?.id ?? ''}
            onChange={(id) => { setWalletId(id); const next = wallets.find((w) => w.id === id); if (next) pickCurrency(next.currency) }}
            options={wallets.map((w) => ({ value: w.id, label: w.name, hint: w.currency }))}
            className={pillClass}
            trigger={
              <>
                <WalletIcon className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                <span className="truncate">{wallet ? wallet.name : 'No wallet'}</span>
                <ChevronDown className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
              </>
            }
          />
          <DatePicker
            aria-label="Date"
            value={date}
            onChange={setDate}
            className={pillClass}
            trigger={
              <>
                <CalendarDays className="size-3.5 shrink-0 text-[var(--text-tertiary)]" />
                <span className="truncate">{/^\d{4}-\d{2}-\d{2}$/.test(date) ? dayLabel(date) : 'Pick date'}</span>
              </>
            }
          />
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

        {currencyCode && wallet && <p role="status" className="mt-3 text-[13px] text-[var(--text-secondary)]">Using {wallet.name} in {currency}. Amount unchanged; no currency conversion.</p>}
        {!wallet && !splitting && !walletsQuery.isLoading && (
          <section aria-label="Create a wallet" className="mt-3 grid gap-2 rounded-xl bg-[var(--tint)] p-3">
            <p className="text-[13px] text-[var(--text-secondary)]">Personal entries need a {currency} wallet. Create one below; the amount stays unchanged and no currency conversion is applied.</p>
            <Input aria-label="Wallet name" placeholder="Wallet name" value={walletName} maxLength={100} onChange={(e) => setWalletName(e.target.value)} />
            <button type="button" className="min-h-10 rounded-lg bg-[var(--ink)] px-3 font-semibold text-[var(--cream)] disabled:opacity-40" disabled={!asset || !walletName.trim() || walletMutation.isPending} onClick={() => walletMutation.mutate()}>{walletMutation.isPending ? 'Creating…' : `Create ${currency} wallet`}</button>
            {assetsQuery.error && <p role="alert">Could not load currencies. Close and try again.</p>}
          </section>
        )}
        {splitting && !wallet && <p className="mt-3 text-[13px] text-[var(--text-secondary)]">Shared only: track what friends owe in {currency}. No personal wallet is needed.</p>}

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
          <div className="mt-5 grid grid-cols-4 gap-y-3 [@media(max-height:760px)]:mt-3.5 [@media(max-height:760px)]:gap-y-2" role="group" aria-label="Category">
            {chips.map((c) => {
              const Icon = categoryIcon(c.name, kind, c.icon)
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
                    className={`flex size-[50px] items-center justify-center rounded-full transition-colors [@media(max-height:760px)]:size-11 ${
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
          <div className="-mx-5 mt-4 flex items-center gap-2 overflow-x-auto px-5 pb-0.5 [@media(max-height:760px)]:mt-3 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none]">
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

        {/* Split with friends: saves a shared expense, split equally, paid by me from this wallet */}
        {kind === 'expense' && (
          <button
            type="button"
            onClick={() => { setSplitOpen((v) => !v); setSplitFriendIds([]); setError(null) }}
            aria-expanded={splitOpen}
            className="mt-4 inline-flex h-8 items-center gap-2 text-[13px] font-semibold text-[var(--text-secondary)] [@media(max-height:760px)]:mt-2 transition-colors hover:text-[var(--text-primary)]"
          >
            <Users className="size-4" /> {splitOpen ? 'Remove split' : 'Split with someone'}
          </button>
        )}
        {splitting && (
          <div className="mt-2" role="group" aria-label="Split with">
            {friendsQuery.isLoading && <p className="text-[13px] text-[var(--text-tertiary)]">Loading friends…</p>}
            {friendsQuery.data && friendsQuery.data.data.filter((f) => f.isFriend).length === 0 && (
              <p className="text-[13px] text-[var(--text-tertiary)]">No friends yet. <a href="/shared" className="underline">Add friends under Shared</a>; no wallet needed.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {(friendsQuery.data?.data ?? []).filter((f) => f.isFriend).map((f) => {
                const on = splitFriendIds.includes(f.personId)
                return (
                  <button
                    key={f.personId}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setSplitFriendIds((ids) => (on ? ids.filter((x) => x !== f.personId) : [...ids, f.personId])); setError(null) }}
                    className={`h-9 max-w-full truncate rounded-full px-3.5 text-[13px] font-semibold ${on ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-[var(--tint)] text-[var(--text-primary)]'}`}
                  >
                    {f.name}
                  </button>
                )
              })}
            </div>
            {splitFriendIds.length > 0 && (
              <p className="mt-2 text-[12.5px] text-[var(--text-tertiary)]">Split equally between you and {splitFriendIds.length} {splitFriendIds.length === 1 ? 'friend' : 'friends'}. Edit details under Shared.</p>
            )}
          </div>
        )}

        <div className="h-3" />
        </div>

        <div className="shrink-0 border-t border-[var(--border-subtle)] px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
        {/* Keypad (phones) */}
        {useKeypad && (
          <div className="grid grid-cols-3 gap-2 [@media(max-height:760px)]:gap-1.5" role="group" aria-label="Keypad">
            {(decimals === 0 ? KEYS_WHOLE : KEYS_DECIMAL).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                aria-label={key === 'back' ? 'Delete digit' : key === '.' ? 'Decimal point' : key}
                className="tabular flex h-[52px] items-center justify-center rounded-full bg-[var(--tint)] text-[24px] [@media(max-height:760px)]:h-11 [@media(max-height:760px)]:text-[22px] font-semibold text-[var(--text-primary)] transition-colors active:bg-[var(--tint-strong)]"
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
          disabled={mutation.isPending || walletMutation.isPending || (!wallet && !splitting) || amount === ''}
          className="mt-3 h-14 w-full rounded-2xl bg-[var(--ink)] [@media(max-height:760px)]:mt-2 [@media(max-height:760px)]:h-12 text-base font-bold text-[var(--cream)] transition-colors active:opacity-90 disabled:bg-[var(--tint-strong)] disabled:text-[var(--text-tertiary)]"
        >
          {mutation.isPending ? 'Saving…' : splitting ? 'Save shared expense' : kind === 'expense' ? 'Save expense' : 'Save income'}
        </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
