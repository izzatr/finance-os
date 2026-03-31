import { TrendingUp, TrendingDown, Calendar, CreditCard, Activity } from 'lucide-react'

interface OverviewHeroProps {
  totalBalance: string
  monthlyChange: string
  isNegativeMonth: boolean
  trackingSince: string | null
  walletCount: number
  transactionCount: number
}

export function OverviewHero({
  totalBalance,
  monthlyChange,
  isNegativeMonth,
  trackingSince,
  walletCount,
  transactionCount,
}: OverviewHeroProps) {
  const TrendIcon = isNegativeMonth ? TrendingDown : TrendingUp
  const trendColor = isNegativeMonth ? 'text-[var(--negative)]' : 'text-[var(--positive)]'

  return (
    <div className="pt-14 pb-10">
      <div className="text-[11px] font-medium tracking-[0.2em] uppercase text-[#5ba4d4] mb-3">
        Total Net Worth
      </div>
      <div className="font-['Cormorant_Garamond',Georgia,serif] font-medium italic text-[clamp(48px,5vw,64px)] leading-none text-[#0a0f18] mb-2">
        {totalBalance}
      </div>
      <div className={`text-sm font-normal ${trendColor} mb-7 flex items-center gap-1`}>
        <TrendIcon className="size-3.5" />
        {monthlyChange}
      </div>
      <div className="flex gap-6 text-xs text-muted-foreground">
        {trackingSince && (
          <span className="flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            Tracking since {trackingSince}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <CreditCard className="size-3.5" />
          {walletCount} wallets
        </span>
        <span className="flex items-center gap-1.5">
          <Activity className="size-3.5" />
          {transactionCount} transactions
        </span>
      </div>
    </div>
  )
}
