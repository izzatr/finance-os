/**
 * Weekly digest — every Monday each active user gets a short money recap in
 * their inbox: last week's income/expense per currency, top spending
 * categories, and (when OpenRouter is configured) a 2-3 sentence narrative.
 *
 * Digests are proposals with source 'digest' and no transaction payload —
 * they carry information, not a booking; the UI offers Dismiss only.
 * Idempotent per (user, ISO week) via payload.dedupeRef.
 */

import { db, proposals, transactions, transactionEntries, assets, categories, users } from '@finance-os/db'
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm'

type DigestStats = {
  from: string
  to: string
  byCurrency: Array<{ currency: string; income: number; expense: number }>
  topCategories: Array<{ name: string; total: number; currency: string }>
  transactionCount: number
}

/** ISO-8601 week key, e.g. 2026-W27. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

async function statsFor(userId: string, from: Date, to: Date): Promise<DigestStats | null> {
  const rows = await db
    .select({
      currency: assets.code,
      amount: transactionEntries.amount,
      type: transactions.type,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      gte(transactions.transactionDate, from),
      lt(transactions.transactionDate, to),
    ))

  if (rows.length === 0) return null

  const byCurrency = new Map<string, { income: number; expense: number }>()
  const byCategory = new Map<string, { total: number; currency: string }>()
  for (const row of rows) {
    if (row.type === 'transfer' || row.type === 'exchange' || row.type === 'adjustment') continue
    const amount = Number(row.amount)
    const bucket = byCurrency.get(row.currency) ?? { income: 0, expense: 0 }
    if (amount > 0) bucket.income += amount
    else bucket.expense += Math.abs(amount)
    byCurrency.set(row.currency, bucket)
    if (amount < 0) {
      const name = row.categoryName ?? 'Uncategorized'
      const cat = byCategory.get(name) ?? { total: 0, currency: row.currency }
      cat.total += Math.abs(amount)
      byCategory.set(name, cat)
    }
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    byCurrency: [...byCurrency.entries()].map(([currency, v]) => ({
      currency,
      income: Math.round(v.income * 100) / 100,
      expense: Math.round(v.expense * 100) / 100,
    })),
    topCategories: [...byCategory.entries()]
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5)
      .map(([name, v]) => ({ name, total: Math.round(v.total * 100) / 100, currency: v.currency })),
    transactionCount: rows.length,
  }
}

async function narrate(stats: DigestStats): Promise<string | null> {
  if (!process.env.OPENROUTER_API_KEY) return null
  try {
    const base = (process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'x-title': 'Finance OS',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4.5',
        stream: false,
        messages: [{
          role: 'user',
          content:
            'Write a friendly 2-3 sentence weekly money recap from these stats. Mention the biggest spending category. ' +
            'No greetings, no advice unless something stands out. Stats: ' + JSON.stringify(stats),
        }],
      }),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return body.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null // stats-only digest is still useful
  }
}

/** Runs for all users; returns how many digests were filed. */
export async function generateWeeklyDigests(now: Date): Promise<{ digests: number }> {
  const weekKey = isoWeekKey(new Date(now.getTime() - 7 * 86_400_000)) // the week being summarized
  const to = new Date(now)
  const from = new Date(now.getTime() - 7 * 86_400_000)
  let digests = 0

  const allUsers = await db.select({ id: users.id }).from(users)
  for (const user of allUsers) {
    try {
      const dedupeRef = `digest:${user.id}:${weekKey}`
      const [existing] = await db.select({ id: proposals.id }).from(proposals)
        .where(and(
          eq(proposals.userId, user.id),
          sql`${proposals.payload} ->> 'dedupeRef' = ${dedupeRef}`,
        ))
      if (existing) continue

      const stats = await statsFor(user.id, from, to)
      if (!stats) continue

      const narrative = await narrate(stats)
      await db.insert(proposals).values({
        userId: user.id,
        source: 'digest',
        actorLabel: 'Weekly digest',
        payload: { digest: narrative, stats, dedupeRef },
      })
      digests += 1
    } catch (err) {
      console.error(`weekly digest failed for user ${user.id}:`, err)
    }
  }

  return { digests }
}
