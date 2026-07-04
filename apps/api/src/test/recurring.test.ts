import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'
import { nextOccurrences } from '@finance-os/domain'

async function getAssetId(cookie: string, code = 'EUR'): Promise<string> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await res.json()) as { data: { id: string; code: string }[] }
  const assetId = assets.find((a) => a.code === code)?.id ?? assets[0]?.id
  if (!assetId) throw new Error('no assets seeded in test DB — check global-setup seeds base assets')
  return assetId
}

async function createWallet(cookie: string, name: string, assetId?: string): Promise<{ walletId: string; assetId: string }> {
  const resolvedAssetId = assetId ?? (await getAssetId(cookie))
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'bank', assetId: resolvedAssetId }),
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { data: { id: string } }
  return { walletId: body.data.id, assetId: resolvedAssetId }
}

function rentTemplate(walletId: string, assetId: string, categoryId?: string) {
  return {
    type: 'expense' as const,
    description: 'Rent',
    entries: [{ walletId, assetId, amount: '-1200.00' }],
    ...(categoryId ? { categoryId } : {}),
  }
}

async function createRule(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/recurring-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

describe('recurring rules', () => {
  beforeEach(async () => await truncateAll())

  it('creates a monthly rent rule and returns 201 with computed nextRunAt', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const startAt = new Date(Date.UTC(2020, 0, 15)) // well in the past

    const res = await createRule(cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: startAt.toISOString(),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as {
      data: { id: string; name: string; freq: string; nextRunAt: string; mode: string; isActive: boolean }
    }
    expect(data.name).toBe('Rent')
    expect(data.freq).toBe('monthly')
    expect(data.mode).toBe('draft')
    expect(data.isActive).toBe(true)

    // nextRunAt must be the first occurrence strictly after "now" — computed
    // independently against the domain function as the source of truth.
    const expectedFirst = nextOccurrences(
      { freq: 'monthly', interval: 1, startAt },
      new Date(),
      1,
    )[0]
    expect(new Date(data.nextRunAt).toISOString()).toBe(expectedFirst.toISOString())
  })

  it('sets nextRunAt to startAt itself when startAt is in the future', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const startAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30) // 30 days out

    const res = await createRule(cookie, {
      name: 'Future rent',
      template: rentTemplate(walletId, assetId),
      freq: 'monthly',
      interval: 1,
      startAt: startAt.toISOString(),
    })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { nextRunAt: string } }
    expect(new Date(data.nextRunAt).toISOString()).toBe(startAt.toISOString())
  })

  it('preview returns occurrences matching nextOccurrences directly', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')
    const startAt = new Date(Date.UTC(2020, 0, 31))

    const created = (await (
      await createRule(cookie, {
        name: 'Rent',
        template: rentTemplate(walletId, assetId),
        freq: 'monthly',
        interval: 1,
        startAt: startAt.toISOString(),
      })
    ).json()) as { data: { id: string } }

    const res = await app.request(`/api/recurring-rules/${created.data.id}/preview?count=5`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { occurrences: string[] } }
    expect(data.occurrences).toHaveLength(5)

    const expected = nextOccurrences({ freq: 'monthly', interval: 1, startAt }, new Date(), 5)
    expect(data.occurrences).toEqual(expected.map((d) => d.toISOString()))
  })

  it('rejects a template referencing a foreign wallet with 404', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const bobWallet = await createWallet(bob.cookie, 'Bob Wallet')

    const res = await createRule(alice.cookie, {
      name: 'Rent',
      template: rentTemplate(bobWallet.walletId, bobWallet.assetId),
      freq: 'monthly',
      startAt: new Date().toISOString(),
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOT_FOUND')
  })

  it('returns 404 for a rule belonging to another user', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Checking')

    const created = (await (
      await createRule(alice.cookie, {
        name: 'Rent',
        template: rentTemplate(walletId, assetId),
        freq: 'monthly',
        startAt: new Date().toISOString(),
      })
    ).json()) as { data: { id: string } }

    const getRes = await app.request(`/api/recurring-rules/${created.data.id}/preview?count=3`, { headers: { cookie: bob.cookie } })
    expect(getRes.status).toBe(404)

    const patchRes = await app.request(`/api/recurring-rules/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ isActive: false }),
    })
    expect(patchRes.status).toBe(404)

    const deleteRes = await app.request(`/api/recurring-rules/${created.data.id}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    })
    expect(deleteRes.status).toBe(404)
  })

  it('patches mode and isActive', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')

    const created = (await (
      await createRule(cookie, {
        name: 'Rent',
        template: rentTemplate(walletId, assetId),
        freq: 'monthly',
        startAt: new Date().toISOString(),
      })
    ).json()) as { data: { id: string } }

    const res = await app.request(`/api/recurring-rules/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ mode: 'auto_post', isActive: false }),
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { mode: string; isActive: boolean } }
    expect(data.mode).toBe('auto_post')
    expect(data.isActive).toBe(false)
  })

  it('deletes a rule so it no longer appears in the list', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Checking')

    const created = (await (
      await createRule(cookie, {
        name: 'Rent',
        template: rentTemplate(walletId, assetId),
        freq: 'monthly',
        startAt: new Date().toISOString(),
      })
    ).json()) as { data: { id: string } }

    const deleteRes = await app.request(`/api/recurring-rules/${created.data.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleteRes.status).toBe(200)

    const list = (await (await app.request('/api/recurring-rules', { headers: { cookie } })).json()) as {
      data: { id: string }[]
    }
    expect(list.data.find((r) => r.id === created.data.id)).toBeUndefined()
  })

  it('rejects a template referencing a foreign category with 404', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const { walletId, assetId } = await createWallet(alice.cookie, 'Checking')

    const catRes = await app.request('/api/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ name: 'Housing', type: 'expense' }),
    })
    const bobCategory = ((await catRes.json()) as { data: { id: string } }).data.id

    const res = await createRule(alice.cookie, {
      name: 'Rent',
      template: rentTemplate(walletId, assetId, bobCategory),
      freq: 'monthly',
      startAt: new Date().toISOString(),
    })
    expect(res.status).toBe(404)
  })
})
