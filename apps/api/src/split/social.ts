import {
  db,
  assets,
  splitExpenseDebts,
  splitExpenseShares,
  splitExpenses,
  splitFriendships,
  splitGroupMembers,
  splitGroups,
  splitPersons,
} from '@finance-os/db'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import {
  currentMemberIds,
  ensureFriendships,
  friendIds,
  isConnected,
  lockKeys,
  memberGroup,
  notFound,
  pairOf,
  personsById,
  SplitError,
  type Dbx,
  type Me,
  type Tx,
} from './core'
import { convertAmount, getLatestRates } from '../lib/fx'
import { fromMinor, netPairs, simplifyDebts, toMinor, type Transfer } from './math'
import { nextRepeatAfter, rebuildDebtsForExpense, recordActivity, syncBooksFor, trimDecimal, type RepeatInterval } from './expenses'
import { booksLockKey } from './books'

type AssetInfo = { code: string; precision: number }

async function assetMap(ids: string[]): Promise<Map<string, AssetInfo>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select({ id: assets.id, code: assets.code, precision: assets.precision }).from(assets).where(inArray(assets.id, [...new Set(ids)]))
  return new Map(rows.map((r) => [r.id, { code: r.code, precision: r.precision }]))
}

const minor = (v: string, p: number) => toMinor(trimDecimal(v), p)

/** Per group and currency: each member's net (paid - owed) over live expenses. */
async function groupNets(dbx: Dbx, groupIds: string[]) {
  if (groupIds.length === 0) return [] as Array<{ groupId: string; personId: string; assetId: string; net: string }>
  return dbx.select({
    groupId: sql<string>`${splitExpenses.groupId}`,
    personId: splitExpenseShares.personId,
    assetId: splitExpenses.assetId,
    net: sql<string>`sum(${splitExpenseShares.paidShare} - ${splitExpenseShares.owedShare})`,
  }).from(splitExpenseShares)
    .innerJoin(splitExpenses, eq(splitExpenses.id, splitExpenseShares.expenseId))
    .where(and(inArray(splitExpenses.groupId, groupIds), isNull(splitExpenses.deletedAt)))
    .groupBy(splitExpenses.groupId, splitExpenseShares.personId, splitExpenses.assetId)
}

/** Settle-up plan for each group and currency (simplified or raw pairwise, per the group setting). */
async function groupTransfers(dbx: Dbx, groups: Array<{ id: string; simplifyDebts: boolean }>) {
  const ids = groups.map((g) => g.id)
  const nets = await groupNets(dbx, ids)
  const debts = ids.length === 0 ? [] : await dbx.select({
    groupId: sql<string>`${splitExpenseDebts.groupId}`,
    from: splitExpenseDebts.fromPersonId,
    to: splitExpenseDebts.toPersonId,
    assetId: splitExpenseDebts.assetId,
    amount: sql<string>`sum(${splitExpenseDebts.amount})`,
  }).from(splitExpenseDebts)
    .where(inArray(splitExpenseDebts.groupId, ids))
    .groupBy(splitExpenseDebts.groupId, splitExpenseDebts.fromPersonId, splitExpenseDebts.toPersonId, splitExpenseDebts.assetId)
  const am = await assetMap([...nets.map((n) => n.assetId), ...debts.map((d) => d.assetId)])
  const out = new Map<string, Map<string, Transfer[]>>() // groupId -> assetId -> transfers
  for (const g of groups) {
    const byAsset = new Map<string, Transfer[]>()
    const assetIds = new Set([...nets.filter((n) => n.groupId === g.id).map((n) => n.assetId), ...debts.filter((d) => d.groupId === g.id).map((d) => d.assetId)])
    for (const assetId of assetIds) {
      const p = am.get(assetId)!.precision
      if (g.simplifyDebts) {
        const m = new Map(nets.filter((n) => n.groupId === g.id && n.assetId === assetId).map((n) => [n.personId, minor(n.net, p)]))
        byAsset.set(assetId, simplifyDebts(m))
      } else {
        byAsset.set(assetId, netPairs(debts.filter((d) => d.groupId === g.id && d.assetId === assetId).map((d) => ({ from: d.from, to: d.to, amount: minor(d.amount, p) }))))
      }
    }
    out.set(g.id, byAsset)
  }
  return { transfers: out, nets, assets: am }
}

