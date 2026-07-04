import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createPerson,
  getSharedBalances,
  getPeople,
  getWallets,
  settlePerson,
  type Person,
  type SharedBalance,
} from '@/lib/api'

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function BalanceChips({ balances }: { balances: SharedBalance['balances'] }) {
  if (balances.length === 0) {
    return <span className="text-xs text-[var(--text-tertiary)]">Settled up</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {balances.map((b) => (
        <span
          key={b.assetCode}
          className={`rounded-full px-2 py-0.5 font-mono text-xs font-semibold tabular-nums ${
            b.amount >= 0
              ? 'bg-[color-mix(in_srgb,var(--positive)_12%,white)] text-[var(--positive)]'
              : 'bg-[color-mix(in_srgb,var(--negative)_12%,white)] text-[var(--negative)]'
          }`}
        >
          {b.amount >= 0 ? 'owes you ' : 'you owe '}
          {formatAmount(Math.abs(b.amount), b.assetCode)}
        </span>
      ))}
    </div>
  )
}

function SettleDialog({ person, balance, onClose }: { person: Person; balance: SharedBalance | undefined; onClose: () => void }) {
  const qc = useQueryClient()
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const [assetCode, setAssetCode] = useState(balance?.balances[0]?.assetCode ?? '')
  const [walletId, setWalletId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const candidates = (walletsQuery.data?.data ?? []).filter((w) => w.currency === assetCode)
  const owed = balance?.balances.find((b) => b.assetCode === assetCode)?.amount ?? 0

  const mutation = useMutation({
    mutationFn: () => {
      const wallet = candidates.find((w) => w.id === walletId) ?? candidates[0]
      if (!wallet) throw new Error('Pick a wallet in the matching currency')
      return settlePerson(person.id, { walletId: wallet.id, assetId: wallet.assetId })
    },
    onSuccess: () => {
      for (const key of ['shared-balances', 'people', 'wallets', 'recent', 'transactions', 'dashboard', 'summary', 'net-worth']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Settle with {person.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {balance && balance.balances.length > 1 && (
            <select
              value={assetCode}
              onChange={(e) => { setAssetCode(e.target.value); setWalletId('') }}
              aria-label="Currency"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {balance.balances.map((b) => (
                <option key={b.assetCode} value={b.assetCode}>{b.assetCode}</option>
              ))}
            </select>
          )}
          <p className="text-sm text-[var(--text-secondary)]">
            {owed >= 0 ? `${person.name} owes you ` : `You owe ${person.name} `}
            <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
              {formatAmount(Math.abs(owed), assetCode || 'EUR')}
            </span>
            . Settling books a transfer into the wallet you pick and clears the balance.
          </p>
          <select
            value={walletId || candidates[0]?.id || ''}
            onChange={(e) => setWalletId(e.target.value)}
            aria-label="Into wallet"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {candidates.length === 0 && <option value="">No wallet in {assetCode}</option>}
            {candidates.map((w) => (
              <option key={w.id} value={w.id}>{w.name} · {w.currency}</option>
            ))}
          </select>
          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || candidates.length === 0}>
            {mutation.isPending ? 'Settling…' : 'Settle up'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AddPersonDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () => createPerson({ name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['people'] })
      qc.invalidateQueries({ queryKey: ['shared-balances'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add person</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) mutation.mutate() }}
            aria-label="Name"
          />
          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? 'Adding…' : 'Add person'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PeoplePage() {
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: getPeople })
  const balancesQuery = useQuery({ queryKey: ['shared-balances'], queryFn: getSharedBalances })
  const [adding, setAdding] = useState(false)
  const [settling, setSettling] = useState<Person | null>(null)

  const people = peopleQuery.data?.data ?? []
  const balanceByPerson = new Map((balancesQuery.data?.data ?? []).map((b) => [b.personId, b]))

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">People</h1>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add
        </Button>
      </header>

      {people.length === 0 && !peopleQuery.isLoading && (
        <div className="rounded-xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <UserRound className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-sm font-medium text-[var(--text-primary)]">Track shared expenses</p>
          <p className="pt-1 text-xs text-[var(--text-tertiary)]">
            Add the people you split costs with. When you log an expense, tap “Split with someone” — balances show up here.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        {people.map((p) => {
          const balance = balanceByPerson.get(p.id)
          const hasBalance = (balance?.balances.length ?? 0) > 0
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-[var(--shadow-card)]">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)] text-sm font-semibold text-[var(--accent-blue)]">
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                <BalanceChips balances={balance?.balances ?? []} />
              </div>
              {hasBalance && (
                <Button size="sm" variant="outline" onClick={() => setSettling(p)}>
                  Settle
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {adding && <AddPersonDialog onClose={() => setAdding(false)} />}
      {settling && (
        <SettleDialog person={settling} balance={balanceByPerson.get(settling.id)} onClose={() => setSettling(null)} />
      )}
    </div>
  )
}
