import { Link } from 'react-router-dom'
import { ArrowLeftRight, BarChart3, Plus, Users } from 'lucide-react'
import { formatSigned, splitMoney } from '@/lib/format'

interface HomeHeaderProps {
  /** Net worth in the default currency; null while rates or summary are loading. */
  netWorth: number | null
  currency: string
  /** Income minus spending this month, in the default currency. */
  monthNet: number
  onTransfer: () => void
  /** Desktop has no tab bar, so the add action lives in the header there. */
  onAdd: () => void
}

const pill =
  'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/10 text-[13px] font-semibold text-white transition-colors hover:bg-white/15 active:bg-white/20 focus-visible:outline-2 focus-visible:outline-[var(--cream)]'

/**
 * The ink block at the top of Home. On phones it runs edge to edge under the status bar and
 * the page body slides over its bottom edge; on desktop it is a rounded card.
 */
export function HomeHeader({ netWorth, currency, monthNet, onTransfer, onAdd }: HomeHeaderProps) {
  const money = netWorth === null ? null : splitMoney(netWorth, currency)
  const gain = monthNet >= 0

  return (
    <header className="-mx-4 bg-[var(--ink)] px-5 pb-11 pt-[calc(env(safe-area-inset-top)+1.25rem)] text-white lg:mx-0 lg:mt-8 lg:rounded-[28px] lg:px-8 lg:pb-8 lg:pt-7">
      <p className="text-[15px] font-medium text-white/75">Net worth</p>
      <p className="tabular mt-1 text-[44px] font-bold leading-[1.05] tracking-[-0.03em] sm:text-[52px]" aria-live="polite">
        {money ? (
          <>
            {money.whole}
            <span className="text-[0.56em] text-white/60">{money.cents}</span>
          </>
        ) : (
          <span className="text-white/40">—</span>
        )}
      </p>
      <p
        className={`tabular mt-3 inline-flex rounded-lg px-2.5 py-1 text-[13px] font-bold ${
          gain ? 'bg-[var(--cream)] text-[var(--ink)]' : 'bg-white/12 text-white'
        }`}
      >
        {formatSigned(monthNet, currency)} this month
      </p>

      <nav aria-label="Quick actions" className="mt-6 flex gap-2.5 lg:max-w-xl">
        <button
          type="button"
          onClick={onAdd}
          className="hidden h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--cream)] text-[13px] font-bold text-[var(--ink)] lg:flex"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Add
        </button>
        <button type="button" onClick={onTransfer} className={pill}>
          <ArrowLeftRight className="size-4" /> Transfer
        </button>
        <Link to="/shared" className={`${pill} no-underline`}>
          <Users className="size-4" /> Shared
        </Link>
        <Link to="/reports" className={`${pill} no-underline`}>
          <BarChart3 className="size-4" /> Reports
        </Link>
      </nav>
    </header>
  )
}
