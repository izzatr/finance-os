import {
  db,
  splitActivity,
  splitExpenseBooks,
  splitExpenseDebts,
  splitExpenseShares,
  splitExpenses,
  splitGroups,
  splitPersons,
  transactions,
  wallets,
  categories,
  assets,
} from '@finance-os/db'
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm'
import {
  canAccessExpense,
  currentMemberIds,
  ensureFriendships,
  friendIds,
  lockKeys,
  memberGroup,
  notFound,
  personsById,
  SplitError,
  type Dbx,
  type Me,
  type Tx,
} from './core'
import { booksLockKey, registeredParticipants, syncBaseline, syncUserExpense, userBooksStart } from './books'
import { computeShares, fromMinor, pairwiseDebts, SplitMathError, toMinor, validateShares, type PaidInput, type Share, type SplitInput } from './math'
import { ensureCurrencyAsset, getAssetById } from './currencies'
import { isSharedCategory } from './categories'

export const REPEAT_INTERVALS = ['never', 'weekly', 'fortnightly', 'monthly', 'yearly'] as const
export type RepeatInterval = typeof REPEAT_INTERVALS[number]

export type MyBooksInput = {
  fundingWalletId?: string | null
  fundingAmount?: string | null
  categoryId?: string | null
  linkedTransactionId?: string | null
}

export type ExpenseInput = {
  groupId?: string | null
  kind: 'expense' | 'payment'
  description?: string
  cost: string
  currency: string
  date: string
  category?: string
  notes?: string | null
  paid?: PaidInput
  split?: SplitInput
  payment?: { fromPersonId: string; toPersonId: string }
  repeatInterval?: RepeatInterval
  externalRef?: string | null
  myBooks?: MyBooksInput
}

type Computed = {
  groupId: string | null
  kind: 'expense' | 'payment'
  description: string
  cost: string
  assetId: string
  precision: number
  expenseDate: Date
  category: string
  notes: string | null
  splitMethod: string
  splitInput: Record<string, unknown> | null
  paidInput: Record<string, unknown> | null
  repeatInterval: RepeatInterval
  shares: Share[]
}

function mathError(err: unknown): never {
  if (err instanceof SplitMathError) throw new SplitError(422, err.code, err.message)
  throw err
}

/** The next occurrence strictly after `now`: an old start date never backfills a pile of copies. */
export function nextRepeatAfter(from: Date, interval: RepeatInterval, now = new Date()): Date | null {
  let next = nextRepeat(from, interval)
  for (let i = 0; next && next <= now && i < 10_000; i++) next = nextRepeat(next, interval)
  return next
}

