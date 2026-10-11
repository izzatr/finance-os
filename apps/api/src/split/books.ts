/**
 * Projects shared expenses into each registered participant's own books.
 *
 * - One system wallet per user and currency (`system_role = 'split'`) holds the net of what
 *   friends owe the user. Its balance always equals sum(paid - owed) over the user's live shares.
 * - Expenses on/after the user's books start get one managed transaction each.
 * - Older expenses are summarised in one managed adjustment per currency (the baseline), which
 *   also absorbs any pre-existing entries in an adopted wallet.
 */
import {
  assets,
  categories,
  splitExpenseBooks,
  splitExpenseShares,
  splitExpenses,
  splitGroups,
  splitPersons,
  splitUserSettings,
  transactionEntries,
  transactions,
  wallets,
} from '@finance-os/db'
import { and, eq, isNull, isNotNull, lt, sql } from 'drizzle-orm'
import type { Tx } from './core'
import { mapToUserCategory } from './categories'
import { fromMinor, toMinor } from './math'

export const MANAGED = 'split'
export const expenseRef = (expenseId: string) => `split:expense:${expenseId}`
export const baselineRef = (assetCode: string) => `split:baseline:${assetCode}`
export const booksLockKey = (userId: string, assetId: string) => `split-books:${userId}:${assetId}`

export async function getOrCreateSharedWallet(tx: Tx, userId: string, asset: { id: string; code: string }): Promise<string> {
  const find = () => tx.select({ id: wallets.id }).from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.assetId, asset.id), eq(wallets.systemRole, 'split'), isNull(wallets.deletedAt)))
  const [existing] = await find()
  if (existing) return existing.id
  await tx.insert(wallets).values({
    userId,
    name: `Friends · ${asset.code}`,
    walletType: 'custom',
    assetId: asset.id,
    systemRole: 'split',
  }).onConflictDoNothing()
  const [created] = await find()
  return created.id
}

async function findManaged(tx: Tx, userId: string, ref: string) {
  const [row] = await tx.select({ id: transactions.id, deletedAt: transactions.deletedAt }).from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.externalRef, ref), eq(transactions.managedBy, MANAGED)))
  return row ?? null
}

async function removeManaged(tx: Tx, userId: string, ref: string) {
  const existing = await findManaged(tx, userId, ref)
  if (existing && !existing.deletedAt) {
    await tx.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, existing.id))
  }
}

type Entry = { walletId: string; assetId: string; amount: string }

async function upsertManaged(tx: Tx, userId: string, ref: string, fields: {
  transactionDate: Date
  type: 'expense' | 'transfer' | 'adjustment'
  description: string
  notes: string | null
  categoryId: string | null
}, entries: Entry[]): Promise<string> {
  const existing = await findManaged(tx, userId, ref)
  let id: string
  if (existing) {
    id = existing.id
    await tx.update(transactions).set({ ...fields, deletedAt: null }).where(eq(transactions.id, id))
    await tx.delete(transactionEntries).where(eq(transactionEntries.transactionId, id))
  } else {
    const [row] = await tx.insert(transactions).values({ userId, externalRef: ref, managedBy: MANAGED, ...fields }).returning({ id: transactions.id })
    id = row.id
  }
  if (entries.length) await tx.insert(transactionEntries).values(entries.map((e) => ({ ...e, transactionId: id })))
  return id
}

/**
 * Rebuilds `userId`'s view of one expense. Call with the books lock held for every currency the
 * expense touches (old and new).
 */
