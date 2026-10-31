import { useState } from 'react'
import { AlertTriangle, ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SectionDivider } from './SectionDivider'
import { HoldingPriceChart } from './HoldingPriceChart'

export type InstrumentType = 'stock' | 'etf' | 'crypto' | 'commodity' | 'mutual_fund'

const UNIT_LABEL: Record<InstrumentType, [string, string]> = {
  stock: ['share', 'shares'],
  etf: ['share', 'shares'],
  mutual_fund: ['unit', 'units'],
  crypto: ['coin', 'coins'],
  commodity: ['oz', 'oz'],
}

function unitLabel(type: InstrumentType | undefined, quantity: number) {
  const [one, many] = UNIT_LABEL[type ?? 'stock'] ?? UNIT_LABEL.stock
  return quantity === 1 ? one : many
}

export type PortfolioHolding = {
  id: string
  quantity: number
  averageCost: number | null
  averageCostCurrency: string | null
  listing: {
    id: string
    symbol: string
    name: string
    exchange: string
    quoteCurrency: string
    instrumentType?: InstrumentType
  }
  latestPrice: number | null
  nativeValue: number | null
  baseValue: number | null
  dailyChangePercent: number | null
  costBaseValue?: number | null
  unrealizedBase?: number | null
  unrealizedPercent?: number | null
  priceAsOf: string | null
  priceSource: string | null
  priceStatus: 'fresh' | 'stale' | 'error' | 'missing'
  priceError?: string | null
}

export type PortfolioSummary = {
  walletId: string
  baseCurrency: string
  totalBaseValue: number | null
  dailyChangeBase: number | null
  dailyChangePercent: number | null
  totalCostBase?: number | null
  totalUnrealizedBase?: number | null
  totalUnrealizedPercent?: number | null
  asOf: string | null
  source: string | null
  status: 'fresh' | 'stale' | 'partial' | 'empty'
  holdings: PortfolioHolding[]
}

type Props = {
  portfolio: PortfolioSummary
  onAddHolding: () => void
  onRefresh: () => void
  onEditHolding: (holding: PortfolioHolding) => void
  onDeleteHolding: (holding: PortfolioHolding) => void
  refreshing: boolean
}