export function nextRepeat(from: Date, interval: RepeatInterval): Date | null {
  if (interval === 'never') return null
  const d = new Date(from)
  if (interval === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (interval === 'fortnightly') d.setUTCDate(d.getUTCDate() + 14)
  else if (interval === 'monthly') {
    const day = d.getUTCDate()
    d.setUTCDate(1)
    d.setUTCMonth(d.getUTCMonth() + 1)
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, last))
  } else if (interval === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

/** Validates the input, computes shares and checks the actor may involve everyone listed. */
async function computeExpense(tx: Tx, me: Me, input: ExpenseInput): Promise<Computed> {
  const asset = await ensureCurrencyAsset(input.currency, tx)
  if (!asset) throw new SplitError(422, 'UNSUPPORTED_CURRENCY', `Unsupported currency: ${input.currency}`)
  const date = new Date(input.date)
  if (Number.isNaN(date.getTime())) throw new SplitError(422, 'INVALID_DATE', 'Invalid date')
  const category = input.kind === 'payment' ? 'payment' : (input.category ?? 'general')
  if (input.kind === 'expense' && !isSharedCategory(category)) throw new SplitError(422, 'INVALID_CATEGORY', `Unknown category: ${category}`)

  let cost: bigint
  try {
    cost = toMinor(input.cost, asset.precision)
  } catch (err) {
    mathError(err)
  }

  let shares: Share[]
  let splitMethod: string
  let description: string
  if (input.kind === 'payment') {
    const p = input.payment
    if (!p) throw new SplitError(422, 'INVALID_PAYMENT', 'A payment needs who paid and who received')
    if (p.fromPersonId === p.toPersonId) throw new SplitError(422, 'INVALID_PAYMENT', 'Someone cannot pay themselves')
    if (cost <= 0n) throw new SplitError(422, 'INVALID_AMOUNT', 'The amount must be more than zero')
    shares = [
      { personId: p.fromPersonId, paid: cost, owed: 0n },
      { personId: p.toPersonId, paid: 0n, owed: cost },
    ].sort((a, b) => (a.personId < b.personId ? -1 : 1))
    splitMethod = 'payment'
    description = input.description?.trim() || 'Payment'
  } else {
    if (!input.paid || !input.split) throw new SplitError(422, 'INVALID_SPLIT', 'An expense needs who paid and how it is split')
    try {
      shares = computeShares(cost, asset.precision, input.paid, input.split)
    } catch (err) {
      mathError(err)
    }
    splitMethod = input.split.method
    description = input.description?.trim() ?? ''
    if (!description) throw new SplitError(422, 'INVALID_DESCRIPTION', 'Add a description')
  }
  try {
    validateShares(cost, shares)
  } catch (err) {
    mathError(err)
  }

  const ids = shares.map((s) => s.personId)
  // FOR SHARE: conflicts with an invite claim merging one of these people (FOR UPDATE).
  const lockedPersons = await tx.execute<{ id: string }>(sql`
    SELECT id FROM split_persons WHERE id IN (${sql.join([...new Set(ids)].map((id) => sql`${id}::uuid`), sql`, `)})
      AND merged_into_id IS NULL ORDER BY id FOR SHARE`)
  if (lockedPersons.rows.length !== new Set(ids).size) throw notFound('Person not found')

  const groupId = input.groupId ?? null
  if (groupId) {
    // FOR SHARE: a member cannot be removed (FOR UPDATE) while an expense involving them is written.
    await tx.execute(sql`SELECT 1 FROM split_groups WHERE id = ${groupId} FOR SHARE`)
    const group = await memberGroup(tx, groupId, me.personId)
    if (!group) throw notFound('Group not found')
    const members = new Set(await currentMemberIds(tx, groupId))
    if (ids.some((id) => !members.has(id))) throw new SplitError(422, 'NOT_A_MEMBER', 'Everyone in the expense must be in the group')
  } else {
    if (!ids.includes(me.personId)) {
      throw new SplitError(422, 'NOT_INVOLVED', 'An expense outside a group must include you')
    }
    const friends = await friendIds(tx, me.personId)
    if (ids.some((id) => id !== me.personId && !friends.has(id))) throw notFound('Person not found')
  }

  const repeatInterval = input.repeatInterval ?? 'never'
  if (!REPEAT_INTERVALS.includes(repeatInterval)) throw new SplitError(422, 'INVALID_REPEAT', 'Invalid repeat interval')

  return {
    groupId,
    kind: input.kind,
    description: description.slice(0, 255),
    cost: fromMinor(cost, asset.precision),
    assetId: asset.id,
    precision: asset.precision,
    expenseDate: date,
    category,
    notes: input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null,
    splitMethod,
    splitInput: input.kind === 'expense' ? (input.split as unknown as Record<string, unknown>) : null,
    paidInput: input.kind === 'expense' ? (input.paid as unknown as Record<string, unknown>) : null,
    repeatInterval: input.kind === 'payment' ? 'never' : repeatInterval,
    shares,
  }
}

async function writeSharesAndDebts(tx: Tx, expenseId: string, c: Pick<Computed, 'shares' | 'precision' | 'assetId' | 'groupId'>, live: boolean) {
  await tx.delete(splitExpenseShares).where(eq(splitExpenseShares.expenseId, expenseId))
  await tx.insert(splitExpenseShares).values(c.shares.map((s) => ({
    expenseId,
    personId: s.personId,
    paidShare: fromMinor(s.paid, c.precision),
    owedShare: fromMinor(s.owed, c.precision),
  })))
  await rebuildDebts(tx, expenseId, live, c)
}

async function rebuildDebts(tx: Tx, expenseId: string, live: boolean, c?: Pick<Computed, 'shares' | 'precision' | 'assetId' | 'groupId'>) {
  await tx.delete(splitExpenseDebts).where(eq(splitExpenseDebts.expenseId, expenseId))
  if (!live) return
  let info = c
  if (!info) {
    const [e] = await tx.select({ assetId: splitExpenses.assetId, groupId: splitExpenses.groupId, precision: assets.precision })
      .from(splitExpenses).innerJoin(assets, eq(assets.id, splitExpenses.assetId)).where(eq(splitExpenses.id, expenseId))
    const rows = await tx.select().from(splitExpenseShares).where(eq(splitExpenseShares.expenseId, expenseId))
    info = {
      assetId: e.assetId,
      groupId: e.groupId,
      precision: e.precision,
      shares: rows.map((r) => ({ personId: r.personId, paid: toMinor(trimDecimal(r.paidShare), e.precision), owed: toMinor(trimDecimal(r.owedShare), e.precision) })),
    }
  }
  const debts = pairwiseDebts(info.shares)
  if (debts.length) {
    await tx.insert(splitExpenseDebts).values(debts.map((d) => ({
      expenseId,
      fromPersonId: d.from,
      toPersonId: d.to,
      groupId: info.groupId,
      assetId: info.assetId,
      amount: fromMinor(d.amount, info.precision),
    })))
  }
}

export async function rebuildDebtsForExpense(tx: Tx, expenseId: string) {
  await rebuildDebts(tx, expenseId, true)
}

/** '12.34000000' -> '12.34' so toMinor accepts numeric(20,8) output at currency precision. */
export function trimDecimal(v: string): string {
  return v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v
}

/**
 * Brings every affected user's books in line with the expense. `before` carries the participants,
 * currency and date the expense had before this write, so users who dropped out are cleaned up.
 */
export async function syncBooksFor(tx: Tx, expenseId: string, before: { userIds: string[]; assetId: string; date: Date } | null) {
  const [after] = await tx.select({ assetId: splitExpenses.assetId, date: splitExpenses.expenseDate }).from(splitExpenses).where(eq(splitExpenses.id, expenseId))
  const now = await registeredParticipants(tx, expenseId)
  const userIds = [...new Set([...(before?.userIds ?? []), ...now.map((p) => p.userId)])]
  const assetIds = [...new Set([after.assetId, ...(before ? [before.assetId] : [])])]
  await lockKeys(tx, userIds.flatMap((u) => assetIds.map((a) => booksLockKey(u, a))))
  for (const userId of userIds) {
    await syncUserExpense(tx, userId, expenseId)
    const start = await userBooksStart(tx, userId)
    if (!start) continue
    const touchesBaseline = after.date < start || (before !== null && before.date < start)
    if (touchesBaseline) for (const a of assetIds) await syncBaseline(tx, userId, a)
  }
}

async function saveMyBooks(tx: Tx, me: Me, expenseId: string, input: MyBooksInput, expense: { assetId: string; kind: string }) {
  const current = (await tx.select().from(splitExpenseBooks)
    .where(and(eq(splitExpenseBooks.expenseId, expenseId), eq(splitExpenseBooks.userId, me.userId))))[0]
  const next = {
    fundingWalletId: input.fundingWalletId !== undefined ? input.fundingWalletId : current?.fundingWalletId ?? null,
    fundingAmount: input.fundingAmount !== undefined ? input.fundingAmount : current?.fundingAmount ?? null,
    categoryId: input.categoryId !== undefined ? input.categoryId : current?.categoryId ?? null,
    linkedTransactionId: input.linkedTransactionId !== undefined ? input.linkedTransactionId : current?.linkedTransactionId ?? null,
  }
  if (next.fundingWalletId) {
    const [w] = await tx.select({ assetId: wallets.assetId, systemRole: wallets.systemRole }).from(wallets)
      .where(and(eq(wallets.id, next.fundingWalletId), eq(wallets.userId, me.userId), isNull(wallets.deletedAt)))
    if (!w || w.systemRole) throw notFound('Wallet not found')
    if (w.assetId === expense.assetId) {
      next.fundingAmount = null
    } else if (!next.fundingAmount || !/^\d+(\.\d+)?$/.test(next.fundingAmount) || Number(next.fundingAmount) <= 0) {
      throw new SplitError(422, 'FUNDING_AMOUNT_REQUIRED', 'This wallet uses another currency: enter the amount it was charged')
    } else {
      const [wa] = await tx.select({ precision: assets.precision }).from(assets).where(eq(assets.id, w.assetId))
      try {
        if (toMinor(next.fundingAmount, wa.precision) <= 0n) throw new SplitMathError('INVALID_AMOUNT', 'too small')
      } catch {
        throw new SplitError(422, 'INVALID_AMOUNT', `Enter the charged amount with at most ${wa.precision} decimals`)
      }
    }
  } else {
    next.fundingAmount = null
  }
  if (next.categoryId) {
    const [cat] = await tx.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, next.categoryId), eq(categories.userId, me.userId)))
    if (!cat) throw notFound('Category not found')
  }
  if (next.linkedTransactionId) {
    const [t] = await tx.select({ id: transactions.id, managedBy: transactions.managedBy }).from(transactions)
      .where(and(eq(transactions.id, next.linkedTransactionId), eq(transactions.userId, me.userId), isNull(transactions.deletedAt)))
    if (!t || t.managedBy) throw notFound('Transaction not found')
    const [taken] = await tx.select({ expenseId: splitExpenseBooks.expenseId }).from(splitExpenseBooks)
      .where(and(eq(splitExpenseBooks.userId, me.userId), eq(splitExpenseBooks.linkedTransactionId, next.linkedTransactionId)))
    if (taken && taken.expenseId !== expenseId) throw new SplitError(409, 'ALREADY_LINKED', 'That transaction is already linked to another shared expense')
  }
  await tx.insert(splitExpenseBooks).values({ expenseId, userId: me.userId, ...next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [splitExpenseBooks.expenseId, splitExpenseBooks.userId], set: { ...next, updatedAt: new Date() } })
}

