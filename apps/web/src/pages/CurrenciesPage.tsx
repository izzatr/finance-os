import { useQuery } from '@tanstack/react-query'
import { CurrencyCards } from '../components/CurrencyCards'
import { SectionDivider } from '../components/SectionDivider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getSummary, getExchangeRates } from '../lib/api'
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
    <main className="w-full px-8 md:px-12 pt-12 pb-24">
      {/* Editorial header */}
      <header className="mb-12">
        <p className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[#5ba4d4] mb-2">
          Currencies
        </p>
        <h1 className="font-['Cormorant_Garamond',Georgia,serif] italic font-normal text-[42px] text-[#0a0f18] leading-tight">
          By currency
        </h1>
      </header>

      {summaryQuery.isLoading && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">Loading...</p>
      )}
      {summaryQuery.error && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">{summaryQuery.error.message}</p>
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
          <SectionDivider title="Exchange rates" badge={`Base ${defaultCurrency}`} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-14">
            {displayedRates.map(({ currency, rate }) => (
              <Card key={currency} className="bg-white/60">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px] tracking-wider">
                      {currency}
                    </Badge>
                  </div>
                  <span className="font-mono text-sm font-medium text-foreground">
                    {rate < 10 ? rate.toFixed(4) : rate < 1000 ? rate.toFixed(2) : rate.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {ratesQuery.isLoading && (
        <p className="py-4 text-center font-mono text-xs text-muted-foreground">Loading exchange rates...</p>
      )}
    </main>
  )
}
