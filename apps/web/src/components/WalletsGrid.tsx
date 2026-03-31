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

export function WalletsGrid({ wallets, formatCurrency }: WalletsGridProps) {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-14">
        {wallets.map((wallet) => {
          const balance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
          return (
            <Link
              to={`/wallets/${wallet.id}`}
              key={wallet.id}
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
              <span className={`font-mono text-sm font-medium whitespace-nowrap ${balance < 0 ? 'text-[var(--negative)]' : ''}`}>
                {formatCurrency(balance, wallet.currency)}
              </span>
            </Link>
          )
        })}

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