async function audienceFor(tx: Tx, expenseId: string, groupId: string | null): Promise<string[]> {
  const shareIds = (await tx.select({ personId: splitExpenseShares.personId }).from(splitExpenseShares)
    .where(eq(splitExpenseShares.expenseId, expenseId))).map((r) => r.personId)
  const memberIds = groupId ? await currentMemberIds(tx, groupId) : []
  return [...new Set([...shareIds, ...memberIds])]
}

export async function recordActivity(tx: Tx, entry: {
  actorPersonId: string | null
  kind: string
  groupId?: string | null
  expenseId?: string | null
  data?: Record<string, unknown>
  audience: string[]
}) {
  if (entry.audience.length === 0) return
  await tx.insert(splitActivity).values({
    actorPersonId: entry.actorPersonId,
    kind: entry.kind,
    groupId: entry.groupId ?? null,
    expenseId: entry.expenseId ?? null,
    data: entry.data ?? {},
    audience: [...new Set(entry.audience)],
  })
}

async function currencyCode(tx: Tx, assetId: string) {
  return (await getAssetById(assetId, tx))?.code ?? '???'
}

export async function createExpense(me: Me, input: ExpenseInput, actor: { kind?: string } = {}): Promise<string> {
  return db.transaction((tx) => createExpenseIn(tx, me, input, actor))
}

