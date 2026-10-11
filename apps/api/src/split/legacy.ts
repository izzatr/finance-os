/**
 * One-time, per-user conversion of the old People + transaction_splits model into shared
 * expenses. Runs inside one transaction the first time the user opens Shared; idempotent.
 *
 * Old model: an expense transaction paid in full by the user, with split rows saying how much
 * each person owes back; settling booked a one-sided transfer into a wallet.
 * New model: a shared expense paid by the user (linked to that same transaction, so its cash leg
 * is not duplicated) plus, for settled splits, a payment linked to the settlement transfer.
 */
import {
  assets,
  people,
  splitExpenseShares,
  splitUserSettings,
  transactionEntries,
  transactionSplits,
  transactions,
  db,
  wallets,
} from '@finance-os/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { ensureFriendships, lockKeys, SplitError, type Me, type Tx } from './core'
import { booksLockKey, syncBaseline, syncUserExpense } from './books'
import { createExpenseIn } from './expenses'
import { fromMinor, toMinor } from './math'
import { splitPersons, splitExpenses } from '@finance-os/db'

const trim = (v: string) => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v)

export async function migrateLegacySplits(me: Me): Promise<{ expenses: number; payments: number } | null> {
  const [settings] = await db.select({ done: splitUserSettings.legacyMigratedAt }).from(splitUserSettings).where(eq(splitUserSettings.userId, me.userId))
  if (settings?.done) return null
  return db.transaction(async (tx) => {
    const [locked] = await tx.select({ done: splitUserSettings.legacyMigratedAt, booksStart: splitUserSettings.booksStart })
      .from(splitUserSettings).where(eq(splitUserSettings.userId, me.userId)).for('update')
    if (!locked || locked.done) return null

    const splits = await tx.select({
      id: transactionSplits.id,
      transactionId: transactionSplits.transactionId,
      personId: transactionSplits.personId,
      assetId: transactionSplits.assetId,
      amount: transactionSplits.amount,
      settledAt: transactionSplits.settledAt,
      settlementTransactionId: transactionSplits.settlementTransactionId,
      txDate: transactions.transactionDate,
      txDescription: transactions.description,
      currency: assets.code,
      precision: assets.precision,
    }).from(transactionSplits)
      .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
      .innerJoin(assets, eq(assets.id, transactionSplits.assetId))
      .where(and(eq(transactions.userId, me.userId), isNull(transactions.deletedAt)))

    let expenses = 0
    let payments = 0
    if (splits.length > 0) {
      // Past spending must stay in reports, so the books start before the oldest split.
      const oldest = splits.reduce((d, s) => (s.txDate < d ? s.txDate : d), locked.booksStart)
      if (oldest < locked.booksStart) {
        await tx.update(splitUserSettings).set({ booksStart: new Date(oldest.getTime() - 1000) }).where(eq(splitUserSettings.userId, me.userId))
      }

      // People -> guests (one per legacy person that has splits).
      const legacyPeople = await tx.select().from(people).where(and(eq(people.userId, me.userId), inArray(people.id, [...new Set(splits.map((s) => s.personId))])))
      const guestFor = new Map<string, string>()
      for (const p of legacyPeople) {
        const [g] = await tx.insert(splitPersons).values({ displayName: p.name, email: p.email, createdByUserId: me.userId }).returning({ id: splitPersons.id })
        guestFor.set(p.id, g.id)
        await ensureFriendships(tx, [me.personId, g.id])
      }

      // One shared expense per (transaction, currency).
      const byTx = new Map<string, typeof splits>()
      for (const s of splits) {
        const key = `${s.transactionId}|${s.assetId}`
        byTx.set(key, [...(byTx.get(key) ?? []), s])
      }
      for (const [key, rows] of byTx) {
        const [txId, assetId] = key.split('|')
        const p = rows[0].precision
        const owedByOthers = rows.reduce((acc, r) => acc + toMinor(trim(r.amount), p), 0n)
        const [paidRow] = await tx.select({ total: sql<string>`coalesce(sum(${transactionEntries.amount}), 0)` })
          .from(transactionEntries).where(and(eq(transactionEntries.transactionId, txId), eq(transactionEntries.assetId, assetId)))
        let cost = -toMinor(trim(paidRow.total), p)
        if (cost < owedByOthers) cost = owedByOthers
        const amounts: Record<string, string> = {}
        const mine = cost - owedByOthers
        if (mine > 0n) amounts[me.personId] = fromMinor(mine, p)
        for (const r of rows) {
          const g = guestFor.get(r.personId)!
          amounts[g] = fromMinor(toMinor(amounts[g] ?? '0', p) + toMinor(trim(r.amount), p), p)
        }
        await createExpenseIn(tx, me, {
          kind: 'expense',
          description: rows[0].txDescription,
          cost: fromMinor(cost, p),
          currency: rows[0].currency,
          date: rows[0].txDate.toISOString(),
          category: 'general',
          paid: { kind: 'single', personId: me.personId },
          split: { method: 'exact', amounts },
          externalRef: `legacy:split:${txId}:${assetId}`,
          myBooks: { linkedTransactionId: txId },
        })
        expenses++
      }

      // Settled splits -> payments from the person to the user, linked to the settlement transfer.
      const settled = splits.filter((s) => s.settledAt && s.settlementTransactionId)
      const bySettlement = new Map<string, typeof splits>()
      for (const s of settled) {
        const key = `${s.settlementTransactionId}|${s.personId}|${s.assetId}`
        bySettlement.set(key, [...(bySettlement.get(key) ?? []), s])
      }
      for (const [key, rows] of bySettlement) {
        const [settlementId, personId] = key.split('|')
        const p = rows[0].precision
        const total = rows.reduce((acc, r) => acc + toMinor(trim(r.amount), p), 0n)
        await createExpenseIn(tx, me, {
          kind: 'payment',
          description: 'Settled up',
          cost: fromMinor(total, p),
          currency: rows[0].currency,
          date: rows[0].settledAt!.toISOString(),
          payment: { fromPersonId: guestFor.get(personId)!, toPersonId: me.personId },
          externalRef: `legacy:settlement:${settlementId}:${personId}`,
          // Linking is skipped when the same settlement transfer covered several people.
          myBooks: [...bySettlement.keys()].filter((k) => k.startsWith(`${settlementId}|`)).length === 1 ? { linkedTransactionId: settlementId } : undefined,
        })
        payments++
      }

      await tx.delete(transactionSplits).where(inArray(transactionSplits.id, splits.map((s) => s.id)))
      await resyncUserBooks(tx, me.userId, me.personId)
    }
    await tx.update(people).set({ deletedAt: new Date() }).where(and(eq(people.userId, me.userId), isNull(people.deletedAt)))
    await tx.update(splitUserSettings).set({ legacyMigratedAt: new Date() }).where(eq(splitUserSettings.userId, me.userId))
    return { expenses, payments }
  })
}

