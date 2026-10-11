import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  addSplitFriend,
  addSplitGroupMember,
  adoptFriendsWallet,
  createSplitGroup,
  getAssets,
  getSplitFriends,
  getWallets,
  isFriendsWallet,
  patchSplitMe,
  type GroupType,
  type SplitMe,
} from '@/lib/api'
import { invalidateShared, splitKeys } from '@/hooks/use-split'
import { Avatar, ErrorText, Field, FullSheet, Segmented, Switch, fieldClass, primaryButton, secondaryButton } from './ui'
import { Dropdown } from '@/components/ui/dropdown'
import { DateField, DropdownField } from './DropdownField'
import { keyFromDate } from '@/components/ui/date-picker'
import { currencyDropdown } from './ExpenseSheet'

const dialogClass = 'rounded-t-lg sm:rounded-lg sm:max-w-md'

export const GROUP_TYPES: Array<{ value: GroupType; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'trip', label: 'Trip' },
  { value: 'couple', label: 'Couple' },
  { value: 'other', label: 'Other' },
]

export function AddFriendDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (id: string) => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationFn: () => addSplitFriend({ name: name.trim(), email: email.trim() || null }),
    onSuccess: (res) => {
      invalidateShared(qc)
      setName('')
      setEmail('')
      onAdded?.(res.data.id)
      onClose()
    },
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { mutation.reset(); onClose() } }}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle>Add a friend</DialogTitle>
          <DialogDescription>They join as a guest. Send them an invite later if they want their own account.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutation.mutate() }}>
          <Field label="Name">
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
          </Field>
          <Field label="Email (optional)">
            <input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </Field>
          <ErrorText>{mutation.error?.message}</ErrorText>
          <button type="submit" className={primaryButton} disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? 'Adding…' : 'Add friend'}</button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CreateGroupSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient()
  const friendsQuery = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends, enabled: open })
  const [name, setName] = useState('')
  const [groupType, setGroupType] = useState<GroupType>('home')
  const [simplify, setSimplify] = useState(true)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [guests, setGuests] = useState<string[]>([])
  const [guestName, setGuestName] = useState('')

  function reset() {
    setName(''); setGroupType('home'); setSimplify(true); setMemberIds([]); setGuests([]); setGuestName('')
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await createSplitGroup({ name: name.trim(), groupType, simplifyDebts: simplify, memberIds })
      for (const g of guests) await addSplitGroupMember(data.id, { name: g })
      return data.id
    },
    onSuccess: (id) => {
      invalidateShared(qc)
      reset()
      onCreated(id)
    },
  })

  function addGuest() {
    const n = guestName.trim()
    if (!n) return
    setGuests((g) => [...g, n])
    setGuestName('')
  }

  const friends = (friendsQuery.data?.data ?? []).filter((f) => f.isFriend)
  return (
    <FullSheet
      open={open}
      onClose={() => { reset(); mutation.reset(); onClose() }}
      title="New group"
      footer={
        <div className="grid gap-2">
          <ErrorText>{mutation.error?.message}</ErrorText>
          <button type="button" className={primaryButton} disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Creating…' : 'Create group'}
          </button>
        </div>
      }
    >
      <div className="grid gap-5 pt-1">
        <Field label="Group name">
          <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Flat, Lisbon trip" />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Type</span>
          <Segmented label="Group type" value={groupType} onChange={setGroupType} options={GROUP_TYPES} />
        </div>
        <Switch checked={simplify} onChange={setSimplify} label="Simplify group debts" description="Fewer payments to settle up. Nobody ends up owing more in total." />
        <section aria-label="Members" className="grid gap-2">
          <h3 className="text-[13px] font-semibold text-[var(--text-secondary)]">Members</h3>
          {friends.length === 0 && guests.length === 0 && <p className="text-[13.5px] text-[var(--text-tertiary)]">Add people below. You are in it already.</p>}
          <ul className="grid gap-1">
            {friends.map((f) => {
              const on = memberIds.includes(f.personId)
              return (
                <li key={f.personId}>
                  <label className="flex min-h-12 items-center gap-3 px-1">
                    <Avatar name={f.name} size={34} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{f.name}</span>
                    <input type="checkbox" checked={on} onChange={() => setMemberIds((m) => (on ? m.filter((x) => x !== f.personId) : [...m, f.personId]))} className="size-5 accent-[var(--ink)]" aria-label={`Add ${f.name}`} />
                  </label>
                </li>
              )
            })}
            {guests.map((g, i) => (
              <li key={`${g}-${i}`} className="flex min-h-12 items-center gap-3 px-1">
                <Avatar name={g} size={34} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{g} <span className="text-[12.5px] font-medium text-[var(--text-tertiary)]">new guest</span></span>
                <button type="button" aria-label={`Remove ${g}`} onClick={() => setGuests((x) => x.filter((_, j) => j !== i))} className="flex size-10 items-center justify-center rounded-full active:bg-[var(--tint)]">
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={fieldClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }} placeholder="New person's name" aria-label="New person's name" maxLength={120} />
            <button type="button" className={secondaryButton} onClick={addGuest} disabled={!guestName.trim()} aria-label="Add new person"><Plus className="size-4" /> Add</button>
          </div>
        </section>
      </div>
    </FullSheet>
  )
}

const BEGINNING = '1971-01-01'

/** Default currency, when shared expenses start counting in my books, and adopting an old wallet. */
export function SharedSettingsSheet({ open, onClose, me }: { open: boolean; onClose: () => void; me: SplitMe }) {
  const qc = useQueryClient()
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets, enabled: open })
  const assetsQuery = useQuery({ queryKey: ['assets'], queryFn: getAssets, enabled: open, staleTime: 5 * 60_000 })
  const startsAtBeginning = me.booksStart.slice(0, 10) < BEGINNING
  const [currency, setCurrency] = useState(me.defaultCurrency)
  const [fromStart, setFromStart] = useState(startsAtBeginning)
  const [booksStart, setBooksStart] = useState(startsAtBeginning ? '' : me.booksStart.slice(0, 10))
  const [adoptId, setAdoptId] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  const wallets = walletsQuery.data?.data ?? []
  const friendsCurrencies = new Set(wallets.filter(isFriendsWallet).map((w) => w.currency))
  const adoptable = wallets.filter((w) => !isFriendsWallet(w) && w.isActive && !w.unit && !friendsCurrencies.has(w.currency) && w.walletType !== 'investment')
  const currencies = [...new Set([me.defaultCurrency, ...(assetsQuery.data?.data ?? []).filter((a) => a.type === 'currency').map((a) => a.code)])]

  const save = useMutation({
    mutationFn: async () => {
      const body: { defaultCurrency?: string; booksStart?: string } = {}
      if (currency !== me.defaultCurrency) body.defaultCurrency = currency
      const nextStart = fromStart ? '1970-01-01' : booksStart
      if (!fromStart && !/^\d{4}-\d{2}-\d{2}$/.test(booksStart)) throw new Error('Pick a start date')
      if (nextStart !== me.booksStart.slice(0, 10)) body.booksStart = new Date(`${nextStart}T00:00:00.000Z`).toISOString()
      if (Object.keys(body).length) await patchSplitMe(body)
    },
    onSuccess: () => { invalidateShared(qc); setSaved('Saved') },
  })
  const adopt = useMutation({
    mutationFn: () => adoptFriendsWallet(adoptId),
    onSuccess: () => { invalidateShared(qc); setAdoptId(''); setSaved('That wallet now holds your balances with friends') },
  })

  return (
    <FullSheet open={open} onClose={() => { setSaved(null); save.reset(); adopt.reset(); onClose() }} title="Shared settings"
      footer={
        <div className="grid gap-2">
          <ErrorText>{save.error?.message}</ErrorText>
          {saved && <p className="text-[13px] font-medium text-[var(--positive)]" role="status">{saved}</p>}
          <button type="button" className={primaryButton} disabled={save.isPending} onClick={() => { setSaved(null); save.mutate() }}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      }
    >
      <div className="grid gap-6 pt-1">
        <DropdownField label="Default currency" hint="Used for new expenses." searchable value={currency} onChange={setCurrency} options={currencyDropdown(currencies)} />
        <div className="grid gap-2">
          <Switch checked={fromStart} onChange={setFromStart} label="Count everything in my books" description="Shared expenses before the start date become one opening balance instead of spending." />
          {!fromStart && (
            <DateField label="Books start" value={booksStart || keyFromDate(new Date())} onChange={setBooksStart} />
          )}
        </div>
        <section aria-label="Use an existing wallet" className="grid gap-2">
          <h3 className="text-[15px] font-bold">Use an existing wallet</h3>
          <p className="text-[13.5px] text-[var(--text-secondary)]">Kept a wallet like "Splitwise €" by hand? Turn it into your Friends wallet for its currency. Its history stays.</p>
          {adoptable.length === 0 ? (
            <p className="text-[13px] text-[var(--text-tertiary)]">No wallet to convert: every currency already has a Friends wallet.</p>
          ) : (
            <div className="flex gap-2">
              <Dropdown aria-label="Wallet to convert" placeholder="Pick a wallet" value={adoptId} onChange={setAdoptId} options={adoptable.map((w) => ({ value: w.id, label: w.name, hint: w.currency }))} />
              <button type="button" className={secondaryButton} disabled={!adoptId || adopt.isPending} onClick={() => { setSaved(null); adopt.mutate() }}>
                {adopt.isPending ? 'Converting…' : 'Convert'}
              </button>
            </div>
          )}
          <ErrorText>{adopt.error?.message}</ErrorText>
        </section>
      </div>
    </FullSheet>
  )
}
