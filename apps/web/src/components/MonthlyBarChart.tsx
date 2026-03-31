import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

type Props = {
  data: Array<{ month: string; income: number; expense: number; net: number; currency: string }>
  currency: string
}

export function MonthlyBarChart({ data, currency }: Props) {
  const filtered = data.filter((d) => d.currency === currency)

  if (filtered.length === 0) return <p className="py-8 text-center font-mono text-sm text-muted-foreground">No data for {currency}</p>

  const fmt = (v: number) => {
    if (currency === 'IDR') return `Rp${(v / 1_000_000).toFixed(1)}M`
    return `${currency === 'EUR' ? '\u20ac' : '$'}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filtered} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,190,220,0.15)" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8296a8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#8296a8' }} tickLine={false} axisLine={false} tickFormatter={fmt} width={70} />
          <Tooltip
            contentStyle={{ background: '#fff', border: '1px solid rgba(180,210,235,0.35)', borderRadius: 12, fontSize: 13 }}
            formatter={(value, name) => [fmt(value as number), name as string]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income" fill="#3aac6a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" name="Expense" fill="#d95050" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
