import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

type Props = {
  data: Array<{ month: string; income: number; expense: number; net: number; currency: string }>
  currency: string
}

export function SpendingTrendLine({ data, currency }: Props) {
  const filtered = data.filter((d) => d.currency === currency)

  if (filtered.length === 0) return <p className="py-8 text-center font-mono text-sm text-muted-foreground">No data for {currency}</p>

  const fmt = (v: number) => {
    if (currency === 'IDR') return `Rp${(v / 1_000_000).toFixed(1)}M`
    return `${currency === 'EUR' ? '\u20ac' : '$'}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="h-70">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filtered} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id={`gradient-expense-${currency}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c23a2b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#c23a2b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`gradient-net-${currency}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0e1729" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#0e1729" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ede7dc" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid #ede7dc', borderRadius: 12, fontSize: 13 }}
            formatter={(value, name) => [fmt(value as number), name as string]}
          />
          <Area type="monotone" dataKey="expense" name="Expense" stroke="#c23a2b" fill={`url(#gradient-expense-${currency})`} strokeWidth={2} />
          <Area type="monotone" dataKey="net" name="Net" stroke="#0e1729" fill={`url(#gradient-net-${currency})`} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