async function myGroups(dbx: Dbx, personId: string) {
  return dbx.select({ id: splitGroups.id, name: splitGroups.name, simplifyDebts: splitGroups.simplifyDebts, groupType: splitGroups.groupType, icon: splitGroups.icon })
    .from(splitGroups)
    .innerJoin(splitGroupMembers, and(eq(splitGroupMembers.groupId, splitGroups.id), eq(splitGroupMembers.personId, personId), isNull(splitGroupMembers.removedAt)))
    .where(isNull(splitGroups.deletedAt))
}

type PairBalance = { friendId: string; assetId: string; groupId: string | null; amount: bigint } // + = friend owes me

/** Everything between me and each other person, split by group (null = outside groups). */
export async function myPairBalances(dbx: Dbx, personId: string): Promise<{ rows: PairBalance[]; assets: Map<string, AssetInfo> }> {
  const nonGroup = await dbx.select({
    from: splitExpenseDebts.fromPersonId,
    to: splitExpenseDebts.toPersonId,
    assetId: splitExpenseDebts.assetId,
    amount: sql<string>`sum(${splitExpenseDebts.amount})`,
  }).from(splitExpenseDebts)
    .where(and(isNull(splitExpenseDebts.groupId), or(eq(splitExpenseDebts.fromPersonId, personId), eq(splitExpenseDebts.toPersonId, personId))))
    .groupBy(splitExpenseDebts.fromPersonId, splitExpenseDebts.toPersonId, splitExpenseDebts.assetId)
  const groups = await myGroups(dbx, personId)
  const { transfers, assets: gAssets } = await groupTransfers(dbx, groups)
  const am = new Map([...gAssets, ...(await assetMap(nonGroup.map((n) => n.assetId)))])
  const rows: PairBalance[] = []
  for (const n of nonGroup) {
    const p = am.get(n.assetId)!.precision
    const amount = minor(n.amount, p)
    if (n.to === personId) rows.push({ friendId: n.from, assetId: n.assetId, groupId: null, amount })
    else rows.push({ friendId: n.to, assetId: n.assetId, groupId: null, amount: -amount })
  }
  for (const [groupId, byAsset] of transfers) {
    for (const [assetId, list] of byAsset) {
      for (const t of list) {
        if (t.to === personId) rows.push({ friendId: t.from, assetId, groupId, amount: t.amount })
        else if (t.from === personId) rows.push({ friendId: t.to, assetId, groupId, amount: -t.amount })
      }
    }
  }
  return { rows, assets: am }
}

