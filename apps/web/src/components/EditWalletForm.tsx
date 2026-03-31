import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { patchWallet } from '../lib/api'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

type Props = {
  wallet: {
    id: string
    name: string
    walletType: string
    institution?: string | null
    isActive?: boolean
  }
  onClose: () => void
}

const WALLET_TYPES = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'cash', label: 'Cash' },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'investment', label: 'Investment' },
  { value: 'credit', label: 'Credit Card' },
  { value: 'custom', label: 'Custom' },
]

export function EditWalletForm({ wallet, onClose }: Props) {
  const [name, setName] = useState(wallet.name)
  const [walletType, setWalletType] = useState(wallet.walletType)
  const [institution, setInstitution] = useState(wallet.institution ?? '')
  const [isActive, setIsActive] = useState(wallet.isActive ?? true)
  const [typeOpen, setTypeOpen] = useState(false)
  const qc = useQueryClient()

  const selectedType = WALLET_TYPES.find((t) => t.value === walletType)

  const mutation = useMutation({
    mutationFn: () => patchWallet(wallet.id, {
      name,
      walletType,
      institution: institution || null,
      isActive,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['wallet-transactions', wallet.id] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Wallet</DialogTitle>
          <DialogDescription>Update your wallet details.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Type
            </label>
            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={typeOpen}
                  className="w-full justify-between font-normal"
                >
                  {selectedType?.label ?? 'Select type...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search type..." />
                  <CommandList>
                    <CommandEmpty>No type found.</CommandEmpty>
                    <CommandGroup>
                      {WALLET_TYPES.map((t) => (
                        <CommandItem
                          key={t.value}
                          value={t.label}
                          onSelect={() => { setWalletType(t.value); setTypeOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', walletType === t.value ? 'opacity-100' : 'opacity-0')} />
                          {t.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Institution
            </label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 accent-primary"
            />
            <span>Active</span>
          </label>

          {mutation.error && (
            <p className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</p>
          )}

          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending} className="w-full">
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