export async function createExpenseIn(tx: Tx, me: Me, input: ExpenseInput, actor: { kind?: string } = {}): Promise<string> {
  {
    const c = await computeExpense(tx, me, input)
    if (input.externalRef) {
      const [dupe] = await tx.select({ id: splitExpenses.id }).from(splitExpenses)
        .where(and(eq(splitExpenses.createdByPersonId, me.personId), eq(splitExpenses.externalRef, input.externalRef)))
      if (dupe) throw new SplitError(409, 'DUPLICATE_EXTERNAL_REF', `Already imported as ${dupe.id}`)
    }
    const [row] = await tx.insert(splitExpenses).values({
      groupId: c.groupId,
      kind: c.kind,
      description: c.description,
      cost: c.cost,
      assetId: c.assetId,
      expenseDate: c.expenseDate,
      category: c.category,
      notes: c.notes,
      splitMethod: c.splitMethod,
      splitInput: c.splitInput,
      paidInput: c.paidInput,
      repeatInterval: c.repeatInterval,
      nextRepeatAt: nextRepeatAfter(c.expenseDate, c.repeatInterval),
      createdByPersonId: me.personId,
      updatedByPersonId: me.personId,
      externalRef: input.externalRef ?? null,
    }).returning({ id: splitExpenses.id })
    await writeSharesAndDebts(tx, row.id, c, true)
    if (input.myBooks && c.shares.some((s) => s.personId === me.personId)) {
      await saveMyBooks(tx, me, row.id, input.myBooks, c)
    }
    await syncBooksFor(tx, row.id, null)
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: c.kind === 'payment' ? 'payment.created' : actor.kind ?? 'expense.created',
      groupId: c.groupId,
      expenseId: row.id,
      data: { description: c.description, cost: c.cost, currency: await currencyCode(tx, c.assetId) },
      audience: await audienceFor(tx, row.id, c.groupId),
    })
    return row.id
  }
}

