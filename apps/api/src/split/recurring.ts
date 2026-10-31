import { db, assets, splitExpenses, splitPersons } from '@finance-os/db'
import { and, eq, isNull, lte } from 'drizzle-orm'
import { getMe } from './core'
import { createExpense, type ExpenseInput, type RepeatInterval } from './expenses'
import type { PaidInput, SplitInput } from './math'

/**
 * Creates the next copy of every repeating expense that is due. Each due row is claimed with a
 * conditional update first, so concurrent workers (or a retry) never create the same copy twice.
 * The copy carries the schedule forward; the original stops repeating (as Splitwise does).
 */
export async function materializeDueSplitExpenses(now: Date, limit = 200): Promise<{ created: number; skipped: number; errors: number }> {
  const due = await db.select({ id: splitExpenses.id, nextRepeatAt: splitExpenses.nextRepeatAt }).from(splitExpenses)
    .where(and(lte(splitExpenses.nextRepeatAt, now), isNull(splitExpenses.deletedAt)))
    .orderBy(splitExpenses.nextRepeatAt)
    .limit(limit)
  let created = 0
  let skipped = 0
  let errors = 0
  for (const d of due) {
    const claimed = await db.update(splitExpenses)
      .set({ nextRepeatAt: null })
      .where(and(eq(splitExpenses.id, d.id), eq(splitExpenses.nextRepeatAt, d.nextRepeatAt!), isNull(splitExpenses.deletedAt)))
      .returning()
    const e = claimed[0]
    if (!e) continue
    const [creator] = await db.select({ userId: splitPersons.userId }).from(splitPersons).where(eq(splitPersons.id, e.createdByPersonId))
    if (!creator?.userId || e.kind !== 'expense' || !e.paidInput || !e.splitInput) {
      skipped++
      continue
    }
    const [asset] = await db.select({ code: assets.code }).from(assets).where(eq(assets.id, e.assetId))
    const input: ExpenseInput = {
      groupId: e.groupId,
      kind: 'expense',
      description: e.description,
      cost: e.cost.replace(/0+$/, '').replace(/\.$/, ''),
      currency: asset.code,
      date: d.nextRepeatAt!.toISOString(),
      category: e.category,
      notes: e.notes,
      paid: e.paidInput as unknown as PaidInput,
      split: e.splitInput as unknown as SplitInput,
      repeatInterval: e.repeatInterval as RepeatInterval,
    }
    try {
      const me = await getMe(creator.userId)
      await createExpense(me, input, { kind: 'expense.repeated' })
      await db.update(splitExpenses).set({ repeatInterval: 'never' }).where(eq(splitExpenses.id, e.id))
      created++
    } catch (err) {
      // Membership changed or the group is gone: stop repeating rather than retrying forever.
      console.error(`[split] could not repeat expense ${e.id}:`, err instanceof Error ? err.message : err)
      await db.update(splitExpenses).set({ repeatInterval: 'never' }).where(eq(splitExpenses.id, e.id))
      errors++
    }
  }

  return { created, skipped, errors }
}
