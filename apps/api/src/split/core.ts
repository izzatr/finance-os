import {
  db,
  users,
  splitFriendships,
  splitGroupMembers,
  splitGroups,
  splitPersons,
  splitUserSettings,
  splitExpenseShares,
} from '@finance-os/db'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export type Dbx = typeof db | Tx

export class SplitError extends Error {
  status: 400 | 403 | 404 | 409 | 410 | 422
  code: string
  constructor(status: SplitError['status'], code: string, message: string) {
    super(message)
    this.name = 'SplitError'
    this.status = status
    this.code = code
  }
}

export const notFound = (what = 'Not found') => new SplitError(404, 'NOT_FOUND', what)

export function pairOf(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export type Me = { userId: string; personId: string; displayName: string; booksStart: Date; defaultCurrency: string }

/** The acting user's person + settings, created on first use. */
export async function getMe(userId: string): Promise<Me> {
  const existing = await loadMe(db, userId)
  if (existing) return existing
  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId))
  if (!user) throw notFound('User not found')
  const displayName = (user.name?.trim() || user.email.split('@')[0]).slice(0, 120)
  await db.transaction(async (tx) => {
    await tx.insert(splitPersons).values({ userId, displayName, createdByUserId: userId }).onConflictDoNothing()
    const [person] = await tx.select({ id: splitPersons.id }).from(splitPersons).where(eq(splitPersons.userId, userId))
    // Everything counts in your books unless you joined with history (see invites) or chose a later start.
    await tx.insert(splitUserSettings).values({ userId, personId: person.id, booksStart: new Date(0) }).onConflictDoNothing()
  })
  const created = await loadMe(db, userId)
  if (!created) throw new Error('could not create split person')
  return created
}

export async function loadMe(dbx: Dbx, userId: string): Promise<Me | null> {
  const [row] = await dbx
    .select({
      personId: splitPersons.id,
      displayName: splitPersons.displayName,
      booksStart: splitUserSettings.booksStart,
      defaultCurrency: splitUserSettings.defaultCurrency,
    })
    .from(splitUserSettings)
    .innerJoin(splitPersons, eq(splitPersons.id, splitUserSettings.personId))
    .where(eq(splitUserSettings.userId, userId))
  return row ? { userId, ...row } : null
}

/** Live group where `personId` is a current member, or null. */
export async function memberGroup(dbx: Dbx, groupId: string, personId: string) {
  const [row] = await dbx
    .select({ id: splitGroups.id, name: splitGroups.name, simplifyDebts: splitGroups.simplifyDebts, groupType: splitGroups.groupType })
    .from(splitGroups)
    .innerJoin(splitGroupMembers, and(eq(splitGroupMembers.groupId, splitGroups.id), eq(splitGroupMembers.personId, personId), isNull(splitGroupMembers.removedAt)))
    .where(and(eq(splitGroups.id, groupId), isNull(splitGroups.deletedAt)))
  return row ?? null
}

export async function currentMemberIds(dbx: Dbx, groupId: string): Promise<string[]> {
  const rows = await dbx.select({ personId: splitGroupMembers.personId }).from(splitGroupMembers)
    .where(and(eq(splitGroupMembers.groupId, groupId), isNull(splitGroupMembers.removedAt)))
  return rows.map((r) => r.personId)
}

/** Ids of everyone `personId` is friends with (live friendships). */
export async function friendIds(dbx: Dbx, personId: string): Promise<Set<string>> {
  const rows = await dbx.select({ low: splitFriendships.personLowId, high: splitFriendships.personHighId })
    .from(splitFriendships)
    .where(and(isNull(splitFriendships.removedAt), or(eq(splitFriendships.personLowId, personId), eq(splitFriendships.personHighId, personId))))
  return new Set(rows.map((r) => (r.low === personId ? r.high : r.low)))
}

/** Makes every pair in `personIds` friends (idempotent; revives removed friendships). */
export async function ensureFriendships(dbx: Dbx, personIds: string[]): Promise<void> {
  const ids = [...new Set(personIds)].sort()
  const values: Array<{ personLowId: string; personHighId: string }> = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) values.push({ personLowId: ids[i], personHighId: ids[j] })
  }
  if (values.length === 0) return
  await dbx.insert(splitFriendships).values(values)
    .onConflictDoUpdate({ target: [splitFriendships.personLowId, splitFriendships.personHighId], set: { removedAt: null } })
}

/** Live (non-merged) persons by id. */
export async function personsById(dbx: Dbx, ids: string[]) {
  if (ids.length === 0) return new Map<string, { id: string; displayName: string; userId: string | null; email: string | null; createdByUserId: string | null }>()
  const rows = await dbx.select({
    id: splitPersons.id,
    displayName: splitPersons.displayName,
    userId: splitPersons.userId,
    email: splitPersons.email,
    createdByUserId: splitPersons.createdByUserId,
  }).from(splitPersons).where(and(inArray(splitPersons.id, [...new Set(ids)]), isNull(splitPersons.mergedIntoId)))
  return new Map(rows.map((r) => [r.id, r]))
}

/**
 * Can `personId` see this expense? Participants always can; otherwise the expense must sit in a
 * live group they are a current member of.
 */
export async function canAccessExpense(dbx: Dbx, expense: { id: string; groupId: string | null }, personId: string): Promise<boolean> {
  const [share] = await dbx.select({ one: sql`1` }).from(splitExpenseShares)
    .where(and(eq(splitExpenseShares.expenseId, expense.id), eq(splitExpenseShares.personId, personId)))
  if (share) return true
  if (!expense.groupId) return false
  return (await memberGroup(dbx, expense.groupId, personId)) !== null
}

/** Is `other` someone `me` is connected to (friend or fellow member of a live group)? */
export async function isConnected(dbx: Dbx, me: string, other: string): Promise<boolean> {
  if (me === other) return true
  if ((await friendIds(dbx, me)).has(other)) return true
  const [row] = await dbx.execute<{ one: number }>(sql`
    SELECT 1 AS one FROM split_group_members a
    JOIN split_group_members b ON b.group_id = a.group_id AND b.person_id = ${other} AND b.removed_at IS NULL
    JOIN split_groups g ON g.id = a.group_id AND g.deleted_at IS NULL
    WHERE a.person_id = ${me} AND a.removed_at IS NULL LIMIT 1`).then((r) => r.rows)
  return Boolean(row)
}

/** Serialises writers touching the same books (user + currency). Keys are locked in sorted order. */
export async function lockKeys(tx: Tx, keys: string[]): Promise<void> {
  for (const key of [...new Set(keys)].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
  }
}
