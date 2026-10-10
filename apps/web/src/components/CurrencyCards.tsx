import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatSigned } from '@/lib/format'

interface CurrencyData {
  currency: string
  net: number
  income: number
  expense: number
  transfer: number
  adjustment: number
  fee: number
}

interface CurrencyCardsProps {
  currencies: CurrencyData[]
  formatCurrency: (amount: number, currency: string) => string
  defaultCurrency?: string
  onSetDefault?: (currency: string) => void
}

export function CurrencyCards({ currencies, formatCurrency, defaultCurrency, onSetDefault }: CurrencyCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
      {currencies.map((curr) => {
        const isDefault = defaultCurrency === curr.currency
        const rows: Array<{ label: string; value: number }> = [
          { label: 'Income', value: curr.income },
          { label: 'Spent', value: curr.expense },
        ]
        if (curr.transfer !== 0) rows.push({ label: 'Transfers', value: curr.transfer })
        if (curr.adjustment !== 0) rows.push({ label: 'Adjustments', value: curr.adjustment })
        if (curr.fee !== 0) rows.push({ label: 'Fees', value: curr.fee })

        return (
          <div key={curr.currency} className="rounded-2xl bg-[var(--tint)] px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--text-tertiary)]">
                {curr.currency}
                {isDefault && <span className="ml-1.5 text-[var(--ink)]">· Default</span>}
              </span>
              {onSetDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-1.5 h-8 w-8 p-0"
                  onClick={() => onSetDefault(curr.currency)}
                  title={isDefault ? 'Default currency' : `Set ${curr.currency} as default`}
                  aria-label={isDefault ? 'Default currency' : `Set ${curr.currency} as default`}
                >
                  <Star className={`h-4 w-4 ${isDefault ? 'fill-[var(--ink)] text-[var(--ink)]' : 'text-muted-foreground'}`} />
                </Button>
              )}
            </div>
            <div className="tabular mt-0.5 text-[22px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
              {formatCurrency(curr.net, curr.currency)}
            </div>
            <dl className="mt-2.5 grid gap-1.5">
              {rows.map((row) => (
                <div key={row.label} className="flex justify-between text-[13px]">
                  <dt className="text-[var(--text-tertiary)]">{row.label}</dt>
                  <dd className={`tabular font-semibold ${row.value > 0 && row.label === 'Income' ? 'text-[var(--positive)]' : 'text-[var(--text-primary)]'}`}>
                    {formatSigned(row.value, curr.currency)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )
      })}
    </div>
  )
}
