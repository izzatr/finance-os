import { Link } from 'react-router-dom'
import { isFriendsWallet, visibleFriendsWallets, walletBalance, type Wallet } from '@/lib/api'
import { formatCurrencyShort } from '@/lib/format'

const TYPE_LABELS: Record<string, string> = {
  bank: 'Bank',
  ewallet: 'E-wallet',
  cash: 'Cash',
  credit: 'Credit',
  investment: 'Invest',
  crypto: 'Crypto',
  custom: 'Other',
}

/** Investments show EOD market value when we have it; everything else shows the ledger balance. */
export function walletDisplayValue(wallet: Wallet): { value: number; currency: string } {
  if (wallet.walletType === 'investment' && wallet.portfolioValue) {
    return { value: wallet.portfolioValue.value, currency: wallet.portfolioValue.currency }
  }
  return { value: walletBalance(wallet), currency: wallet.currency }
}

interface WalletTilesProps {
  wallets: Wallet[]
  limit?: number
}

/** Compact 2-up wallet tiles for Home. */
export function WalletTiles({ wallets, limit = 4 }: WalletTilesProps) {
  const active = wallets.filter((w) => w.isActive && !isFriendsWallet(w))
  const friends = visibleFriendsWallets(wallets)
  const shown = active.slice(0, friends.length > 0 ? Math.max(limit - 1, 1) : limit)

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {shown.map((wallet) => {
        const { value, currency } = walletDisplayValue(wallet)
        const typeLabel = TYPE_LABELS[wallet.walletType] ?? wallet.walletType
        const text = wallet.unit && wallet.walletType !== 'investment' ? `${value} ${wallet.unit}` : formatCurrencyShort(value, currency)
        return (
          <li key={wallet.id}>
            <Link
              to={`/wallets/${wallet.id}`}
              className="block rounded-2xl bg-[var(--tint)] px-3.5 py-3 text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
            >
              <span className="block text-[11.5px] font-semibold text-[var(--text-tertiary)]">
                {typeLabel.toLowerCase() === wallet.name.toLowerCase() ? 'Wallet' : typeLabel}
              </span>
              <span className="mt-0.5 block truncate text-[13.5px] font-semibold">{wallet.name}</span>
              <span className={`tabular mt-0.5 block truncate text-[17px] font-bold ${value < 0 ? 'text-[var(--negative)]' : ''}`}>{text}</span>
            </Link>
          </li>
        )
      })}
      {friends.length > 0 && (
        <li>
          <Link
            to="/shared"
            className="block rounded-2xl bg-[var(--tint)] px-3.5 py-3 text-[var(--text-primary)] no-underline transition-colors hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
          >
            <span className="block text-[11.5px] font-semibold text-[var(--text-tertiary)]">Shared</span>
            <span className="mt-0.5 block truncate text-[13.5px] font-semibold">Friends</span>
            <span className={`tabular mt-0.5 block truncate text-[17px] font-bold ${walletBalance(friends[0]) < 0 ? 'text-[var(--negative)]' : ''}`}>
              {formatCurrencyShort(walletBalance(friends[0]), friends[0].currency)}
              {friends.length > 1 && <span className="text-[12px] font-semibold text-[var(--text-tertiary)]"> +{friends.length - 1}</span>}
            </span>
          </Link>
        </li>
      )}
    </ul>
  )
}
