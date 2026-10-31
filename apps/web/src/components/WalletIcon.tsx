import { Landmark, Banknote, Smartphone, Bitcoin, TrendingUp, CreditCard, Wallet, type LucideProps } from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  bank: Landmark,
  cash: Banknote,
  ewallet: Smartphone,
  crypto: Bitcoin,
  investment: TrendingUp,
  credit: CreditCard,
  custom: Wallet,
}

export function WalletIcon({ walletType, size = 16 }: { walletType: string; size?: number }) {
  const Icon = ICON_MAP[walletType] ?? ICON_MAP.custom
  return <Icon size={size} strokeWidth={1.5} />
}
