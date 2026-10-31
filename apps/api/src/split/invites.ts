import { createHash, randomBytes } from 'node:crypto'
import {
  db,
  splitActivity,
  splitComments,
  splitExpenseDebts,
  splitExpenseShares,
  splitExpenses,
  splitFriendships,
  splitGroupMembers,
  splitGroups,
  splitInvites,
  splitPersons,
  splitUserSettings,
  users,
} from '@finance-os/db'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { ensureFriendships, getMe, isConnected, notFound, pairOf, SplitError, type Me, type Tx } from './core'
import { resyncUserBooks } from './legacy'
import { rebuildDebtsForExpense, recordActivity } from './expenses'

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createInvite(me: Me, personId: string) {
  const [guest] = await db.select().from(splitPersons).where(eq(splitPersons.id, personId))
  if (!guest || guest.mergedIntoId || !(await isConnected(db, me.personId, personId))) throw notFound('Friend not found')
  if (guest.userId) throw new SplitError(409, 'ALREADY_REGISTERED', `${guest.displayName} already has an account`)
  // Whoever claims the link becomes this guest and inherits what they are owed, so only the person
  // who added the guest may hand it out. Otherwise any group-mate could take over someone's guest.
  if (guest.createdByUserId !== me.userId) {
    throw new SplitError(403, 'NOT_GUEST_OWNER', `Only the person who added ${guest.displayName} can invite them`)
  }
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.transaction(async (tx) => {
    await tx.update(splitInvites).set({ revokedAt: new Date() })
      .where(and(eq(splitInvites.personId, personId), isNull(splitInvites.claimedAt), isNull(splitInvites.revokedAt)))
    await tx.insert(splitInvites).values({ tokenHash: hashInviteToken(token), personId, createdByUserId: me.userId, expiresAt })
  })
  return { token, expiresAt: expiresAt.toISOString(), guestName: guest.displayName }
}

type InviteStatus = 'valid' | 'expired' | 'claimed' | 'revoked'

function statusOf(invite: { claimedAt: Date | null; revokedAt: Date | null; expiresAt: Date }): InviteStatus {
  if (invite.claimedAt) return 'claimed'
  if (invite.revokedAt) return 'revoked'
  if (invite.expiresAt.getTime() <= Date.now()) return 'expired'
  return 'valid'
}

/** Public: what the invite page may show before sign-in. Deliberately minimal. */
export async function previewInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Invite not found')
  const [row] = await db.select({
    claimedAt: splitInvites.claimedAt,
    revokedAt: splitInvites.revokedAt,
    expiresAt: splitInvites.expiresAt,
    guestName: splitPersons.displayName,
    inviterName: users.name,
  }).from(splitInvites)
    .innerJoin(splitPersons, eq(splitPersons.id, splitInvites.personId))
    .innerJoin(users, eq(users.id, splitInvites.createdByUserId))
    .where(eq(splitInvites.tokenHash, hashInviteToken(token)))
  if (!row) throw notFound('Invite not found')
  return { status: statusOf(row), guestName: row.guestName, inviterName: row.inviterName }
}

/**
 * Turns the guest into the claiming user. If the user already has history, the guest is merged
 * into their person; balances, groups, comments and activity all carry over.
 */
export async function claimInvite(userId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound('Invite not found')
  const me = await getMe(userId)
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(splitInvites).where(eq(splitInvites.tokenHash, hashInviteToken(token))).for('update')
    if (!invite) throw notFound('Invite not found')
    const status = statusOf(invite)
    if (status !== 'valid') throw new SplitError(410, `INVITE_${status.toUpperCase()}`, `This invite is ${status}`)
    if (invite.createdByUserId === userId) throw new SplitError(422, 'OWN_INVITE', 'Send this link to your friend; it is not for you')
    const [guest] = await tx.select().from(splitPersons).where(eq(splitPersons.id, invite.personId)).for('update')
    if (!guest || guest.userId || guest.mergedIntoId) throw new SplitError(410, 'INVITE_CLAIMED', 'This invite was already used')

    // Someone new to shared expenses starts their books now: the guest history they inherit is
    // carried as an opening balance instead of being replayed as past spending.
    const [hasHistory] = await tx.select({ one: sql`1` }).from(splitExpenseShares).where(eq(splitExpenseShares.personId, me.personId)).limit(1)
    if (!hasHistory) {
      await tx.update(splitUserSettings).set({ booksStart: new Date() }).where(eq(splitUserSettings.userId, userId))
    }
    const affected = await mergePerson(tx, guest.id, me.personId)
    await tx.update(splitInvites).set({ claimedAt: new Date(), claimedByUserId: userId }).where(eq(splitInvites.id, invite.id))
    await tx.update(splitInvites).set({ revokedAt: new Date() })
      .where(and(eq(splitInvites.personId, guest.id), isNull(splitInvites.claimedAt), isNull(splitInvites.revokedAt)))

    // Only the claimer's books change: everyone else's shares are untouched by the merge.
    await resyncUserBooks(tx, userId, me.personId)

    const audience = await connectedPersons(tx, me.personId)
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: 'person.joined',
      data: { name: me.displayName, guestName: guest.displayName },
      audience: [me.personId, ...audience],
    })
    return { personId: me.personId, mergedGuestId: guest.id, expenses: affected.length }
  })
}

