import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { WalletsGrid } from '../components/WalletsGrid'
import { NetWorthCard } from '../components/NetWorthCard'
import { CreateWalletForm } from '../components/CreateWalletForm'
import { Button } from '@/components/ui/button'
import { getWallets } from '../lib/api'

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

export function WalletsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })

  return (
    <main className="w-full px-4 py-6 lg:px-12 lg:pt-12 pb-24">
      <header className="flex items-end justify-between mb-6 lg:mb-10">
        <div>
          <p className="font-mono text-[10px] font-semibold tracking-[0.2em] uppercase text-[#5ba4d4] mb-2">
            Wallets
          </p>
          <h1 className="font-['Cormorant_Garamond',Georgia,serif] italic font-normal text-[42px] text-[#0a0f18] leading-tight">
            Your accounts
          </h1>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowCreate(true)}
          className="gap-1.5 text-xs font-medium"
        >
          <Plus size={14} /> New Wallet
        </Button>
      </header>

      <NetWorthCard />

      {walletsQuery.isLoading && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">Loading wallets...</p>
      )}
      {walletsQuery.error && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">{walletsQuery.error.message}</p>
      )}
      {walletsQuery.data && walletsQuery.data.data.length === 0 && (
        <div className="rounded-3xl border border-border/60 bg-white/75 px-6 py-7 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          <p className="mb-2 text-[11px] font-medium tracking-[0.18em] uppercase text-[#5ba4d4]">No wallets yet</p>
          <p className="mb-4 max-w-[640px]">Create your first wallet to start tracking balances, connect reports, and give the dashboard real visual context.</p>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5"><Plus size={14} /> Create your first wallet</Button>
        </div>
      )}
      {walletsQuery.data && walletsQuery.data.data.length > 0 && (
        <WalletsGrid wallets={walletsQuery.data.data} formatCurrency={formatCurrency} />
      )}

      {showCreate && <CreateWalletForm onClose={() => setShowCreate(false)} />}
    </main>
  )
}
