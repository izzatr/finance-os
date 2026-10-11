import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Bar, BarChart, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { getMonthReport, getWallets, type MonthReport } from '../lib/api'
import { formatMoney } from '../lib/format'
import { categoryIcon } from '../lib/categoryIcon'
import { averageSaved, biggestChanges, heroHeadline, shownDiff, isInProgress, monthLabel, ordinal, paceSentence, shiftMonth, shortMonth } from '../lib/reportInsights'
import { useDefaultCurrency } from '../contexts/CurrencyContext'
import { PageHeader } from '../components/PageHeader'
import { WalletMultiSelect } from '../components/WalletMultiSelect'
import { NetWorthTrendCard } from '../components/NetWorthTrendCard'

function compactMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)
  } catch {
    return String(Math.round(value))
  }
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const card = 'rounded-[22px] border border-[var(--border-subtle)] bg-white'

export function ReportsPage() {
  const [defaultCurrency] = useDefaultCurrency()
  const today = localToday()
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [walletIds, setWalletIds] = useState<string[]>([])
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })

  const query = useQuery({
    queryKey: ['month-report', month, defaultCurrency, today, walletIds],
    queryFn: () => getMonthReport({ month, currency: defaultCurrency, today, walletIds }),
    placeholderData: (prev) => prev,
  })
  const report = query.data?.data

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      <PageHeader title="Reports" className="mb-4" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex h-11 items-center rounded-2xl bg-[var(--tint)] p-1">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="flex size-9 items-center justify-center rounded-xl text-[var(--ink)] hover:bg-white"
          >
            <ChevronLeft className="size-5" />
          </button>
          <span className="min-w-[128px] text-center text-[15px] font-bold" aria-live="polite">
            {monthLabel(month, { year: true })}
          </span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth}
            aria-label="Next month"
            className="flex size-9 items-center justify-center rounded-xl text-[var(--ink)] hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        {(walletsQuery.data?.data.length ?? 0) > 1 && (
          <div className="min-w-0 flex-1 sm:max-w-[240px]">
            <WalletMultiSelect wallets={walletsQuery.data?.data ?? []} selectedWalletIds={walletIds} onChange={setWalletIds} />
          </div>
        )}
      </div>

      {query.isLoading && <div className="h-[420px] animate-pulse rounded-[24px] bg-[var(--tint)]" />}
      {query.isError && <p className="rounded-2xl bg-[var(--tint)] px-5 py-5 text-sm">Could not load this report. Pull to refresh or try again in a moment.</p>}

      {report && (
        <div className={`grid gap-4 transition-opacity lg:grid-cols-2 lg:items-start ${query.isFetching && query.isPlaceholderData ? 'opacity-60' : ''}`}>
          <div className="grid gap-4">
            <Hero report={report} />
            <Pace report={report} />
            <Changes report={report} />
            <CashFlow report={report} onSelect={(m) => m <= thisMonth && setMonth(m)} />
          </div>
          <div className="grid gap-4">
            <Categories report={report} />
            <Merchants report={report} />
            <div className="[&>section]:mb-0">
              <NetWorthTrendCard walletIds={walletIds} />
            </div>
          </div>
          {report.missing.length > 0 && (
            <p className="text-[13px] text-[var(--text-tertiary)] lg:col-span-2">
              Not included: amounts in {report.missing.join(', ')} (no exchange rate to {report.currency} yet).
            </p>
          )}
        </div>
      )}
    </main>
  )
}