export async function syncUserExpense(tx: Tx, userId: string, expenseId: string): Promise<void> {
  const [settings] = await tx.select({ personId: splitUserSettings.personId, booksStart: splitUserSettings.booksStart })
    .from(splitUserSettings).where(eq(splitUserSettings.userId, userId))
  const ref = expenseRef(expenseId)
  if (!settings) return removeManaged(tx, userId, ref)

  const [expense] = await tx.select({
    id: splitExpenses.id,
    kind: splitExpenses.kind,
    description: splitExpenses.description,
    expenseDate: splitExpenses.expenseDate,
    category: splitExpenses.category,
    deletedAt: splitExpenses.deletedAt,
    assetId: splitExpenses.assetId,
    assetCode: assets.code,
    precision: assets.precision,
    groupName: splitGroups.name,
  }).from(splitExpenses)
    .innerJoin(assets, eq(assets.id, splitExpenses.assetId))
    .leftJoin(splitGroups, eq(splitGroups.id, splitExpenses.groupId))
    .where(eq(splitExpenses.id, expenseId))
  if (!expense) return removeManaged(tx, userId, ref)

  const [share] = await tx.select({ paid: splitExpenseShares.paidShare, owed: splitExpenseShares.owedShare })
    .from(splitExpenseShares)
    .where(and(eq(splitExpenseShares.expenseId, expenseId), eq(splitExpenseShares.personId, settings.personId)))

  if (expense.deletedAt || !share || expense.expenseDate < settings.booksStart) {
    return removeManaged(tx, userId, ref)
  }

  const [books] = await tx.select().from(splitExpenseBooks)
    .where(and(eq(splitExpenseBooks.expenseId, expenseId), eq(splitExpenseBooks.userId, userId)))

  const p = expense.precision
  const paid = toMinor(share.paid, p)
  const owed = toMinor(share.owed, p)
  const entries: Entry[] = []
  const delta = paid - owed
  if (delta !== 0n) {
    const walletId = await getOrCreateSharedWallet(tx, userId, { id: expense.assetId, code: expense.assetCode })
    entries.push({ walletId, assetId: expense.assetId, amount: fromMinor(delta, p) })
  }

  // The real-money leg, when the user told us where the money came from / went to.
  if (books?.fundingWalletId && !books.linkedTransactionId) {
    const [w] = await tx.select({ id: wallets.id, assetId: wallets.assetId }).from(wallets)
      .where(and(eq(wallets.id, books.fundingWalletId), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
    if (w) {
      const cashMinor = expense.kind === 'payment' ? (paid > 0n ? -paid : owed) : -paid
      if (cashMinor !== 0n) {
        let amount: string
        if (w.assetId === expense.assetId) {
          amount = fromMinor(cashMinor, p)
        } else if (books.fundingAmount) {
          const abs = books.fundingAmount.replace(/^-/, '')
          amount = cashMinor < 0n ? `-${abs}` : abs
        } else {
          amount = ''
        }
        if (amount) entries.push({ walletId: w.id, assetId: w.assetId, amount })
      }
    }
  }

  if (entries.length === 0) return removeManaged(tx, userId, ref)

  let description = expense.description
  if (expense.kind === 'payment') {
    const others = await tx.select({ personId: splitExpenseShares.personId, paid: splitExpenseShares.paidShare, name: splitPersons.displayName })
      .from(splitExpenseShares).innerJoin(splitPersons, eq(splitPersons.id, splitExpenseShares.personId))
      .where(eq(splitExpenseShares.expenseId, expenseId))
    const other = others.find((o) => o.personId !== settings.personId)
    description = paid > 0n ? `You paid ${other?.name ?? 'a friend'}` : `${other?.name ?? 'A friend'} paid you`
  }

  let categoryId: string | null = null
  if (expense.kind === 'expense') {
    if (books?.categoryId) {
      categoryId = books.categoryId
    } else {
      const cats = await tx.select({ id: categories.id, slug: categories.slug, type: categories.type }).from(categories).where(eq(categories.userId, userId))
      categoryId = mapToUserCategory(expense.category, cats)
    }
  }

  // A projection linked to an imported payment carries that payment's date, so a card charge that
  // posts a day later still lands in the same month as its other half.
  let transactionDate = expense.expenseDate
  if (books?.linkedTransactionId) {
    const [linked] = await tx.select({ date: transactions.transactionDate }).from(transactions)
      .where(and(eq(transactions.id, books.linkedTransactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)))
    if (linked) transactionDate = linked.date
  }

  await upsertManaged(tx, userId, ref, {
    transactionDate,
    type: expense.kind === 'payment' ? 'transfer' : 'expense',
    description: description.slice(0, 255),
    notes: expense.groupName ? `Shared · ${expense.groupName}` : 'Shared',
    categoryId,
  }, entries)
}

/** Rebuilds the opening adjustment for one user and currency. Call with the books lock held. */
export async function syncBaseline(tx: Tx, userId: string, assetId: string): Promise<void> {
  const [settings] = await tx.select({ personId: splitUserSettings.personId, booksStart: splitUserSettings.booksStart })
    .from(splitUserSettings).where(eq(splitUserSettings.userId, userId))
  const [asset] = await tx.select({ id: assets.id, code: assets.code, precision: assets.precision }).from(assets).where(eq(assets.id, assetId))
  if (!settings || !asset) return
  const ref = baselineRef(asset.code)

  const [pre] = await tx.select({ net: sql<string>`coalesce(sum(${splitExpenseShares.paidShare} - ${splitExpenseShares.owedShare}), 0)` })
    .from(splitExpenseShares)
    .innerJoin(splitExpenses, eq(splitExpenses.id, splitExpenseShares.expenseId))
    .where(and(
      eq(splitExpenseShares.personId, settings.personId),
      eq(splitExpenses.assetId, assetId),
      isNull(splitExpenses.deletedAt),
      lt(splitExpenses.expenseDate, settings.booksStart),
    ))

  // Entries already in the shared wallet that we did not write (an adopted wallet's history).
  const [wallet] = await tx.select({ id: wallets.id }).from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.assetId, assetId), eq(wallets.systemRole, 'split'), isNull(wallets.deletedAt)))
  let legacy = 0n
  if (wallet) {
    const [row] = await tx.select({ total: sql<string>`coalesce(sum(${transactionEntries.amount}), 0)` })
      .from(transactionEntries)
      .innerJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .where(and(eq(transactionEntries.walletId, wallet.id), isNull(transactions.deletedAt), isNull(transactions.managedBy)))
    legacy = decimalToMinorLoose(row.total, asset.precision)
  }

  const amount = decimalToMinorLoose(pre.net, asset.precision) - legacy
  if (amount === 0n) return removeManaged(tx, userId, ref)
  const walletId = wallet?.id ?? await getOrCreateSharedWallet(tx, userId, asset)
  await upsertManaged(tx, userId, ref, {
    transactionDate: new Date(settings.booksStart.getTime() - 1000),
    type: 'adjustment',
    description: `Shared balances before ${settings.booksStart.toISOString().slice(0, 10)}`,
    notes: 'Opening balance with friends, kept up to date automatically',
    categoryId: null,
  }, [{ walletId, assetId, amount: fromMinor(amount, asset.precision) }])
}

