import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { createTransfer } from '../lib/api'
import type { Wallet } from '../lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  wallets: Wallet[]
  onClose: () => void
}

export function TransferForm({ wallets, onClose }: Props) {
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const qc = useQueryClient()

  const sourceWallet = wallets.find((w) => w.id === sourceId)
  const targetOptions = sourceWallet
    ? wallets.filter((w) => w.assetId === sourceWallet.assetId && w.id !== sourceId)
    : wallets

  const mutation = useMutation({
    mutationFn: () => createTransfer({
      sourceWalletId: sourceId,
      targetWalletId: targetId,
      assetId: sourceWallet!.assetId,
      amount,
      description: description || 'Transfer',
      transactionDate: `${date}T00:00:00.000Z`,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['recent'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      onClose()
    },
  })

  const canSubmit = sourceId && targetId && amount && parseFloat(amount) > 0 && !mutation.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer</DialogTitle>
          <DialogDescription>Move funds between wallets.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              From
            </label>
            <Select value={sourceId} onValueChange={(v) => { setSourceId(v ?? ''); setTargetId('') }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select wallet..." />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center text-muted-foreground">
            <ArrowRight size={16} />
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              To
            </label>
            <Select value={targetId} onValueChange={(v) => setTargetId(v ?? '')} disabled={!sourceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select wallet..." />
              </SelectTrigger>
              <SelectContent>
                {targetOptions.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name} ({w.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Amount
            </label>
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Description
            </label>
            <Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Transfer" />
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Date
            </label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {mutation.error && (
            <p className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</p>
          )}

          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} className="w-full">
            {mutation.isPending ? 'Transferring...' : 'Transfer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
