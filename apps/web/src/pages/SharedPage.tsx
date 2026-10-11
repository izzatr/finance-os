import { GroupIcon } from '@/lib/icons'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Settings2, UserPlus, Users } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { getDeletedSplitGroups, getSplitFriends, getSplitGroups, restoreSplitGroup, type Money } from '@/lib/api'
import { invalidateShared, splitKeys, useSplitMe } from '@/hooks/use-split'
import { formatAmount } from '@/lib/split'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import { AddFriendDialog, CreateGroupSheet, GROUP_TYPES, SharedSettingsSheet } from '@/components/shared/SharedDialogs'
import { ExpenseSheet } from '@/components/shared/ExpenseSheet'
import { SettleUpSheet } from '@/components/shared/SettleUpSheet'
import { Avatar, EmptyState, ErrorText, FriendBalance, MyBalance, secondaryButton } from '@/components/shared/ui'

type Tab = 'friends' | 'groups' | 'activity'

function Totals({ owedToMe, iOwe }: { owedToMe: Money[]; iOwe: Money[] }) {
  if (owedToMe.length === 0 && iOwe.length === 0) {
    return <p className="text-[17px] font-bold text-[var(--text-primary)]">You are all settled up</p>
  }
  return (
    <dl className="grid grid-cols-2 gap-2.5">
      <div className="min-w-0 rounded-lg bg-[var(--tint)] px-3.5 py-3">
        <dt className="text-[12.5px] font-semibold text-[var(--text-tertiary)]">You are owed</dt>
        <dd className="mt-0.5">
          {owedToMe.length === 0 ? <span className="text-[17px] font-bold">0</span> : owedToMe.map((m) => (
            <span key={m.currency} className="tabular block truncate text-[18px] font-bold text-[var(--positive)]">{formatAmount(m.amount, m.currency)}</span>
          ))}
        </dd>
      </div>
      <div className="min-w-0 rounded-lg bg-[var(--tint)] px-3.5 py-3">
        <dt className="text-[12.5px] font-semibold text-[var(--text-tertiary)]">You owe</dt>
        <dd className="mt-0.5">
          {iOwe.length === 0 ? <span className="text-[17px] font-bold">0</span> : iOwe.map((m) => (
            <span key={m.currency} className="tabular block truncate text-[18px] font-bold text-[var(--negative)]">{formatAmount(m.amount, m.currency)}</span>
          ))}
        </dd>
      </div>
    </dl>
  )
}

