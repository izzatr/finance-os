import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Copy, Ellipsis, Pencil, Plus, Send, Share2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createSplitInvite, getSplitFriend, patchSplitFriend, removeSplitFriend, type SplitFriendDetail } from '@/lib/api'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { ExpenseFeed } from '@/components/shared/ExpenseFeed'
import { ExpenseSheet } from '@/components/shared/ExpenseSheet'
import { SettleUpSheet } from '@/components/shared/SettleUpSheet'
import { Avatar, ErrorText, Field, FriendBalance, dangerButton, fieldClass, primaryButton, secondaryButton } from '@/components/shared/ui'

const dialogClass = 'rounded-t-lg sm:rounded-lg sm:max-w-md'

export function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`
}

function InviteDialog({ friend, open, onClose }: { friend: SplitFriendDetail; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const mutation = useMutation({ mutationFn: () => createSplitInvite(friend.personId) })
  const link = mutation.data ? inviteUrl(mutation.data.data.token) : null
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { mutation.reset(); setCopied(false); onClose() } }}>
      <DialogContent className={dialogClass}>
        <DialogHeader>
          <DialogTitle>Invite {friend.name}</DialogTitle>
          <DialogDescription>They get their own account and keep everything you shared so far. The link works once and lasts 14 days.</DialogDescription>
        </DialogHeader>
        {!link ? (
          <>
            <ErrorText>{mutation.error?.message}</ErrorText>
            <button type="button" className={primaryButton} disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              <Send className="size-4" /> {mutation.isPending ? 'Creating link…' : 'Create invite link'}
            </button>
          </>
        ) : (
          <div className="grid gap-2.5">
            <input readOnly value={link} aria-label="Invite link" className={`${fieldClass} text-[13px]`} onFocus={(e) => e.currentTarget.select()} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={secondaryButton} onClick={() => void copy()}><Copy className="size-4" /> {copied ? 'Copied' : 'Copy'}</button>
              {canShare && (
                <button type="button" className={secondaryButton} onClick={() => void navigator.share({ title: 'Finance OS', text: `Join me on Finance OS to split expenses`, url: link }).catch(() => undefined)}>
                  <Share2 className="size-4" /> Share
                </button>
              )}
            </div>
            <p className="text-[12.5px] text-[var(--text-tertiary)]">Creating a new link replaces older ones.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function EditGuestDialog({ friend, open, onClose }: { friend: SplitFriendDetail; open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(friend.name)
  const [email, setEmail] = useState(friend.email ?? '')
  const mutation = useMutation({
    mutationFn: () => patchSplitFriend(friend.personId, { name: name.trim(), email: email.trim() || null }),
    onSuccess: () => { invalidateShared(qc); onClose() },
  })
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className={dialogClass}>
        <DialogHeader><DialogTitle>Edit {friend.name}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
          <Field label="Name"><input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field label="Email (optional)"><input className={fieldClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} /></Field>
          <ErrorText>{mutation.error?.message}</ErrorText>
          <button type="submit" className={primaryButton} disabled={!name.trim() || mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FriendPage() {
  const { friendId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const me = useSplitMe().data?.data
  const query = useQuery({ queryKey: splitKeys.friend(friendId), queryFn: () => getSplitFriend(friendId) })
  const [adding, setAdding] = useState(false)
  const [settling, setSettling] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const remove = useMutation({
    mutationFn: () => removeSplitFriend(friendId),
    onSuccess: () => { invalidateShared(qc); navigate('/shared') },
  })

  const friend = query.data?.data

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-8 lg:pt-8">
      <Link to="/shared" className="-ml-1 mb-2 inline-flex h-10 items-center gap-0.5 text-[14px] font-semibold text-[var(--text-secondary)] no-underline">
        <ChevronLeft className="size-5" /> Shared
      </Link>
      {query.isLoading && <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>}
      {query.error && <ErrorText>{query.error.message}</ErrorText>}
      {friend && (
        <>
          <header className="mb-5 flex items-center gap-3.5">
            <Avatar name={friend.name} size={56} tone="ink" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[26px] font-bold leading-tight tracking-[-0.02em]">{friend.name}</h1>
              <p className="text-[13.5px] text-[var(--text-tertiary)]">{friend.isGuest ? (friend.email ? `Guest · ${friend.email}` : 'Guest') : 'Has an account'}</p>
            </div>
            {(friend.canEdit || friend.isFriend) && (
              <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                <PopoverTrigger aria-label={`More options for ${friend.name}`} className="flex size-10 shrink-0 items-center justify-center rounded-full outline-none hover:bg-[var(--tint)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/20 data-[popup-open]:bg-[var(--tint)]">
                  <Ellipsis className="size-5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 gap-0 bg-white p-1 text-[15px] text-[var(--text-primary)]">
                  {friend.canEdit && (
                    <button type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left hover:bg-[var(--tint)]" onClick={() => { setMenuOpen(false); setEditing(true) }}>
                      <Pencil className="size-4" /> Edit details
                    </button>
                  )}
                  {friend.isFriend && (
                    <button type="button" className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[var(--negative)] hover:bg-[var(--tint)]" onClick={() => { setMenuOpen(false); remove.reset(); setConfirmRemove(true) }}>
                      <Trash2 className="size-4" /> Remove friend
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </header>

          <section aria-label="Balance" className="mb-5 rounded-lg bg-[var(--tint)] px-4 py-3.5">
            {friend.balances.length === 0 ? (
              <p className="text-[16px] font-bold">You are settled up</p>
            ) : (
              <div className="text-[16px]"><FriendBalance balances={friend.balances} align="left" /></div>
            )}
            {friend.breakdown.length > 1 || (friend.breakdown.length === 1 && friend.breakdown[0].groupId) ? (
              <ul className="mt-2.5 grid gap-1.5 border-t border-[var(--border-medium)] pt-2.5">
                {friend.breakdown.map((b) => (
                  <li key={b.groupId ?? 'none'} className="flex items-start justify-between gap-3 text-[13.5px]">
                    {b.groupId ? <Link to={`/shared/groups/${b.groupId}`} className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{b.groupName}</Link> : <span className="font-semibold">Outside groups</span>}
                    <FriendBalance balances={b.balances} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="mb-6 grid grid-cols-2 gap-2">
            <button type="button" className={primaryButton} onClick={() => setSettling(true)} disabled={!me}>Settle up</button>
            <button type="button" className={`${secondaryButton} h-12`} onClick={() => setAdding(true)} disabled={!friend.isFriend}><Plus className="size-4" /> Expense</button>
            {friend.isGuest && (
              <button type="button" className={`${secondaryButton} col-span-2`} onClick={() => setInviting(true)}><Send className="size-4" /> Invite {friend.name}</button>
            )}
          </div>

          <h2 className="text-[18px] font-bold">Expenses</h2>
          <ExpenseFeed friendId={friendId} mePersonId={me?.personId} emptyLabel="Nothing shared with this friend yet." />

          <Dialog open={confirmRemove} onOpenChange={(open) => { if (!open && !remove.isPending) setConfirmRemove(false) }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Remove {friend.name}?</DialogTitle>
                <DialogDescription>Shared history stays. You need to be settled up first.</DialogDescription>
              </DialogHeader>
              <ErrorText>{remove.error?.message}</ErrorText>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={secondaryButton} onClick={() => setConfirmRemove(false)}>Keep</button>
                <button type="button" className={dangerButton} disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? 'Removing…' : 'Remove'}</button>
              </div>
            </DialogContent>
          </Dialog>

          <ExpenseSheet open={adding} mode={{ kind: 'new', friendIds: [friendId] }} onClose={() => setAdding(false)} />
          <SettleUpSheet open={settling} onClose={() => setSettling(false)} prefill={{ friendId }} />
          <InviteDialog friend={friend} open={inviting} onClose={() => setInviting(false)} />
          {editing && <EditGuestDialog friend={friend} open onClose={() => setEditing(false)} />}
        </>
      )}
    </main>
  )
}
