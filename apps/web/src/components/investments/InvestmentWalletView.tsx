import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, subDays } from 'date-fns'
import { Plus, RefreshCw } from 'lucide-react'
import {
  createPortfolioHolding,
  deletePortfolioHolding,
  getPortfolioHistory,
  getPortfolioSummary,
  refreshPortfolioWallet,
  searchPortfolioInstruments,
  updatePortfolioHolding,
  type PortfolioSummaryApi,
} from '@/lib/api'
import { buildValueTrend, type LedgerPoint } from '@/lib/valueTrend'
import { displayName, displayQuantity, formatMoney, formatPercent, splitDecimals } from '@/lib/investments'
import { AddHoldingDialog, type AddHoldingInput, type InstrumentCandidate } from '../AddHoldingDialog'
import { DeleteHoldingDialog } from '../DeleteHoldingDialog'
import { EditHoldingDialog } from '../EditHoldingDialog'
import { HoldingAvatar } from './HoldingAvatar'
import { HoldingSheet } from './HoldingSheet'
import { ValueChart, type ValueScrub } from './ValueChart'
import type { InvestmentHolding } from './types'

type Wallet = { id: string; name: string; currency: string; balance: number; subtitle: string }

const ALLOCATION_COLORS = ['#0e1729', '#c9a35b', '#5f7aa8', '#7fa58c', '#d9c7a3', '#9aa3b5']

export function toInvestmentHoldings(summary: PortfolioSummaryApi | undefined): InvestmentHolding[] {
  return (summary?.holdings ?? []).map((holding) => ({
    id: holding.id,
    listingId: holding.listing.id,
    symbol: holding.listing.providerSymbol,
    name: holding.listing.instrumentName,
    type: holding.listing.instrumentType,
    exchange: holding.listing.exchangeName,
    quoteCurrency: holding.nativeCurrency ?? holding.listing.currency,
    quantity: Number(holding.quantity),
    averageCost: holding.averageCost === null ? null : Number(holding.averageCost),
    averageCostCurrency: holding.costCurrency,
    price: holding.price,
    baseValue: holding.baseValue,
    costBaseValue: holding.costBaseValue ?? null,
    unrealizedBase: holding.unrealizedBase ?? null,
    unrealizedPercent: holding.unrealizedPercent ?? null,
    dailyChangePercent: holding.dailyChangePercent ?? null,
    priceStatus: holding.priceStatus ?? (holding.price === null ? 'missing' : 'fresh'),
    priceError: holding.listing.refreshError,
  }))
}

/**
 * Investment wallet page body: value hero with chart, three key numbers, allocation and the
 * holdings list. Tapping a holding opens its detail sheet (price chart, position, edit/remove).
 */