/**
 * Locks an expense for writing. A group expense can only be changed by current members of its
 * group; someone who left keeps read access to what they took part in, nothing more.
 * `booksOnly` (your private bookkeeping) only needs read access.
 */
async function lockExpense(tx: Tx, me: Me, expenseId: string, opts: { booksOnly?: boolean } = {}) {
  const rows = await tx.execute<{ id: string; group_id: string | null; version: number; deleted_at: Date | null; asset_id: string; expense_date: Date; kind: string; description: string; repeat_interval: string }>(sql`
    SELECT id, group_id, version, deleted_at, asset_id, expense_date, kind, description, repeat_interval FROM split_expenses WHERE id = ${expenseId} FOR UPDATE`)
  const row = rows.rows[0]
  if (!row) throw notFound('Expense not found')
  if (!(await canAccessExpense(tx, { id: row.id, groupId: row.group_id }, me.personId))) throw notFound('Expense not found')
  if (!opts.booksOnly && row.group_id && !(await isCurrentMember(tx, row.group_id, me.personId))) {
    throw new SplitError(403, 'NOT_A_MEMBER', 'You left this group, so you can no longer change its expenses')
  }
  return { ...row, expense_date: new Date(row.expense_date) }
}

async function isCurrentMember(tx: Dbx, groupId: string, personId: string) {
  const r = await tx.execute(sql`SELECT 1 FROM split_group_members WHERE group_id = ${groupId} AND person_id = ${personId} AND removed_at IS NULL`)
  return r.rows.length > 0
}

/** For comments and other writes outside a transaction: same rule as lockExpense. */
export async function assertCanModifyExpense(me: Me, expenseId: string) {
  const row = await assertExpenseAccess(me, expenseId)
  if (row.groupId && !(await isCurrentMember(db, row.groupId, me.personId))) {
    throw new SplitError(403, 'NOT_A_MEMBER', 'You left this group, so you can no longer change its expenses')
  }
  return row
}

async function snapshotForBooks(tx: Tx, expenseId: string, assetId: string, date: Date) {
  return { userIds: (await registeredParticipants(tx, expenseId)).map((p) => p.userId), assetId, date }
}

export async function updateExpense(me: Me, expenseId: string, input: ExpenseInput & { version?: number }): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, me, expenseId)
    if (current.deleted_at) throw new SplitError(410, 'DELETED', 'This expense was deleted; restore it first')
    if (input.version === undefined) throw new SplitError(422, 'VERSION_REQUIRED', 'Send the version you edited')
    if (input.version !== current.version) {
      throw new SplitError(409, 'VERSION_CONFLICT', 'Someone else changed this expense. Reload and try again.')
    }
    if ((input.kind ?? current.kind) !== current.kind) throw new SplitError(422, 'KIND_CHANGE', 'An expense cannot become a payment or the other way round')
    // Moving between groups (or out of one) requires membership of both sides.
    const before = await snapshotForBooks(tx, expenseId, current.asset_id, current.expense_date)
    const beforeAudience = await audienceFor(tx, expenseId, current.group_id)
    if (current.group_id && input.groupId !== undefined && input.groupId !== current.group_id) {
      await tx.execute(sql`SELECT 1 FROM split_groups WHERE id = ${current.group_id} FOR SHARE`)
    }
    const c = await computeExpense(tx, me, {
      ...input,
      groupId: input.groupId === undefined ? current.group_id : input.groupId,
      repeatInterval: input.repeatInterval ?? (current.repeat_interval as RepeatInterval),
    })
    await tx.update(splitExpenses).set({
      groupId: c.groupId,
      description: c.description,
      cost: c.cost,
      assetId: c.assetId,
      expenseDate: c.expenseDate,
      category: c.category,
      notes: c.notes,
      splitMethod: c.splitMethod,
      splitInput: c.splitInput,
      paidInput: c.paidInput,
      repeatInterval: c.repeatInterval,
      nextRepeatAt: nextRepeatAfter(c.expenseDate, c.repeatInterval),
      updatedByPersonId: me.personId,
      updatedAt: new Date(),
      version: sql`${splitExpenses.version} + 1`,
    }).where(eq(splitExpenses.id, expenseId))
    await writeSharesAndDebts(tx, expenseId, c, true)
    if (input.myBooks && c.shares.some((s) => s.personId === me.personId)) await saveMyBooks(tx, me, expenseId, input.myBooks, c)
    // Bookkeeping choices of people no longer in the expense are dropped.
    const stillIn = (await registeredParticipants(tx, expenseId)).map((p) => p.userId)
    const prefs = await tx.select({ userId: splitExpenseBooks.userId }).from(splitExpenseBooks).where(eq(splitExpenseBooks.expenseId, expenseId))
    for (const p of prefs) {
      if (!stillIn.includes(p.userId)) {
        await tx.delete(splitExpenseBooks).where(and(eq(splitExpenseBooks.expenseId, expenseId), eq(splitExpenseBooks.userId, p.userId)))
      }
    }
    await syncBooksFor(tx, expenseId, before)
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: c.kind === 'payment' ? 'payment.updated' : 'expense.updated',
      groupId: c.groupId,
      expenseId,
      data: { description: c.description, cost: c.cost, currency: await currencyCode(tx, c.assetId), previousDescription: current.description },
      audience: [...new Set([...beforeAudience, ...(await audienceFor(tx, expenseId, c.groupId))])],
    })
  })
}