/** numeric(20,8) strings may carry trailing zeros beyond the currency precision; round them away. */
function decimalToMinorLoose(value: string, precision: number): bigint {
  const [whole, frac = ''] = value.replace(/^-/, '').split('.')
  const neg = value.startsWith('-')
  const scaled = BigInt(whole) * 10n ** BigInt(precision) + BigInt((frac + '0'.repeat(precision)).slice(0, precision) || '0')
  return neg ? -scaled : scaled
}

/** Users (registered participants) of an expense, with their person id. */
export async function registeredParticipants(tx: Tx, expenseId: string): Promise<Array<{ userId: string; personId: string }>> {
  const rows = await tx.select({ userId: splitPersons.userId, personId: splitPersons.id })
    .from(splitExpenseShares)
    .innerJoin(splitPersons, eq(splitPersons.id, splitExpenseShares.personId))
    .where(and(eq(splitExpenseShares.expenseId, expenseId), isNotNull(splitPersons.userId)))
  return rows.filter((r): r is { userId: string; personId: string } => r.userId !== null)
}

export async function userBooksStart(tx: Tx, userId: string): Promise<Date | null> {
  const [row] = await tx.select({ booksStart: splitUserSettings.booksStart }).from(splitUserSettings).where(eq(splitUserSettings.userId, userId))
  return row?.booksStart ?? null
}
