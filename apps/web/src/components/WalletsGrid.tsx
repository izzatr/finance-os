import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { WalletIcon } from './WalletIcon'
import { CreateWalletForm } from './CreateWalletForm'
import type { Wallet } from '../lib/api'

interface WalletsGridProps {
  wallets: Wallet[]
  formatCurrency: (amount: number, currency: string) => string
}

const GROUP_ORDER = ['bank', 'ewallet', 'cash', 'credit', 'investment', 'crypto', 'custom'] as const
const GROUP_LABELS: Record<string, string> = {
  bank: 'Banks',
  ewallet: 'E-wallets',
  cash: 'Cash',
  credit: 'Credit',
  investment: 'Investments',
  crypto: 'Crypto',
  custom: 'Other',
}

function WalletRow({ wallet, formatCurrency }: { wallet: Wallet; formatCurrency: WalletsGridProps['formatCurrency'] }) {
  const balance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
  return (
    <Link
      to={`/wallets/${wallet.id}`}
      className="flex items-center gap-3.5 bg-white/60 border border-border/50 rounded-xl px-5 py-4 transition-all hover:border-[rgba(91,164,212,0.4)] hover:bg-white/90 no-underline text-foreground"
    >
      <div className="size-[38px] rounded-[10px] bg-gradient-to-br from-[#ddeef9] to-[#c6e2f5] flex items-center justify-center text-[#5ba4d4] shrink-0">
        <WalletIcon walletType={wallet.walletType} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{wallet.name}</div>
        <div className="text-xs font-light text-muted-foreground mt-0.5">
          {wallet.walletType}{wallet.institution ? ` · ${wallet.institution}` : ''}
        </div>
      </div>
      <div className="text-right">
        <span className={`font-mono text-sm font-medium whitespace-nowrap ${balance < 0 ? 'text-[var(--negative)]' : ''}`}>
          {wallet.unit ? `${balance} ${wallet.unit}` : formatCurrency(balance, wallet.currency)}
        </span>
        {wallet.valuation && (
          <div className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
            ≈ {formatCurrency(wallet.valuation.value, wallet.valuation.currency)}
          </div>
        )}
      </div>
    </Link>
  )
}

export function WalletsGrid({ wallets, formatCurrency }: WalletsGridProps) {
  const [showCreate, setShowCreate] = useState(false)

  const groups = GROUP_ORDER
    .map((type) => ({ type, label: GROUP_LABELS[type], items: wallets.filter((w) => w.walletType === type) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <div className="mb-14 grid gap-6">
        {groups.map((group) => (
          <section key={group.type} aria-label={group.label}>
            <h2 className="pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {group.items.map((wallet) => (
                <WalletRow key={wallet.id} wallet={wallet} formatCurrency={formatCurrency} />
              ))}
            </div>
          </section>
        ))}

        {/* Add wallet button */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center gap-2 border border-dashed border-border/60 rounded-xl px-5 py-4 text-sm text-muted-foreground transition-all hover:border-[rgba(91,164,212,0.4)] hover:text-foreground hover:bg-white/60 cursor-pointer"
        >
          <Plus size={16} />
          New Wallet
        </button>
      </div>

      {showCreate && <CreateWalletForm onClose={() => setShowCreate(false)} />}
    </>
  )
}