/**
 * Rebuilds every projection and baseline for a user (after their books start moved, a merge, or
 * adopting a wallet). Expenses before the books start are cleared in bulk; only later ones are
 * rebuilt one by one.
 */
export async function resyncUserBooks(tx: Tx, userId: string, personId: string) {
  const [settings] = await tx.select({ booksStart: splitUserSettings.booksStart }).from(splitUserSettings).where(eq(splitUserSettings.userId, userId))
  if (!settings) return
  const rows = await tx.select({ id: splitExpenses.id, assetId: splitExpenses.assetId, date: splitExpenses.expenseDate })
    .from(splitExpenseShares)
    .innerJoin(splitExpenses, eq(splitExpenses.id, splitExpenseShares.expenseId))
    .where(eq(splitExpenseShares.personId, personId))
  const assetIds = [...new Set(rows.map((r) => r.assetId))]
  await lockKeys(tx, assetIds.map((a) => booksLockKey(userId, a)))
  const before = rows.filter((r) => r.date < settings.booksStart).map((r) => `split:expense:${r.id}`)
  for (let i = 0; i < before.length; i += 500) {
    await tx.update(transactions).set({ deletedAt: new Date() }).where(and(
      eq(transactions.userId, userId), eq(transactions.managedBy, 'split'), isNull(transactions.deletedAt),
      inArray(transactions.externalRef, before.slice(i, i + 500)),
    ))
  }
  for (const r of rows) if (r.date >= settings.booksStart) await syncUserExpense(tx, userId, r.id)
  for (const a of assetIds) await syncBaseline(tx, userId, a)
}

/**
 * Turns an existing wallet (e.g. a hand-kept "Splitwise €" wallet) into the user's Friends wallet
 * for its currency. Its past entries stay; the opening adjustment absorbs any difference between
 * them and the real shared balance, so the wallet ends up equal to what friends owe.
 */
export async function adoptWallet(me: Me, walletId: string) {
  return db.transaction(async (tx) => {
    const [w] = await tx.select({ id: wallets.id, assetId: wallets.assetId, systemRole: wallets.systemRole, type: assets.type })
      .from(wallets).innerJoin(assets, eq(assets.id, wallets.assetId))
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, me.userId), isNull(wallets.deletedAt)))
      .for('update')
    if (!w) throw new SplitError(404, 'NOT_FOUND', 'Wallet not found')
    if (w.systemRole) throw new SplitError(409, 'ALREADY_SYSTEM', 'This wallet is already a Friends wallet')
    if (w.type !== 'currency') throw new SplitError(422, 'NOT_CURRENCY', 'Only cash wallets can hold balances with friends')
    await lockKeys(tx, [booksLockKey(me.userId, w.assetId)])
    const [existing] = await tx.select({ id: wallets.id }).from(wallets)
      .where(and(eq(wallets.userId, me.userId), eq(wallets.assetId, w.assetId), eq(wallets.systemRole, 'split'), isNull(wallets.deletedAt)))
    if (existing) throw new SplitError(409, 'FRIENDS_WALLET_EXISTS', 'You already have a Friends wallet in this currency')
    await tx.update(wallets).set({ systemRole: 'split' }).where(eq(wallets.id, walletId))
    await resyncUserBooks(tx, me.userId, me.personId)
    await syncBaseline(tx, me.userId, w.assetId)
  })
}
