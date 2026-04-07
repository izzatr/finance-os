import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, ArrowLeftRight, BarChart3 } from 'lucide-react'
import { AddTransactionForm } from '../components/AddTransactionForm'
import { OverviewHero } from '../components/OverviewHero'
import { StatsRow } from '../components/StatsRow'
import { TransferForm } from '../components/TransferForm'
import { CurrencyCards } from '../components/CurrencyCards'
import { TopSpending } from '../components/TopSpending'
import { WalletsGrid } from '../components/WalletsGrid'
import { RecentActivity } from '../components/RecentActivity'
import { SectionDivider } from '../components/SectionDivider'
import {
  getDashboard,
  getWallets,
  getRecentTransactions,
  getSummary,
  getCategoryBreakdown,
  getExchangeRates,
} from '../lib/api'
import type { CategoryBreakdown } from '../lib/api'
import { useDefaultCurrency } from '../contexts/CurrencyContext'

const CURRENCY_SYMBOLS: Record<string, string> = { IDR: 'Rp', EUR: '\u20ac', USD: '$' }

function formatCurrency(amount: number | string, currency: string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const absNum = Math.abs(num)
  let formatted: string
  if (currency === 'IDR') {
    formatted = absNum.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  } else {
    formatted = absNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return `${num < 0 ? '-' : ''}${symbol}${formatted}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getCurrentMonthRange() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const to = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  return { from, to }
}

export function DashboardPage() {
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [defaultCurrency] = useDefaultCurrency()
  const monthRange = getCurrentMonthRange()

  const dashboardQuery = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const recentQuery = useQuery({ queryKey: ['recent'], queryFn: getRecentTransactions })
  const summaryQuery = useQuery({ queryKey: ['summary'], queryFn: () => getSummary() })
  const monthlySummaryQuery = useQuery({
    queryKey: ['summary-monthly', monthRange.from],
    queryFn: () => getSummary({ from: monthRange.from, to: monthRange.to }),
  })
  const categoryQuery = useQuery({ queryKey: ['categories'], queryFn: () => getCategoryBreakdown() })
  const ratesQuery = useQuery({ queryKey: ['exchange-rates'], queryFn: getExchangeRates, staleTime: 1000 * 60 * 30 })

  const summary = summaryQuery.data?.data
  const monthlySummary = monthlySummaryQuery.data?.data
  const rates = ratesQuery.data?.rates
  const hasFinanceData = Boolean(summary && (summary.walletCount > 0 || summary.transactionCount > 0))

  // Convert any currency amount to the default currency using EUR-based rates
  const toDefaultRate = rates ? (defaultCurrency === 'EUR' ? 1 : (rates[defaultCurrency] ?? 1)) : 1
  function convertToDefault(amount: number, currency: string): number {
    if (!rates) return 0
    const fromRate = currency === 'EUR' ? 1 : (rates[currency] ?? 0)
    if (fromRate === 0) return 0
    return (amount / fromRate) * toDefaultRate
  }

  const totalBalance = summary && rates
    ? summary.byCurrency.reduce((acc, curr) => acc + convertToDefault(curr.net, curr.currency), 0)
    : null

  // Monthly stats converted to default currency
  const monthlyIncome = monthlySummary && rates
    ? monthlySummary.byCurrency.reduce((acc, curr) => acc + convertToDefault(curr.income, curr.currency), 0)
    : 0
  const monthlyExpense = monthlySummary && rates
    ? monthlySummary.byCurrency.reduce((acc, curr) => acc + convertToDefault(curr.expense, curr.currency), 0)
    : 0
  const monthlySaved = monthlyIncome + monthlyExpense
  const savingsRate = monthlyIncome > 0 ? Math.round((monthlySaved / monthlyIncome) * 100) : 0

  const allExpenseCategories = (categoryQuery.data?.data ?? [])
    .filter((c: CategoryBreakdown) => c.type === 'expense' && c.categoryName)

  const expenseByCurrency = new Map<string, CategoryBreakdown[]>()
  for (const cat of allExpenseCategories) {
    const list = expenseByCurrency.get(cat.currency) ?? []
    list.push(cat)
    expenseByCurrency.set(cat.currency, list)
  }

  const currencyOrder = ['IDR', 'EUR', 'USD']
  const sortedCurrencies = [...expenseByCurrency.keys()].sort(
    (a, b) => (currencyOrder.indexOf(a) === -1 ? 99 : currencyOrder.indexOf(a)) -
              (currencyOrder.indexOf(b) === -1 ? 99 : currencyOrder.indexOf(b))
  )

  return (
    <main className="max-w-[960px] px-8 md:px-12 pb-24">
      {/* Level 1: Overview */}
      <OverviewHero
        totalBalance={totalBalance !== null ? formatCurrency(totalBalance, defaultCurrency) : '\u2014'}
        monthlyChange={monthlySaved >= 0
          ? `+${formatCurrency(monthlySaved, defaultCurrency)} this month`
          : `${formatCurrency(monthlySaved, defaultCurrency)} this month`
        }
        isNegativeMonth={monthlySaved < 0}
        trackingSince={summary?.dateRange.from ? formatDate(summary.dateRange.from) : null}
        walletCount={dashboardQuery.data?.data.walletCount ?? 0}
        transactionCount={dashboardQuery.data?.data.transactionCount ?? 0}
      />

      {/* Quick Actions */}
      <div className="flex gap-2 mb-8">
        <button
          onClick={() => setShowAddTransaction(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 cursor-pointer"
        >
          <Plus size={14} /> New Transaction
        </button>
        <button
          onClick={() => setShowTransfer(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/60 px-3.5 py-2 text-xs font-medium text-foreground/70 transition-all hover:border-[rgba(91,164,212,0.4)] hover:bg-white/90 hover:text-foreground cursor-pointer"
        >
          <ArrowLeftRight size={14} /> Transfer
        </button>
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/60 px-3.5 py-2 text-xs font-medium text-foreground/70 transition-all hover:border-[rgba(91,164,212,0.4)] hover:bg-white/90 hover:text-foreground no-underline cursor-pointer"
        >
          <BarChart3 size={14} /> Reports
        </Link>
      </div>

      <StatsRow
        stats={[
          { label: 'Income', value: formatCurrency(monthlyIncome, defaultCurrency), color: 'positive' },
          { label: 'Spent', value: formatCurrency(Math.abs(monthlyExpense), defaultCurrency), color: 'negative' },
          { label: 'Saved', value: formatCurrency(monthlySaved, defaultCurrency), color: monthlySaved >= 0 ? 'positive' : 'negative' },
          { label: 'Net Income Rate', value: `${savingsRate}%` },
        ]}
      />

      {!summaryQuery.isLoading && !hasFinanceData && (
        <section className="mb-10 rounded-3xl border border-border/60 bg-white/75 px-6 py-7 shadow-[var(--shadow-card)] backdrop-blur-sm">
          <div className="text-[11px] font-medium tracking-[0.18em] uppercase text-[#5ba4d4] mb-3">First run</div>
          <h2 className="font-['Cormorant_Garamond',Georgia,serif] text-[32px] italic leading-tight text-[#0a0f18] mb-3">
            Your dashboard is ready — now add your real finance data.
          </h2>
          <p className="text-sm text-muted-foreground max-w-[700px] mb-5">
            Start by creating a wallet, then add your first transaction or import a statement. Finance OS does not require fake demo balances to be useful.
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5">1. Create wallet</span>
            <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5">2. Add transaction</span>
            <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1.5">3. Review reports</span>
          </div>
        </section>
      )}

      {/* Level 2: Per Currency */}
      {summary && summary.byCurrency.length > 0 && (
        <>
          <SectionDivider title="By currency" badge={`${summary.byCurrency.length} currencies`} />
          <CurrencyCards currencies={summary.byCurrency} formatCurrency={formatCurrency} />
        </>
      )}

      {/* Top Spending */}
      {sortedCurrencies.map((currency) => {
        const cats = (expenseByCurrency.get(currency) ?? []).slice(0, 10)
        return (
          <div key={currency}>
            <SectionDivider title="Top spending" badge={currency} />
            <TopSpending categories={cats} currency={currency} formatCurrency={formatCurrency} />
          </div>
        )
      })}

      {/* Level 3: Wallets */}
      {walletsQuery.data && (
        <>
          <SectionDivider title="Wallets" badge={`${walletsQuery.data.data.length} wallets`} />
          <WalletsGrid wallets={walletsQuery.data.data} formatCurrency={formatCurrency} />
        </>
      )}

      {/* Level 4: Recent Activity */}
      {recentQuery.data && (
        <>
          <SectionDivider title="Recent activity" badge="Last 50" />
          <RecentActivity transactions={recentQuery.data.data} formatCurrency={formatCurrency} />
        </>
      )}

      <footer className="border-t border-border/50 pt-7 text-xs text-muted-foreground font-light">
        Finance OS · Made for agents, by humans
      </footer>

      {showAddTransaction && <AddTransactionForm onClose={() => setShowAddTransaction(false)} />}
      {showTransfer && walletsQuery.data && (
        <TransferForm wallets={walletsQuery.data.data} onClose={() => setShowTransfer(false)} />
      )}
    </main>
  )
}
