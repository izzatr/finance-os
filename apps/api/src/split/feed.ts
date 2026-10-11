import { db, splitActivity, splitComments, splitPersons, splitUserSettings, splitGroups, splitExpenses } from '@finance-os/db'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { notFound, SplitError, type Me } from './core'
import { assertCanModifyExpense, assertExpenseAccess, audienceFor, recordActivity } from './expenses'

export async function listComments(me: Me, expenseId: string) {
  await assertExpenseAccess(me, expenseId)
  const rows = await db.select({
    id: splitComments.id,
    personId: splitComments.personId,
    name: splitPersons.displayName,
    body: splitComments.body,
    createdAt: splitComments.createdAt,
  }).from(splitComments)
    .innerJoin(splitPersons, eq(splitPersons.id, splitComments.personId))
    .where(and(eq(splitComments.expenseId, expenseId), isNull(splitComments.deletedAt)))
    .orderBy(splitComments.createdAt)
    .limit(500)
  return rows.map((r) => ({ ...r, isMine: r.personId === me.personId, createdAt: r.createdAt.toISOString() }))
}

export async function addComment(me: Me, expenseId: string, body: string) {
  const text = body.trim()
  if (!text) throw new SplitError(422, 'EMPTY_COMMENT', 'Write something first')
  if (text.length > 1000) throw new SplitError(422, 'COMMENT_TOO_LONG', 'Comments are limited to 1000 characters')
  const expense = await assertCanModifyExpense(me, expenseId)
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(splitComments).values({ expenseId, personId: me.personId, body: text }).returning({ id: splitComments.id })
    const [e] = await tx.select({ description: splitExpenses.description }).from(splitExpenses).where(eq(splitExpenses.id, expenseId))
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: 'comment.added',
      groupId: expense.groupId,
      expenseId,
      data: { description: e.description, comment: text.slice(0, 140) },
      audience: await audienceFor(tx, expenseId, expense.groupId),
    })
    return row.id
  })
}

export async function deleteComment(me: Me, commentId: string) {
  const [c] = await db.select().from(splitComments).where(and(eq(splitComments.id, commentId), isNull(splitComments.deletedAt)))
  if (!c) throw notFound('Comment not found')
  await assertExpenseAccess(me, c.expenseId)
  if (c.personId !== me.personId) throw new SplitError(403, 'NOT_YOURS', 'You can only delete your own comments')
  await db.update(splitComments).set({ deletedAt: new Date() }).where(eq(splitComments.id, commentId))
}

export async function listActivity(me: Me, opts: { before?: { at: string; id: string }; limit: number; groupId?: string }) {
  const conds = [sql`${splitActivity.audience} @> ARRAY[${me.personId}]::uuid[]`]
  if (opts.groupId) conds.push(eq(splitActivity.groupId, opts.groupId))
  if (opts.before) {
    const at = new Date(opts.before.at)
    conds.push(or(lt(splitActivity.createdAt, at), and(eq(splitActivity.createdAt, at), lt(splitActivity.id, opts.before.id)))!)
  }
  const rows = await db.select({
    id: splitActivity.id,
    kind: splitActivity.kind,
    actorPersonId: splitActivity.actorPersonId,
    actorName: splitPersons.displayName,
    groupId: splitActivity.groupId,
    groupName: splitGroups.name,
    expenseId: splitActivity.expenseId,
    data: splitActivity.data,
    createdAt: splitActivity.createdAt,
  }).from(splitActivity)
    .leftJoin(splitPersons, eq(splitPersons.id, splitActivity.actorPersonId))
    .leftJoin(splitGroups, eq(splitGroups.id, splitActivity.groupId))
    .where(and(...conds))
    .orderBy(desc(splitActivity.createdAt), desc(splitActivity.id))
    .limit(opts.limit + 1)
  const page = rows.slice(0, opts.limit)
  const [settings] = await db.select({ seen: splitUserSettings.activitySeenAt }).from(splitUserSettings).where(eq(splitUserSettings.userId, me.userId))
  const seen = settings?.seen ?? null
  return {
    data: page.map((r) => ({
      ...r,
      isMine: r.actorPersonId === me.personId,
      unread: r.actorPersonId !== me.personId && (!seen || r.createdAt > seen),
      createdAt: r.createdAt.toISOString(),
    })),
    next: rows.length > opts.limit ? { at: page[page.length - 1].createdAt.toISOString(), id: page[page.length - 1].id } : null,
  }
}

export async function unreadActivityCount(me: Me): Promise<number> {
  const [settings] = await db.select({ seen: splitUserSettings.activitySeenAt }).from(splitUserSettings).where(eq(splitUserSettings.userId, me.userId))
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(splitActivity).where(and(
    sql`${splitActivity.audience} @> ARRAY[${me.personId}]::uuid[]`,
    sql`${splitActivity.actorPersonId} IS DISTINCT FROM ${me.personId}`,
    ...(settings?.seen ? [sql`${splitActivity.createdAt} > ${settings.seen}`] : []),
  ))
  return Math.min(row.n, 99)
}

export async function markActivitySeen(me: Me) {
  await db.update(splitUserSettings).set({ activitySeenAt: new Date() }).where(eq(splitUserSettings.userId, me.userId))
}
