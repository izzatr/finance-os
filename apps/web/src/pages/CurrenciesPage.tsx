import { useQuery } from '@tanstack/react-query'
import { CurrencyCards } from '../components/CurrencyCards'
import { SectionDivider } from '../components/SectionDivider'
import { getSummary, getExchangeRates } from '../lib/api'
import { useDefaultCurrency } from '../contexts/CurrencyContext'
import { PageHeader } from '../components/PageHeader'

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

export function CurrenciesPage() {
  const [defaultCurrency, setDefaultCurrency] = useDefaultCurrency()
  const summaryQuery = useQuery({ queryKey: ['summary'], queryFn: () => getSummary() })
  const ratesQuery = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: getExchangeRates,
    staleTime: 1000 * 60 * 30,
  })

  const summary = summaryQuery.data?.data
  const rates = ratesQuery.data?.rates

  const displayedRates = rates
    ? ['USD', 'IDR', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'SGD']
        .filter((c) => c !== defaultCurrency && c in rates)
        .map((c) => {
          // Convert EUR-based rates to default-currency-based rates
          // rates[X] = X per 1 EUR, so X per 1 defaultCurrency = rates[X] / rates[defaultCurrency]
          const defaultRate = defaultCurrency === 'EUR' ? 1 : (rates[defaultCurrency] ?? 1)
          const rate = (c === 'EUR' ? 1 : rates[c]) / defaultRate
          return { currency: c, rate }
        })
    : []

  return (
    <main className="w-full px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      <PageHeader title="Currencies" description="Balances per currency and today's rates." />

      {summaryQuery.isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
      )}
      {summaryQuery.error && (
        <p className="py-8 text-center text-sm text-muted-foreground">{summaryQuery.error.message}</p>
      )}

      {summary && summary.byCurrency.length > 0 && (
        <CurrencyCards
          currencies={summary.byCurrency}
          formatCurrency={formatCurrency}
          defaultCurrency={defaultCurrency}
          onSetDefault={setDefaultCurrency}
        />
      )}

      {/* Exchange Rates */}
      {displayedRates.length > 0 && (
        <>
          <SectionDivider title="Exchange rates" badge={`1 ${defaultCurrency} =`} className="mb-3 mt-8" />
          <ul className="mb-10 grid grid-cols-1 gap-x-6 rounded-2xl bg-[var(--tint)] px-4 py-1 sm:grid-cols-2">
            {displayedRates.map(({ currency, rate }) => (
              <li key={currency} className="flex items-center justify-between border-b border-[var(--tint-strong)] py-3 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <span className="text-[15px] font-semibold">{currency}</span>
                <span className="tabular text-[15px] font-semibold">
                  {rate < 10 ? rate.toFixed(4) : rate < 1000 ? rate.toFixed(2) : rate.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {ratesQuery.isLoading && (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading exchange rates...</p>
      )}
    </main>
  )
}