async function connectedPersons(tx: Tx, personId: string): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT CASE WHEN person_low_id = ${personId} THEN person_high_id ELSE person_low_id END AS id
    FROM split_friendships WHERE removed_at IS NULL AND (person_low_id = ${personId} OR person_high_id = ${personId})
    UNION
    SELECT b.person_id FROM split_group_members a JOIN split_group_members b ON b.group_id = a.group_id AND b.removed_at IS NULL
    WHERE a.person_id = ${personId} AND a.removed_at IS NULL`)
  return rows.rows.map((r) => r.id).filter((id) => id !== personId)
}

/** Moves everything that references `fromId` onto `toId`. Returns the expenses whose books must be rebuilt. */
export async function mergePerson(tx: Tx, fromId: string, toId: string) {
  if (fromId === toId) return []
  const expenseIds = (await tx.select({ id: splitExpenseShares.expenseId }).from(splitExpenseShares)
    .where(eq(splitExpenseShares.personId, fromId))).map((r) => r.id)

  const both = expenseIds.length === 0 ? [] : (await tx.select({ id: splitExpenseShares.expenseId }).from(splitExpenseShares)
    .where(and(eq(splitExpenseShares.personId, toId), inArray(splitExpenseShares.expenseId, expenseIds)))).map((r) => r.id)

  // Shares: fold into an existing row for the same expense, otherwise re-point.
  if (expenseIds.length) {
    await tx.execute(sql`
      UPDATE split_expense_shares t SET paid_share = t.paid_share + f.paid_share, owed_share = t.owed_share + f.owed_share
      FROM split_expense_shares f
      WHERE f.person_id = ${fromId} AND t.person_id = ${toId} AND t.expense_id = f.expense_id`)
    await tx.execute(sql`
      DELETE FROM split_expense_shares f WHERE f.person_id = ${fromId}
      AND EXISTS (SELECT 1 FROM split_expense_shares t WHERE t.expense_id = f.expense_id AND t.person_id = ${toId})`)
    await tx.update(splitExpenseShares).set({ personId: toId }).where(eq(splitExpenseShares.personId, fromId))
    // Both people may have been the payer and the debtor of one expense; a share that nets to
    // zero on both sides adds nothing, drop it.
    await tx.execute(sql`DELETE FROM split_expense_shares WHERE person_id = ${toId} AND paid_share = 0 AND owed_share = 0
      AND expense_id IN (${sql.join(expenseIds.map((id) => sql`${id}::uuid`), sql`, `)})`)
    // Debts: re-point in bulk; only expenses where both people took part need recomputing.
    await tx.delete(splitExpenseDebts).where(inArray(splitExpenseDebts.expenseId, both.length ? both : ['00000000-0000-0000-0000-000000000000']))
    await tx.update(splitExpenseDebts).set({ fromPersonId: toId }).where(eq(splitExpenseDebts.fromPersonId, fromId))
    await tx.update(splitExpenseDebts).set({ toPersonId: toId }).where(eq(splitExpenseDebts.toPersonId, fromId))
  }

  // The entered split (used by the edit form and recurring copies) names people by id too.
  await tx.execute(sql`
    UPDATE split_expenses SET
      split_input = replace(split_input::text, ${fromId}, ${toId})::jsonb,
      paid_input = replace(paid_input::text, ${fromId}, ${toId})::jsonb
    WHERE split_input::text LIKE ${'%' + fromId + '%'} OR paid_input::text LIKE ${'%' + fromId + '%'}`)
  // Where both were in the same expense the entered split no longer maps to one person each;
  // record the merged result as exact amounts.
  for (const id of both) {
    const rows = await tx.select().from(splitExpenseShares).where(eq(splitExpenseShares.expenseId, id))
    const trim = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v)
    const [e] = await tx.select({ kind: splitExpenses.kind }).from(splitExpenses).where(eq(splitExpenses.id, id))
    if (e.kind !== 'expense') continue
    await tx.update(splitExpenses).set({
      splitMethod: 'exact',
      splitInput: { method: 'exact', amounts: Object.fromEntries(rows.filter((r) => Number(r.owedShare) > 0).map((r) => [r.personId, trim(r.owedShare)])) },
      paidInput: { kind: 'multiple', amounts: Object.fromEntries(rows.filter((r) => Number(r.paidShare) > 0).map((r) => [r.personId, trim(r.paidShare)])) },
    }).where(eq(splitExpenses.id, id))
  }

  // Group memberships.
  const fromGroups = await tx.select().from(splitGroupMembers).where(eq(splitGroupMembers.personId, fromId))
  for (const m of fromGroups) {
    const [existing] = await tx.select().from(splitGroupMembers)
      .where(and(eq(splitGroupMembers.groupId, m.groupId), eq(splitGroupMembers.personId, toId)))
    if (existing) {
      if (!m.removedAt && existing.removedAt) {
        await tx.update(splitGroupMembers).set({ removedAt: null }).where(and(eq(splitGroupMembers.groupId, m.groupId), eq(splitGroupMembers.personId, toId)))
      }
      await tx.delete(splitGroupMembers).where(and(eq(splitGroupMembers.groupId, m.groupId), eq(splitGroupMembers.personId, fromId)))
    } else {
      await tx.update(splitGroupMembers).set({ personId: toId }).where(and(eq(splitGroupMembers.groupId, m.groupId), eq(splitGroupMembers.personId, fromId)))
    }
  }

  // Friendships.
  const fromFriends = await tx.select().from(splitFriendships)
    .where(or(eq(splitFriendships.personLowId, fromId), eq(splitFriendships.personHighId, fromId)))
  for (const f of fromFriends) {
    const other = f.personLowId === fromId ? f.personHighId : f.personLowId
    await tx.delete(splitFriendships).where(eq(splitFriendships.id, f.id))
    if (other === toId) continue
    if (!f.removedAt) await ensureFriendships(tx, [toId, other])
    else {
      const [low, high] = pairOf(toId, other)
      await tx.insert(splitFriendships).values({ personLowId: low, personHighId: high, removedAt: f.removedAt }).onConflictDoNothing()
    }
  }

  // Authorship and history.
  await tx.update(splitComments).set({ personId: toId }).where(eq(splitComments.personId, fromId))
  await tx.update(splitActivity).set({ actorPersonId: toId }).where(eq(splitActivity.actorPersonId, fromId))
  await tx.execute(sql`UPDATE split_activity SET audience = array(SELECT DISTINCT unnest(array_replace(audience, ${fromId}::uuid, ${toId}::uuid))) WHERE audience @> ARRAY[${fromId}]::uuid[]`)
  await tx.update(splitExpenses).set({ createdByPersonId: toId }).where(eq(splitExpenses.createdByPersonId, fromId))
  await tx.update(splitExpenses).set({ updatedByPersonId: toId }).where(eq(splitExpenses.updatedByPersonId, fromId))
  await tx.update(splitExpenses).set({ deletedByPersonId: toId }).where(eq(splitExpenses.deletedByPersonId, fromId))
  await tx.update(splitGroups).set({ createdByPersonId: toId }).where(eq(splitGroups.createdByPersonId, fromId))
  await tx.update(splitGroups).set({ deletedByPersonId: toId }).where(eq(splitGroups.deletedByPersonId, fromId))
  await tx.update(splitGroupMembers).set({ addedByPersonId: toId }).where(eq(splitGroupMembers.addedByPersonId, fromId))
  await tx.update(splitPersons).set({ mergedIntoId: toId, updatedAt: new Date() }).where(eq(splitPersons.id, fromId))

  for (const id of both) {
    const [e] = await tx.select({ deletedAt: splitExpenses.deletedAt }).from(splitExpenses).where(eq(splitExpenses.id, id))
    if (!e.deletedAt) await rebuildDebtsForExpense(tx, id)
  }
  return expenseIds
}

/** Used by the auth hook: may this sign-up proceed because it carries a live invite? */
export async function isValidInviteToken(token: string | null | undefined): Promise<boolean> {
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false
  const [row] = await db.select({ claimedAt: splitInvites.claimedAt, revokedAt: splitInvites.revokedAt, expiresAt: splitInvites.expiresAt })
    .from(splitInvites).where(eq(splitInvites.tokenHash, hashInviteToken(token)))
  return Boolean(row && statusOf(row) === 'valid')
}
