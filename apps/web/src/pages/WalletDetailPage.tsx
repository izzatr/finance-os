import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Settings, Trash2 } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { WalletIcon } from '../components/WalletIcon'
import { ActivityList } from '../components/ActivityList'
import { EditWalletForm } from '../components/EditWalletForm'
import { DeleteWalletDialog } from '../components/DeleteWalletDialog'
import { EditTransactionForm } from '../components/EditTransactionForm'
import { SectionDivider } from '../components/SectionDivider'
import { InvestmentWalletView } from '../components/investments/InvestmentWalletView'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getWalletTransactions } from '../lib/api'
import type { WalletTransaction } from '../lib/api'

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function WalletDetailPage() {
  const { walletId } = useParams<{ walletId: string }>()
  const [editingWallet, setEditingWallet] = useState(false)
  const [deletingWallet, setDeletingWallet] = useState(false)
  const [editingTx, setEditingTx] = useState<WalletTransaction | null>(null)
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['wallet-transactions', walletId],
    queryFn: () => getWalletTransactions(walletId!),
    enabled: !!walletId,
    staleTime: 30_000,
  })

  const detail = query.data?.data
  const isInvestment = detail?.wallet.walletType === 'investment'

  // Compute cumulative balance over time from transactions
  const ledgerTrend = useMemo(() => {
    if (!detail) return []

    const sorted = [...detail.transactions].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    )

    if (sorted.length === 0) return []

    let cumulative = 0
    const points: Array<{ date: string; balance: number }> = []

    for (const tx of sorted) {
      cumulative += tx.amount
      const point = { date: tx.transactionDate, balance: Math.round(cumulative * 100) / 100 }
      // One point per calendar day (the end-of-day balance), so the axis never repeats a date.
      if (points.length > 0 && points[points.length - 1].date.slice(0, 10) === point.date.slice(0, 10)) {
        points[points.length - 1] = point
      } else {
        points.push(point)
      }
    }

    return points
  }, [detail])
  const balanceTrend = ledgerTrend

  const chartFmt = (v: number) => {
    if (!detail) return String(v)
    const c = detail.wallet.currency
    if (c === 'IDR') return `Rp${(v / 1_000_000).toFixed(1)}M`
    return `${CURRENCY_SYMBOLS[c] ?? c}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  const walletActions = (
    <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingWallet(true)}
                  aria-label="Edit wallet"
                  className="text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <Settings size={19} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeletingWallet(true)}
                  aria-label="Delete wallet"
                  className="text-white/75 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 size={19} />
                </Button>
    </>
  )

  return (
    <main className="mx-auto w-full max-w-[960px] px-4 pb-8 pt-6 lg:px-12 lg:pt-10">
      {query.isLoading && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading wallet...</p>
      )}
      {query.error && (
        <p className="py-8 text-center text-sm text-muted-foreground">{query.error.message}</p>
      )}

      {detail && (
        <>
          <Link to="/wallets" className="-ml-1 mb-3 inline-flex h-9 items-center gap-0.5 text-[14px] font-semibold text-[var(--text-secondary)] no-underline hover:text-[var(--text-primary)]">
            <ChevronLeft className="size-5" /> Wallets
          </Link>

          {isInvestment ? (
            <InvestmentWalletView
              wallet={{
                id: detail.wallet.id,
                name: detail.wallet.name,
                currency: detail.wallet.currency,
                balance: Number(detail.wallet.balance),
                subtitle: ['Investments', detail.wallet.institution].filter(Boolean).join(' · '),
              }}
              ledgerTrend={ledgerTrend}
              icon={<WalletIcon walletType={detail.wallet.walletType} size={22} />}
              actions={detail.wallet.systemRole ? null : walletActions}
            />
          ) : (
            <>
          {/* Hero */}
          <header className="mb-8 rounded-[24px] bg-[var(--ink)] px-5 pb-5 pt-4 text-white">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[var(--cream)]">
                <WalletIcon walletType={detail.wallet.walletType} size={22} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h1 className="break-words text-[22px] font-bold leading-tight tracking-[-0.01em]">{detail.wallet.name}</h1>
                <p className="mt-0.5 text-[13px] capitalize text-white/65">
                  {detail.wallet.walletType}
                  {detail.wallet.institution ? ` · ${detail.wallet.institution}` : ''}
                </p>
              </div>
              {!detail.wallet.systemRole && <div className="-mr-2 flex shrink-0 items-center">{walletActions}</div>}
            </div>

            <p className="mt-6 text-[14px] font-medium text-white/70">
              Balance
            </p>
            <p className={`tabular text-[38px] font-bold leading-tight tracking-[-0.03em] ${Number(detail.wallet.balance) < 0 ? 'text-[#ffb4a8]' : ''}`}>
              {formatCurrency(Number(detail.wallet.balance), detail.wallet.currency)}
            </p>
          </header>

          {detail.wallet.systemRole && (
            <p className="mb-6 rounded-lg bg-[var(--tint)] px-4 py-3 text-[14px] text-[var(--text-secondary)]">
              This wallet holds your balances with friends and updates itself. Change it from{' '}
              <Link to="/shared" className="font-semibold text-[var(--ink)]">Shared</Link>.
            </p>
          )}


          {/* Balance Trend Chart */}
          {balanceTrend.length > 1 && (
            <>
              <SectionDivider title="Balance trend" badge={detail.wallet.currency} />
              <Card className="mb-8 bg-white">
                <CardContent className="px-2 py-1 sm:px-4">
                  <div className="h-56 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={balanceTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <defs>
                          <linearGradient id="gradient-wallet-balance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0e1729" stopOpacity={0.12} />
                            <stop offset="95%" stopColor="#0e1729" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ede7dc" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#6f695f' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(d: string) => formatShortDate(d)}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#6f695f' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={chartFmt}
                          width={56}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#fff',
                            border: '1px solid #ede7dc',
                            borderRadius: 12,
                            fontSize: 13,
                          }}
                          labelFormatter={(label) => formatDate(String(label ?? ''))}
                          formatter={(value) => [chartFmt(value as number), 'Balance']}
                        />
                        <Area
                          type="monotone"
                          dataKey="balance"
                          stroke="#0e1729"
                          fill="url(#gradient-wallet-balance)"
                          strokeWidth={2.5}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

            </>
          )}

          {/* Transactions */}
          <SectionDivider
            title="Transactions"
            badge={`${detail.transactions.length} total`}
          />

          <ActivityList
            transactions={detail.transactions}
            onSelect={(tx) => (tx.sharedExpenseId ? navigate(`/shared/expenses/${tx.sharedExpenseId}`) : setEditingTx(tx))}
            emptyLabel="No transactions in this wallet yet"
          />

          {editingWallet && (
            <EditWalletForm wallet={detail.wallet} onClose={() => setEditingWallet(false)} />
          )}

          {deletingWallet && (
            <DeleteWalletDialog
              walletId={walletId!}
              walletName={detail.wallet.name}
              onClose={() => setDeletingWallet(false)}
            />
          )}

          {editingTx && (
            <EditTransactionForm
              transaction={editingTx}
              walletId={walletId!}
              onClose={() => setEditingTx(null)}
            />
          )}

        </>
      )}
    </main>
  )
}