function formatMoney(amount: number, currency: string, compact = false) {
  if (currency === 'IDR' && !compact) {
    return `Rp${Math.round(amount).toLocaleString('en-US')}`
  }
  try {
    return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: compact ? 'compact' : 'standard',
      minimumFractionDigits: currency === 'IDR' ? 0 : 2,
      maximumFractionDigits: currency === 'IDR' ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

function formatAge(value: string | null) {
  if (!value) return 'No price yet'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Unknown update time'
  const elapsed = Math.max(0, Date.now() - timestamp)
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Updated recently'
  if (hours < 24) return `Updated ${hours}h ago`
  return `Updated ${Math.floor(hours / 24)}d ago`
}

function signedMoney(value: number, currency: string) {
  return `${value >= 0 ? '+' : '−'}${formatMoney(Math.abs(value), currency)}`
}

function signedPercent(value: number) {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`
}

export function PortfolioSection({ portfolio, onAddHolding, onRefresh, onEditHolding, onDeleteHolding, refreshing }: Props) {
  const hasHoldings = portfolio.holdings.length > 0
  const movementPositive = (portfolio.dailyChangeBase ?? 0) >= 0
  const stale = portfolio.status === 'stale' || portfolio.status === 'partial'
  const totalBaseValue = portfolio.totalBaseValue
  const [expanded, setExpanded] = useState<string | null>(null)
  const totalReturn = portfolio.totalUnrealizedBase ?? null
  const totalReturnPercent = portfolio.totalUnrealizedPercent ?? null

  return (
    <section aria-label="Investment portfolio" className="mb-14">
      <SectionDivider title="Portfolio" badge={`${portfolio.holdings.length} holding${portfolio.holdings.length === 1 ? '' : 's'}`} />

      <Card className="overflow-hidden bg-white">
        <CardContent className="p-0">
          <header className="flex flex-col gap-5 border-b border-border/60 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Market value</p>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{totalBaseValue === null ? '—' : formatMoney(totalBaseValue, portfolio.baseCurrency)}</p>
              {portfolio.dailyChangeBase !== null && portfolio.dailyChangePercent !== null && (
                <p className={`mt-1 font-mono text-xs ${movementPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                  {signedMoney(portfolio.dailyChangeBase, portfolio.baseCurrency)} · {portfolio.dailyChangePercent >= 0 ? '+' : ''}{portfolio.dailyChangePercent.toFixed(2)}% today
                </p>
              )}
              {totalReturn !== null && totalReturnPercent !== null && (
                <p className={`mt-0.5 font-mono text-xs ${totalReturn >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                  {signedMoney(totalReturn, portfolio.baseCurrency)} · {signedPercent(totalReturnPercent)} since bought
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">EOD prices · {portfolio.source ? portfolio.source[0].toUpperCase() + portfolio.source.slice(1) : 'Awaiting first refresh'} · {formatAge(portfolio.asOf)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing || !hasHoldings} className="min-h-11">
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </Button>
              <Button size="sm" onClick={onAddHolding} className="min-h-11"><Plus className="size-4" /> Add holding</Button>
            </div>
          </header>

          {stale && (
            <div role="status" className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-900 sm:px-7">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Some prices may be stale. Finance OS is keeping the last valid close instead of replacing it with incomplete data.
            </div>
          )}

          {!hasHoldings ? (
            <div className="px-5 py-12 text-center sm:px-7">
              <p className="text-sm font-medium">No holdings yet</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">Search global stocks and ETFs, select the exact exchange, then add the quantity you own.</p>
              <Button className="mt-5" onClick={onAddHolding}><Plus className="size-4" /> Add your first holding</Button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {portfolio.holdings.map((holding) => {
                const native = holding.nativeValue === null ? 'No price' : formatMoney(holding.nativeValue, holding.listing.quoteCurrency)
                const showBase = holding.baseValue !== null && holding.listing.quoteCurrency !== portfolio.baseCurrency
                const isOpen = expanded === holding.id
                return (
                  <div key={holding.id}>
                  <article className="group grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-7">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} ${holding.listing.symbol} price chart`}
                      onClick={() => setExpanded(isOpen ? null : holding.id)}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{holding.listing.symbol}</span>
                        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{holding.listing.exchange}</Badge>
                        {holding.priceStatus !== 'fresh' && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[9px] text-amber-800">{holding.priceStatus}</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{holding.listing.name} · {holding.quantity.toLocaleString()} {unitLabel(holding.listing.instrumentType, holding.quantity)}</p>
                      {holding.priceError && <p className="mt-1 text-[11px] text-[var(--negative)]">{holding.priceError}</p>}
                      <p className="mt-1 text-[10px] text-muted-foreground">{holding.priceSource ? holding.priceSource[0].toUpperCase() + holding.priceSource.slice(1) : 'No source'} · {formatAge(holding.priceAsOf)}</p>
                    </button>
                    <div className="sm:text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">{native}</p>
                      {showBase && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">≈ {formatMoney(holding.baseValue!, portfolio.baseCurrency)}</p>}
                      {holding.dailyChangePercent !== null && (
                        <p className={`mt-0.5 font-mono text-[10px] ${holding.dailyChangePercent >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                          {holding.dailyChangePercent >= 0 ? '+' : ''}{holding.dailyChangePercent.toFixed(2)}% today
                        </p>
                      )}
                      {holding.unrealizedPercent !== null && holding.unrealizedPercent !== undefined && holding.unrealizedBase !== null && holding.unrealizedBase !== undefined && (
                        <p className={`mt-0.5 font-mono text-[10px] ${holding.unrealizedBase >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                          {signedMoney(holding.unrealizedBase, portfolio.baseCurrency)} · {signedPercent(holding.unrealizedPercent)} since bought
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button aria-label={`Edit ${holding.listing.symbol}`} variant="ghost" size="sm" onClick={() => onEditHolding(holding)}>Edit</Button>
                      <Button aria-label={`Delete ${holding.listing.symbol}`} variant="ghost" size="icon-sm" onClick={() => onDeleteHolding(holding)} className="hover:text-[var(--negative)]"><Trash2 className="size-4" /></Button>
                    </div>
                  </article>
                  {isOpen && <HoldingPriceChart listingId={holding.listing.id} symbol={holding.listing.symbol} averageCost={holding.averageCost} averageCostCurrency={holding.averageCostCurrency} />}
                  </div>
                )
              })}
            </div>
          )}

        </CardContent>
      </Card>
    </section>
  )
}
