import { useMemo, useState } from 'react'
import { format, subDays, subMonths } from 'date-fns'
import { Area, AreaChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useChartScrub } from './useChartScrub'

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
  const out = before && inside[0]?.date.slice(0, 10) !== start ? [{ date: start, balance: before.balance }, ...inside] : inside
  const last = out.at(-1)
  if (last && last.date.slice(0, 10) < today) out.push({ date: today, balance: last.balance })
  return out
}

export type ValueScrub = { date: string; value: number; change: number; changePercent: number | null; since: string }

/**
 * Borderless value chart for the dark wallet header, with range pills underneath. Pressing
 * and dragging (or hovering) reports the value at that day through `onScrub`, so the header
 * can show it in place of the current total; releasing reports null.
 */
export function ValueChart({ points, onScrub }: { points: TrendPoint[]; onScrub?: (scrub: ValueScrub | null) => void }) {
  const [range, setRange] = useState<RangeId>('All')
  const today = format(new Date(), 'yyyy-MM-dd')
  const data = useMemo(() => {
    const cutoff = RANGES.find((item) => item.id === range)!.from(new Date())
    return sliceTrend(points, cutoff, today)
  }, [points, range, today])
  const { index, handlers } = useChartScrub(data.length, { left: 0, right: 0 }, (next) => {
    if (next === null || !data[next]) return onScrub?.(null)
    const start = data[0].balance
    const point = data[next]
    onScrub?.({ date: point.date.slice(0, 10), value: point.balance, change: point.balance - start, changePercent: start ? ((point.balance - start) / Math.abs(start)) * 100 : null, since: data[0].date.slice(0, 10) })
  })
  const active = index !== null ? data[index] : null

  if (points.length < 2) return null
  return (
    <div className="-mx-5 mt-5">
      <div className="h-36 cursor-crosshair select-none sm:h-44 [touch-action:pan-y]" aria-label={`Value over ${range === 'All' ? 'all time' : range}. Press and drag to see past values.`} role="img" {...handlers}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 144 }}>
          <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="value-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f5dfb3" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f5dfb3" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Area type="linear" dataKey="balance" stroke="#f5dfb3" strokeWidth={2} fill="url(#value-fill)" dot={false} activeDot={false} isAnimationActive={false} />
            {active && <ReferenceLine x={active.date} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />}
            {active && <ReferenceDot x={active.date} y={active.balance} r={5} fill="#f5dfb3" stroke="#0e1729" strokeWidth={2} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <RangePills value={range} onChange={(next) => { setRange(next); onScrub?.(null) }} options={RANGES.map((item) => item.id)} tone="dark" className="mt-3 px-5" />
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
