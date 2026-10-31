import { beforeEach, describe, expect, it } from 'vitest'
import { db, proposals, recurringRules, transactionEntries, transactions, wallets } from '@finance-os/db'
import { and, eq } from 'drizzle-orm'
import app from '../app'
import { materializeDueRules } from '../jobs/materialize-recurring'
import { createTestUser, truncateAll } from './helpers'

async function getAssetId(cookie: string): Promise<string> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await res.json()) as { data: { id: string }[] }
  if (!assets[0]) throw new Error('no assets seeded in test DB')
  return assets[0].id
}

async function createWallet(cookie: string, name: string): Promise<{ walletId: string; assetId: string }> {
  const assetId = await getAssetId(cookie)
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'bank', assetId }),
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { data: { id: string } }
  return { walletId: body.data.id, assetId }
}

async function createCategory(cookie: string, name: string): Promise<string> {
  const res = await app.request('/api/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, type: 'expense' }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { data: { id: string } }).data.id
}

async function createRule(cookie: string, body: Record<string, unknown>): Promise<string> {
  const res = await app.request('/api/recurring-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { data: { id: string } }).data.id
}

function rentTemplate(walletId: string, assetId: string, categoryId?: string) {
  return {
    type: 'expense' as const,
    description: 'Rent',
    entries: [{ walletId, assetId, amount: '-1200.00' }],
    ...(categoryId ? { categoryId } : {}),
  }
}

async function txByExternalRef(userId: string, externalRef: string) {
  return db.select().from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.externalRef, externalRef)))
}

describe('materializeDueRules', () => {
  beforeEach(async () => await truncateAll())

  it('posts a due auto_post occurrence with the dedupe externalRef, amount, and category', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const categoryId = await createCategory(cookie, 'Housing')
    const ruleId = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId, categoryId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })

    const result = await materializeDueRules(new Date(Date.UTC(2024, 0, 20)))
    expect(result).toEqual({ posted: 1, drafted: 0, errors: 0 })

    const rows = await txByExternalRef(userId, `recurring:${ruleId}:2024-01-15`)
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('Rent')
    expect(rows[0].categoryId).toBe(categoryId)
    expect(rows[0].transactionDate.toISOString()).toBe(new Date(Date.UTC(2024, 0, 15)).toISOString())

    const entries = await db.select().from(transactionEntries)
      .where(eq(transactionEntries.transactionId, rows[0].id))
    expect(entries).toHaveLength(1)
    expect(Number(entries[0].amount)).toBe(-1200)
    expect(entries[0].walletId).toBe(walletId)
  })

  it('is idempotent: a second run with the same now posts nothing new', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const ruleId = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })

    const now = new Date(Date.UTC(2024, 0, 20))
    const first = await materializeDueRules(now)
    expect(first.posted).toBe(1)

    const second = await materializeDueRules(now)
    expect(second).toEqual({ posted: 0, drafted: 0, errors: 0 })

    const rows = await txByExternalRef(userId, `recurring:${ruleId}:2024-01-15`)
    expect(rows).toHaveLength(1)
  })

  it('catches up a rule 3 occurrences behind with distinct externalRefs', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const ruleId = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })

    const result = await materializeDueRules(new Date(Date.UTC(2024, 2, 20)))
    expect(result).toEqual({ posted: 3, drafted: 0, errors: 0 })

    for (const key of ['2024-01-15', '2024-02-15', '2024-03-15']) {
      const rows = await txByExternalRef(userId, `recurring:${ruleId}:${key}`)
      expect(rows).toHaveLength(1)
    }
  })

  it('draft mode creates one pending proposal with a dedupeRef and never a duplicate', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const ruleId = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'draft',
    })

    const now = new Date(Date.UTC(2024, 0, 20))
    const first = await materializeDueRules(now)
    expect(first).toEqual({ posted: 0, drafted: 1, errors: 0 })

    let rows = await db.select().from(proposals).where(eq(proposals.userId, userId))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].source).toBe('recurring_draft')
    expect(rows[0].actorLabel).toBe('Rent')
    const payload = rows[0].payload as { transaction: { externalRef: string }; dedupeRef: string }
    expect(payload.dedupeRef).toBe(`recurring:${ruleId}:2024-01-15`)
    expect(payload.transaction.externalRef).toBe(`recurring:${ruleId}:2024-01-15`)

    // the rule's cursor advanced, so force it due again to prove payload-level dedupe holds
    await db.update(recurringRules)
      .set({ lastRunAt: null, nextRunAt: new Date(Date.UTC(2024, 0, 15)) })
      .where(eq(recurringRules.id, ruleId))
    const second = await materializeDueRules(now)
    expect(second).toEqual({ posted: 0, drafted: 0, errors: 0 })

    rows = await db.select().from(proposals).where(eq(proposals.userId, userId))
    expect(rows).toHaveLength(1)

    // no transaction was booked in draft mode
    expect(await txByExternalRef(userId, `recurring:${ruleId}:2024-01-15`)).toHaveLength(0)
  })

  it('advances lastRunAt to now and nextRunAt beyond now after a run', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const ruleId = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })

    const now = new Date(Date.UTC(2024, 0, 20))
    await materializeDueRules(now)

    const [rule] = await db.select().from(recurringRules).where(eq(recurringRules.id, ruleId))
    expect(rule.lastRunAt?.toISOString()).toBe(now.toISOString())
    expect(rule.nextRunAt.getTime()).toBeGreaterThan(now.getTime())
    expect(rule.nextRunAt.toISOString()).toBe(new Date(Date.UTC(2024, 1, 15)).toISOString())
    expect(rule.isActive).toBe(true)
  })

  it('deactivates a rule whose endAt has passed with no remaining occurrences, posting nothing', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    // endAt before the first occurrence: nothing ever becomes due
    const ruleId = await createRule(cookie, {
      name: 'Expired',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 1, 15)).toISOString(),
      endAt: new Date(Date.UTC(2024, 1, 10)).toISOString(),
      mode: 'auto_post',
    })

    const result = await materializeDueRules(new Date(Date.UTC(2024, 2, 20)))
    expect(result).toEqual({ posted: 0, drafted: 0, errors: 0 })

    const [rule] = await db.select().from(recurringRules).where(eq(recurringRules.id, ruleId))
    expect(rule.isActive).toBe(false)

    const txRows = await db.select().from(transactions).where(eq(transactions.userId, userId))
    expect(txRows).toHaveLength(0)
  })

  it('isolates a failing rule: other rules still post and errors is counted', async () => {
    const { cookie, userId } = await createTestUser(app)
    const good = await createWallet(cookie, 'Good wallet')
    const bad = await createWallet(cookie, 'Doomed wallet')

    const goodRuleId = await createRule(cookie, {
      name: 'Good rent',
      template: rentTemplate(good.walletId, good.assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })
    await createRule(cookie, {
      name: 'Bad rent',
      template: rentTemplate(bad.walletId, bad.assetId),
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'auto_post',
    })

    // soft-delete the bad rule's wallet so its createTransactionForUser call throws
    await db.update(wallets).set({ deletedAt: new Date() }).where(eq(wallets.id, bad.walletId))

    const result = await materializeDueRules(new Date(Date.UTC(2024, 0, 20)))
    expect(result.posted).toBe(1)
    expect(result.errors).toBe(1)

    expect(await txByExternalRef(userId, `recurring:${goodRuleId}:2024-01-15`)).toHaveLength(1)
  })
})
