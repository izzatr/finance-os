import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { InboxNudge } from '../components/InboxNudge'
import { HomeHeader } from '../components/HomeHeader'
import { TransferForm } from '../components/TransferForm'
import { CurrencyCards } from '../components/CurrencyCards'
import { TopSpending } from '../components/TopSpending'
import { WalletTiles } from '../components/WalletTiles'
import { ActivityList } from '../components/ActivityList'
import { SectionDivider } from '../components/SectionDivider'
import { CreateWalletForm } from '../components/CreateWalletForm'
import { useQuickAdd } from '@/contexts/QuickAddContext'
import { getWallets, getRecentTransactions, getSummary, getCategoryBreakdown, getExchangeRates } from '../lib/api'
import type { CategoryBreakdown } from '../lib/api'
import { formatCurrency } from '../lib/format'
import { useDefaultCurrency } from '../contexts/CurrencyContext'

const HOME_ACTIVITY_LIMIT = 8
const HOME_WALLET_LIMIT = 4

function getCurrentMonthRange() {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const to = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  return { from, to }
}

const linkAction = 'text-[13px] font-semibold text-[var(--ink)] no-underline underline-offset-4 hover:underline'

export function DashboardPage() {
  const [showTransfer, setShowTransfer] = useState(false)
  const [showCreateWallet, setShowCreateWallet] = useState(false)
  const { openQuickAdd } = useQuickAdd()
  const [defaultCurrency] = useDefaultCurrency()
  const monthRange = getCurrentMonthRange()

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
  const wallets = walletsQuery.data?.data ?? []
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

  const monthlyIncome = monthlySummary && rates
    ? monthlySummary.byCurrency.reduce((acc, curr) => acc + convertToDefault(curr.income, curr.currency), 0)
    : 0
  const monthlyExpense = monthlySummary && rates
    ? monthlySummary.byCurrency.reduce((acc, curr) => acc + convertToDefault(curr.expense, curr.currency), 0)
    : 0
  const monthlySaved = monthlyIncome + monthlyExpense
  const savingsRate = monthlyIncome > 0 ? Math.round((monthlySaved / monthlyIncome) * 100) : null

  // One spending list in the default currency: the same category in EUR and IDR is merged
  // after conversion, so a single big rupiah purchase does not get its own section.
  const topSpending: CategoryBreakdown[] = rates
    ? [...(categoryQuery.data?.data ?? [])
        .filter((c) => c.type === 'expense' && c.categoryName)
        .reduce((acc, c) => {
          const key = c.categorySlug ?? c.categoryName!
          const prev = acc.get(key)
          const total = convertToDefault(Math.abs(c.total), c.currency)
          acc.set(key, prev
            ? { ...prev, total: prev.total + total, count: prev.count + c.count }
            : { ...c, total, currency: defaultCurrency })
          return acc
        }, new Map<string, CategoryBreakdown>())
        .values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
    : []
  const isMultiCurrency = (summary?.byCurrency.length ?? 0) > 1
  const currencyRows = [...(summary?.byCurrency ?? [])].sort((a, b) =>
    a.currency === defaultCurrency ? -1 : b.currency === defaultCurrency ? 1 : a.currency.localeCompare(b.currency),
  )

  // A transfer produces one entry per wallet; key rows by entry so both legs render.
  const recent = (recentQuery.data?.data ?? []).slice(0, HOME_ACTIVITY_LIMIT).map((tx) => ({ ...tx, id: tx.entryId }))
  const activeWallets = wallets.filter((w) => w.isActive)

  return (
    <main className="mx-auto w-full max-w-[960px] px-4 pb-2 lg:px-12 lg:pb-16">
      <HomeHeader
        netWorth={totalBalance}
        currency={defaultCurrency}
        monthNet={monthlySaved}
        onTransfer={() => setShowTransfer(true)}
        onAdd={openQuickAdd}
      />

      {/* On phones the body is a white sheet sliding over the bottom of the ink header. */}
      <div className="relative -mx-4 -mt-5 rounded-t-[26px] bg-[var(--bg-elevated)] px-4 pt-5 lg:mx-0 lg:mt-6 lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0">
        <InboxNudge />

        {!summaryQuery.isLoading && !hasFinanceData && (
          <section className="mb-8 rounded-3xl bg-[var(--tint)] px-5 py-6">
            <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em]">Add your real numbers to get started</h2>
            <p className="mt-2 max-w-[560px] text-sm text-[var(--text-secondary)]">
              Create a wallet, then log your first transaction or import a statement. No demo balances needed.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowCreateWallet(true)} className="h-11 rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--cream)]">
                Create wallet
              </button>
              <button type="button" onClick={openQuickAdd} className="h-11 rounded-2xl bg-white px-4 text-sm font-semibold">
                Add transaction
              </button>
            </div>
          </section>
        )}

        {activeWallets.length > 0 && (
          <section className="mb-8" aria-labelledby="home-wallets">
            <SectionDivider
              title="Wallets"
              action={
                <Link to="/wallets" className={linkAction}>
                  {activeWallets.length > HOME_WALLET_LIMIT ? `All ${activeWallets.length}` : 'Manage'}
                </Link>
              }
            />
            <WalletTiles wallets={wallets} limit={HOME_WALLET_LIMIT} />
          </section>
        )}

        {hasFinanceData && (
          <section className="mb-8" aria-label="This month">
            <SectionDivider title="This month" badge={savingsRate === null ? undefined : `${savingsRate}% of income saved`} />
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Income', value: monthlyIncome, tone: 'text-[var(--positive)]' },
                { label: 'Spent', value: Math.abs(monthlyExpense), tone: '' },
              ].map((s) => (
                <div key={s.label} className="min-w-0 rounded-2xl bg-[var(--tint)] px-3.5 py-3">
                  <dt className="text-[12px] font-semibold text-[var(--text-tertiary)]">{s.label}</dt>
                  <dd className={`tabular mt-0.5 truncate text-[18px] font-bold ${s.tone}`}>{formatCurrency(s.value, defaultCurrency)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {recentQuery.data && recentQuery.data.data.length > 0 && (
          <section className="mb-8" aria-label="Recent activity">
            <SectionDivider title="Activity" action={<Link to="/transactions" className={linkAction}>See all</Link>} />
            <ActivityList transactions={recent} />
          </section>
        )}

        {topSpending.length > 0 && (
          <section className="mb-8" aria-label="Top spending">
            <SectionDivider title="Top spending" badge={isMultiCurrency ? `All time · in ${defaultCurrency}` : 'All time'} />
            <TopSpending categories={topSpending} currency={defaultCurrency} formatCurrency={formatCurrency} />
          </section>
        )}

        {isMultiCurrency && (
          <section className="mb-8" aria-label="By currency">
            <SectionDivider title="By currency" badge="All time" />
            <CurrencyCards currencies={currencyRows} formatCurrency={formatCurrency} defaultCurrency={defaultCurrency} />
          </section>
        )}

        {activeWallets.length === 0 && hasFinanceData && (
          <button
            type="button"
            onClick={() => setShowCreateWallet(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-medium)] text-sm font-semibold text-[var(--text-secondary)]"
          >
            <Plus className="size-4" /> New wallet
          </button>
        )}
      </div>

      {showTransfer && walletsQuery.data && (
        <TransferForm wallets={walletsQuery.data.data} onClose={() => setShowTransfer(false)} />
      )}
      {showCreateWallet && <CreateWalletForm onClose={() => setShowCreateWallet(false)} />}
    </main>
  )
}
