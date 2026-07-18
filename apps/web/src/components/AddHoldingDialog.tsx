import { useState, type FormEvent } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type InstrumentCandidate = {
  provider: 'yahoo'
  providerSymbol: string
  symbol: string
  name: string
  type: 'stock' | 'etf'
  exchange: string
  exchangeCode: string
  quoteCurrency: string
  timezone: string
  mic?: string | null
}

export type AddHoldingInput = {
  candidate: InstrumentCandidate
  quantity: string
  averageCost: string | null
  averageCostCurrency: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  onSearch: (query: string) => Promise<InstrumentCandidate[]>
  onSubmit: (input: AddHoldingInput) => Promise<void>
}

const DECIMAL = /^\d+(\.\d+)?$/
function positiveDecimal(value: string) {
  return DECIMAL.test(value) && Number.isFinite(Number(value)) && Number(value) > 0
}

export function AddHoldingDialog({ open, onClose, onSearch, onSubmit }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InstrumentCandidate[]>([])
  const [selected, setSelected] = useState<InstrumentCandidate | null>(null)
  const [quantity, setQuantity] = useState('')
  const [averageCost, setAverageCost] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quantityValid = positiveDecimal(quantity)
  const averageCostValid = !averageCost || positiveDecimal(averageCost)

  function resetAndClose() {
    setQuery('')
    setResults([])
    setSelected(null)
    setQuantity('')
    setAverageCost('')
    setSearched(false)
    setError(null)
    onClose()
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    if (!normalized || searching) return
    setSearching(true)
    setSearched(false)
    setError(null)
    try {
      setResults(await onSearch(normalized))
      setSelected(null)
      setSearched(true)
    } catch (cause) {
      setResults([])
      setError(cause instanceof Error ? cause.message : 'Unable to search Yahoo right now')
    } finally {
      setSearching(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selected || !quantityValid || !averageCostValid || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ candidate: selected, quantity, averageCost: averageCost || null, averageCostCurrency: averageCost ? selected.quoteCurrency : null })
      resetAndClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add holding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) resetAndClose() }}>
      <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add holding</DialogTitle>
          <DialogDescription>Search Yahoo and choose the exact exchange listing you own.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <label htmlFor="holding-search" className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">Search stocks and ETFs</label>
            <div className="flex gap-2">
              <Input id="holding-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSearch(event) }} placeholder="BBCA, Bank Central Asia, VWCE..." autoComplete="off" />
              <Button type="button" variant="outline" onClick={(event) => void handleSearch(event)} disabled={!query.trim() || searching} className="min-h-11">
                {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
              </Button>
            </div>
          </div>

          {results.length > 0 && (
            <div className="grid gap-2" aria-label="Instrument listings">
              {results.map((candidate) => {
                const label = `${candidate.symbol} · ${candidate.exchange} · ${candidate.quoteCurrency}`
                const active = selected?.providerSymbol === candidate.providerSymbol
                return (
                  <button type="button" aria-label={label} aria-pressed={active} key={`${candidate.provider}:${candidate.providerSymbol}`} onClick={() => setSelected(candidate)} className={cn('min-h-11 rounded-xl border px-4 py-3 text-left transition-colors', active ? 'border-[#5ba4d4] bg-[#eef7fd]' : 'border-border/70 bg-white hover:border-[#9fc9e4]')}>
                    <span className="block font-mono text-sm font-semibold">{label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{candidate.name} · Yahoo {candidate.providerSymbol}</span>
                  </button>
                )
              })}
            </div>
          )}
          {searched && results.length === 0 && <p className="text-xs text-muted-foreground">No Yahoo stock or ETF listings found.</p>}

          {selected && (
            <div className="grid gap-4 rounded-xl border border-border/70 bg-white/70 p-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="holding-quantity" className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">Quantity</label>
                <Input id="holding-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1000" aria-invalid={quantity !== '' && !quantityValid} aria-describedby="holding-quantity-error" />
                {quantity !== '' && !quantityValid && <p id="holding-quantity-error" className="text-xs text-[var(--negative)]">Enter a quantity greater than zero.</p>}
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="holding-average-cost" className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">Average cost ({selected.quoteCurrency})</label>
                <Input id="holding-average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} placeholder="Optional" aria-invalid={!averageCostValid} aria-describedby="holding-average-cost-error" />
                {!averageCostValid && <p id="holding-average-cost-error" className="text-xs text-[var(--negative)]">Enter a cost greater than zero or leave it blank.</p>}
              </div>
            </div>
          )}

          {error && <p role="alert" className="font-mono text-xs text-[var(--negative)]">{error}</p>}
          <Button type="submit" disabled={!selected || !quantityValid || !averageCostValid || saving} className="min-h-11 w-full">{saving ? 'Adding...' : 'Add holding'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
