import { db, proposals, recurringRules, transactions } from '@finance-os/db'
import { nextOccurrences } from '@finance-os/domain'
import type { RecurringSchedule } from '@finance-os/domain'
import { and, eq, lte, sql } from 'drizzle-orm'
import { createTransactionForUser } from '../lib/create-transaction'
import type { NewTransactionInput } from '../lib/create-transaction'

/** UTC calendar date of an occurrence — the date part of the idempotency key. */
function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** True when a transaction or a proposal already carries this dedupe ref — the
 *  occurrence has been materialized (or is awaiting approval) and must not be redone. */
async function alreadyMaterialized(userId: string, dedupeRef: string): Promise<boolean> {
  const [existingTx] = await db.select({ id: transactions.id }).from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.externalRef, dedupeRef)))
  if (existingTx) return true

  // proposals of ANY status count: a rejected draft must stay rejected, not reappear
  const [existingProposal] = await db.select({ id: proposals.id }).from(proposals)
    .where(and(
      eq(proposals.userId, userId),
      sql`${proposals.payload} ->> 'dedupeRef' = ${dedupeRef}`,
    ))
  return Boolean(existingProposal)
}

/**
 * Processes all active rules with nextRunAt <= now. Idempotent: each (rule, occurrence-date)
 * materializes at most once, keyed by externalRef `recurring:{ruleId}:{YYYY-MM-DD}`.
 * auto_post -> createTransactionForUser (actorType 'scheduler');
 * draft -> pending proposals row (source 'recurring_draft', actorLabel rule.name,
 *          payload { transaction, dedupeRef }).
 * One failing rule never blocks the others — it is counted in `errors` and its cursor is
 * left untouched so the next tick retries it (the dedupe refs make the retry safe).
 */
export async function materializeDueRules(
  now: Date,
): Promise<{ posted: number; drafted: number; errors: number }> {
  let posted = 0
  let drafted = 0
  let errors = 0

  const dueRules = await db.select().from(recurringRules)
    .where(and(eq(recurringRules.isActive, true), lte(recurringRules.nextRunAt, now)))

  for (const rule of dueRules) {
    try {
      const schedule: RecurringSchedule = {
        freq: rule.freq as RecurringSchedule['freq'],
        interval: rule.interval,
        startAt: rule.startAt,
        endAt: rule.endAt,
      }

      // Everything owed since the last run (or since ever, for a never-run rule).
      // startAt-1ms makes the strictly-after window include startAt itself.
      const windowStart = rule.lastRunAt ?? new Date(rule.startAt.getTime() - 1)
      const dueOccurrences = nextOccurrences(schedule, windowStart, 100)
        .filter((occurrence) => occurrence.getTime() <= now.getTime())

      for (const occurrence of dueOccurrences) {
        const dedupeRef = `recurring:${rule.id}:${dateKey(occurrence)}`
        if (await alreadyMaterialized(rule.userId, dedupeRef)) continue

        const template = rule.template as Omit<NewTransactionInput, 'transactionDate'>
        const transaction: NewTransactionInput = {
          ...template,
          transactionDate: occurrence.toISOString(),
          externalRef: dedupeRef,
        }

        if (rule.mode === 'auto_post') {
          await createTransactionForUser(transaction, { userId: rule.userId, actorType: 'scheduler' })
          posted += 1
        } else {
          await db.insert(proposals).values({
            userId: rule.userId,
            source: 'recurring_draft',
            actorLabel: rule.name,
            payload: { transaction, dedupeRef },
          })
          drafted += 1
        }
      }

      // Advance the cursor. Direct assignment of the first occurrence > now is safe
      // here (unlike the PATCH route) because the rule WAS just materialized through now.
      const [nextOccurrence] = nextOccurrences(schedule, now, 1)
      const endAtPassed = rule.endAt !== null && rule.endAt.getTime() <= now.getTime()
      await db.update(recurringRules).set({
        lastRunAt: now,
        ...(nextOccurrence ? { nextRunAt: nextOccurrence } : {}),
        // No future occurrence and the end date is behind us: the rule is spent.
        ...(!nextOccurrence && endAtPassed ? { isActive: false } : {}),
      }).where(eq(recurringRules.id, rule.id))
    } catch (err) {
      errors += 1
      console.error(`materializeDueRules: rule ${rule.id} failed:`, err)
    }
  }

  return { posted, drafted, errors }
}
