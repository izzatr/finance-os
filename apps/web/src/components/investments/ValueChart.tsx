import { useMemo, useState } from 'react'
import { format, subDays, subMonths } from 'date-fns'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { formatMoney } from '@/lib/investments'

export type TrendPoint = { date: string; balance: number }

const RANGES = [
  { id: '1M', from: (now: Date) => subMonths(now, 1) },
  { id: '6M', from: (now: Date) => subMonths(now, 6) },
  { id: '1Y', from: (now: Date) => subDays(now, 365) },
  { id: 'All', from: () => null },
] as const

type RangeId = (typeof RANGES)[number]['id']

/** Keep points inside the range, starting with the value carried in from before it. */
export function sliceTrend(points: TrendPoint[], from: Date | null, today: string): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) return []
  const start = from ? format(from, 'yyyy-MM-dd') : sorted[0].date.slice(0, 10)
  const inside = sorted.filter((point) => point.date.slice(0, 10) >= start)
  const before = [...sorted].reverse().find((point) => point.date.slice(0, 10) < start)
  const out = before ? [{ date: start, balance: before.balance }, ...inside] : inside
  const last = out.at(-1)
  if (last && last.date.slice(0, 10) < today) out.push({ date: today, balance: last.balance })
  return out
}

/** Borderless value chart for the dark wallet header, with range pills underneath. */
export function ValueChart({ points, currency }: { points: TrendPoint[]; currency: string }) {
  const [range, setRange] = useState<RangeId>('All')
  const today = format(new Date(), 'yyyy-MM-dd')
  const data = useMemo(() => {
    const cutoff = RANGES.find((item) => item.id === range)!.from(new Date())
    return sliceTrend(points, cutoff, today)
  }, [points, range, today])

  if (points.length < 2) return null
  return (
    <div className="-mx-5 mt-5">
      <div className="h-36 sm:h-44" aria-label={`Value over ${range === 'All' ? 'all time' : range}`} role="img">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 144 }}>
          <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5dfb3" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f5dfb3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.35)', strokeWidth: 1 }}
              contentStyle={{ background: '#1c2740', border: 0, borderRadius: 10, fontSize: 12, color: '#fff' }}
              labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
              itemStyle={{ color: '#fff' }}
              labelFormatter={(label) => format(new Date(String(label)), 'MMM d, yyyy')}
              formatter={(value) => [formatMoney(Number(value), currency), 'Value']}
            />
            <Area type="linear" dataKey="balance" stroke="#f5dfb3" strokeWidth={2} fill="url(#value-fill)" dot={false} activeDot={{ r: 4, fill: '#f5dfb3', stroke: '#0e1729' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <RangePills value={range} onChange={setRange} options={RANGES.map((item) => item.id)} tone="dark" className="mt-3 px-5" />
    </div>
  )
}

export function RangePills<T extends string>({ value, onChange, options, tone, className = '' }: { value: T; onChange: (value: T) => void; options: readonly T[]; tone: 'dark' | 'light'; className?: string }) {
  return (
    <div role="tablist" aria-label="Chart range" className={`flex gap-1 ${className}`}>
      {options.map((option) => {
        const active = option === value
        const colors = tone === 'dark'
          ? active ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
          : active ? 'bg-[var(--ink)] text-white' : 'text-[var(--text-tertiary)] hover:bg-[var(--tint)]'
        return (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option)}
            className={`h-9 min-w-12 flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors sm:flex-none ${colors}`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
