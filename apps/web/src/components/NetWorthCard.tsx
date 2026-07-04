import { useQuery } from '@tanstack/react-query'
import { getNetWorth } from '@/lib/api'
import { useDefaultCurrency } from '@/contexts/CurrencyContext'

const DISPLAY_CHOICES = ['EUR', 'USD', 'IDR']

function formatTotal(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${amount.toFixed(0)} ${currency}`
  }
}

export function NetWorthCard() {
  const [currency, setCurrency] = useDefaultCurrency()
  const query = useQuery({
    queryKey: ['net-worth', currency],
    queryFn: () => getNetWorth({ currency, months: 12 }),
    staleTime: 60_000,
  })

  const data = query.data?.data

  return (
    <section
      aria-label="Net worth"
      className="mb-6 rounded-2xl bg-white px-5 py-4 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-blue)]">
          Net worth
        </p>
        <div className="flex gap-1" role="tablist" aria-label="Display currency">
          {DISPLAY_CHOICES.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={currency === c}
              onClick={() => setCurrency(c)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                currency === c
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="pt-1 font-mono text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
        {data ? formatTotal(data.total, data.currency) : '—'}
      </p>
      {data && (data.staleRates || data.missing.length > 0) && (
        <p className="pt-1 text-[11px] text-[var(--text-tertiary)]">
          {data.staleRates && 'Rates are more than a week old. '}
          {data.missing.length > 0 && `Not included (no rate or price yet): ${data.missing.join(', ')}.`}
        </p>
      )}
    </section>
  )
}
