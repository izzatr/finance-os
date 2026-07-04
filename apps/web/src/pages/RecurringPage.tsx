import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  createRecurringRule,
  deleteRecurringRule,
  getCategories,
  getRecurringRules,
  getWallets,
  patchRecurringRule,
  type RecurringRule,
} from '@/lib/api'

function cadenceLabel(rule: RecurringRule): string {
  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[rule.freq]
  return rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`
}

function CreateRuleDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })
  const categoriesQuery = useQuery({ queryKey: ['category-list'], queryFn: getCategories })

  const [name, setName] = useState('')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [walletId, setWalletId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [freq, setFreq] = useState<RecurringRule['freq']>('monthly')
  const [startAt, setStartAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<RecurringRule['mode']>('draft')
  const [error, setError] = useState<string | null>(null)

  const wallets = walletsQuery.data?.data ?? []
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0]
  const categories = (categoriesQuery.data?.data ?? []).filter((c) => c.type === kind)

  const mutation = useMutation({
    mutationFn: () => {
      if (!wallet) throw new Error('Create a wallet first')
      const value = amount.replace(',', '.')
      if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) throw new Error('Enter an amount greater than zero')
      return createRecurringRule({
        name: name.trim() || 'Recurring transaction',
        template: {
          type: kind,
          description: name.trim() || 'Recurring transaction',
          categoryId: categoryId || undefined,
          entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: kind === 'expense' ? `-${value}` : value }],
        },
        freq,
        interval: 1,
        startAt: new Date(`${startAt}T09:00:00.000Z`).toISOString(),
        endAt: null,
        mode,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-rules'] })
      onClose()
    },
    onError: (err: Error) => setError(err.message),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New recurring transaction</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2.5">
          <Input autoFocus placeholder="Name (e.g. Rent)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          <div className="grid grid-cols-2 gap-2.5">
            <select value={kind} onChange={(e) => { setKind(e.target.value as 'expense' | 'income'); setCategoryId('') }} aria-label="Type" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            <Input inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <select value={wallet?.id ?? ''} onChange={(e) => setWalletId(e.target.value)} aria-label="Wallet" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.currency}</option>)}
            </select>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <select value={freq} onChange={(e) => setFreq(e.target.value as RecurringRule['freq'])} aria-label="Frequency" className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} aria-label="First occurrence" />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={mode === 'auto_post'}
              onChange={(e) => setMode(e.target.checked ? 'auto_post' : 'draft')}
            />
            Book automatically (otherwise each occurrence waits in your inbox)
          </label>
          {error && <p className="text-xs text-[var(--negative)]" role="alert">{error}</p>}
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create rule'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Two-tap delete: first tap arms, second confirms. Disarms after 3s. */
function DeleteRuleButton({ name, onDelete }: { name: string; onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      onClick={() => {
        if (armed) { onDelete(); setArmed(false) }
        else { setArmed(true); setTimeout(() => setArmed(false), 3000) }
      }}
      aria-label={armed ? `Confirm delete ${name}` : `Delete ${name}`}
      className={`flex items-center gap-1 text-xs transition-colors ${
        armed ? 'font-semibold text-[var(--negative)]' : 'text-[var(--text-tertiary)] hover:text-[var(--negative)]'
      }`}
    >
      <Trash2 className="size-4" />
      {armed && 'Sure?'}
    </button>
  )
}

export function RecurringPage() {
  const qc = useQueryClient()
  const rulesQuery = useQuery({ queryKey: ['recurring-rules'], queryFn: getRecurringRules })
  const [creating, setCreating] = useState(false)

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => patchRecurringRule(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-rules'] }),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteRecurringRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-rules'] }),
  })

  const rules = rulesQuery.data?.data ?? []

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 lg:px-8">
      <header className="flex items-center justify-between pb-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Recurring</h1>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New rule
        </Button>
      </header>

      {rules.length === 0 && !rulesQuery.isLoading && (
        <div className="rounded-xl bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <CalendarClock className="mx-auto size-8 text-[var(--text-tertiary)]" />
          <p className="pt-3 text-sm font-medium text-[var(--text-primary)]">Automate the predictable</p>
          <p className="pt-1 text-xs text-[var(--text-tertiary)]">
            Rent, salary, subscriptions — set them once. Draft mode sends each occurrence to your inbox for approval.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        {rules.map((rule) => {
          const amount = rule.template.entries[0]?.amount ?? ''
          return (
            <div key={rule.id} className={`rounded-xl bg-white px-4 py-3 shadow-[var(--shadow-card)] ${rule.isActive ? '' : 'opacity-60'}`}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{rule.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      rule.mode === 'auto_post'
                        ? 'bg-[color-mix(in_srgb,var(--positive)_12%,white)] text-[var(--positive)]'
                        : 'bg-[var(--accent-dim)] text-[var(--accent-blue)]'
                    }`}>
                      {rule.mode === 'auto_post' ? 'Auto' : 'Inbox'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {cadenceLabel(rule)} · next {new Date(rule.nextRunAt).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">{amount}</span>
                <label className="flex items-center" aria-label={`${rule.name} active`}>
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={(e) => toggle.mutate({ id: rule.id, isActive: e.target.checked })}
                  />
                </label>
                <DeleteRuleButton name={rule.name} onDelete={() => remove.mutate(rule.id)} />
              </div>
            </div>
          )
        })}
      </div>

      {creating && <CreateRuleDialog onClose={() => setCreating(false)} />}
    </div>
  )
}