function sumBy(rows: PairBalance[], am: Map<string, AssetInfo>) {
  const totals = new Map<string, bigint>()
  for (const r of rows) totals.set(r.assetId, (totals.get(r.assetId) ?? 0n) + r.amount)
  return [...totals].filter(([, v]) => v !== 0n).map(([assetId, v]) => ({ currency: am.get(assetId)!.code, amount: fromMinor(v, am.get(assetId)!.precision) }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export async function listFriends(me: Me) {
  const ids = [...(await friendIds(db, me.personId))]
  const persons = await personsById(db, ids)
  const { rows, assets: am } = await myPairBalances(db, me.personId)
  // People I owe/am owed through a group but am not friends with still show up (Splitwise does too).
  const extra = [...new Set(rows.map((r) => r.friendId))].filter((id) => !persons.has(id))
  const extraPersons = await personsById(db, extra)
  const all = [...persons.values(), ...extraPersons.values()]
  const rates = await getLatestRates().catch(() => new Map<string, number>())
  const list = all.map((p) => {
    const balances = sumBy(rows.filter((r) => r.friendId === p.id), am)
    return {
      personId: p.id,
      name: p.displayName,
      isGuest: p.userId === null,
      email: p.userId === null && p.createdByUserId === me.userId ? p.email : null,
      isFriend: persons.has(p.id),
      balances,
      // Everything open with this friend, converted to your default currency (null when a rate is missing).
      totalInDefault: totalIn(balances, me.defaultCurrency, rates),
    }
  })
  // Biggest open balance first (either direction), settled friends alphabetically at the end.
  const size = (f: typeof list[number]) => (f.totalInDefault === null ? null : Math.abs(f.totalInDefault.owedToMe) + Math.abs(f.totalInDefault.iOwe))
  return list.sort((a, b) => {
    const open = (f: typeof a) => f.balances.length > 0
    if (open(a) !== open(b)) return open(a) ? -1 : 1
    if (open(a)) {
      const sa = size(a) ?? 0
      const sb = size(b) ?? 0
      if (sa !== sb) return sb - sa
    }
    return a.name.localeCompare(b.name)
  })
}

function totalIn(balances: Array<{ currency: string; amount: string }>, currency: string, rates: Map<string, number>) {
  let owedToMe = 0
  let iOwe = 0
  for (const b of balances) {
    const v = Number(b.amount)
    let converted: number
    if (b.currency === currency) converted = v
    else if (rates.has(b.currency) && rates.has(currency)) converted = convertAmount(v, b.currency, currency, rates)
    else return null
    if (converted > 0) owedToMe += converted
    else iOwe -= converted
  }
  const round = (x: number) => Math.round(x * 100) / 100
  return { currency, owedToMe: round(owedToMe), iOwe: round(iOwe), net: round(owedToMe - iOwe) }
}

export async function getBalancesSummary(me: Me) {
  const { rows, assets: am } = await myPairBalances(db, me.personId)
  const owedToMe = new Map<string, bigint>()
  const iOwe = new Map<string, bigint>()
  const byFriend = new Map<string, Map<string, bigint>>()
  for (const r of rows) {
    const m = byFriend.get(r.friendId) ?? new Map<string, bigint>()
    m.set(r.assetId, (m.get(r.assetId) ?? 0n) + r.amount)
    byFriend.set(r.friendId, m)
  }
  for (const m of byFriend.values()) {
    for (const [assetId, v] of m) {
      if (v > 0n) owedToMe.set(assetId, (owedToMe.get(assetId) ?? 0n) + v)
      if (v < 0n) iOwe.set(assetId, (iOwe.get(assetId) ?? 0n) - v)
    }
  }
  const fmt = (m: Map<string, bigint>) => [...m].map(([a, v]) => ({ currency: am.get(a)!.code, amount: fromMinor(v, am.get(a)!.precision) }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
  return { owedToMe: fmt(owedToMe), iOwe: fmt(iOwe), net: sumBy(rows, am) }
}

export async function getFriend(me: Me, friendId: string) {
  if (friendId === me.personId) throw notFound('Friend not found')
  const persons = await personsById(db, [friendId])
  const person = persons.get(friendId)
  if (!person || !(await isConnected(db, me.personId, friendId))) {
    // Someone you still have a balance with stays visible even after unfriending.
    const { rows } = await myPairBalances(db, me.personId)
    if (!person || !rows.some((r) => r.friendId === friendId)) throw notFound('Friend not found')
  }
  const { rows, assets: am } = await myPairBalances(db, me.personId)
  const mine = rows.filter((r) => r.friendId === friendId)
  const groupIds = [...new Set(mine.map((r) => r.groupId).filter((g): g is string => g !== null))]
  const sharedGroups = (await db.execute<{ id: string; name: string }>(sql`
    SELECT g.id, g.name FROM split_groups g
    JOIN split_group_members a ON a.group_id = g.id AND a.person_id = ${me.personId} AND a.removed_at IS NULL
    JOIN split_group_members b ON b.group_id = g.id AND b.person_id = ${friendId} AND b.removed_at IS NULL
    WHERE g.deleted_at IS NULL ORDER BY g.name`)).rows
  const groupNames = new Map(sharedGroups.map((g) => [g.id, g.name]))
  const missing = groupIds.filter((g) => !groupNames.has(g))
  if (missing.length) {
    for (const g of await db.select({ id: splitGroups.id, name: splitGroups.name }).from(splitGroups).where(inArray(splitGroups.id, missing))) groupNames.set(g.id, g.name)
  }
  const friends = await friendIds(db, me.personId)
  return {
    personId: person!.id,
    name: person!.displayName,
    isGuest: person!.userId === null,
    email: person!.userId === null && person!.createdByUserId === me.userId ? person!.email : null,
    isFriend: friends.has(friendId),
    canEdit: person!.userId === null && person!.createdByUserId === me.userId,
    balances: sumBy(mine, am),
    breakdown: [
      ...(mine.some((r) => r.groupId === null) ? [{ groupId: null as string | null, groupName: null as string | null, balances: sumBy(mine.filter((r) => r.groupId === null), am) }] : []),
      ...groupIds.map((g) => ({ groupId: g as string | null, groupName: groupNames.get(g) ?? 'Group' as string | null, balances: sumBy(mine.filter((r) => r.groupId === g), am) })),
    ].filter((b) => b.balances.length > 0),
    sharedGroups: sharedGroups.map((g) => ({ id: g.id, name: g.name })),
  }
}

async function createGuest(tx: Tx, me: Me, name: string, email: string | null) {
  const displayName = name.trim().slice(0, 120)
  if (!displayName) throw new SplitError(422, 'INVALID_NAME', 'Add a name')
  const cleanEmail = email?.trim().toLowerCase() || null
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new SplitError(422, 'INVALID_EMAIL', 'That email does not look right')
  const [row] = await tx.insert(splitPersons).values({ displayName, email: cleanEmail, createdByUserId: me.userId }).returning({ id: splitPersons.id })
  return row.id
}

export async function addFriend(me: Me, input: { name: string; email?: string | null }) {
  return db.transaction(async (tx) => {
    const existing = await personsById(tx, [...(await friendIds(tx, me.personId))])
    const wanted = input.name.trim().toLowerCase()
    if ([...existing.values()].some((p) => p.displayName.toLowerCase() === wanted)) {
      throw new SplitError(409, 'DUPLICATE_NAME', 'You already have a friend with that name')
    }
    const id = await createGuest(tx, me, input.name, input.email ?? null)
    await ensureFriendships(tx, [me.personId, id])
    await recordActivity(tx, { actorPersonId: me.personId, kind: 'friend.added', data: { name: input.name.trim() }, audience: [me.personId] })
    return id
  })
}

export async function updateGuest(me: Me, personId: string, input: { name?: string; email?: string | null }) {
  const [p] = await db.select().from(splitPersons).where(eq(splitPersons.id, personId))
  if (!p || p.mergedIntoId || p.userId !== null || p.createdByUserId !== me.userId) throw notFound('Friend not found')
  const set: { displayName?: string; email?: string | null; updatedAt: Date } = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const n = input.name.trim().slice(0, 120)
    if (!n) throw new SplitError(422, 'INVALID_NAME', 'Add a name')
    set.displayName = n
  }
  if (input.email !== undefined) {
    const e = input.email?.trim().toLowerCase() || null
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new SplitError(422, 'INVALID_EMAIL', 'That email does not look right')
    set.email = e
  }
  await db.update(splitPersons).set(set).where(eq(splitPersons.id, personId))
}

export async function removeFriend(me: Me, friendId: string) {
  const { rows } = await myPairBalances(db, me.personId)
  const perCurrency = new Map<string, bigint>()
  for (const r of rows.filter((x) => x.friendId === friendId)) perCurrency.set(r.assetId, (perCurrency.get(r.assetId) ?? 0n) + r.amount)
  if ([...perCurrency.values()].some((v) => v !== 0n)) {
    throw new SplitError(409, 'UNSETTLED', 'Settle up before removing this friend')
  }
  const [low, high] = pairOf(me.personId, friendId)
  const res = await db.update(splitFriendships).set({ removedAt: new Date() })
    .where(and(eq(splitFriendships.personLowId, low), eq(splitFriendships.personHighId, high), isNull(splitFriendships.removedAt)))
    .returning({ id: splitFriendships.id })
  if (res.length === 0) throw notFound('Friend not found')
}

// ---------------------------------------------------------------------------------------------
// Groups

export const GROUP_TYPES = ['home', 'trip', 'couple', 'other'] as const
export const MAX_GROUP_MEMBERS = 100

export async function listGroups(me: Me) {
  const groups = await myGroups(db, me.personId)
  const { transfers, assets: am } = await groupTransfers(db, groups)
  const counts = groups.length === 0 ? [] : await db.select({ groupId: splitGroupMembers.groupId, n: sql<number>`count(*)::int` })
    .from(splitGroupMembers).where(and(inArray(splitGroupMembers.groupId, groups.map((g) => g.id)), isNull(splitGroupMembers.removedAt)))
    .groupBy(splitGroupMembers.groupId)
  return groups.map((g) => {
    const rows: PairBalance[] = []
    for (const [assetId, list] of transfers.get(g.id) ?? []) {
      for (const t of list) {
        if (t.to === me.personId) rows.push({ friendId: t.from, assetId, groupId: g.id, amount: t.amount })
        if (t.from === me.personId) rows.push({ friendId: t.to, assetId, groupId: g.id, amount: -t.amount })
      }
    }
    return {
      id: g.id,
      name: g.name,
      groupType: g.groupType,
      icon: g.icon,
      simplifyDebts: g.simplifyDebts,
      memberCount: counts.find((c) => c.groupId === g.id)?.n ?? 0,
      myBalances: sumBy(rows, am),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getGroup(me: Me, groupId: string) {
  const group = await memberGroup(db, groupId, me.personId)
  if (!group) throw notFound('Group not found')
  const memberIds = await currentMemberIds(db, groupId)
  const persons = await personsById(db, memberIds)
  const { transfers, nets, assets: am } = await groupTransfers(db, [{ id: groupId, simplifyDebts: group.simplifyDebts }])
  const suggested = [...(transfers.get(groupId) ?? [])].flatMap(([assetId, list]) => list.map((t) => ({
    fromPersonId: t.from,
    toPersonId: t.to,
    currency: am.get(assetId)!.code,
    amount: fromMinor(t.amount, am.get(assetId)!.precision),
  })))
  const memberBalances = (personId: string) => nets.filter((n) => n.personId === personId)
    .map((n) => ({ currency: am.get(n.assetId)!.code, amount: fromMinor(minor(n.net, am.get(n.assetId)!.precision), am.get(n.assetId)!.precision) }))
    .filter((b) => !/^-?0(\.0+)?$/.test(b.amount))
  // Former members who still carry a balance are listed so the numbers add up.
  const formerIds = [...new Set(nets.map((n) => n.personId))].filter((id) => !memberIds.includes(id))
  const former = await personsById(db, formerIds)
  return {
    id: group.id,
    name: group.name,
    groupType: group.groupType,
    icon: group.icon,
    simplifyDebts: group.simplifyDebts,
    members: [...persons.values(), ...former.values()].map((p) => ({
      personId: p.id,
      name: p.displayName,
      isGuest: p.userId === null,
      isMe: p.id === me.personId,
      isCurrent: memberIds.includes(p.id),
      balances: memberBalances(p.id),
    })).sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : a.name.localeCompare(b.name))),
    suggested,
  }
}

export async function createGroup(me: Me, input: { name: string; icon?: import('@finance-os/domain').IconId | null; groupType?: typeof GROUP_TYPES[number]; simplifyDebts?: boolean; memberIds?: string[]; externalRef?: string | null }) {
  const name = input.name.trim().slice(0, 120)
  if (!name) throw new SplitError(422, 'INVALID_NAME', 'Name the group')
  return db.transaction(async (tx) => {
    if (input.externalRef) {
      const [dupe] = await tx.select({ id: splitGroups.id }).from(splitGroups)
        .where(and(eq(splitGroups.createdByPersonId, me.personId), eq(splitGroups.externalRef, input.externalRef)))
      if (dupe) throw new SplitError(409, 'DUPLICATE_EXTERNAL_REF', `Already imported as ${dupe.id}`)
    }
    const [g] = await tx.insert(splitGroups).values({
      name,
      groupType: input.groupType ?? 'other',
      icon: input.icon ?? null,
      simplifyDebts: input.simplifyDebts ?? true,
      createdByPersonId: me.personId,
      externalRef: input.externalRef ?? null,
    }).returning({ id: splitGroups.id })
    const friends = await friendIds(tx, me.personId)
    const memberIds = [...new Set(input.memberIds ?? [])].filter((id) => id !== me.personId)
    if (memberIds.some((id) => !friends.has(id))) throw notFound('Person not found')
    await tx.insert(splitGroupMembers).values([me.personId, ...memberIds].map((personId) => ({ groupId: g.id, personId, addedByPersonId: me.personId })))
    await ensureFriendships(tx, [me.personId, ...memberIds])
    await recordActivity(tx, { actorPersonId: me.personId, kind: 'group.created', groupId: g.id, data: { name }, audience: [me.personId, ...memberIds] })
    return g.id
  })
}

export async function updateGroup(me: Me, groupId: string, input: { name?: string; icon?: import('@finance-os/domain').IconId | null; groupType?: typeof GROUP_TYPES[number]; simplifyDebts?: boolean }) {
  await db.transaction(async (tx) => {
    const group = await memberGroup(tx, groupId, me.personId)
    if (!group) throw notFound('Group not found')
    const set: Partial<typeof splitGroups.$inferInsert> = { updatedAt: new Date() }
    if (input.name !== undefined) {
      const n = input.name.trim().slice(0, 120)
      if (!n) throw new SplitError(422, 'INVALID_NAME', 'Name the group')
      set.name = n
    }
    if (input.groupType !== undefined) set.groupType = input.groupType
    if (input.icon !== undefined) set.icon = input.icon
    if (input.simplifyDebts !== undefined) set.simplifyDebts = input.simplifyDebts
    await tx.update(splitGroups).set(set).where(eq(splitGroups.id, groupId))
    await recordActivity(tx, {
      actorPersonId: me.personId, kind: 'group.updated', groupId,
      data: { name: set.name ?? group.name, previousName: group.name, simplifyDebts: input.simplifyDebts },
      audience: await currentMemberIds(tx, groupId),
    })
  })
}

/** Adds an existing friend, or a new guest, to a group. */
export async function addGroupMember(me: Me, groupId: string, input: { personId?: string; name?: string; email?: string | null }) {
  return db.transaction(async (tx) => {
    const group = await memberGroup(tx, groupId, me.personId)
    if (!group) throw notFound('Group not found')
    let personId = input.personId
    if (personId) {
      if (!(await isConnected(tx, me.personId, personId))) throw notFound('Person not found')
      const p = (await personsById(tx, [personId])).get(personId)
      if (!p) throw notFound('Person not found')
    } else {
      if (!input.name) throw new SplitError(422, 'INVALID_NAME', 'Add a name')
      personId = await createGuest(tx, me, input.name, input.email ?? null)
    }
    await tx.execute(sql`SELECT 1 FROM split_groups WHERE id = ${groupId} FOR UPDATE`)
    const before = await currentMemberIds(tx, groupId)
    if (before.length >= MAX_GROUP_MEMBERS && !before.includes(personId)) {
      throw new SplitError(422, 'GROUP_FULL', `A group can have up to ${MAX_GROUP_MEMBERS} people`)
    }
    await tx.insert(splitGroupMembers).values({ groupId, personId, addedByPersonId: me.personId })
      .onConflictDoUpdate({ target: [splitGroupMembers.groupId, splitGroupMembers.personId], set: { removedAt: null, addedByPersonId: me.personId, joinedAt: new Date() } })
    const members = await currentMemberIds(tx, groupId)
    // Only the newcomer's pairs are new; re-inserting every pair would grow with the square of the group.
    for (const other of members) if (other !== personId) await ensureFriendships(tx, [personId, other])
    const name = (await personsById(tx, [personId])).get(personId)!.displayName
    await recordActivity(tx, { actorPersonId: me.personId, kind: 'group.member_added', groupId, data: { name, personId }, audience: members })
    return personId
  })
}

async function memberNetIsZero(tx: Tx, groupId: string, personId: string) {
  const rows = await tx.select({ net: sql<string>`sum(${splitExpenseShares.paidShare} - ${splitExpenseShares.owedShare})` })
    .from(splitExpenseShares)
    .innerJoin(splitExpenses, eq(splitExpenses.id, splitExpenseShares.expenseId))
    .where(and(eq(splitExpenses.groupId, groupId), isNull(splitExpenses.deletedAt), eq(splitExpenseShares.personId, personId)))
    .groupBy(splitExpenses.assetId)
  return rows.every((r) => Number(r.net) === 0)
}

export async function removeGroupMember(me: Me, groupId: string, personId: string) {
  await db.transaction(async (tx) => {
    const group = await memberGroup(tx, groupId, me.personId)
    if (!group) throw notFound('Group not found')
    await tx.execute(sql`SELECT 1 FROM split_groups WHERE id = ${groupId} FOR UPDATE`)
    const members = await currentMemberIds(tx, groupId)
    if (!members.includes(personId)) throw notFound('Member not found')
    if (!(await memberNetIsZero(tx, groupId, personId))) {
      throw new SplitError(409, 'UNSETTLED', personId === me.personId ? 'Settle up before leaving the group' : 'They need to settle up before leaving the group')
    }
    await tx.update(splitGroupMembers).set({ removedAt: new Date() })
      .where(and(eq(splitGroupMembers.groupId, groupId), eq(splitGroupMembers.personId, personId)))
    const name = (await personsById(tx, [personId])).get(personId)?.displayName ?? 'Someone'
    await recordActivity(tx, {
      actorPersonId: me.personId, kind: personId === me.personId ? 'group.left' : 'group.member_removed', groupId,
      data: { name, personId }, audience: members,
    })
  })
}

async function groupExpenseSnapshots(tx: Tx, ids: string[]) {
  const out: Array<{ id: string; before: { userIds: string[]; assetId: string; date: Date } }> = []
  for (const id of ids) {
    const [e] = await tx.select({ assetId: splitExpenses.assetId, date: splitExpenses.expenseDate }).from(splitExpenses).where(eq(splitExpenses.id, id))
    const userIds = (await tx.select({ userId: splitPersons.userId }).from(splitExpenseShares)
      .innerJoin(splitPersons, eq(splitPersons.id, splitExpenseShares.personId)).where(eq(splitExpenseShares.expenseId, id)))
      .map((r) => r.userId).filter((u): u is string => u !== null)
    out.push({ id, before: { userIds, assetId: e.assetId, date: e.date } })
  }
  return out
}

/** Soft-deletes the group and its live expenses together, so restoring brings both back. */
export async function deleteGroup(me: Me, groupId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM split_groups WHERE id = ${groupId} FOR UPDATE`)
    const group = await memberGroup(tx, groupId, me.personId)
    if (!group) throw notFound('Group not found')
    const now = new Date()
    const audience = await currentMemberIds(tx, groupId)
    const live = (await tx.select({ id: splitExpenses.id }).from(splitExpenses)
      .where(and(eq(splitExpenses.groupId, groupId), isNull(splitExpenses.deletedAt)))).map((r) => r.id)
    const snaps = await groupExpenseSnapshots(tx, live)
    await tx.update(splitGroups).set({ deletedAt: now, deletedByPersonId: me.personId }).where(eq(splitGroups.id, groupId))
    if (live.length) {
      await tx.update(splitExpenses).set({ deletedAt: now, deletedByPersonId: me.personId, nextRepeatAt: null }).where(inArray(splitExpenses.id, live))
      await tx.delete(splitExpenseDebts).where(inArray(splitExpenseDebts.expenseId, live))
    }
    // Take every books lock up front, in one sorted pass, so two group operations can't deadlock.
    await lockKeys(tx, snaps.flatMap((s) => s.before.userIds.map((u) => booksLockKey(u, s.before.assetId))))
    for (const s of snaps) await syncBooksFor(tx, s.id, s.before)
    await recordActivity(tx, { actorPersonId: me.personId, kind: 'group.deleted', groupId, data: { name: group.name }, audience })
  })
}

export async function restoreGroup(me: Me, groupId: string) {
  await db.transaction(async (tx) => {
    const [g] = await tx.select().from(splitGroups).where(eq(splitGroups.id, groupId)).for('update')
    if (!g || !g.deletedAt) throw notFound('Group not found')
    const [member] = await tx.select({ one: sql`1` }).from(splitGroupMembers)
      .where(and(eq(splitGroupMembers.groupId, groupId), eq(splitGroupMembers.personId, me.personId), isNull(splitGroupMembers.removedAt)))
    if (!member) throw notFound('Group not found')
    const deletedWith = (await tx.select({ id: splitExpenses.id }).from(splitExpenses)
      .where(and(eq(splitExpenses.groupId, groupId), eq(splitExpenses.deletedAt, g.deletedAt)))).map((r) => r.id)
    await tx.update(splitGroups).set({ deletedAt: null, deletedByPersonId: null, updatedAt: new Date() }).where(eq(splitGroups.id, groupId))
    if (deletedWith.length) {
      await tx.update(splitExpenses).set({ deletedAt: null, deletedByPersonId: null }).where(inArray(splitExpenses.id, deletedWith))
    }
    const restored = deletedWith.length === 0 ? [] : await tx.select({ id: splitExpenses.id, date: splitExpenses.expenseDate, repeat: splitExpenses.repeatInterval, assetId: splitExpenses.assetId })
      .from(splitExpenses).where(inArray(splitExpenses.id, deletedWith))
    for (const e of restored) {
      // Repeating expenses pick their schedule up again (deleting the group paused it).
      if (e.repeat !== 'never') await tx.update(splitExpenses).set({ nextRepeatAt: nextRepeatAfter(e.date, e.repeat as RepeatInterval) }).where(eq(splitExpenses.id, e.id))
    }
    const users = deletedWith.length === 0 ? { rows: [] as Array<{ user_id: string; asset_id: string }> } : await tx.execute<{ user_id: string; asset_id: string }>(sql`
      SELECT DISTINCT p.user_id, x.asset_id FROM split_expense_shares s JOIN split_persons p ON p.id = s.person_id JOIN split_expenses x ON x.id = s.expense_id
      WHERE p.user_id IS NOT NULL AND s.expense_id IN (${sql.join(deletedWith.map((id) => sql`${id}::uuid`), sql`, `)})`)
    await lockKeys(tx, users.rows.map((r) => booksLockKey(r.user_id, r.asset_id)))
    for (const id of deletedWith) {
      await rebuildDebtsForExpense(tx, id)
      await syncBooksFor(tx, id, null)
    }
    await recordActivity(tx, { actorPersonId: me.personId, kind: 'group.restored', groupId, data: { name: g.name }, audience: await currentMemberIds(tx, groupId) })
  })
}

export async function listDeletedGroups(me: Me) {
  return db.select({ id: splitGroups.id, name: splitGroups.name, deletedAt: splitGroups.deletedAt })
    .from(splitGroups)
    .innerJoin(splitGroupMembers, and(eq(splitGroupMembers.groupId, splitGroups.id), eq(splitGroupMembers.personId, me.personId), isNull(splitGroupMembers.removedAt)))
    .where(sql`${splitGroups.deletedAt} IS NOT NULL`)
}

export { lockKeys }
