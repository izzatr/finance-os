import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { AssetGrowth } from '../lib/api'

const CURRENCY_SYMBOLS: Record<string, string> = { IDR: 'Rp', EUR: '\u20ac', USD: '$' }

type Props = {
  data: AssetGrowth[]
  currency: string | 'ALL'
  rates: Record<string, number> | null
  defaultCurrency?: string
}

export function AssetGrowthChart({ data, currency, rates, defaultCurrency = 'EUR' }: Props) {
  let chartData: Array<{ month: string; balance: number }>

  if (currency === 'ALL' && rates) {
    // Merge all currencies into default currency equivalent
    const targetRate = defaultCurrency === 'EUR' ? 1 : (rates[defaultCurrency] ?? 1)
    const byMonth = new Map<string, number>()
    for (const d of data) {
      const fromRate = d.currency === 'EUR' ? 1 : (rates[d.currency] ?? 0)
      const converted = fromRate > 0 ? (d.balance / fromRate) * targetRate : 0
      byMonth.set(d.month, (byMonth.get(d.month) ?? 0) + converted)
    }
    chartData = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, balance]) => ({ month, balance: Math.round(balance * 100) / 100 }))
  } else {
    chartData = data
      .filter((d) => d.currency === currency)
      .map((d) => ({ month: d.month, balance: d.balance }))
  }

  if (chartData.length === 0) {
    return <p className="py-8 text-center font-mono text-sm text-muted-foreground">No data</p>
  }

  const displayCurrency = currency === 'ALL' ? defaultCurrency : currency

  const fmt = (v: number) => {
    const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency
    if (displayCurrency === 'IDR') return `Rp${(v / 1_000_000).toFixed(1)}M`
    return `${symbol}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="gradient-growth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0e1729" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#0e1729" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ede7dc" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} tickFormatter={fmt} width={80} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #ede7dc', borderRadius: 12, fontSize: 13 }}
            formatter={(value) => [fmt(value as number), currency === 'ALL' ? `Net Worth (${defaultCurrency})` : 'Balance']}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#0e1729"
            fill="url(#gradient-growth)"
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
