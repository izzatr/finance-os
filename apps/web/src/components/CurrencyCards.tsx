import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
      {currencies.map((curr) => {
        const isDefault = defaultCurrency === curr.currency
        const rows: Array<{ label: string; value: number; positive: boolean }> = [
          { label: 'Income', value: curr.income, positive: true },
          { label: 'Expense', value: curr.expense, positive: false },
        ]
        if (curr.transfer !== 0) rows.push({ label: 'Transfers', value: curr.transfer, positive: curr.transfer >= 0 })
        if (curr.adjustment !== 0) rows.push({ label: 'Adjustments', value: curr.adjustment, positive: curr.adjustment >= 0 })
        if (curr.fee !== 0) rows.push({ label: 'Fees', value: curr.fee, positive: false })

        return (
          <Card key={curr.currency} className={`bg-white/70 transition-all hover:-translate-y-0.5 hover:shadow-lg ${isDefault ? 'ring-1 ring-[#5ba4d4]/40' : ''}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold tracking-[0.08em] text-[#5ba4d4]">
                    {curr.currency}
                  </span>
                  {isDefault && (
                    <Badge variant="secondary" className="font-mono text-[9px] tracking-wider">
                      Default
                    </Badge>
                  )}
                </div>
                {onSetDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onSetDefault(curr.currency)}
                    title={isDefault ? 'Default currency' : `Set ${curr.currency} as default`}
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${isDefault ? 'fill-[#5ba4d4] text-[#5ba4d4]' : 'text-muted-foreground'}`}
                    />
                  </Button>
                )}
              </div>
              <div className="font-['Cormorant_Garamond',Georgia,serif] italic font-normal text-[28px] text-[#0a0f18] mb-4">
                {formatCurrency(curr.net, curr.currency)}
              </div>
              <div className="flex flex-col gap-2 pt-3.5 border-t border-border/50">
                {rows.map((row) => (
                  <div key={row.label} className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground font-light">{row.label}</span>
                    <span
                      className={`font-mono text-xs font-medium ${
                        row.positive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      }`}
                    >
                      {row.value >= 0 ? '+' : ''}{formatCurrency(row.value, curr.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
