import { useQuery } from '@tanstack/react-query'
import { CurrencyCards } from '../components/CurrencyCards'
import { CurrencySetup } from '../components/CurrencySetup'
import { SectionDivider } from '../components/SectionDivider'
import { getSummary, getExchangeRates } from '../lib/api'
import { useCurrencySettings } from '../contexts/CurrencyContext'
import { PageHeader } from '../components/PageHeader'
import { formatCurrency } from '../lib/format'
import { rateBetween } from '../lib/currencies'

const RATE_CURRENCIES = ['USD', 'IDR', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'SGD']

function formatRate(rate: number): string {
  return rate < 10 ? rate.toFixed(4) : rate < 1000 ? rate.toFixed(2) : rate.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function CurrenciesPage() {
  const { defaultCurrency, preferredCurrencies, setDefaultCurrency, isSaving, status } = useCurrencySettings()
  const summaryQuery = useQuery({ queryKey: ['summary'], queryFn: () => getSummary() })
  const ratesQuery = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: getExchangeRates,
    staleTime: 1000 * 60 * 30,
  })

  const summary = summaryQuery.data?.data
  const rates = ratesQuery.data?.rates

  // Rates are shown for the account's own currencies, the currencies it holds, and the usual set.
  const rateCodes = [...new Set([...preferredCurrencies, ...(summary?.byCurrency.map((c) => c.currency) ?? []), ...RATE_CURRENCIES])]
    .filter((c) => c !== defaultCurrency)
  // A missing rate is shown as missing, never as 1.
  const displayedRates = rateCodes.map((code) => ({ currency: code, rate: rateBetween(rates, defaultCurrency, code) }))
  const defaultHasRate = defaultCurrency === 'EUR' || (rates !== undefined && defaultCurrency in rates)

  return (
    <main className="w-full px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      <PageHeader title="Currencies" description="Set your default and preferred currencies. Balances and today's rates are below." />

      <CurrencySetup />

      <SectionDivider title="Balances" className="mb-3 mt-8" />
      {summaryQuery.isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading...</p>
      )}
      {summaryQuery.error && (
        <p className="py-4 text-center text-sm text-muted-foreground">{summaryQuery.error.message}</p>
      )}
      {summary && summary.byCurrency.length === 0 && (
        <p className="rounded-2xl bg-[var(--tint)] px-4 py-4 text-[14px] text-[var(--text-secondary)]">
          No balances yet. They appear here once you create a wallet or add an entry.
        </p>
      )}
      {summary && summary.byCurrency.length > 0 && (
        <CurrencyCards
          currencies={summary.byCurrency}
          formatCurrency={formatCurrency}
          defaultCurrency={defaultCurrency}
          onSetDefault={status === 'ready' && !isSaving ? setDefaultCurrency : undefined}
        />
      )}

      {/* Exchange Rates */}
      <SectionDivider title="Exchange rates" badge={`1 ${defaultCurrency} =`} className="mb-3 mt-8" />
      {ratesQuery.isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading exchange rates...</p>
      )}
      {ratesQuery.error && (
        <p role="alert" className="py-4 text-center text-sm text-muted-foreground">Could not load exchange rates.</p>
      )}
      {rates && !defaultHasRate && (
        <p className="mb-3 rounded-2xl bg-[var(--tint)] px-4 py-3 text-[14px] text-[var(--text-secondary)]">
          No exchange rate is recorded for {defaultCurrency}, so rates against it cannot be shown.
        </p>
      )}
      {rates && (
        <ul aria-label="Exchange rates" className="mb-10 grid grid-cols-1 gap-x-6 rounded-2xl bg-[var(--tint)] px-4 py-1 sm:grid-cols-2">
          {displayedRates.map(({ currency, rate }) => (
            <li key={currency} className="flex items-center justify-between border-b border-[var(--tint-strong)] py-3 last:border-0 sm:[&:nth-last-child(2)]:border-0">
              <span className="text-[15px] font-semibold">{currency}</span>
              {rate === null
                ? <span className="text-[14px] text-[var(--text-tertiary)]">No rate</span>
                : <span className="tabular text-[15px] font-semibold">{formatRate(rate)}</span>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
