import { useQuery } from '@tanstack/react-query'
import { getNetWorth } from '@/lib/api'
import { useCurrencySettings } from '@/contexts/CurrencyContext'

const DISPLAY_CHOICES = ['EUR', 'USD', 'IDR']

function formatTotal(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency}`
  }
}

export function NetWorthCard() {
  const { defaultCurrency: currency, preferredCurrencies, setDefaultCurrency: setCurrency, isSaving } = useCurrencySettings()
  // The quick switch offers the account's own currencies; with none preferred, the familiar three.
  const choices = [...new Set([currency, ...(preferredCurrencies.length > 0 ? preferredCurrencies : DISPLAY_CHOICES)])].slice(0, 4)
  const query = useQuery({
    queryKey: ['net-worth', currency],
    queryFn: () => getNetWorth({ currency, months: 12 }),
    staleTime: 60_000,
  })

  const data = query.data?.data

  return (
    <section
      aria-label="Net worth"
      className="mb-8 rounded-[24px] bg-[var(--ink)] px-5 py-5 text-white"
    >
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-medium text-white/75">Net worth</p>
        <div className="flex gap-1" role="tablist" aria-label="Display currency">
          {choices.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={currency === c}
              disabled={isSaving}
              onClick={() => setCurrency(c)}
              className={`h-8 rounded-full px-3 text-[12px] font-bold transition-colors ${
                currency === c
                  ? 'bg-[var(--cream)] text-[var(--ink)]'
                  : 'bg-white/10 text-white/80 hover:bg-white/15'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="tabular pt-2 text-[36px] font-bold leading-tight tracking-[-0.03em] text-white">
        {data ? formatTotal(data.total, data.currency) : '—'}
      </p>
      {data && (data.staleRates || data.missing.length > 0) && (
        <p className="pt-1 text-[12px] text-white/65">
          {data.staleRates && 'Rates are more than a week old. '}
          {data.missing.length > 0 && `Not included (no rate or price yet): ${data.missing.join(', ')}.`}
        </p>
      )}
    </section>
  )
}
