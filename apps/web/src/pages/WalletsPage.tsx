import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { WalletsGrid } from '../components/WalletsGrid'
import { NetWorthCard } from '../components/NetWorthCard'
import { CreateWalletForm } from '../components/CreateWalletForm'
import { Button } from '@/components/ui/button'
import { getWallets } from '../lib/api'
import { PageHeader } from '../components/PageHeader'

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
    <main className="w-full px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      <PageHeader
        title="Wallets"
        action={
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus size={16} /> New wallet
          </Button>
        }
      />

      <NetWorthCard />

      {walletsQuery.isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading wallets...</p>
      )}
      {walletsQuery.error && (
        <p className="py-8 text-center text-sm text-muted-foreground">{walletsQuery.error.message}</p>
      )}
      {walletsQuery.data && walletsQuery.data.data.length === 0 && (
        <div className="rounded-2xl bg-[var(--tint)] px-5 py-5 text-sm text-[var(--text-secondary)]">
          <p className="mb-1 text-[15px] font-bold text-[var(--text-primary)]">No wallets yet</p>
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
