import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createPortfolioHolding,
  deletePortfolioHolding,
  getPortfolioSummary,
  refreshPortfolioWallet,
  searchPortfolioInstruments,
  updatePortfolioHolding,
  type PortfolioHoldingApi,
} from '@/lib/api'
import { AddHoldingDialog, type AddHoldingInput, type InstrumentCandidate } from './AddHoldingDialog'
import { DeleteHoldingDialog } from './DeleteHoldingDialog'
import { EditHoldingDialog } from './EditHoldingDialog'
import { PortfolioSection, type PortfolioHolding, type PortfolioSummary } from './PortfolioSection'

// Holdings are valued in the wallet's own currency (an IDR gold wallet shows rupiah), so the
// figures line up with the wallet balance and its value trend.
export function WalletPortfolio({ walletId, baseCurrency }: { walletId: string; baseCurrency: string }) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<PortfolioHolding | null>(null)
  const [deleting, setDeleting] = useState<PortfolioHolding | null>(null)
  const qc = useQueryClient()
  const summaryQuery = useQuery({ queryKey: ['portfolio-summary', walletId, baseCurrency], queryFn: () => getPortfolioSummary(walletId, baseCurrency), staleTime: 60_000 })

  async function invalidatePortfolio() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['portfolio-summary', walletId] }),
      qc.invalidateQueries({ queryKey: ['portfolio-history', walletId] }),
      qc.invalidateQueries({ queryKey: ['wallets'] }),
      qc.invalidateQueries({ queryKey: ['net-worth'] }),
      qc.invalidateQueries({ queryKey: ['listing-prices'] }),
    ])
  }

  const refresh = useMutation({ mutationFn: () => refreshPortfolioWallet(walletId), onSuccess: invalidatePortfolio })

  async function search(query: string): Promise<InstrumentCandidate[]> {
    const response = await searchPortfolioInstruments(query, 12)
    return response.data.filter((item) => item.currency && item.timezone).map((item) => ({
      provider: 'yahoo', providerSymbol: item.providerSymbol, symbol: item.providerSymbol, name: item.name,
      type: item.instrumentType, exchange: item.exchangeName, exchangeCode: item.exchangeCode,
      quoteCurrency: item.currency, timezone: item.timezone!, mic: item.mic,
    }))
  }

  async function add(input: AddHoldingInput) {
    await createPortfolioHolding({
      walletId, provider: 'yahoo', providerSymbol: input.candidate.providerSymbol,
      quantity: input.quantity, averageCost: input.averageCost, costCurrency: input.averageCostCurrency,
    })
    await refreshPortfolioWallet(walletId)
    await invalidatePortfolio()
  }

  async function edit(input: { quantity: string; averageCost: string | null; averageCostCurrency: string | null }) {
    if (!editing) return
    await updatePortfolioHolding(editing.id, { quantity: input.quantity, averageCost: input.averageCost, costCurrency: input.averageCostCurrency })
    await invalidatePortfolio()
  }

  async function remove() {
    if (!deleting) return
    await deletePortfolioHolding(deleting.id)
    await invalidatePortfolio()
  }

  const portfolio = adaptPortfolio(walletId, baseCurrency, summaryQuery.data?.data)
  if (summaryQuery.isLoading) return <p className="mb-10 py-6 text-center font-mono text-xs text-muted-foreground">Loading portfolio...</p>
  if (summaryQuery.error) return <p className="mb-10 py-6 text-center font-mono text-xs text-[var(--negative)]">{summaryQuery.error.message}</p>
  if (!portfolio) return null

  return (
    <>
      {refresh.error && <p role="alert" className="mb-3 text-sm text-[var(--negative)]">Price refresh failed: {refresh.error.message}</p>}
      <PortfolioSection portfolio={portfolio} onAddHolding={() => setAdding(true)} onRefresh={() => refresh.mutate()} onEditHolding={setEditing} onDeleteHolding={setDeleting} refreshing={refresh.isPending} />
      {adding && <AddHoldingDialog open onClose={() => setAdding(false)} onSearch={search} onSubmit={add} />}
      {editing && <EditHoldingDialog open holding={{ id: editing.id, symbol: editing.listing.symbol, name: editing.listing.name, exchange: editing.listing.exchange, quoteCurrency: editing.listing.quoteCurrency, quantity: editing.quantity, averageCost: editing.averageCost }} onClose={() => setEditing(null)} onSubmit={edit} />}
      {deleting && <DeleteHoldingDialog open symbol={deleting.listing.symbol} onClose={() => setDeleting(null)} onConfirm={remove} />}
    </>
  )
}

function adaptPortfolio(walletId: string, fallbackCurrency: string, summary: Awaited<ReturnType<typeof getPortfolioSummary>>['data'] | undefined): PortfolioSummary | null {
  if (!summary) return null
  const baseCurrency = summary.baseCurrency ?? fallbackCurrency
  return {
    walletId, baseCurrency, totalBaseValue: summary.totalBaseValue, dailyChangeBase: summary.dailyChangeBase ?? null,
    dailyChangePercent: summary.dailyChangePercent ?? null,
    totalCostBase: summary.totalCostBase ?? null, totalUnrealizedBase: summary.totalUnrealizedBase ?? null, totalUnrealizedPercent: summary.totalUnrealizedPercent ?? null,
    asOf: summary.asOf ?? null, source: summary.source ?? 'yahoo',
    status: summary.status ?? (summary.holdings.length ? 'partial' : 'empty'),
    holdings: summary.holdings.map(adaptHolding),
  }
}

function adaptHolding(holding: PortfolioHoldingApi & { price: number | null; previousClose?: number | null; priceDate: string | null; nativeCurrency: string; nativeValue: number | null; baseValue: number | null; dailyChangePercent?: number | null; costBaseValue?: number | null; unrealizedBase?: number | null; unrealizedPercent?: number | null; priceStatus?: 'fresh' | 'stale' | 'error' | 'missing' }): PortfolioHolding {
  return {
    id: holding.id, quantity: Number(holding.quantity), averageCost: holding.averageCost === null ? null : Number(holding.averageCost), averageCostCurrency: holding.costCurrency,
    listing: { id: holding.listing.id, symbol: holding.listing.providerSymbol, name: holding.listing.instrumentName, exchange: holding.listing.exchangeName, quoteCurrency: holding.listing.currency, instrumentType: holding.listing.instrumentType },
    latestPrice: holding.price, nativeValue: holding.nativeValue, baseValue: holding.baseValue, dailyChangePercent: holding.dailyChangePercent ?? null,
    costBaseValue: holding.costBaseValue ?? null, unrealizedBase: holding.unrealizedBase ?? null, unrealizedPercent: holding.unrealizedPercent ?? null,
    priceAsOf: holding.priceDate ? `${holding.priceDate}T23:59:59Z` : null, priceSource: holding.listing.instrumentType === 'mutual_fund' ? 'pasardana' : 'yahoo', priceStatus: holding.priceStatus ?? (holding.price ? 'fresh' : 'missing'), priceError: holding.listing.refreshError,
  }
}