export async function deleteExpense(me: Me, expenseId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, me, expenseId)
    if (current.deleted_at) return
    const before = await snapshotForBooks(tx, expenseId, current.asset_id, current.expense_date)
    await tx.update(splitExpenses).set({ deletedAt: new Date(), deletedByPersonId: me.personId, nextRepeatAt: null }).where(eq(splitExpenses.id, expenseId))
    await rebuildDebts(tx, expenseId, false)
    await syncBooksFor(tx, expenseId, before)
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: current.kind === 'payment' ? 'payment.deleted' : 'expense.deleted',
      groupId: current.group_id,
      expenseId,
      data: { description: current.description },
      audience: await audienceFor(tx, expenseId, current.group_id),
    })
  })
}

export async function restoreExpense(me: Me, expenseId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, me, expenseId)
    if (!current.deleted_at) return
    if (current.group_id) {
      const [g] = await tx.select({ deletedAt: splitGroups.deletedAt }).from(splitGroups).where(eq(splitGroups.id, current.group_id))
      if (g?.deletedAt) throw new SplitError(409, 'GROUP_DELETED', 'Restore the group first')
      // Everyone in the expense must still be in the group.
      const members = new Set(await currentMemberIds(tx, current.group_id))
      const shareIds = (await tx.select({ personId: splitExpenseShares.personId }).from(splitExpenseShares).where(eq(splitExpenseShares.expenseId, expenseId))).map((r) => r.personId)
      if (shareIds.some((id) => !members.has(id))) throw new SplitError(409, 'MEMBER_LEFT', 'Someone in this expense has left the group')
    }
    const [e] = await tx.select({ repeatInterval: splitExpenses.repeatInterval, expenseDate: splitExpenses.expenseDate }).from(splitExpenses).where(eq(splitExpenses.id, expenseId))
    await tx.update(splitExpenses).set({
      deletedAt: null,
      deletedByPersonId: null,
      updatedByPersonId: me.personId,
      updatedAt: new Date(),
      version: sql`${splitExpenses.version} + 1`,
      nextRepeatAt: nextRepeatAfter(e.expenseDate, e.repeatInterval as RepeatInterval),
    }).where(eq(splitExpenses.id, expenseId))
    await rebuildDebts(tx, expenseId, true)
    await syncBooksFor(tx, expenseId, null)
    await recordActivity(tx, {
      actorPersonId: me.personId,
      kind: current.kind === 'payment' ? 'payment.restored' : 'expense.restored',
      groupId: current.group_id,
      expenseId,
      data: { description: current.description },
      audience: await audienceFor(tx, expenseId, current.group_id),
    })
  })
}

