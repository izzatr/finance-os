import { useQuery } from '@tanstack/react-query'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getNetWorth } from '@/lib/api'
import { useDefaultCurrency } from '@/contexts/CurrencyContext'

function compact(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(value)
  }
}

export function NetWorthTrendCard() {
  const [currency] = useDefaultCurrency()
  const query = useQuery({
    queryKey: ['net-worth', currency],
    queryFn: () => getNetWorth({ currency, months: 12 }),
    staleTime: 60_000,
  })

  const data = query.data?.data
  if (!data || data.series.length < 2) return null

  return (
    <section aria-label="Net worth trend" className="mb-6 rounded-2xl bg-white px-5 py-4 shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between pb-2">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-blue)]">
          Net worth · 12 months
        </p>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
          {compact(data.total, data.currency)}
        </span>
      </div>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              formatter={(value) => [compact(Number(value), data.currency), 'Net worth']}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="total" stroke="var(--accent-blue)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
