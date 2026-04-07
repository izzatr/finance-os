import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MonthlyBarChart } from '../components/MonthlyBarChart'
import { CategoryDonutChart } from '../components/CategoryDonutChart'
import { SpendingTrendLine } from '../components/SpendingTrendLine'
import { AssetGrowthChart } from '../components/AssetGrowthChart'
import { DateRangeFilter, type DateRange } from '../components/DateRangeFilter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getMonthlyTrend,
  getCategoryBreakdown,
  getSummary,
  getAssetGrowth,
  getExchangeRates,
} from '../lib/api'
import type { MonthlyTrend, CategoryBreakdown } from '../lib/api'
import { useDefaultCurrency } from '../contexts/CurrencyContext'

const CURRENCY_SYMBOLS: Record<string, string> = { IDR: 'Rp', EUR: '\u20ac', USD: '$' }

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const absNum = Math.abs(amount)
  let formatted: string
  if (currency === 'IDR') {
    formatted = absNum.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  } else {
    formatted = absNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`
}

function convertTrendToCurrency(data: MonthlyTrend[], rates: Record<string, number>, targetCurrency: string): MonthlyTrend[] {
  const targetRate = targetCurrency === 'EUR' ? 1 : (rates[targetCurrency] ?? 1)
  const byMonth = new Map<string, { income: number; expense: number; net: number }>()

  for (const d of data) {
    const fromRate = d.currency === 'EUR' ? 1 : (rates[d.currency] ?? 0)
    if (fromRate === 0) continue
    const entry = byMonth.get(d.month) ?? { income: 0, expense: 0, net: 0 }
    entry.income += (d.income / fromRate) * targetRate
    entry.expense += (d.expense / fromRate) * targetRate
    entry.net += (d.net / fromRate) * targetRate
    byMonth.set(d.month, entry)
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      income: Math.round(vals.income * 100) / 100,
      expense: Math.round(vals.expense * 100) / 100,
      net: Math.round(vals.net * 100) / 100,
      currency: targetCurrency,
    }))
}

function convertCategoriesToCurrency(data: CategoryBreakdown[], rates: Record<string, number>, targetCurrency: string): CategoryBreakdown[] {
  const targetRate = targetCurrency === 'EUR' ? 1 : (rates[targetCurrency] ?? 1)
  const merged = new Map<string, CategoryBreakdown>()

  for (const d of data) {
    const fromRate = d.currency === 'EUR' ? 1 : (rates[d.currency] ?? 0)
    if (fromRate === 0 || !d.categoryName) continue

    const key = `${d.categoryName}:${d.type}`
    const existing = merged.get(key)
    if (existing) {
      existing.total += (d.total / fromRate) * targetRate
      existing.count += d.count
    } else {
      merged.set(key, {
        ...d,
        total: (d.total / fromRate) * targetRate,
        currency: targetCurrency,
      })
    }
  }

  return [...merged.values()]
    .map((d) => ({ ...d, total: Math.round(d.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
}

const ALL_TIME: DateRange = { label: 'All Time', from: '', to: '' }

export function ReportsPage() {
  const [defaultCurrency] = useDefaultCurrency()
  const [currency, setCurrency] = useState('ALL')
  const [dateRange, setDateRange] = useState<DateRange>(ALL_TIME)

  const dateParams = dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined

  const trendQuery = useQuery({
    queryKey: ['monthly-trend', dateRange.from, dateRange.to],
    queryFn: () => getMonthlyTrend(dateParams),
  })
  const categoryQuery = useQuery({
    queryKey: ['categories', dateRange.from, dateRange.to],
    queryFn: () => getCategoryBreakdown(dateParams),
  })
  const summaryQuery = useQuery({ queryKey: ['summary'], queryFn: () => getSummary() })
  const growthQuery = useQuery({
    queryKey: ['asset-growth', dateRange.from, dateRange.to],
    queryFn: () => getAssetGrowth(dateParams),
  })
  const ratesQuery = useQuery({ queryKey: ['exchange-rates'], queryFn: getExchangeRates, staleTime: 1000 * 60 * 30 })

  const currencies = summaryQuery.data?.data.byCurrency.map((c) => c.currency) ?? ['IDR', 'EUR', 'USD']
  const rates = ratesQuery.data?.rates ?? null

  const isAll = currency === 'ALL'
  const displayCurrency = isAll ? defaultCurrency : currency

  const trendData = trendQuery.data?.data ?? []
  const categoryData = categoryQuery.data?.data ?? []

  const effectiveTrend = isAll && rates ? convertTrendToCurrency(trendData, rates, defaultCurrency) : trendData
  const effectiveCategories = isAll && rates ? convertCategoriesToCurrency(categoryData, rates, defaultCurrency) : categoryData
  const hasReportData = Boolean(summaryQuery.data?.data.transactionCount)

  return (
    <main className="relative z-1 w-full px-8 md:px-12 pt-12 pb-24">
      <div className="mb-10">
        <div className="text-[11px] font-medium tracking-[0.2em] uppercase text-[#5ba4d4] mb-3">
          Reports
        </div>
        <h1 className="font-['Cormorant_Garamond',Georgia,serif] font-medium italic text-[clamp(32px,4vw,48px)] leading-tight text-[#0a0f18]">
          Financial Analytics
        </h1>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        <Tabs value={currency} onValueChange={setCurrency}>
          <TabsList>
            <TabsTrigger value="ALL" className="font-mono text-xs tracking-wider">
              All ({defaultCurrency})
            </TabsTrigger>
            {currencies.map((c) => (
              <TabsTrigger key={c} value={c} className="font-mono text-xs tracking-wider">
                {c}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {!summaryQuery.isLoading && !hasReportData && (
        <div className="mb-6 rounded-3xl border border-border/60 bg-white/75 px-6 py-7 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          <p className="mb-2 text-[11px] font-medium tracking-[0.18em] uppercase text-[#5ba4d4]">No report data yet</p>
          <p>Reports will populate after you create a wallet and record transactions. Until then, this page stays intentionally empty instead of showing misleading charts.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Asset Growth - full width */}
        <Card className="lg:col-span-2" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="border-b">
            <CardTitle>
              {isAll ? `Net Worth Growth (${defaultCurrency} equivalent)` : `Asset Growth — ${currency}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {growthQuery.isLoading && <p className="py-4 text-center font-mono text-xs text-muted-foreground">Loading...</p>}
            {growthQuery.data && (
              <AssetGrowthChart
                data={growthQuery.data.data}
                currency={currency}
                rates={rates}
                defaultCurrency={defaultCurrency}
              />
            )}
          </CardContent>
        </Card>

        {/* Monthly Income vs Expense */}
        <Card style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="border-b">
            <CardTitle>Monthly Income vs Expense</CardTitle>
          </CardHeader>
          <CardContent>
            {trendQuery.isLoading && <p className="py-4 text-center font-mono text-xs text-muted-foreground">Loading...</p>}
            {trendQuery.data && (
              <MonthlyBarChart data={effectiveTrend} currency={displayCurrency} />
            )}
          </CardContent>
        </Card>

        {/* Spending by Category */}
        <Card style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="border-b">
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryQuery.isLoading && <p className="py-4 text-center font-mono text-xs text-muted-foreground">Loading...</p>}
            {categoryQuery.data && (
              <CategoryDonutChart
                data={effectiveCategories}
                currency={displayCurrency}
                formatCurrency={formatCurrency}
              />
            )}
          </CardContent>
        </Card>

        {/* Spending Trend - full width */}
        <Card className="lg:col-span-2" style={{ boxShadow: 'var(--shadow-card)' }}>
          <CardHeader className="border-b">
            <CardTitle>Spending Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendQuery.isLoading && <p className="py-4 text-center font-mono text-xs text-muted-foreground">Loading...</p>}
            {trendQuery.data && (
              <SpendingTrendLine data={effectiveTrend} currency={displayCurrency} />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
