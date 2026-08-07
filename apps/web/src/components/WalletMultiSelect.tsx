import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type WalletOption = {
  id: string
  name: string
  currency: string
}

type Props = {
  wallets: WalletOption[]
  selectedWalletIds: string[]
  onChange: (walletIds: string[]) => void
}

export function WalletMultiSelect({ wallets, selectedWalletIds, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const selected = new Set(selectedWalletIds)
  const label = selectedWalletIds.length === 0
    ? 'All wallets'
    : selectedWalletIds.length === 1
      ? wallets.find((wallet) => wallet.id === selectedWalletIds[0])?.name ?? '1 wallet selected'
      : `${selectedWalletIds.length} wallets selected`

  function toggle(walletId: string) {
    onChange(selected.has(walletId)
      ? selectedWalletIds.filter((id) => id !== walletId)
      : [...selectedWalletIds, walletId])
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex min-w-48 items-center justify-between rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal hover:bg-muted">
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">Filter reports by wallet</p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {wallets.map((wallet) => (
              <label key={wallet.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(wallet.id)}
                  onChange={() => toggle(wallet.id)}
                  className="size-4 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate">{wallet.name}</span>
                <span className={cn('font-mono text-xs text-muted-foreground', selected.has(wallet.id) && 'text-foreground')}>{wallet.currency}</span>
                <Check className={cn('size-4 text-primary', selected.has(wallet.id) ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
              </label>
            ))}
          </div>
          {wallets.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">No wallets yet.</p>}
        </PopoverContent>
      </Popover>
      {selectedWalletIds.length > 0 && (
        <Button variant="ghost" size="icon" onClick={() => onChange([])} aria-label="Clear wallet filter">
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