export async function setMyBooks(me: Me, expenseId: string, input: MyBooksInput): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockExpense(tx, me, expenseId, { booksOnly: true })
    const [share] = await tx.select({ one: sql`1` }).from(splitExpenseShares)
      .where(and(eq(splitExpenseShares.expenseId, expenseId), eq(splitExpenseShares.personId, me.personId)))
    if (!share) throw new SplitError(422, 'NOT_INVOLVED', 'You are not part of this expense')
    await saveMyBooks(tx, me, expenseId, input, { assetId: current.asset_id, kind: current.kind })
    await lockKeys(tx, [booksLockKey(me.userId, current.asset_id)])
    await syncUserExpense(tx, me.userId, expenseId)
  })
}

// ---------------------------------------------------------------------------------------------
// Reading

export type ExpenseView = Awaited<ReturnType<typeof loadExpenseViews>>[number]

export async function loadExpenseViews(me: Me, ids: string[]) {
  if (ids.length === 0) return []
  const rows = await db.select({
    id: splitExpenses.id,
    groupId: splitExpenses.groupId,
    groupName: splitGroups.name,
    kind: splitExpenses.kind,
    description: splitExpenses.description,
    cost: splitExpenses.cost,
    currency: assets.code,
    precision: assets.precision,
    date: splitExpenses.expenseDate,
    category: splitExpenses.category,
    notes: splitExpenses.notes,
    splitMethod: splitExpenses.splitMethod,
    splitInput: splitExpenses.splitInput,
    paidInput: splitExpenses.paidInput,
    repeatInterval: splitExpenses.repeatInterval,
    createdBy: splitExpenses.createdByPersonId,
    updatedBy: splitExpenses.updatedByPersonId,
    createdAt: splitExpenses.createdAt,
    updatedAt: splitExpenses.updatedAt,
    deletedAt: splitExpenses.deletedAt,
    version: splitExpenses.version,
  }).from(splitExpenses)
    .innerJoin(assets, eq(assets.id, splitExpenses.assetId))
    .leftJoin(splitGroups, eq(splitGroups.id, splitExpenses.groupId))
    .where(inArray(splitExpenses.id, ids))
  const shares = await db.select({
    expenseId: splitExpenseShares.expenseId,
    personId: splitExpenseShares.personId,
    paid: splitExpenseShares.paidShare,
    owed: splitExpenseShares.owedShare,
    name: splitPersons.displayName,
    isGuest: sql<boolean>`${splitPersons.userId} IS NULL`,
  }).from(splitExpenseShares).innerJoin(splitPersons, eq(splitPersons.id, splitExpenseShares.personId))
    .where(inArray(splitExpenseShares.expenseId, ids))
  const books = await db.select().from(splitExpenseBooks)
    .where(and(inArray(splitExpenseBooks.expenseId, ids), eq(splitExpenseBooks.userId, me.userId)))
  const projections = await db.select({ id: transactions.id, ref: transactions.externalRef }).from(transactions)
    .where(and(eq(transactions.userId, me.userId), eq(transactions.managedBy, 'split'), isNull(transactions.deletedAt),
      inArray(transactions.externalRef, ids.map((id) => `split:expense:${id}`))))
  const projectionBy = new Map(projections.map((p) => [p.ref!.slice('split:expense:'.length), p.id]))
  const personIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy].filter((x): x is string => Boolean(x))))]
  const persons = await personsById(db, personIds)
  const order = new Map(ids.map((id, i) => [id, i]))
  return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!).map((r) => {
    const p = r.precision
    const fmt = (v: string) => fromMinor(toMinor(trimDecimal(v), p), p)
    const myShares = shares.filter((s) => s.expenseId === r.id)
    const mine = myShares.find((s) => s.personId === me.personId)
    const myBooks = books.find((b) => b.expenseId === r.id)
    const paidMine = mine ? toMinor(trimDecimal(mine.paid), p) : 0n
    const owedMine = mine ? toMinor(trimDecimal(mine.owed), p) : 0n
    return {
      id: r.id,
      groupId: r.groupId,
      groupName: r.groupName,
      kind: r.kind,
      description: r.description,
      cost: fmt(r.cost),
      currency: r.currency,
      date: r.date.toISOString(),
      category: r.category,
      notes: r.notes,
      splitMethod: r.splitMethod,
      splitInput: r.splitInput,
      paidInput: r.paidInput,
      repeatInterval: r.repeatInterval,
      shares: myShares.map((s) => ({ personId: s.personId, name: s.name, isGuest: s.isGuest, paid: fmt(s.paid), owed: fmt(s.owed) })),
      createdBy: { personId: r.createdBy, name: persons.get(r.createdBy)?.displayName ?? 'Someone' },
      updatedBy: r.updatedBy ? { personId: r.updatedBy, name: persons.get(r.updatedBy)?.displayName ?? 'Someone' } : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      version: r.version,
      me: mine ? { paid: fromMinor(paidMine, p), owed: fromMinor(owedMine, p), net: fromMinor(paidMine - owedMine, p) } : null,
      myBooks: mine ? {
        fundingWalletId: myBooks?.fundingWalletId ?? null,
        fundingAmount: myBooks?.fundingAmount ? trimDecimal(myBooks.fundingAmount) : null,
        categoryId: myBooks?.categoryId ?? null,
        linkedTransactionId: myBooks?.linkedTransactionId ?? null,
        transactionId: projectionBy.get(r.id) ?? null,
      } : null,
    }
  })
}

