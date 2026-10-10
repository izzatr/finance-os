import { Link } from 'react-router-dom'
import type { Wallet } from '@/lib/api'
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
  const balance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
  return { value: balance, currency: wallet.currency }
}

interface WalletTilesProps {
  wallets: Wallet[]
  limit?: number
}

/** Compact 2-up wallet tiles for Home. */
export function WalletTiles({ wallets, limit = 4 }: WalletTilesProps) {
  const active = wallets.filter((w) => w.isActive)
  const shown = active.slice(0, limit)

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
    </ul>
  )
}