function FriendsTab({ onAdd }: { onAdd: () => void }) {
  const query = useQuery({ queryKey: splitKeys.friends, queryFn: getSplitFriends })
  const [showSettled, setShowSettled] = useState(false)
  if (query.isLoading) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>
  if (query.error) return <ErrorText>{query.error.message}</ErrorText>
  const friends = query.data?.data ?? []
  // The server sorts by biggest open balance; settled friends fold away below.
  const open = friends.filter((f) => f.balances.length > 0)
  const settled = friends.filter((f) => f.balances.length === 0)
  const row = (f: (typeof friends)[number]) => (
    <li key={f.personId}>
      <Link to={`/shared/friends/${f.personId}`} className="flex min-h-16 items-center gap-3 rounded-lg py-2 text-[var(--text-primary)] no-underline active:bg-[var(--tint)]">
        <Avatar name={f.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{f.name}</span>
          {f.isGuest && <span className="block text-[12.5px] text-[var(--text-tertiary)]">Guest{f.isFriend ? '' : ' · via a group'}</span>}
        </span>
        <FriendBalance balances={f.balances} compact total={f.totalInDefault} />
      </Link>
    </li>
  )
  return (
    <div className="grid gap-3">
      {friends.length === 0 ? (
        <EmptyState title="No friends yet">Add the people you split costs with.</EmptyState>
      ) : (
        <>
          {open.length > 0 && <ul>{open.map(row)}</ul>}
          {settled.length > 0 && (
            <section aria-label="Settled up">
              <button
                type="button"
                aria-expanded={showSettled}
                onClick={() => setShowSettled((v) => !v)}
                className="flex w-full items-center justify-between py-2 text-[13px] font-semibold text-[var(--text-tertiary)]"
              >
                <span>Settled up · {settled.length}</span>
                <span>{showSettled ? 'Hide' : 'Show'}</span>
              </button>
              {showSettled && <ul>{settled.map(row)}</ul>}
            </section>
          )}
        </>
      )}
      <button type="button" className={secondaryButton} onClick={onAdd}><UserPlus className="size-4" /> Add friend</button>
    </div>
  )
}

function GroupsTab({ onCreate }: { onCreate: () => void }) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: splitKeys.groups, queryFn: getSplitGroups })
  const [showDeleted, setShowDeleted] = useState(false)
  const deletedQuery = useQuery({ queryKey: splitKeys.deletedGroups, queryFn: getDeletedSplitGroups, enabled: showDeleted })
  const restore = useMutation({ mutationFn: restoreSplitGroup, onSuccess: () => invalidateShared(qc) })
  if (query.isLoading) return <p className="py-10 text-center text-sm text-[var(--text-tertiary)]">Loading…</p>
  if (query.error) return <ErrorText>{query.error.message}</ErrorText>
  const groups = query.data?.data ?? []
  return (
    <div className="grid gap-3">
      {groups.length === 0 ? (
        <EmptyState title="No groups yet">A group keeps a flat, a trip or a couple's costs together.</EmptyState>
      ) : (
        <ul>
          {groups.map((g) => (
            <li key={g.id}>
              <Link to={`/shared/groups/${g.id}`} className="flex min-h-16 items-center gap-3 rounded-lg py-2 text-[var(--text-primary)] no-underline active:bg-[var(--tint)]">
                <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--ink)] text-[15px] font-bold text-[var(--cream)]"><GroupIcon group={g} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{g.name}</span>
                  <span className="block text-[12.5px] text-[var(--text-tertiary)]">{GROUP_TYPES.find((t) => t.value === g.groupType)?.label} · {g.memberCount} {g.memberCount === 1 ? 'person' : 'people'}</span>
                </span>
                <MyBalance balances={g.myBalances} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={secondaryButton} onClick={onCreate}><Users className="size-4" /> New group</button>
      <button type="button" onClick={() => setShowDeleted((v) => !v)} aria-expanded={showDeleted} className="h-10 text-[13px] font-semibold text-[var(--text-secondary)]">
        {showDeleted ? 'Hide deleted groups' : 'Deleted groups'}
      </button>
      {showDeleted && (
        <div className="grid gap-1">
          {deletedQuery.isLoading && <p className="text-center text-sm text-[var(--text-tertiary)]">Loading…</p>}
          {deletedQuery.data?.data.length === 0 && <p className="text-center text-[13px] text-[var(--text-tertiary)]">No deleted groups.</p>}
          {deletedQuery.data?.data.map((g) => (
            <div key={g.id} className="flex min-h-12 items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-[var(--text-secondary)]">{g.name}</span>
              <button type="button" className={secondaryButton} disabled={restore.isPending} onClick={() => restore.mutate(g.id)}>Restore</button>
            </div>
          ))}
          <ErrorText>{restore.error?.message}</ErrorText>
        </div>
      )}
    </div>
  )
}

export function SharedPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = (['friends', 'groups', 'activity'].includes(params.get('tab') ?? '') ? params.get('tab') : 'friends') as Tab
  const meQuery = useSplitMe()
  const me = meQuery.data?.data
  const [adding, setAdding] = useState(false)
  const [addingFriend, setAddingFriend] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [settling, setSettling] = useState(false)
  const [settings, setSettings] = useState(false)
  const unread = me?.unreadActivity ?? 0

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)] lg:px-8 lg:pt-8">
      <PageHeader
        title="Shared"
        className="mb-4"
        action={
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setSettings(true)} disabled={!me} aria-label="Shared settings" className="flex size-10 items-center justify-center rounded-full text-[var(--text-secondary)] active:bg-[var(--tint)]">
              <Settings2 className="size-5" />
            </button>
            <button type="button" onClick={() => setAdding(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3.5 text-[14px] font-bold text-[var(--cream)]">
              <Plus className="size-4" strokeWidth={2.6} /> Expense
            </button>
          </div>
        }
      />

      <section aria-label="Balances" className="mb-5">
        {meQuery.isLoading && <p className="text-sm text-[var(--text-tertiary)]">Loading…</p>}
        {meQuery.error && <ErrorText>{meQuery.error.message}</ErrorText>}
        {me && <Totals owedToMe={me.balances.owedToMe} iOwe={me.balances.iOwe} />}
        {me && (me.balances.owedToMe.length > 0 || me.balances.iOwe.length > 0) && (
          <button type="button" onClick={() => setSettling(true)} className={`${secondaryButton} mt-2.5 w-full`}>Settle up</button>
        )}
      </section>

      <div role="tablist" aria-label="Shared sections" className="sticky top-0 z-10 -mx-4 mb-3 flex gap-1.5 bg-[var(--bg-base)] px-4 py-2 lg:-mx-8 lg:px-8">
        {(['friends', 'groups', 'activity'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'friends' ? {} : { tab: t }, { replace: true })}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold capitalize ${tab === t ? 'bg-[var(--ink)] text-[var(--cream)]' : 'bg-[var(--tint)] text-[var(--text-secondary)]'}`}
          >
            {t}
            {t === 'activity' && unread > 0 && (
              <span aria-label={`${unread} new`} className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--negative)] px-1.5 text-[11px] font-bold text-white">{unread}</span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === 'friends' && <FriendsTab onAdd={() => setAddingFriend(true)} />}
        {tab === 'groups' && <GroupsTab onCreate={() => setCreatingGroup(true)} />}
        {tab === 'activity' && <ActivityFeed />}
      </div>

      <ExpenseSheet open={adding} mode={{ kind: 'new' }} onClose={() => setAdding(false)} onSaved={(id) => navigate(`/shared/expenses/${id}`)} />
      <AddFriendDialog open={addingFriend} onClose={() => setAddingFriend(false)} />
      <CreateGroupSheet open={creatingGroup} onClose={() => setCreatingGroup(false)} onCreated={(id) => { setCreatingGroup(false); navigate(`/shared/groups/${id}`) }} />
      <SettleUpSheet open={settling} onClose={() => setSettling(false)} />
      {me && <SharedSettingsSheet key={`${me.defaultCurrency}:${me.booksStart}`} open={settings} onClose={() => setSettings(false)} me={me} />}
    </main>
  )
}