export async function getExpense(me: Me, expenseId: string) {
  const [row] = await db.select({ id: splitExpenses.id, groupId: splitExpenses.groupId }).from(splitExpenses).where(eq(splitExpenses.id, expenseId))
  if (!row || !(await canAccessExpense(db, row, me.personId))) throw notFound('Expense not found')
  const [view] = await loadExpenseViews(me, [expenseId])
  return view
}

/** Expense ids the person can see: theirs, plus anything in live groups they currently belong to. */
function visibleCondition(personId: string): SQL {
  return sql`(
    EXISTS (SELECT 1 FROM split_expense_shares s WHERE s.expense_id = ${splitExpenses.id} AND s.person_id = ${personId})
    OR EXISTS (
      SELECT 1 FROM split_group_members m JOIN split_groups g ON g.id = m.group_id AND g.deleted_at IS NULL
      WHERE m.group_id = ${splitExpenses.groupId} AND m.person_id = ${personId} AND m.removed_at IS NULL
    )
  )`
}

export async function listExpenses(me: Me, filters: {
  groupId?: string
  friendId?: string
  q?: string
  before?: { date: string; id: string }
  limit: number
  includeDeleted?: boolean
}) {
  const conds: SQL[] = [visibleCondition(me.personId)]
  if (!filters.includeDeleted) conds.push(isNull(splitExpenses.deletedAt))
  if (filters.groupId) conds.push(eq(splitExpenses.groupId, filters.groupId))
  if (filters.friendId) {
    conds.push(sql`EXISTS (SELECT 1 FROM split_expense_shares s WHERE s.expense_id = ${splitExpenses.id} AND s.person_id = ${filters.friendId})`)
    conds.push(sql`EXISTS (SELECT 1 FROM split_expense_shares s WHERE s.expense_id = ${splitExpenses.id} AND s.person_id = ${me.personId})`)
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    conds.push(or(sql`${splitExpenses.description} ILIKE ${like}`, sql`${splitExpenses.notes} ILIKE ${like}`)!)
  }
  if (filters.before) {
    const d = new Date(filters.before.date)
    conds.push(or(lt(splitExpenses.expenseDate, d), and(eq(splitExpenses.expenseDate, d), lt(splitExpenses.id, filters.before.id)))!)
  }
  const rows = await db.select({ id: splitExpenses.id, date: splitExpenses.expenseDate }).from(splitExpenses)
    .where(and(...conds))
    .orderBy(desc(splitExpenses.expenseDate), desc(splitExpenses.id))
    .limit(filters.limit + 1)
  const page = rows.slice(0, filters.limit)
  const next = rows.length > filters.limit ? { date: page[page.length - 1].date.toISOString(), id: page[page.length - 1].id } : null
  return { data: await loadExpenseViews(me, page.map((r) => r.id)), next }
}

export async function assertExpenseAccess(me: Me, expenseId: string) {
  const [row] = await db.select({ id: splitExpenses.id, groupId: splitExpenses.groupId }).from(splitExpenses).where(eq(splitExpenses.id, expenseId))
  if (!row || !(await canAccessExpense(db, row, me.personId))) throw notFound('Expense not found')
  return row
}

export { audienceFor }
