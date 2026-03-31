import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutGrid,
  BarChart3,
  CreditCard,
  Globe,
  ArrowLeftRight,
  Plus,
  Wallet,
  Receipt,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { getWallets, searchTransactions } from '../lib/api'

const CURRENCY_SYMBOLS: Record<string, string> = { IDR: 'Rp', EUR: '\u20ac', USD: '$' }

function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency
  const absNum = Math.abs(amount)
  let formatted: string
  if (currency === 'IDR') {
    formatted = absNum.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  } else {
    formatted = absNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return `${amount < 0 ? '-' : ''}${symbol}${formatted}`
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  const walletsQuery = useQuery({
    queryKey: ['wallets'],
    queryFn: getWallets,
    enabled: open,
  })

  const txSearchQuery = useQuery({
    queryKey: ['tx-search', search],
    queryFn: () => searchTransactions(search),
    enabled: open && search.length >= 2,
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const runCommand = useCallback((command: () => void) => {
    setOpen(false)
    setSearch('')
    command()
  }, [])

  const hasSearch = search.length >= 2
  const transactions = txSearchQuery.data?.data ?? []
  const listRef = useRef<HTMLDivElement>(null)

  // Reset scroll when search changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [search, transactions.length])

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search for a command, page, or transaction</DialogDescription>
        <Command className="rounded-xl">
          <CommandInput
            placeholder="Search transactions, pages, actions..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList ref={listRef} className="max-h-80">
            <CommandEmpty>
              {hasSearch && txSearchQuery.isLoading
                ? 'Searching...'
                : 'No results found.'
              }
            </CommandEmpty>

            {/* Transaction search results — only when typing 2+ chars */}
            {hasSearch && transactions.length > 0 && (
              <>
                <CommandGroup heading={`Transactions (${transactions.length})`} forceMount>
                  {transactions.slice(0, 10).map((tx) => (
                    <CommandItem
                      key={tx.id}
                      value={`transaction ${tx.description} ${tx.categoryName ?? ''} ${tx.walletName}`}
                      onSelect={() => runCommand(() => navigate('/dashboard'))}
                      forceMount
                    >
                      <Receipt className="size-4 shrink-0" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="truncate">{tx.description}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatShortDate(tx.transactionDate)}
                          {tx.categoryName ? ` · ${tx.categoryName}` : ''}
                          {` · ${tx.walletName}`}
                        </span>
                      </div>
                      <span className={`font-mono text-xs whitespace-nowrap ${tx.amount >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>
                        {formatCurrency(tx.amount, tx.currency)}
                      </span>
                    </CommandItem>
                  ))}
                  {transactions.length > 10 && (
                    <CommandItem disabled forceMount>
                      <span className="text-xs text-muted-foreground">
                        +{transactions.length - 10} more results
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {hasSearch && txSearchQuery.isLoading && (
              <CommandGroup heading="Searching transactions..." forceMount />
            )}

            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => runCommand(() => navigate('/dashboard'))}>
                <LayoutGrid className="size-4" />
                <span>Dashboard</span>
                <CommandShortcut>Go</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => navigate('/reports'))}>
                <BarChart3 className="size-4" />
                <span>Reports</span>
                <CommandShortcut>Go</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => navigate('/wallets'))}>
                <CreditCard className="size-4" />
                <span>Wallets</span>
                <CommandShortcut>Go</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => navigate('/currencies'))}>
                <Globe className="size-4" />
                <span>Currencies</span>
                <CommandShortcut>Go</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Actions">
              <CommandItem onSelect={() => runCommand(() => {})}>
                <Plus className="size-4" />
                <span>Add Transaction</span>
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => {})}>
                <ArrowLeftRight className="size-4" />
                <span>Transfer Between Wallets</span>
              </CommandItem>
            </CommandGroup>

            {walletsQuery.data && walletsQuery.data.data.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Wallets">
                  {walletsQuery.data.data.map((wallet) => (
                    <CommandItem
                      key={wallet.id}
                      onSelect={() => runCommand(() => navigate(`/wallets/${wallet.id}`))}
                    >
                      <Wallet className="size-4" />
                      <span>{wallet.name}</span>
                      <CommandShortcut>{wallet.currency}</CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
