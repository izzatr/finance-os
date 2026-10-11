import { Link } from 'react-router-dom'
import { WalletIcon } from './WalletIcon'
import { isFriendsWallet, visibleFriendsWallets, walletBalance, type Wallet } from '../lib/api'
import { Users } from 'lucide-react'
import { formatAmount } from '../lib/split'

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
  const balance = walletBalance(wallet)
  const isPortfolio = wallet.walletType === 'investment' && wallet.portfolioValue
  const displayValue = isPortfolio ? wallet.portfolioValue!.value : balance
  const displayCurrency = isPortfolio ? wallet.portfolioValue!.currency : wallet.currency
  return (
    <Link
      to={`/wallets/${wallet.id}`}
      className="flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3.5 text-foreground no-underline transition-colors hover:bg-[var(--tint)]"
    >
      <div className="size-10 rounded-full bg-[var(--tint)] flex items-center justify-center text-[var(--ink)] shrink-0">
        <WalletIcon walletType={wallet.walletType} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate text-[15px] font-semibold">{wallet.name}</div>
        <div className="mt-0.5 text-[13px] capitalize text-muted-foreground">
          {wallet.walletType}{wallet.institution ? ` · ${wallet.institution}` : ''}
        </div>
      </div>
      <div className="text-right">
        <span className={`tabular text-[15px] font-semibold whitespace-nowrap ${displayValue < 0 ? 'text-[var(--negative)]' : ''}`}>
          {wallet.unit && !isPortfolio ? `${balance} ${wallet.unit}` : formatCurrency(displayValue, displayCurrency)}
        </span>
        {isPortfolio && (
          <div className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
            Market value · EOD
          </div>
        )}
        {!isPortfolio && wallet.valuation && (
          <div className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
            ≈ {formatCurrency(wallet.valuation.value, wallet.valuation.currency)}
          </div>
        )}
      </div>
    </Link>
  )
}

export function WalletsGrid({ wallets, formatCurrency }: WalletsGridProps) {

  const own = wallets.filter((w) => !isFriendsWallet(w))
  const friends = visibleFriendsWallets(wallets)
  const groups = GROUP_ORDER
    .map((type) => ({ type, label: GROUP_LABELS[type], items: own.filter((w) => w.walletType === type) }))
    .filter((g) => g.items.length > 0)

  return (
    <>
      <div className="mb-8 grid gap-6">
        {groups.map((group) => (
          <section key={group.type} aria-label={group.label}>
            <h2 className="pb-2 text-[15px] font-bold text-[var(--text-primary)]">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {group.items.map((wallet) => (
                <WalletRow key={wallet.id} wallet={wallet} formatCurrency={formatCurrency} />
              ))}
            </div>
          </section>
        ))}
        {friends.length > 0 && (
          <section aria-label="Friends">
            <h2 className="pb-2 text-[15px] font-bold text-[var(--text-primary)]">Friends</h2>
            <Link
              to="/shared"
              className="flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-white px-4 py-3.5 text-foreground no-underline transition-colors hover:bg-[var(--tint)] md:max-w-[calc(50%-0.45rem)]"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--tint)] text-[var(--ink)]">
                <Users className="size-[18px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">Balances with friends</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">Kept in step with Shared</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                {friends.map((w) => (
                  <span key={w.id} className={`tabular whitespace-nowrap text-[15px] font-semibold ${walletBalance(w) < 0 ? 'text-[var(--negative)]' : ''}`}>
                    {formatAmount(walletBalance(w), w.currency)}
                  </span>
                ))}
              </div>
            </Link>
          </section>
        )}
      </div>
    </>
  )
}
