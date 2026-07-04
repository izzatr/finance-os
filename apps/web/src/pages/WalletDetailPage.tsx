import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Settings, Pencil, Trash2 } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { WalletIcon } from '../components/WalletIcon'
import { EditNotesInline } from '../components/EditNotesInline'
import { EditWalletForm } from '../components/EditWalletForm'
import { DeleteWalletDialog } from '../components/DeleteWalletDialog'
import { EditTransactionForm } from '../components/EditTransactionForm'
import { SectionDivider } from '../components/SectionDivider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const TYPE_STYLES: Record<string, string> = {
  income: 'bg-[rgba(58,172,106,0.08)] text-[var(--positive)]',
  expense: 'bg-[rgba(217,80,80,0.08)] text-[var(--negative)]',
  transfer: 'bg-[rgba(91,164,212,0.08)] text-[#5ba4d4]',
}

export function WalletDetailPage() {
  const { walletId } = useParams<{ walletId: string }>()
  const [editingWallet, setEditingWallet] = useState(false)
  const [deletingWallet, setDeletingWallet] = useState(false)
  const [editingTx, setEditingTx] = useState<WalletTransaction | null>(null)

  const query = useQuery({
    queryKey: ['wallet-transactions', walletId],
    queryFn: () => getWalletTransactions(walletId!),
    enabled: !!walletId,
    staleTime: 30_000,
  })

  const detail = query.data?.data

  // Compute cumulative balance over time from transactions
  const balanceTrend = useMemo(() => {
    if (!detail) return []

    const sorted = [...detail.transactions].sort(
      (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
    )

    if (sorted.length === 0) return []

    let cumulative = 0
    const points: Array<{ date: string; balance: number }> = []

    for (const tx of sorted) {
      cumulative += tx.amount
      points.push({ date: tx.transactionDate, balance: Math.round(cumulative * 100) / 100 })
    }

    return points
  }, [detail])

  const chartFmt = (v: number) => {
    if (!detail) return String(v)
    const c = detail.wallet.currency
    if (c === 'IDR') return `Rp${(v / 1_000_000).toFixed(1)}M`
    return `${CURRENCY_SYMBOLS[c] ?? c}${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }

  return (
    <main className="w-full px-8 md:px-12 pt-12 pb-24">
      {query.isLoading && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">Loading wallet...</p>
      )}
      {query.error && (
        <p className="py-8 text-center font-mono text-xs text-muted-foreground">{query.error.message}</p>
      )}

      {detail && (
        <>
          {/* Hero Section */}
          <header className="relative mb-12">
            <div className="absolute top-0 right-0 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingWallet(true)}
                title="Edit wallet"
                className="text-muted-foreground hover:text-foreground"
              >
                <Settings size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeletingWallet(true)}
                title="Delete wallet"
                className="text-muted-foreground hover:text-[var(--negative)]"
              >
                <Trash2 size={18} />
              </Button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="size-14 rounded-2xl bg-gradient-to-br from-[#ddeef9] to-[#c6e2f5] flex items-center justify-center text-[#5ba4d4] shrink-0">
                <WalletIcon walletType={detail.wallet.walletType} size={28} />
              </div>
              <div>
                <h1 className="font-['Cormorant_Garamond',Georgia,serif] italic font-normal text-[42px] text-[#0a0f18] leading-tight">
                  {detail.wallet.name}
                </h1>
                <p className="text-sm font-light text-muted-foreground mt-0.5">
                  {detail.wallet.walletType}
                  {detail.wallet.institution ? ` \u00b7 ${detail.wallet.institution}` : ''}
                </p>
              </div>
            </div>

            <div className="mt-2">
              <span
                className={`font-mono text-[36px] font-semibold tracking-tight ${
                  detail.wallet.balance >= 0 ? 'text-[#0a0f18]' : 'text-[var(--negative)]'
                }`}
              >
                {formatCurrency(detail.wallet.balance, detail.wallet.currency)}
              </span>
              <span className="block font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mt-1">
                Current balance
              </span>
            </div>
          </header>

          {/* Balance Trend Chart */}
          {balanceTrend.length > 1 && (
            <>
              <SectionDivider title="Balance trend" badge={detail.wallet.currency} />
              <Card className="bg-white/70 mb-14">
                <CardContent className="p-6">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={balanceTrend} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <defs>
                          <linearGradient id="gradient-wallet-balance" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3aac6a" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#3aac6a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,190,220,0.15)" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#8296a8' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(d: string) => formatShortDate(d)}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#8296a8' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={chartFmt}
                          width={80}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#fff',
                            border: '1px solid rgba(180,210,235,0.35)',
                            borderRadius: 12,
                            fontSize: 13,
                          }}
                          labelFormatter={(label) => formatDate(String(label ?? ''))}
                          formatter={(value) => [chartFmt(value as number), 'Balance']}
                        />
                        <Area
                          type="monotone"
                          dataKey="balance"
                          stroke="#3aac6a"
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

          {/* Transactions */}
          <SectionDivider
            title="Transactions"
            badge={`${detail.transactions.length} total`}
          />

          <div className="flex flex-col gap-px mb-14">
            {detail.transactions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions</p>
            )}
            {detail.transactions.map((tx) => (
              <div
                key={tx.id}
                className="group grid grid-cols-[72px_1fr_auto] gap-4 items-start py-3 px-4 rounded-lg transition-colors hover:bg-white/70"
              >
                {/* Date */}
                <div className="text-xs font-light text-muted-foreground pt-0.5">
                  {formatShortDate(tx.transactionDate)}
                </div>

                {/* Middle: type badge + description + category + notes */}
                <div className="min-w-0">
                  <div className="text-[13px] font-normal text-foreground">
                    <Badge
                      variant="outline"
                      className={`mr-1.5 text-[9px] font-medium tracking-[0.1em] uppercase px-1.5 py-0 border-0 ${
                        TYPE_STYLES[tx.type] ?? ''
                      }`}
                    >
                      {tx.type}
                    </Badge>
                    {tx.description}
                    <button
                      className="ml-1 inline-flex items-center rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:text-primary group-hover:opacity-100"
                      onClick={() => setEditingTx(tx)}
                      title="Edit transaction"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                  {tx.categoryName && (
                    <div className="text-[11px] font-light text-muted-foreground mt-0.5">
                      {tx.categoryName}
                    </div>
                  )}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <EditNotesInline
                      transactionId={tx.id}
                      walletId={walletId!}
                      initialNotes={tx.notes}
                    />
                  </div>
                </div>

                {/* Amount */}
                <div
                  className={`font-mono text-[13px] font-medium text-right whitespace-nowrap pt-0.5 ${
                    tx.amount >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {formatCurrency(tx.amount, tx.currency)}
                </div>
              </div>
            ))}
          </div>

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
