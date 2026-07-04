import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Trash2 } from 'lucide-react'
import { patchTransaction, deleteTransaction, getCategories } from '../lib/api'
import type { WalletTransaction } from '../lib/api'
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
  transaction: WalletTransaction
  walletId: string
  onClose: () => void
}

const TX_TYPES = ['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']

function formatAddedDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function EditTransactionForm({ transaction, walletId, onClose }: Props) {
  const [description, setDescription] = useState(transaction.description)
  const [type, setType] = useState(transaction.type)
  const [date, setDate] = useState(transaction.transactionDate.slice(0, 10))
  const [amount, setAmount] = useState(String(transaction.amount))
  const [notes, setNotes] = useState(transaction.notes ?? '')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const qc = useQueryClient()

  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })
  const categories = categoriesQuery.data?.data ?? []

  // Find category ID from the transaction's category name
  const matchedCategory = categories.find((c) => c.name === transaction.categoryName)
  const [categoryId, setCategoryId] = useState(matchedCategory?.id ?? '')

  // Update categoryId when categories load and we can match by name
  const selectedCategory = categories.find((c) => c.id === categoryId)
  if (!categoryId && matchedCategory && categories.length > 0) {
    setCategoryId(matchedCategory.id)
  }

  const mutation = useMutation({
    mutationFn: () => patchTransaction(transaction.id, {
      description,
      type,
      transactionDate: `${date}T00:00:00.000Z`,
      amount,
      notes: notes || null,
      categoryId: categoryId || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-transactions', walletId] })
      qc.invalidateQueries({ queryKey: ['recent'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(transaction.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-transactions', walletId] })
      qc.invalidateQueries({ queryKey: ['recent'] })
      qc.invalidateQueries({ queryKey: ['summary'] })
      onClose()
    },
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>Modify transaction details.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Description
            </label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
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
              Amount
            </label>
            <Input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-32.50" />
            <span className="font-mono text-[0.65rem] text-muted-foreground">
              Negative for expenses, positive for income
            </span>
          </div>

          <div className="grid gap-1.5">
            <label className="font-mono text-[0.68rem] font-medium uppercase tracking-widest text-muted-foreground">
              Category
            </label>
            <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={categoryOpen}
                  className="w-full justify-between font-normal"
                >
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

          <Button onClick={() => mutation.mutate()} disabled={!description || mutation.isPending} className="w-full">
            {mutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>

          <p className="font-mono text-[0.65rem] text-muted-foreground">
            Added on {formatAddedDate(transaction.createdAt)}
          </p>

          <div className="mt-1 border-t border-border pt-3">
            {!confirmingDelete ? (
              <Button
                variant="ghost"
                onClick={() => setConfirmingDelete(true)}
                className="w-full text-[var(--negative)] hover:text-[var(--negative)] hover:bg-[rgba(217,80,80,0.08)]"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete transaction
              </Button>
            ) : (
              <div className="grid gap-2">
                <p className="text-xs text-muted-foreground">
                  Delete this transaction? It can be restored later.
                </p>
                {deleteMutation.error && (
                  <p className="font-mono text-xs text-[var(--negative)]">{deleteMutation.error.message}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={deleteMutation.isPending}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1"
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
