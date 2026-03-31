import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown } from 'lucide-react'
import { getWallets, getCategories, createTransaction } from '../lib/api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select'
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

const TX_TYPES = ['expense', 'income', 'transfer', 'adjustment', 'fee']

export function AddTransactionForm({ onClose }: Props) {
  const [description, setDescription] = useState('')
  const [type, setType] = useState('expense')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = useState('')
  const [walletId, setWalletId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [walletOpen, setWalletOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const qc = useQueryClient()

  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const categoriesQuery = useQuery({ queryKey: ['all-categories'], queryFn: getCategories })
  const wallets = walletsQuery.data?.data ?? []
  const categories = categoriesQuery.data?.data ?? []

  const selectedWallet = wallets.find((w) => w.id === walletId)
  const selectedCategory = categories.find((c) => c.id === categoryId)

  // Auto-negate amount for expenses
  const finalAmount = (() => {
    const num = parseFloat(amount)
    if (isNaN(num)) return amount
    if (type === 'expense' && num > 0) return `-${amount}`
    if (type === 'income' && num < 0) return amount.replace('-', '')
    return amount
  })()

  const mutation = useMutation({
    mutationFn: () => createTransaction({
      transactionDate: `${date}T00:00:00.000Z`,
      type,
      description,
      notes: notes || undefined,
      entries: [{
        walletId,
        assetId: selectedWallet!.assetId,
        amount: finalAmount,
      }],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['recent'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
  })

  const canSubmit = description && walletId && amount && !mutation.isPending

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Transaction</DialogTitle>
          <DialogDescription>Record a new expense, income, or other transaction.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Description
            </label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Edeka groceries" autoFocus />
          </div>

          <div className="flex gap-3">
            <div className="grid flex-1 gap-1.5">
              <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
                Type
              </label>
              <Select value={type} onValueChange={(v) => { if (v) setType(v) }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TX_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid flex-1 gap-1.5">
              <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
                Date
              </label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Wallet
            </label>
            <Popover open={walletOpen} onOpenChange={setWalletOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedWallet ? `${selectedWallet.name} (${selectedWallet.currency})` : 'Select wallet...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search wallets..." />
                  <CommandList>
                    <CommandEmpty>No wallet found.</CommandEmpty>
                    <CommandGroup>
                      {wallets.map((w) => (
                        <CommandItem
                          key={w.id}
                          value={`${w.name} ${w.currency}`}
                          onSelect={() => { setWalletId(w.id); setWalletOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', walletId === w.id ? 'opacity-100' : 'opacity-0')} />
                          {w.name} ({w.currency})
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
              Amount
            </label>
            <Input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={type === 'expense' ? '32.50' : '2500.00'}
            />
            <span className="font-mono text-[0.65rem] text-muted-foreground">
              {type === 'expense' ? 'Enter as positive — will be saved as negative' : 'Enter the amount'}
            </span>
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Category
            </label>
            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedCategory?.name ?? 'Select category...'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search categories..." />
                  <CommandList>
                    <CommandEmpty>No category found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__"
                        onSelect={() => { setCategoryId(''); setCategoryOpen(false) }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', !categoryId ? 'opacity-100' : 'opacity-0')} />
                        None
                      </CommandItem>
                      {categories.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => { setCategoryId(c.id); setCategoryOpen(false) }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', categoryId === c.id ? 'opacity-100' : 'opacity-0')} />
                          {c.name}
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
              Notes
            </label>
            <Textarea
              className="min-h-12 font-mono text-xs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
            />
          </div>

          {mutation.error && (
            <p className="font-mono text-xs text-[var(--negative)]">{mutation.error.message}</p>
          )}

          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} className="w-full">
            {mutation.isPending ? 'Saving...' : 'Add Transaction'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
