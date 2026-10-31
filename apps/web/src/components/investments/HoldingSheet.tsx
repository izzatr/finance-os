import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subDays, subMonths } from 'date-fns'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Pencil, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getListingPrices } from '@/lib/api'
import { displayName, displayQuantity, displayTicker, formatMoney, formatPercent, isMetal, unitPrice } from '@/lib/investments'
import { HoldingAvatar } from './HoldingAvatar'
import { RangePills } from './ValueChart'
import { useChartScrub } from './useChartScrub'
import type { InvestmentHolding } from './types'

const RANGES = ['1M', '6M', '1Y'] as const
type RangeId = (typeof RANGES)[number]
const RANGE_START: Record<RangeId, (now: Date) => Date> = { '1M': (now) => subMonths(now, 1), '6M': (now) => subMonths(now, 6), '1Y': (now) => subDays(now, 365) }
const GRAMS_PER_TROY_OUNCE = 31.1034768

type Props = {
  holding: InvestmentHolding
  walletCurrency: string
  onClose: () => void
  onEdit: () => void
  onRemove: () => void
}

export function HoldingSheet({ holding, walletCurrency, onClose, onEdit, onRemove }: Props) {
  const [range, setRange] = useState<RangeId>('6M')
  const identity = { symbol: holding.symbol, name: holding.name, type: holding.type }
  const metal = isMetal(holding.symbol)
  const now = new Date()
  const to = format(now, 'yyyy-MM-dd')
  const from = format(RANGE_START[range](now), 'yyyy-MM-dd')
  const prices = useQuery({ queryKey: ['listing-prices', holding.listingId, from, to], queryFn: () => getListingPrices(holding.listingId, from, to), staleTime: 300_000 })

  const quoteCurrency = holding.quoteCurrency
  const scale = metal ? 1 / GRAMS_PER_TROY_OUNCE : 1
  const series = useMemo(() => (prices.data?.data.points ?? []).map((point) => ({ date: point.date, close: point.close * scale })), [prices.data, scale])
  const first = series[0]?.close
  const last = series.at(-1)?.close
  const { index, handlers } = useChartScrub(series.length, { left: 4, right: 4 })
  const active = index !== null ? series[index] : null
  const shown = active?.close ?? last
  const rangeChange = first && shown ? ((shown - first) / first) * 100 : null

  const quoted = holding.price !== null ? unitPrice(identity, holding.price) : null
  const basePerUnit = holding.baseValue !== null && holding.quantity > 0 ? (holding.baseValue / holding.quantity) * scale : null
  const costCurrency = holding.averageCostCurrency ?? quoteCurrency
  const avgCostPerUnit = holding.averageCost !== null ? holding.averageCost * scale : null
  const showCostLine = avgCostPerUnit !== null && costCurrency === quoteCurrency
  const unitSuffix = metal ? ' / g' : ''
  const ticker = displayTicker(identity)

  const facts: Array<[string, string, 'positive' | 'negative' | null]> = [
    ['Value', holding.baseValue !== null ? formatMoney(holding.baseValue, walletCurrency) : '—', null],
    ['Amount', displayQuantity(identity, holding.quantity), null],
  ]
  if (avgCostPerUnit !== null) facts.push(['Average cost', `${formatMoney(avgCostPerUnit, costCurrency)}${unitSuffix}`, null])
  if (holding.costBaseValue !== null) facts.push(['Invested', formatMoney(holding.costBaseValue, walletCurrency), null])
  if (holding.unrealizedBase !== null && holding.unrealizedPercent !== null) {
    facts.push(['Total return', `${formatMoney(holding.unrealizedBase, walletCurrency, { signed: true })} · ${formatPercent(holding.unrealizedPercent)}`, holding.unrealizedBase >= 0 ? 'positive' : 'negative'])
  }
  if (holding.dailyChangePercent !== null) facts.push(['Today', formatPercent(holding.dailyChangePercent), holding.dailyChangePercent >= 0 ? 'positive' : 'negative'])

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side="bottom"
        className="max-h-[calc(100dvh-max(env(safe-area-inset-top),8px))] gap-0 rounded-t-[28px] border-0 bg-white p-0 lg:mx-auto lg:max-w-lg lg:data-[side=bottom]:bottom-auto lg:data-[side=bottom]:top-16 lg:rounded-[28px]"
      >
        <div className="min-w-0 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5">
          <div className="flex items-center gap-3 pr-12">
            <HoldingAvatar identity={identity} size={44} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[18px] font-bold text-[var(--text-primary)]">{displayName(identity)}</SheetTitle>
              <p className="truncate text-[13px] text-[var(--text-tertiary)]">{metal || holding.type === 'mutual_fund' ? displayQuantity(identity, holding.quantity) : [ticker, holding.exchange].filter(Boolean).join(' · ')}</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="tabular text-[30px] font-bold leading-none tracking-[-0.02em]">
              {active ? `${formatMoney(active.close, quoteCurrency)}${unitSuffix}` : quoted ? `${formatMoney(quoted.price, quoteCurrency)}${unitSuffix}` : 'No price yet'}
            </p>
            <p className="mt-1.5 min-h-5 text-[13px] text-[var(--text-tertiary)]" aria-live="polite">
              {rangeChange !== null && (
                <span className={rangeChange >= 0 ? 'font-semibold text-[var(--positive)]' : 'font-semibold text-[var(--negative)]'}>{formatPercent(rangeChange)}{active ? '' : ` ${range}`}</span>
              )}
              {active
                ? <span> · {format(parseISO(active.date), 'd MMM yyyy')}</span>
                : basePerUnit !== null && quoteCurrency !== walletCurrency && <span>{rangeChange !== null ? ' · ' : ''}≈ {formatMoney(basePerUnit, walletCurrency)}{unitSuffix}</span>}
            </p>
          </div>

          <div className="-mx-1 mt-4 h-44 cursor-crosshair select-none [touch-action:pan-y]" role="img" aria-label={`${displayName(identity)} price over ${range}. Press and drag to see past prices.`} {...handlers}>
            {series.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 176 }}>
                <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id={`price-fill-${holding.listingId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0e1729" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#0e1729" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  {showCostLine && <ReferenceLine y={avgCostPerUnit!} stroke="#b45309" strokeDasharray="4 4" ifOverflow="extendDomain" />}
                  <Area type="linear" dataKey="close" stroke="#0e1729" strokeWidth={2} fill={`url(#price-fill-${holding.listingId})`} dot={false} activeDot={false} isAnimationActive={false} />
                  {active && <ReferenceLine x={active.date} stroke="#0e1729" strokeOpacity={0.3} strokeWidth={1} />}
                  {active && <ReferenceDot x={active.date} y={active.close} r={5} fill="#0e1729" stroke="#fff" strokeWidth={2} />}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-[13px] text-[var(--text-tertiary)]">
                {prices.isLoading ? 'Loading prices…' : prices.error ? prices.error.message : 'Price history builds up daily'}
              </p>
            )}
          </div>
          {showCostLine && series.length >= 2 && <p className="mt-1 text-[12px] text-[#b45309]">- - Your average cost</p>}
          <RangePills value={range} onChange={setRange} options={RANGES} tone="light" className="mt-3" />

          <dl className="mt-6 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
            {facts.map(([label, value, tone]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-[14px] text-[var(--text-secondary)]">{label}</dt>
                <dd className={`tabular text-right text-[15px] font-semibold ${tone === 'positive' ? 'text-[var(--positive)]' : tone === 'negative' ? 'text-[var(--negative)]' : ''}`}>{value}</dd>
              </div>
            ))}
          </dl>
          {holding.priceStatus !== 'fresh' && (
            <p className="mt-3 text-[12px] text-amber-800">{holding.priceError ?? 'This price may be out of date.'}</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onEdit} className="h-12 rounded-full"><Pencil className="size-4" /> Edit</Button>
            <Button variant="outline" onClick={onRemove} className="h-12 rounded-full text-[var(--negative)] hover:text-[var(--negative)]"><Trash2 className="size-4" /> Remove</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
