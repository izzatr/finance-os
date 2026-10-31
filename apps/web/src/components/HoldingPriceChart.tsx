import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, subMonths } from 'date-fns'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getListingPrices } from '@/lib/api'

const RANGES = [
  { id: '1M', label: '1M', from: (now: Date) => subMonths(now, 1) },
  { id: '6M', label: '6M', from: (now: Date) => subMonths(now, 6) },
  { id: '1Y', label: '1Y', from: (now: Date) => subDays(now, 365) },
] as const

type RangeId = (typeof RANGES)[number]['id']

function formatPrice(value: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat(currency === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: currency === 'IDR' ? 0 : value < 10 ? 4 : 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toLocaleString()}`
  }
}

type Props = {
  listingId: string
  symbol: string
  /** Average cost per unit, drawn as a reference line when it is in the quote currency. */
  averageCost: number | null
  averageCostCurrency: string | null
}

export function HoldingPriceChart({ listingId, symbol, averageCost, averageCostCurrency }: Props) {
  const [range, setRange] = useState<RangeId>('6M')
  const now = new Date()
  const to = format(now, 'yyyy-MM-dd')
  const from = format(RANGES.find((item) => item.id === range)!.from(now), 'yyyy-MM-dd')
  const query = useQuery({
    queryKey: ['listing-prices', listingId, from, to],
    queryFn: () => getListingPrices(listingId, from, to),
    staleTime: 300_000,
  })
  const data = query.data?.data
  const points = data?.points ?? []
  const currency = points.at(-1)?.currency ?? data?.currency ?? 'USD'
  const first = points[0]?.close
  const last = points.at(-1)?.close
  const change = first && last ? ((last - first) / first) * 100 : null
  const showCost = averageCost !== null && (averageCostCurrency ?? currency) === currency

  return (
    <div className="border-t border-border/40 bg-[var(--tint,#faf7f2)] px-4 pb-4 pt-4 sm:px-7" aria-label={`${symbol} price chart`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">Price</p>
          {change !== null && (
            <p className={`font-mono text-[11px] ${change >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}% over {range}
            </p>
          )}
        </div>
        <div role="tablist" aria-label="Price range" className="flex gap-1">
          {RANGES.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={range === item.id}
              onClick={() => setRange(item.id)}
              className={`min-h-9 rounded-full px-3 text-[12px] font-semibold ${range === item.id ? 'bg-[#0e1729] text-white' : 'text-muted-foreground hover:bg-black/5'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {query.isLoading && <p className="py-10 text-center text-xs text-muted-foreground">Loading prices...</p>}
      {query.error && <p className="py-10 text-center text-xs text-[var(--negative)]">{query.error.message}</p>}
      {!query.isLoading && !query.error && points.length < 2 && (
        <p className="py-10 text-center text-xs text-muted-foreground">Not enough price history yet. It fills in as daily prices arrive.</p>
      )}
      {points.length >= 2 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 192 }}>
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={`price-fill-${listingId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0e1729" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#0e1729" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ede7dc" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(value: string) => format(new Date(value), 'MMM d')} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => formatPrice(Number(value), currency, true)} width={64} />
              <Tooltip
                labelFormatter={(label) => format(new Date(String(label)), 'MMM d, yyyy')}
                formatter={(value) => [formatPrice(Number(value), currency), 'Close']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              {showCost && (
                <ReferenceLine y={averageCost!} stroke="#b45309" strokeDasharray="4 4" label={{ value: `Avg cost ${formatPrice(averageCost!, currency)}`, position: 'insideTopLeft', fontSize: 10, fill: '#b45309' }} />
              )}
              <Area type="monotone" dataKey="close" stroke="#0e1729" strokeWidth={2} fill={`url(#price-fill-${listingId})`} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
