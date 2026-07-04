import { beforeEach, describe, expect, it } from 'vitest'
import { db, proposals, transactions } from '@finance-os/db'
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

/** Seed a pending recurring_draft proposal through the real materializer path. */
async function seedDraftProposal(cookie: string): Promise<{ proposalId: string; ruleId: string; dedupeRef: string }> {
  const { walletId, assetId } = await createWallet(cookie, `Wallet ${Date.now()}-${Math.random()}`)
  const res = await app.request('/api/recurring-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      name: 'Rent draft',
      template: {
        type: 'expense',
        description: 'Rent',
        entries: [{ walletId, assetId, amount: '-1200.00' }],
      },
      freq: 'monthly',
      interval: 1,
      startAt: new Date(Date.UTC(2024, 0, 15)).toISOString(),
      mode: 'draft',
    }),
  })
  expect(res.status).toBe(201)
  const ruleId = ((await res.json()) as { data: { id: string } }).data.id

  const result = await materializeDueRules(new Date(Date.UTC(2024, 0, 20)))
  expect(result.drafted).toBe(1)

  const dedupeRef = `recurring:${ruleId}:2024-01-15`
  const [row] = await db.select().from(proposals)
  return { proposalId: row.id, ruleId, dedupeRef }
}

type InboxItem = {
  id: string
  source: string
  actorLabel: string
  status: string
  payload: { transaction: { description: string }; dedupeRef?: string }
  createdAt: string
  resolvedAt: string | null
}

describe('inbox', () => {
  beforeEach(async () => await truncateAll())

  it('lists proposals with pending first, newest first within each group', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { proposalId } = await seedDraftProposal(cookie)

    // an older, already-resolved proposal must sort after the pending one
    const [resolved] = await db.insert(proposals).values({
      userId,
      source: 'ai_chat',
      actorLabel: 'Assistant',
      payload: { transaction: { description: 'Old suggestion' } },
      status: 'rejected',
      resolvedAt: new Date(),
    }).returning()

    const res = await app.request('/api/inbox', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: InboxItem[] }
    expect(data).toHaveLength(2)
    expect(data[0].id).toBe(proposalId)
    expect(data[0].status).toBe('pending')
    expect(data[0].source).toBe('recurring_draft')
    expect(data[0].actorLabel).toBe('Rent draft')
    expect(data[0].payload.transaction.description).toBe('Rent')
    expect(data[0].createdAt).toBeTruthy()
    expect(data[1].id).toBe(resolved.id)
    expect(data[1].status).toBe('rejected')
  })

  it('approve books the transaction and resolves the proposal', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { proposalId, dedupeRef } = await seedDraftProposal(cookie)

    const res = await app.request(`/api/inbox/${proposalId}/approve`, {
      method: 'POST',
      headers: { cookie },
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: InboxItem }
    expect(data.status).toBe('approved')
    expect(data.resolvedAt).toBeTruthy()

    const txRows = await db.select().from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.externalRef, dedupeRef)))
    expect(txRows).toHaveLength(1)
    expect(txRows[0].description).toBe('Rent')
  })

  it('approving an already-resolved proposal returns 409 ALREADY_RESOLVED', async () => {
    const { cookie } = await createTestUser(app)
    const { proposalId } = await seedDraftProposal(cookie)

    const first = await app.request(`/api/inbox/${proposalId}/approve`, { method: 'POST', headers: { cookie } })
    expect(first.status).toBe(200)

    const second = await app.request(`/api/inbox/${proposalId}/approve`, { method: 'POST', headers: { cookie } })
    expect(second.status).toBe(409)
    const body = (await second.json()) as { error: { code: string } }
    expect(body.error.code).toBe('ALREADY_RESOLVED')

    // reject after approve is equally blocked
    const reject = await app.request(`/api/inbox/${proposalId}/reject`, { method: 'POST', headers: { cookie } })
    expect(reject.status).toBe(409)
  })

  it('approve returns 409 ALREADY_MATERIALIZED and stays pending when the ref was already booked', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { proposalId, dedupeRef } = await seedDraftProposal(cookie)

    // simulate a race: the same occurrence got booked through another path first
    await db.insert(transactions).values({
      userId,
      transactionDate: new Date(Date.UTC(2024, 0, 15)),
      type: 'expense',
      description: 'Raced booking',
      externalRef: dedupeRef,
    })

    const res = await app.request(`/api/inbox/${proposalId}/approve`, { method: 'POST', headers: { cookie } })
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('ALREADY_MATERIALIZED')

    const [row] = await db.select().from(proposals).where(eq(proposals.id, proposalId))
    expect(row.status).toBe('pending')
    expect(row.resolvedAt).toBeNull()
  })

  it('reject resolves the proposal without creating a transaction', async () => {
    const { cookie, userId } = await createTestUser(app)
    const { proposalId, dedupeRef } = await seedDraftProposal(cookie)

    const res = await app.request(`/api/inbox/${proposalId}/reject`, { method: 'POST', headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: InboxItem }
    expect(data.status).toBe('rejected')
    expect(data.resolvedAt).toBeTruthy()

    const txRows = await db.select().from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.externalRef, dedupeRef)))
    expect(txRows).toHaveLength(0)
  })

  it('returns 404 for a foreign or missing proposal', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { proposalId } = await seedDraftProposal(alice.cookie)

    for (const action of ['approve', 'reject']) {
      const res = await app.request(`/api/inbox/${proposalId}/${action}`, {
        method: 'POST',
        headers: { cookie: bob.cookie },
      })
      expect(res.status).toBe(404)
    }

    const missing = await app.request('/api/inbox/00000000-0000-0000-0000-000000000000/approve', {
      method: 'POST',
      headers: { cookie: alice.cookie },
    })
    expect(missing.status).toBe(404)

    // and the foreign proposal never leaks into bob's list
    const list = await app.request('/api/inbox', { headers: { cookie: bob.cookie } })
    const { data } = (await list.json()) as { data: InboxItem[] }
    expect(data).toHaveLength(0)
  })
})
