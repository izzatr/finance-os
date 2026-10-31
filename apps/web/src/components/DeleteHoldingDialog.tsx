import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  symbol: string
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteHoldingDialog({ open, symbol, onClose, onConfirm }: Props) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove holding')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {symbol}?</DialogTitle>
          <DialogDescription>This removes the holding from this investment account. Shared instrument and historical market data remain available.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="font-mono text-xs text-[var(--negative)]">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={deleting}>{deleting ? 'Removing...' : 'Remove holding'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
