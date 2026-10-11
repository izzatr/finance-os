import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Download, LogOut, Plus, Search, Send, Settings2, Trash2, X } from 'lucide-react'
import {
  addSplitGroupMember,
  createSplitInvite,
  deleteSplitGroup,
  getSplitFriends,
  getSplitGroup,
  patchSplitGroup,
  removeSplitGroupMember,
  splitGroupExportUrl,
  type GroupType,
  type SplitGroup,
} from '@/lib/api'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { formatAmount } from '@/lib/split'
import { ExpenseFeed } from '@/components/shared/ExpenseFeed'
import { ExpenseSheet } from '@/components/shared/ExpenseSheet'
import { SettleUpSheet, type SettlePrefill } from '@/components/shared/SettleUpSheet'
import { GROUP_TYPES } from '@/components/shared/SharedDialogs'
import { inviteUrl } from './FriendPage'
import { Dropdown } from '@/components/ui/dropdown'
import { Avatar, ErrorText, Field, FullSheet, MyBalance, Segmented, Switch, dangerButton, fieldClass, primaryButton, secondaryButton } from '@/components/shared/ui'

function MemberBalance({ balances, isMe }: { balances: Array<{ currency: string; amount: string }>; isMe?: boolean }) {
  if (balances.length === 0) return <span className="text-[13px] text-[var(--text-tertiary)]">settled up</span>
  return (
    <span className="flex flex-col items-end text-right">
      {balances.map((b) => {
        const gets = Number(b.amount) > 0
        return (
          <span key={b.currency} className="whitespace-nowrap text-[13px]">
            <span className="text-[var(--text-tertiary)]">{gets ? (isMe ? 'you get back ' : 'gets back ') : isMe ? 'you owe ' : 'owes '}</span>
            <span className={`tabular font-bold ${gets ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{formatAmount(Math.abs(Number(b.amount)), b.currency)}</span>
          </span>
        )
      })}
    </span>
  )
}

function InviteLink({ personId, name }: { personId: string; name: string }) {
  const mutation = useMutation({ mutationFn: () => createSplitInvite(personId) })
  const [copied, setCopied] = useState(false)
  const link = mutation.data ? inviteUrl(mutation.data.data.token) : null
  if (!link) {
    return (
      <span className="grid justify-items-end">
        <button type="button" className="h-9 rounded-full bg-[var(--tint)] px-3 text-[12.5px] font-semibold" onClick={() => mutation.mutate()} disabled={mutation.isPending} aria-label={`Invite ${name}`}>
          <Send className="mr-1 inline size-3.5" />{mutation.isPending ? '…' : 'Invite'}
        </button>
        {mutation.error && <span role="alert" className="text-[12px] text-[var(--negative)]">{mutation.error.message}</span>}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="h-9 rounded-full bg-[var(--ink)] px-3 text-[12.5px] font-semibold text-[var(--cream)]"
      onClick={() => {
        if (typeof navigator.share === 'function') void navigator.share({ title: 'Finance OS', url: link }).catch(() => undefined)
        else void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => undefined)
      }}
      aria-label={`Share invite link for ${name}`}
    >
      {copied ? 'Copied' : 'Share link'}
    </button>
  )
}

function GroupSettingsSheet({ group, open, onClose }: { group: SplitGroup; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const friendsQuery = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends, enabled: open })
  const [name, setName] = useState(group.name)
  const [newGuest, setNewGuest] = useState('')
  const [newGuestEmail, setNewGuestEmail] = useState('')
  const [addFriendId, setAddFriendId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const current = group.members.filter((m) => m.isCurrent)
  const me = current.find((m) => m.isMe)
  const done = () => invalidateShared(qc)
  const patch = useMutation({ mutationFn: (body: { name?: string; groupType?: GroupType; simplifyDebts?: boolean }) => patchSplitGroup(group.id, body), onSuccess: done })
  const addMember = useMutation({
    mutationFn: (body: { personId: string } | { name: string; email?: string | null }) => addSplitGroupMember(group.id, body),
    onSuccess: () => { done(); setNewGuest(''); setNewGuestEmail(''); setAddFriendId('') },
  })
  const removeMember = useMutation({
    mutationFn: (personId: string) => removeSplitGroupMember(group.id, personId),
    onSuccess: (_d, personId) => {
      invalidateShared(qc)
      if (personId === me?.personId) navigate('/shared?tab=groups')
    },
  })
  const del = useMutation({ mutationFn: () => deleteSplitGroup(group.id), onSuccess: () => { invalidateShared(qc); navigate('/shared?tab=groups') } })

  const iAmSettled = (me?.balances.length ?? 0) === 0
  const candidates = (friendsQuery.data?.data ?? []).filter((f) => !current.some((m) => m.personId === f.personId))

  return (
    <FullSheet open={open} onClose={onClose} title="Group settings">
      <div className="grid gap-6 pt-1">
        <div className="flex items-end gap-2">
          <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <button type="button" className={secondaryButton} disabled={!name.trim() || name.trim() === group.name || patch.isPending} onClick={() => patch.mutate({ name: name.trim() })}>Save</button>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Type</span>
          <Segmented label="Group type" value={group.groupType} onChange={(groupType) => patch.mutate({ groupType })} options={GROUP_TYPES} />
        </div>
        <Switch checked={group.simplifyDebts} onChange={(simplifyDebts) => patch.mutate({ simplifyDebts })} label="Simplify group debts" description="Combines debts so fewer payments settle the group." />
        <ErrorText>{patch.error?.message}</ErrorText>

        <section aria-label="Members" className="grid gap-2">
          <h3 className="text-[15px] font-bold">Members</h3>
          <ul>
            {current.map((m) => (
              <li key={m.personId} className="flex min-h-14 items-center gap-3">
                <Avatar name={m.name} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{m.isMe ? 'You' : m.name}</span>
                  <span className="block text-[12.5px] text-[var(--text-tertiary)]">{m.isGuest ? 'Guest' : 'Has an account'}</span>
                </span>
                {m.isGuest && <InviteLink personId={m.personId} name={m.name} />}
                {!m.isMe && (
                  <button type="button" aria-label={`Remove ${m.name}`} disabled={removeMember.isPending} onClick={() => removeMember.mutate(m.personId)} className="flex size-10 items-center justify-center rounded-full active:bg-[var(--tint)]">
                    <X className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <ErrorText>{removeMember.error?.message}</ErrorText>
          {candidates.length > 0 && (
            <div className="flex gap-2">
              <Dropdown aria-label="Add a friend to the group" placeholder="Add a friend" searchable={candidates.length > 8} value={addFriendId} onChange={setAddFriendId} options={candidates.map((f) => ({ value: f.personId, label: f.name }))} />
              <button type="button" className={secondaryButton} disabled={!addFriendId || addMember.isPending} onClick={() => addMember.mutate({ personId: addFriendId })}>Add</button>
            </div>
          )}
          <div className="grid gap-2 rounded-lg bg-[var(--tint)] p-3">
            <span className="text-[13px] font-semibold text-[var(--text-secondary)]">New person</span>
            <input className={fieldClass} value={newGuest} onChange={(e) => setNewGuest(e.target.value)} placeholder="Name" aria-label="New person's name" maxLength={120} />
            <input className={fieldClass} type="email" value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} placeholder="Email (optional)" aria-label="New person's email" maxLength={255} />
            <button type="button" className={secondaryButton + ' bg-white'} disabled={!newGuest.trim() || addMember.isPending} onClick={() => addMember.mutate({ name: newGuest.trim(), email: newGuestEmail.trim() || null })}>
              <Plus className="size-4" /> Add to group
            </button>
          </div>
          <ErrorText>{addMember.error?.message}</ErrorText>
        </section>

        <section aria-label="More" className="grid gap-2">
          <a href={splitGroupExportUrl(group.id)} download className={`${secondaryButton} no-underline`}><Download className="size-4" /> Export as CSV</a>
          <button type="button" className={secondaryButton} disabled={!iAmSettled || removeMember.isPending} onClick={() => me && removeMember.mutate(me.personId)}>
            <LogOut className="size-4" /> Leave group
          </button>
          {!iAmSettled && <p className="text-[12.5px] text-[var(--text-tertiary)]">Settle up before you leave.</p>}
          {!confirmDelete ? (
            <button type="button" className={dangerButton} onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /> Delete group</button>
          ) : (
            <div className="grid gap-2 rounded-lg bg-[var(--tint)] p-3">
              <p className="text-[14px]">Delete {group.name} and its expenses for everyone? You can restore it from Deleted groups.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={secondaryButton + ' bg-white'} onClick={() => setConfirmDelete(false)}>Keep</button>
                <button type="button" className={dangerButton} disabled={del.isPending} onClick={() => del.mutate()}>{del.isPending ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          )}
          <ErrorText>{del.error?.message}</ErrorText>
        </section>
      </div>
    </FullSheet>
  )
}

function SettleSuggestion({ text, onRecord }: { text: string; onRecord: () => void }) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-1">
      <span className="min-w-0 flex-1 text-[14px] [overflow-wrap:anywhere]">{text}</span>
      <button type="button" onClick={onRecord} className="h-9 shrink-0 rounded-full bg-[var(--ink)] px-3.5 text-[12.5px] font-semibold text-[var(--cream)]">Record payment</button>
    </li>
  )
}

export function GroupPage() {
  const { groupId = '' } = useParams()
  const me = useSplitMe().data?.data
  const query = useQuery({ queryKey: splitKeys.group(groupId), queryFn: () => getSplitGroup(groupId) })
  const [adding, setAdding] = useState(false)
  const [settle, setSettle] = useState<SettlePrefill | null>(null)
  const [settings, setSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')

  const group = query.data?.data
  const meMember = group?.members.find((m) => m.isMe)
  const nameOf = (id: string) => {
    const m = group?.members.find((x) => x.personId === id)
    return m?.isMe ? 'You' : m?.name ?? 'Someone'
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-8 lg:pt-8">
      <Link to="/shared?tab=groups" className="-ml-1 mb-2 inline-flex h-10 items-center gap-0.5 text-[14px] font-semibold text-[var(--text-secondary)] no-underline">
        <ChevronLeft className="size-5" /> Groups
      </Link>
      {query.isLoading && <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>}
      {query.error && <ErrorText>{query.error.message}</ErrorText>}
      {group && (
        <>
          <header className="mb-4 flex items-center gap-3">
            <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-[var(--ink)] text-[22px] font-bold text-[var(--cream)]">{group.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.02em]">{group.name}</h1>
              <MyBalance balances={meMember?.balances ?? []} align="left" />
            </div>
            <button type="button" onClick={() => setSettings(true)} aria-label="Group settings" className="flex size-11 items-center justify-center rounded-full active:bg-[var(--tint)]">
              <Settings2 className="size-5" />
            </button>
          </header>

          <div className="mb-6 grid grid-cols-2 gap-2">
            <button type="button" className={primaryButton} onClick={() => setAdding(true)}><Plus className="size-4" /> Expense</button>
            <button type="button" className={`${secondaryButton} h-12`} onClick={() => setSettle({ groupId })} disabled={!me}>Settle up</button>
          </div>

          <section aria-label="Balances" className="mb-6">
            <h2 className="mb-1 text-[18px] font-bold">Balances</h2>
            <ul>
              {group.members.map((m) => (
                <li key={m.personId} className="flex min-h-14 items-center gap-3">
                  <Avatar name={m.name} size={36} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                    {m.isMe ? 'You' : m.name}
                    {!m.isCurrent && <span className="ml-1.5 text-[12.5px] font-medium text-[var(--text-tertiary)]">left</span>}
                  </span>
                  <MemberBalance balances={m.balances} isMe={m.isMe} />
                </li>
              ))}
            </ul>
          </section>

          {group.suggested.length > 0 && (
            <section aria-label="Suggested payments" className="mb-6">
              <h2 className="mb-1 text-[18px] font-bold">Suggested payments</h2>
              <ul>
                {group.suggested.map((s) => (
                  <SettleSuggestion
                    key={`${s.fromPersonId}-${s.toPersonId}-${s.currency}`}
                    text={`${nameOf(s.fromPersonId)} ${s.fromPersonId === meMember?.personId ? 'pay' : 'pays'} ${nameOf(s.toPersonId) === 'You' ? 'you' : nameOf(s.toPersonId)} ${formatAmount(s.amount, s.currency)}`}
                    onRecord={() => setSettle({
                      groupId,
                      fromPersonId: s.fromPersonId,
                      toPersonId: s.toPersonId,
                      currency: s.currency,
                      amount: s.amount,
                      names: Object.fromEntries(group.members.map((m) => [m.personId, m.name])),
                    })}
                  />
                ))}
              </ul>
              {!group.simplifyDebts && group.members.filter((m) => m.isCurrent).length > 2 && <p className="mt-1 text-[12.5px] text-[var(--text-tertiary)]">Turn on Simplify group debts in settings for fewer payments.</p>}
            </section>
          )}

          <section aria-label="Expenses">
            <h2 className="mb-1 text-[18px] font-bold">Expenses</h2>
            <form className="relative mb-1" onSubmit={(e) => { e.preventDefault(); setSubmittedSearch(search.trim()) }} role="search">
              <Search className="pointer-events-none absolute left-3 top-3 size-[18px] text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); if (!e.target.value.trim()) setSubmittedSearch('') }}
                onBlur={() => setSubmittedSearch(search.trim())}
                placeholder="Search this group"
                aria-label="Search expenses"
                className="h-11 w-full rounded-lg bg-[var(--tint)] pl-10 pr-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/20"
              />
            </form>
            <ExpenseFeed groupId={groupId} q={submittedSearch || undefined} mePersonId={me?.personId} emptyLabel="No expenses yet. Add the first one." />
          </section>

          <ExpenseSheet open={adding} mode={{ kind: 'new', groupId }} onClose={() => setAdding(false)} />
          <SettleUpSheet open={settle !== null} onClose={() => setSettle(null)} prefill={settle ?? undefined} />
          {settings && <GroupSettingsSheet key={group.name} group={group} open onClose={() => setSettings(false)} />}
        </>
      )}
    </main>
  )
}
