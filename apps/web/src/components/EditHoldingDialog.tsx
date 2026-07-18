import { useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type EditableHolding = {
  id: string
  symbol: string
  name: string
  exchange: string
  quoteCurrency: string
  quantity: number
  averageCost: number | null
}

type Props = {
  open: boolean
  holding: EditableHolding
  onClose: () => void
  onSubmit: (input: { quantity: string; averageCost: string | null; averageCostCurrency: string | null }) => Promise<void>
}

export function EditHoldingDialog({ open, holding, onClose, onSubmit }: Props) {
  const [quantity, setQuantity] = useState(String(holding.quantity))
  const [averageCost, setAverageCost] = useState(holding.averageCost === null ? '' : String(holding.averageCost))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const validQuantity = Number.isFinite(Number(quantity)) && Number(quantity) > 0

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!validQuantity || saving) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        quantity,
        averageCost: averageCost || null,
        averageCostCurrency: averageCost ? holding.quoteCurrency : null,
      })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update holding')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {holding.symbol}</DialogTitle>
          <DialogDescription>{holding.name} · {holding.exchange}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="edit-holding-quantity" className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">Quantity</label>
            <Input id="edit-holding-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="edit-holding-average-cost" className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">Average cost ({holding.quoteCurrency})</label>
            <Input id="edit-holding-average-cost" inputMode="decimal" value={averageCost} onChange={(event) => setAverageCost(event.target.value)} placeholder="Optional" />
          </div>
          {error && <p role="alert" className="font-mono text-xs text-[var(--negative)]">{error}</p>}
          <Button type="submit" disabled={!validQuantity || saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
