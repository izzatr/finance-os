import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import type { CategoryBreakdown } from '../lib/api'

const COLORS = [
  '#5ba4d4', '#3aac6a', '#d95050', '#e8a838', '#9b6bc4',
  '#4fc3c3', '#e06090', '#7ab648', '#c78438', '#6082b6',
]

type Props = {
  data: CategoryBreakdown[]
  currency: string
  formatCurrency: (amount: number, currency: string) => string
}

export function CategoryDonutChart({ data, currency, formatCurrency }: Props) {
  const filtered = data
    .filter((d) => d.type === 'expense' && d.currency === currency && d.categoryName)
    .slice(0, 8)

  if (filtered.length === 0) return <p className="py-8 text-center font-mono text-sm text-muted-foreground">No data for {currency}</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="h-70">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={filtered}
              dataKey="total"
              nameKey="categoryName"
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={110}
              paddingAngle={2}
            >
              {filtered.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid rgba(180,210,235,0.35)', borderRadius: 12, fontSize: 13 }}
              formatter={(value) => [formatCurrency(value as number, currency), 'Spent']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid gap-1">
        {filtered.map((d, i) => (
          <div key={d.categoryName} className="flex items-center gap-2 text-[0.78rem]">
            <span className="size-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 text-[var(--text-secondary)]">{d.categoryName}</span>
            <span className="font-mono font-medium">{formatCurrency(d.total, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
