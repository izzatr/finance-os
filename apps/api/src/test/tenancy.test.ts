import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function getAssetId(cookie: string): Promise<string> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await res.json()) as { data: { id: string; code: string }[] }
  const assetId = assets.find((a) => a.code === 'EUR')?.id ?? assets[0]?.id
  if (!assetId) throw new Error('no assets seeded in test DB — check global-setup seeds base assets')
  return assetId
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

async function createTransaction(cookie: string, walletId: string, assetId: string, description: string) {
  return app.request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      transactionDate: new Date().toISOString(),
      type: 'expense',
      description,
      entries: [{ walletId, assetId, amount: '-10.00' }],
    }),
  })
}

describe('tenancy isolation', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a user only sees their own wallets', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    await createWallet(alice.cookie, 'Alice Bank')
    const res = await app.request('/api/wallets', { headers: { cookie: bob.cookie } })
    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it("cannot read another user's wallet transactions", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId } = await createWallet(alice.cookie, 'Alice Bank')
    const res = await app.request(`/api/wallets/${walletId}/transactions`, {
      headers: { cookie: bob.cookie },
    })
    expect(res.status).toBe(404)
  })

  it("cannot patch another user's wallet", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId } = await createWallet(alice.cookie, 'Alice Bank')
    const res = await app.request(`/api/wallets/${walletId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ name: 'Hacked' }),
    })
    expect(res.status).toBe(404)
  })

  it("cannot delete another user's wallet", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId } = await createWallet(alice.cookie, 'Alice Bank')
    const res = await app.request(`/api/wallets/${walletId}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    })
    expect(res.status).toBe(404)
  })

  it('categories are per-user (same name creates distinct rows)', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const mk = async (cookie: string) => {
      const res = await app.request('/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ name: 'Groceries' }),
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as { data: { id: string } }
      return body.data.id
    }
    const aliceId = await mk(alice.cookie)
    const bobId = await mk(bob.cookie)
    expect(aliceId).not.toBe(bobId)

    // Each user sees exactly their own category
    for (const user of [alice, bob]) {
      const res = await app.request('/api/categories', { headers: { cookie: user.cookie } })
      const body = (await res.json()) as { data: { id: string }[] }
      expect(body.data).toHaveLength(1)
    }
  })

  it("cannot patch another user's category", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const createRes = await app.request('/api/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: alice.cookie },
      body: JSON.stringify({ name: 'Groceries' }),
    })
    const { data: category } = (await createRes.json()) as { data: { id: string } }
    const res = await app.request(`/api/categories/${category.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ name: 'Hacked' }),
    })
    expect(res.status).toBe(404)
  })

  it('transactions are isolated across users', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Alice Bank')
    const txRes = await createTransaction(alice.cookie, walletId, assetId, 'secret purchase')
    expect(txRes.status).toBe(201)
    const listRes = await app.request('/api/transactions', { headers: { cookie: bob.cookie } })
    const body = (await listRes.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it("cannot attach a transaction entry to another user's wallet", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Alice Bank')

    // Bob tries to create a transaction whose entry points at Alice's wallet
    const res = await createTransaction(bob.cookie, walletId, assetId, 'poison entry')
    expect(res.status).toBe(404)

    // Nothing was written for either user
    for (const user of [alice, bob]) {
      const listRes = await app.request('/api/transactions', { headers: { cookie: user.cookie } })
      const body = (await listRes.json()) as { data: unknown[] }
      expect(body.data).toEqual([])
    }
  })

  it("cannot delete or patch another user's transaction", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Alice Bank')
    const txRes = await createTransaction(alice.cookie, walletId, assetId, 'mine')
    const { data: tx } = (await txRes.json()) as { data: { id: string } }

    const delRes = await app.request(`/api/transactions/${tx.id}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    })
    expect(delRes.status).toBe(404)

    const patchRes = await app.request(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ description: 'hacked' }),
    })
    expect(patchRes.status).toBe(404)

    // Amount-only patch must also be blocked (entries reached via transaction)
    const amountRes = await app.request(`/api/transactions/${tx.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ amount: '-999.00' }),
    })
    expect(amountRes.status).toBe(404)
  })

  it('search only returns own transactions', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Alice Bank')
    await createTransaction(alice.cookie, walletId, assetId, 'secret purchase')
    const res = await app.request('/api/transactions/search?q=secret', { headers: { cookie: bob.cookie } })
    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })

  it('analytics and dashboard are scoped to the acting user', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Alice Bank')
    await createTransaction(alice.cookie, walletId, assetId, 'alice expense')

    const summaryRes = await app.request('/api/analytics/summary', { headers: { cookie: bob.cookie } })
    const summary = (await summaryRes.json()) as { data: { transactionCount: number; walletCount: number } }
    expect(summary.data.transactionCount).toBe(0)
    expect(summary.data.walletCount).toBe(0)

    const dashRes = await app.request('/api/dashboard', { headers: { cookie: bob.cookie } })
    const dash = (await dashRes.json()) as { data: { walletCount: number; transactionCount: number } }
    expect(dash.data.walletCount).toBe(0)
    expect(dash.data.transactionCount).toBe(0)

    const recentRes = await app.request('/api/analytics/recent', { headers: { cookie: bob.cookie } })
    const recent = (await recentRes.json()) as { data: unknown[] }
    expect(recent.data).toEqual([])

    const growthRes = await app.request('/api/analytics/asset-growth', { headers: { cookie: bob.cookie } })
    const growth = (await growthRes.json()) as { data: unknown[] }
    expect(growth.data).toEqual([])

    const trendRes = await app.request('/api/analytics/monthly-trend', { headers: { cookie: bob.cookie } })
    const trend = (await trendRes.json()) as { data: unknown[] }
    expect(trend.data).toEqual([])

    const breakdownRes = await app.request('/api/analytics/category-breakdown', { headers: { cookie: bob.cookie } })
    const breakdown = (await breakdownRes.json()) as { data: unknown[] }
    expect(breakdown.data).toEqual([])
  })
})
