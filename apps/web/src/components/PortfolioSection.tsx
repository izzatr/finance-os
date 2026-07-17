import { AlertTriangle, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SectionDivider } from './SectionDivider'

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
  }
  latestPrice: number | null
  nativeValue: number | null
  baseValue: number | null
  dailyChangePercent: number | null
  priceAsOf: string | null
  priceSource: string | null
  priceStatus: 'fresh' | 'stale' | 'error' | 'missing'
  priceError?: string | null
}

export type PortfolioSummary = {
  walletId: string
  baseCurrency: string
  totalBaseValue: number
  dailyChangeBase: number | null
  dailyChangePercent: number | null
  asOf: string | null
  source: string | null
  status: 'fresh' | 'stale' | 'partial' | 'empty'
  holdings: PortfolioHolding[]
  history: Array<{ date: string; value: number }>
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
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours < 1) return 'Updated recently'
  if (hours < 24) return `Updated ${hours}h ago`
  return `Updated ${Math.floor(hours / 24)}d ago`
}

function signedMoney(value: number, currency: string) {
  return `${value >= 0 ? '+' : '−'}${formatMoney(Math.abs(value), currency)}`
}

export function PortfolioSection({ portfolio, onAddHolding, onRefresh, onEditHolding, onDeleteHolding, refreshing }: Props) {
  const hasHoldings = portfolio.holdings.length > 0
  const movementPositive = (portfolio.dailyChangeBase ?? 0) >= 0
  const stale = portfolio.status === 'stale' || portfolio.status === 'partial'

  return (
    <section aria-label="Investment portfolio" className="mb-14">
      <SectionDivider title="Portfolio" badge={`${portfolio.holdings.length} holding${portfolio.holdings.length === 1 ? '' : 's'}`} />

      <Card className="overflow-hidden bg-white/75">
        <CardContent className="p-0">
          <header className="flex flex-col gap-5 border-b border-border/60 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Market value</p>
              <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{formatMoney(portfolio.totalBaseValue, portfolio.baseCurrency)}</p>
              {portfolio.dailyChangeBase !== null && portfolio.dailyChangePercent !== null && (
                <p className={`mt-1 font-mono text-xs ${movementPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                  {signedMoney(portfolio.dailyChangeBase, portfolio.baseCurrency)} · {portfolio.dailyChangePercent >= 0 ? '+' : ''}{portfolio.dailyChangePercent.toFixed(2)}%
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">EOD prices · {portfolio.source ? portfolio.source[0].toUpperCase() + portfolio.source.slice(1) : 'Awaiting first refresh'} · {formatAge(portfolio.asOf)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing || !hasHoldings}>
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Refreshing' : 'Refresh'}
              </Button>
              <Button size="sm" onClick={onAddHolding}><Plus className="size-4" /> Add holding</Button>
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
                return (
                  <article key={holding.id} className="group grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-7">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{holding.listing.symbol}</span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{holding.listing.exchange}</Badge>
                        {holding.priceStatus !== 'fresh' && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[9px] text-amber-800">{holding.priceStatus}</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{holding.listing.name} · {holding.quantity.toLocaleString()} shares</p>
                      {holding.priceError && <p className="mt-1 text-[11px] text-[var(--negative)]">{holding.priceError}</p>}
                    </div>
                    <div className="sm:text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">{native}</p>
                      {showBase && <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">≈ {formatMoney(holding.baseValue!, portfolio.baseCurrency)}</p>}
                      {holding.dailyChangePercent !== null && (
                        <p className={`mt-0.5 font-mono text-[10px] ${holding.dailyChangePercent >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                          {holding.dailyChangePercent >= 0 ? '+' : ''}{holding.dailyChangePercent.toFixed(2)}%
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <Button variant="ghost" size="sm" onClick={() => onEditHolding(holding)}>Edit</Button>
                      <Button aria-label={`Delete ${holding.listing.symbol}`} variant="ghost" size="icon-sm" onClick={() => onDeleteHolding(holding)} className="hover:text-[var(--negative)]"><Trash2 className="size-4" /></Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {portfolio.history.length > 1 && (
            <div className="border-t border-border/60 px-4 pb-4 pt-6 sm:px-7">
              <div className="h-52" aria-label="Portfolio history chart">
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 208 }}>
                  <AreaChart data={portfolio.history} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs><linearGradient id="portfolio-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#5ba4d4" stopOpacity={0.25} /><stop offset="95%" stopColor="#5ba4d4" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,190,220,0.15)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => formatMoney(Number(value), portfolio.baseCurrency, true)} width={70} />
                    <Tooltip formatter={(value) => [formatMoney(Number(value), portfolio.baseCurrency), 'Portfolio']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="value" stroke="#5ba4d4" strokeWidth={2.5} fill="url(#portfolio-fill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
