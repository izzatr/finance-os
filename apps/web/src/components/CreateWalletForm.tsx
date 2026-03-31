import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { createWallet, getAssets } from '../lib/api'
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

export function CreateWalletForm({ onClose }: Props) {
  const [name, setName] = useState('')
  const [walletType, setWalletType] = useState('')
  const [currency, setCurrency] = useState('')
  const [institution, setInstitution] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const qc = useQueryClient()

  const assetsQuery = useQuery({ queryKey: ['assets'], queryFn: getAssets })
  const assets = assetsQuery.data?.data ?? []

  const selectedType = WALLET_TYPES.find((t) => t.value === walletType)
  const selectedAsset = assets.find((a) => a.id === currency)

  const mutation = useMutation({
    mutationFn: () => createWallet({
      name,
      walletType,
      assetId: currency,
      institution: institution || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      onClose()
    },
  })

  const canSubmit = name && walletType && currency && !mutation.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Wallet</DialogTitle>
          <DialogDescription>Add a new wallet to track.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Name
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Checking EUR" />
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Type
            </label>
            <Popover open={typeOpen} onOpenChange={setTypeOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
              Currency
            </label>
            <Popover open={currencyOpen} onOpenChange={setCurrencyOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedAsset ? `${selectedAsset.code} — ${selectedAsset.name}` : 'Select currency...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search currency..." />
                  <CommandList>
                    <CommandEmpty>No currency found.</CommandEmpty>
                    <CommandGroup>
                      {assets.map((a) => (
                        <CommandItem
                          key={a.id}
                          value={`${a.code} ${a.name}`}
                          onSelect={() => { setCurrency(a.id); setCurrencyOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', currency === a.id ? 'opacity-100' : 'opacity-0')} />
                          {a.code} — {a.name}
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
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Optional (e.g. Example Bank, City Credit Union)" />
          </div>

          {mutation.error && (
            <p className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</p>
          )}

          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} className="w-full">
            {mutation.isPending ? 'Creating...' : 'Create Wallet'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