export function InvestmentWalletView({ wallet, ledgerTrend, icon, actions }: { wallet: Wallet; ledgerTrend: LedgerPoint[]; icon: ReactNode; actions: ReactNode }) {
  const qc = useQueryClient()
  const currency = wallet.currency
  const historyTo = format(new Date(), 'yyyy-MM-dd')
  const historyFrom = format(subDays(new Date(), 365), 'yyyy-MM-dd')
  const summaryQuery = useQuery({ queryKey: ['portfolio-summary', wallet.id, currency], queryFn: () => getPortfolioSummary(wallet.id, currency), staleTime: 60_000 })
  const historyQuery = useQuery({ queryKey: ['portfolio-history', wallet.id, currency, historyFrom, historyTo], queryFn: () => getPortfolioHistory(wallet.id, currency, historyFrom, historyTo), staleTime: 300_000 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scrub, setScrub] = useState<ValueScrub | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<InvestmentHolding | null>(null)
  const [deleting, setDeleting] = useState<InvestmentHolding | null>(null)

  const summary = summaryQuery.data?.data
  const holdings = useMemo(() => toInvestmentHoldings(summary).sort((a, b) => (b.baseValue ?? 0) - (a.baseValue ?? 0)), [summary])
  const holdingsValue = summary?.totalBaseValue ?? null
  const cash = wallet.balance
  const total = holdingsValue !== null ? cash + holdingsValue : cash
  const totalReturn = summary?.totalUnrealizedBase ?? null
  const totalReturnPercent = summary?.totalUnrealizedPercent ?? null
  const invested = summary?.totalCostBase ?? null
  const trend = useMemo(() => (historyQuery.data ? buildValueTrend(ledgerTrend, historyQuery.data.data.points) : ledgerTrend), [historyQuery.data, ledgerTrend])
  const selected = holdings.find((holding) => holding.id === selectedId) ?? null
  const stale = holdings.some((holding) => holding.priceStatus !== 'fresh')

  async function invalidate() {
    await Promise.all(['portfolio-summary', 'portfolio-history', 'wallets', 'net-worth', 'listing-prices'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
  }
  const refresh = useMutation({ mutationFn: () => refreshPortfolioWallet(wallet.id), onSuccess: invalidate })

  async function search(query: string): Promise<InstrumentCandidate[]> {
    const response = await searchPortfolioInstruments(query, 12)
    return response.data.filter((item) => item.currency && item.timezone).map((item) => ({
      provider: 'yahoo', providerSymbol: item.providerSymbol, symbol: item.providerSymbol, name: item.name,
      type: item.instrumentType, exchange: item.exchangeName, exchangeCode: item.exchangeCode,
      quoteCurrency: item.currency, timezone: item.timezone!, mic: item.mic,
    }))
  }
  async function add(input: AddHoldingInput) {
    await createPortfolioHolding({ walletId: wallet.id, provider: 'yahoo', providerSymbol: input.candidate.providerSymbol, quantity: input.quantity, averageCost: input.averageCost, costCurrency: input.averageCostCurrency })
    await refreshPortfolioWallet(wallet.id)
    await invalidate()
  }
  async function edit(input: { quantity: string; averageCost: string | null; averageCostCurrency: string | null }) {
    if (!editing) return
    await updatePortfolioHolding(editing.id, { quantity: input.quantity, averageCost: input.averageCost, costCurrency: input.averageCostCurrency })
    await invalidate()
  }
  async function remove() {
    if (!deleting) return
    await deletePortfolioHolding(deleting.id)
    setSelectedId(null)
    await invalidate()
  }

  const hero = splitDecimals(formatMoney(scrub ? scrub.value : total, currency))
  // While scrubbing only the date is shown: the wallet value includes deposits and withdrawals,
  // so a change versus the range start would count new money as gains.
  const chip = !scrub && totalReturn !== null && totalReturnPercent !== null ? { amount: totalReturn, percent: totalReturnPercent, label: 'all time' } : null
  const allocation = holdingsValue && holdingsValue > 0
    ? [...holdings.filter((holding) => (holding.baseValue ?? 0) > 0).map((holding) => ({ key: holding.id, label: displayName(holding), value: holding.baseValue! })), ...(cash > 0 ? [{ key: 'cash', label: 'Cash', value: cash }] : [])]
    : []
  const allocationTotal = allocation.reduce((sum, item) => sum + item.value, 0)

  return (
    <>
      <header className="mb-4 overflow-hidden rounded-[24px] bg-[var(--ink)] px-5 pb-4 pt-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[var(--cream)]">{icon}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="break-words text-[20px] font-bold leading-tight tracking-[-0.01em]">{wallet.name}</h1>
            <p className="mt-0.5 text-[13px] text-white/60">{wallet.subtitle}</p>
          </div>
          <div className="-mr-2 flex shrink-0 items-center">{actions}</div>
        </div>

        <p className="tabular mt-6 text-[40px] font-bold leading-none tracking-[-0.03em]" aria-label={`Value ${formatMoney(total, currency)}`}>
          {hero.main}<span className="text-[26px] text-white/55">{hero.decimals}</span>
        </p>
        {scrub ? (
          <p className="mt-3 flex min-h-7 items-center text-[13px] font-semibold text-white/75" aria-live="polite">{format(parseISO(scrub.date), 'EEE, d MMM yyyy')}</p>
        ) : chip ? (
          <p className="mt-3 flex min-h-7 flex-wrap items-center gap-2 text-[13px]" aria-live="polite">
            <span className={`tabular rounded-full px-2.5 py-1 font-semibold ${chip.amount >= 0 ? 'bg-[var(--cream)] text-[var(--ink)]' : 'bg-[#ffb4a8]/15 text-[#ffb4a8]'}`}>
              {chip.amount >= 0 ? '▲' : '▼'} {formatMoney(Math.abs(chip.amount), currency)}{chip.percent !== null ? ` · ${formatPercent(Math.abs(chip.percent), false)}` : ''}
            </span>
            <span className="text-white/55">{chip.label}</span>
          </p>
        ) : summary && holdings.length === 0 ? (
          <p className="mt-3 min-h-7 text-[13px] text-white/55">Cash balance</p>
        ) : null}

        <ValueChart points={trend} onScrub={setScrub} />
      </header>

      {holdings.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-2">
          <Stat label="Invested" value={invested !== null ? formatMoney(invested, currency, { compact: true }) : '—'} />
          <Stat label="Return" value={totalReturn !== null ? formatMoney(totalReturn, currency, { compact: true, signed: true }) : '—'} tone={totalReturn === null ? null : totalReturn >= 0 ? 'positive' : 'negative'} />
          {cash !== 0 || summary?.dailyChangeBase == null ? (
            <Stat label="Cash" value={formatMoney(cash, currency, { compact: true })} />
          ) : (
            <Stat label="Today" value={formatMoney(summary.dailyChangeBase, currency, { compact: true, signed: true })} tone={summary.dailyChangeBase >= 0 ? 'positive' : 'negative'} />
          )}
        </div>
      )}

      <section aria-label="Holdings" className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-bold tracking-[-0.01em]">Holdings</h2>
          <div className="flex items-center gap-1">
            {holdings.length > 0 && (
              <button type="button" onClick={() => refresh.mutate()} disabled={refresh.isPending} aria-label="Refresh prices" className="flex size-10 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--tint)] disabled:opacity-50">
                <RefreshCw className={`size-[18px] ${refresh.isPending ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button type="button" onClick={() => setAdding(true)} aria-label="Add holding" className="flex size-10 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--cream)]">
              <Plus className="size-5" />
            </button>
          </div>
        </div>

        {allocation.length > 1 && (
          <div className="mb-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-[var(--tint)]" role="img" aria-label={`Allocation: ${allocation.map((item) => `${item.label} ${Math.round((item.value / allocationTotal) * 100)}%`).join(', ')}`}>
              {allocation.map((item, index) => (
                <span key={item.key} style={{ width: `${(item.value / allocationTotal) * 100}%`, background: ALLOCATION_COLORS[index % ALLOCATION_COLORS.length] }} className="h-full border-r-2 border-white last:border-r-0" />
              ))}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--text-tertiary)]">
              {allocation.slice(0, 3).map((item, index) => (
                <span key={item.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: ALLOCATION_COLORS[index] }} />
                  <span className="max-w-[9rem] truncate">{item.label}</span>
                  <span className="tabular font-semibold text-[var(--text-secondary)]">{Math.round((item.value / allocationTotal) * 100)}%</span>
                </span>
              ))}
              {allocation.length > 3 && <span>+{allocation.length - 3} more</span>}
            </p>
          </div>
        )}

        {summaryQuery.isLoading && <p className="py-8 text-center text-[13px] text-[var(--text-tertiary)]">Loading holdings…</p>}
        {summaryQuery.error && <p className="py-8 text-center text-[13px] text-[var(--negative)]">{summaryQuery.error.message}</p>}
        {refresh.error && <p role="alert" className="mb-2 text-[13px] text-[var(--negative)]">Couldn’t refresh prices: {refresh.error.message}</p>}

        {summary && holdings.length === 0 && (
          <button type="button" onClick={() => setAdding(true)} className="flex w-full items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-[var(--shadow-card)]">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--tint)]"><Plus className="size-5" /></span>
            <span className="text-[15px] font-semibold">Add your first holding</span>
          </button>
        )}

        {holdings.length > 0 && (
          <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-[20px] bg-white shadow-[var(--shadow-card)]">
            {holdings.map((holding) => (
              <li key={holding.id}>
                <button type="button" onClick={() => setSelectedId(holding.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-[var(--bg-base)]" aria-label={`${displayName(holding)}, ${holding.baseValue !== null ? formatMoney(holding.baseValue, currency) : 'no price'}`}>
                  <HoldingAvatar identity={holding} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{displayName(holding)}</span>
                    <span className="block truncate text-[13px] text-[var(--text-tertiary)]">{displayQuantity(holding, holding.quantity)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-[15px] font-semibold">{holding.baseValue !== null ? formatMoney(holding.baseValue, currency) : '—'}</span>
                    {holding.unrealizedPercent !== null ? (
                      <span className={`tabular block text-[13px] font-medium ${holding.unrealizedPercent >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {holding.unrealizedPercent >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(holding.unrealizedPercent), false)}
                      </span>
                    ) : holding.priceStatus !== 'fresh' ? (
                      <span className="block text-[13px] text-amber-700">{holding.priceStatus === 'missing' ? 'No price' : 'Stale'}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {stale && holdings.length > 0 && <p className="mt-2 text-[12px] text-amber-800">Some prices are out of date. Tap Refresh to try again.</p>}
      </section>

      {selected && (
        <HoldingSheet
          holding={selected}
          walletCurrency={currency}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onRemove={() => setDeleting(selected)}
        />
      )}
      {adding && <AddHoldingDialog open onClose={() => setAdding(false)} onSearch={search} onSubmit={add} />}
      {editing && <EditHoldingDialog open holding={{ id: editing.id, symbol: editing.symbol, name: editing.name, exchange: editing.exchange, quoteCurrency: editing.quoteCurrency, quantity: editing.quantity, averageCost: editing.averageCost }} onClose={() => setEditing(null)} onSubmit={edit} />}
      {deleting && <DeleteHoldingDialog open symbol={displayName(deleting)} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </>
  )
}

function Stat({ label, value, tone = null }: { label: string; value: string; tone?: 'positive' | 'negative' | null }) {
  return (
    <div className="rounded-[16px] bg-white px-3 py-3 shadow-[var(--shadow-card)]">
      <p className="text-[12px] text-[var(--text-tertiary)]">{label}</p>
      <p className={`tabular mt-0.5 truncate text-[16px] font-bold ${tone === 'positive' ? 'text-[var(--positive)]' : tone === 'negative' ? 'text-[var(--negative)]' : ''}`}>{value}</p>
    </div>
  )
}