function Delta({ value, usual, currency, invert = false }: { value: number; usual: number | null | undefined; currency: string; invert?: boolean }) {
  if (usual == null) return null
  const diff = shownDiff(value, usual)
  if (diff === 0) return <span className="text-white/60">same as usual</span>
  const good = invert ? diff < 0 : diff > 0
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 ${good ? 'text-[#8fe0b5]' : 'text-[#ffb4a8]'}`}>
      <Icon className="size-3.5" strokeWidth={2.4} />
      {formatMoney(Math.abs(diff), currency)} vs usual
    </span>
  )
}

function Hero({ report: r }: { report: MonthReport }) {
  const { title, detail, tone } = heroHeadline(r)
  const running = isInProgress(r)
  // Mid-month, compare with the usual *by the same day*; income usually lands in one go, so
  // a running month only gets a spending comparison.
  return (
    <section className="rounded-[24px] bg-[var(--ink)] px-5 pb-5 pt-5 text-white">
      <p className="text-[14px] font-medium text-white/70">
        {running ? `${monthLabel(r.month)} so far · day ${r.daysElapsed} of ${r.daysInMonth}` : monthLabel(r.month, { year: true })}
      </p>
      <h2 className="mt-1.5 text-balance text-[30px] font-bold leading-[1.1] tracking-[-0.02em]">{title}</h2>
      {detail && (
        <p className={`mt-2 inline-flex rounded-lg px-2.5 py-1 text-[13px] font-bold ${tone === 'bad' ? 'bg-[#ffb4a8] text-[#4a1610]' : 'bg-[var(--cream)] text-[var(--ink)]'}`}>{detail}</p>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3">
          <dt className="text-[13px] text-white/65">{running ? 'Income so far' : 'Income'}</dt>
          <dd className="tabular mt-0.5 text-[20px] font-bold">{formatMoney(r.income, r.currency)}</dd>
          {!running && <dd className="mt-0.5 text-[12px] font-semibold"><Delta value={r.income} usual={r.usual?.income} currency={r.currency} /></dd>}
        </div>
        {running ? (
          <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3">
            <dt className="text-[13px] text-white/65">Usual by the {ordinal(r.daysElapsed)}</dt>
            <dd className="tabular mt-0.5 text-[20px] font-bold">{r.usualByNow === null ? '—' : formatMoney(r.usualByNow, r.currency)}</dd>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/[0.07] px-3.5 py-3">
            <dt className="text-[13px] text-white/65">Spent</dt>
            <dd className="tabular mt-0.5 text-[20px] font-bold">{formatMoney(r.spent, r.currency)}</dd>
            <dd className="mt-0.5 text-[12px] font-semibold"><Delta value={r.spent} usual={r.usual?.spent} currency={r.currency} invert /></dd>
          </div>
        )}
      </dl>
      {r.fronted > 0 && (
        <p className="mt-3 text-[13px] text-white/65">
          Spent is your share. You also paid {formatMoney(r.fronted, r.currency)} for others, tracked under People.
        </p>
      )}
    </section>
  )
}

function Pace({ report: r }: { report: MonthReport }) {
  if (r.daysElapsed === 0) return null
  // The hero already states the running month's pace; here give the reference point instead.
  const running = isInProgress(r)
  const projection = r.usual && r.usualByNow !== null ? r.spentByNow + (r.usual.spent - r.usualByNow) : null
  const { title, tone } = running
    ? { title: projection === null ? 'Your first month, so no usual yet' : `Heading for about ${formatMoney(projection, r.currency)}`, tone: 'neutral' as const }
    : paceSentence(r)
  const heading = running ? 'Spending pace' : 'Through the month'
  const ticks = [1, 10, 20, r.daysInMonth]
  return (
    <section className={`${card} px-4 pb-3 pt-4`}>
      <p className="text-[14px] font-semibold text-[var(--text-secondary)]">{heading}</p>
      <p className={`mt-0.5 text-balance text-[20px] font-bold leading-snug ${tone === 'bad' ? 'text-[var(--negative)]' : tone === 'good' ? 'text-[var(--positive)]' : ''}`}>{title}</p>
      {running && projection !== null && (
        <p className="mt-0.5 text-pretty text-[13px] text-[var(--text-tertiary)]">If the rest of {monthLabel(r.month)} goes like a usual month ({formatMoney(r.usual?.spent ?? 0, r.currency)}).</p>
      )}
      <div className="mt-3 h-40" aria-hidden>
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 160 }}>
          <LineChart data={r.pace} margin={{ top: 6, right: 0, bottom: 0, left: 4 }}>
            <XAxis dataKey="day" ticks={ticks} tickFormatter={(d) => ordinal(Number(d))} tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} interval={0} padding={{ left: 4, right: 14 }} />
            <YAxis orientation="right" width={44} tickCount={3} tickFormatter={(v) => compactMoney(Number(v), r.currency)} tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} domain={[0, 'auto']} />
            {r.usual && <Line type="monotone" dataKey="usual" stroke="#9a917f" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />}
            <Line type="monotone" dataKey="current" stroke="#0e1729" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
            {isInProgress(r) && <ReferenceLine x={r.daysElapsed} stroke="#ddd5c6" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 px-1 pt-1 text-[12px] font-semibold text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-[var(--ink)]" /> {monthLabel(r.month)}</span>
        {r.usual && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-[#9a917f]" /> Usual ({r.usual.months === 1 ? 'last month' : `avg of last ${r.usual.months} months`})
          </span>
        )}
      </div>
    </section>
  )
}

function Changes({ report: r }: { report: MonthReport }) {
  const changes = biggestChanges(r)
  if (!r.usual) {
    return (
      <section className="rounded-[22px] bg-[var(--tint)] px-4 py-4 text-[14px] text-[var(--text-secondary)]">
        <p className="flex items-center gap-2 font-bold text-[var(--text-primary)]"><Sparkles className="size-4" /> Comparisons start next month</p>
        <p className="mt-1">Once there is a month of history before {monthLabel(r.month)}, this page shows what changed against your usual month.</p>
      </section>
    )
  }
  if (changes.length === 0) return null
  return (
    <section className={`${card} px-4 py-4`}>
      <p className="text-[15px] font-bold">What changed</p>
      <ul className="mt-2">
        {changes.map((c) => {
          const Icon = categoryIcon(c.name, 'expense')
          return (
            <li key={c.name} className="flex items-center gap-3 py-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
                <Icon className="size-[18px]" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                <span className={`block text-[13px] font-medium ${c.direction === 'down' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{c.text}</span>
              </span>
              <span className="tabular shrink-0 text-[15px] font-semibold">{formatMoney(c.spent, r.currency)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Categories({ report: r }: { report: MonthReport }) {
  const [showAll, setShowAll] = useState(false)
  const rows = r.categories.filter((c) => c.spent > 0)
  if (rows.length === 0) return null
  const max = Math.max(...rows.map((c) => Math.max(c.spent, c.usual ?? 0)))
  const visible = showAll ? rows : rows.slice(0, 6)
  const running = isInProgress(r)
  return (
    <section className={`${card} px-4 py-4`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-bold">Where it went</p>
        <p className="tabular text-[15px] font-bold">{formatMoney(r.spent, r.currency)}</p>
      </div>
      <ul>
        {visible.map((c) => {
          const Icon = categoryIcon(c.name, 'expense')
          const share = r.spent > 0 ? Math.round((c.spent / r.spent) * 100) : 0
          return (
            <li key={c.id ?? 'none'} className="py-2.5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                  <span className="block text-[12.5px] text-[var(--text-tertiary)]">
                    {share}% · {c.count} {c.count === 1 ? 'payment' : 'payments'}
                    {c.usual && c.usual / max > 0.03 && Math.abs(shownDiff(c.spent, c.usual)) > max * 0.01 ? (shownDiff(c.spent, c.usual) === 0 ? ' · as usual' : running ? ` · ${formatMoney(c.usual, r.currency)}/mo usual` : ` · usually ${formatMoney(c.usual, r.currency)}`) : ''}
                  </span>
                </span>
                <span className="tabular shrink-0 text-[15px] font-semibold">{formatMoney(c.spent, r.currency)}</span>
              </div>
              <div className="relative ml-12 mt-2 h-1.5 rounded-full bg-[var(--tint)]">
                <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${Math.max(2, (c.spent / max) * 100)}%` }} />
                {c.usual && c.usual / max > 0.03 && Math.abs(shownDiff(c.spent, c.usual)) > max * 0.01 ? (
                  <span
                    title="Usual"
                    className="absolute -top-1 h-3.5 w-[2px] rounded-full bg-[#b5ad9f]"
                    style={{ left: `calc(${Math.min(100, (c.usual / max) * 100)}% - 1px)` }}
                  />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      {rows.length > 6 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 h-10 w-full rounded-xl bg-[var(--tint)] text-[14px] font-semibold">
          {showAll ? 'Show less' : `Show all ${rows.length} categories`}
        </button>
      )}
      {r.usual && <p className="mt-2 text-[12px] text-[var(--text-tertiary)]">The grey tick marks a usual month.</p>}
    </section>
  )
}

function Merchants({ report: r }: { report: MonthReport }) {
  if (r.merchants.length === 0) return null
  return (
    <section className={`${card} px-4 py-4`}>
      {r.merchants.length > 0 && (
        <>
          <p className="text-[15px] font-bold">Where you spent most</p>
          <ol className="mt-1">
            {r.merchants.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3 py-2">
                <span className="tabular w-4 text-[13px] font-bold text-[var(--text-tertiary)]">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                  {m.name}
                  {m.count > 1 && <span className="ml-1.5 text-[13px] font-medium text-[var(--text-tertiary)]">{m.count}×</span>}
                </span>
                <span className="tabular w-[84px] text-right text-[15px] font-semibold">{formatMoney(m.spent, r.currency)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function CashFlow({ report: r, onSelect }: { report: MonthReport; onSelect: (month: string) => void }) {
  const firstActive = r.history.findIndex((h) => h.income !== 0 || h.spent !== 0)
  if (firstActive === -1) return null
  // Trim empty months before the first activity so a new account isn't a row of blanks.
  const data = r.history.slice(Math.min(firstActive, r.history.length - 3)).map((h) => ({ ...h, out: -h.spent }))
  const avg = averageSaved(r)
  return (
    <section className={`${card} px-4 pb-3 pt-4`}>
      <p className="text-[14px] font-semibold text-[var(--text-secondary)]">Cash flow</p>
      <p className="mt-0.5 text-[20px] font-bold leading-snug">
        {avg
          ? avg.amount >= 0
            ? `You keep ${formatMoney(avg.amount, r.currency)} a month`
            : `You overspend ${formatMoney(Math.abs(avg.amount), r.currency)} a month`
          : 'Income and spending by month'}
      </p>
      <p className="mt-0.5 text-pretty text-[13px] text-[var(--text-tertiary)]">
        {avg ? `Average of ${avg.months} complete months. ` : ''}Tap a month to open it.
      </p>
      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 320, height: 160 }}>
          <BarChart data={data} stackOffset="sign" margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
            <XAxis dataKey="month" tickFormatter={(m) => shortMonth(String(m))} tick={{ fontSize: 11, fill: '#6f695f' }} tickLine={false} axisLine={false} interval={0} />
            <YAxis hide />
            <ReferenceLine y={0} stroke="#ddd5c6" />
            <Bar dataKey="income" stackId="flow" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={(d) => onSelect(String((d as { month?: string }).month))} className="cursor-pointer">
              {data.map((d) => <Cell key={d.month} fill="#12895a" fillOpacity={d.month === r.month ? 1 : 0.35} />)}
            </Bar>
            <Bar dataKey="out" stackId="flow" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={(d) => onSelect(String((d as { month?: string }).month))} className="cursor-pointer">
              {data.map((d) => <Cell key={d.month} fill="#0e1729" fillOpacity={d.month === r.month ? 1 : 0.3} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between px-1 pt-1 text-[12px] font-semibold text-[var(--text-tertiary)]">
        <span className="flex gap-4">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--positive)]" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--ink)]" /> Spent</span>
        </span>
      </div>
      {r.incomeSources.length > 1 && (
        <ul className="mt-3 border-t border-[var(--border-subtle)] pt-2">
          {r.incomeSources.map((s) => (
            <li key={s.name} className="flex justify-between py-1.5 text-[14px]">
              <span className="text-[var(--text-secondary)]">{s.name}</span>
              <span className="tabular font-semibold text-[var(--positive)]">+{formatMoney(s.amount, r.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
