import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

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

async function createPerson(cookie: string, name: string): Promise<string> {
  const res = await app.request('/api/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name }),
  })
  expect(res.status).toBe(201)
  const body = (await res.json()) as { data: { id: string } }
  return body.data.id
}

describe('transaction splits and settlement', () => {
  beforeEach(async () => await truncateAll())

  it('creates a transaction with splits and reflects them in person balances', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')
    const alice = await createPerson(cookie, 'Alice')
    const bob = await createPerson(cookie, 'Bob')

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'Dinner',
        entries: [{ walletId, assetId, amount: '-60.00' }],
        splits: [
          { personId: alice, amount: '20.00' },
          { personId: bob, amount: '20.00' },
        ],
      }),
    })
    expect(res.status).toBe(201)

    const aliceBalance = await app.request(`/api/people/${alice}/balance`, { headers: { cookie } })
    const aliceBody = (await aliceBalance.json()) as { data: { balances: { assetCode: string; amount: number }[] } }
    expect(aliceBody.data.balances).toEqual([{ assetCode: 'EUR', amount: 20 }])

    const bobBalance = await app.request(`/api/people/${bob}/balance`, { headers: { cookie } })
    const bobBody = (await bobBalance.json()) as { data: { balances: { assetCode: string; amount: number }[] } }
    expect(bobBody.data.balances).toEqual([{ assetCode: 'EUR', amount: 20 }])
  })

  it('rejects a split referencing another user\'s person, and writes nothing', async () => {
    const { cookie } = await createTestUser(app)
    const other = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')
    const foreignPerson = await createPerson(other.cookie, 'Stranger')

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'Dinner',
        entries: [{ walletId, assetId, amount: '-60.00' }],
        splits: [{ personId: foreignPerson, amount: '20.00' }],
      }),
    })
    expect(res.status).toBe(404)

    const list = (await (await app.request('/api/transactions', { headers: { cookie } })).json()) as { data: unknown[] }
    expect(list.data).toHaveLength(0)
  })

  it('settling all splits zeroes the balance, books a transfer, and marks splits settled', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')
    const alice = await createPerson(cookie, 'Alice')

    await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'Dinner',
        entries: [{ walletId, assetId, amount: '-60.00' }],
        splits: [{ personId: alice, amount: '30.00' }],
      }),
    })

    const settleRes = await app.request(`/api/people/${alice}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ walletId, assetId }),
    })
    expect(settleRes.status).toBe(201)

    const balance = await app.request(`/api/people/${alice}/balance`, { headers: { cookie } })
    const balanceBody = (await balance.json()) as { data: { balances: unknown[] } }
    expect(balanceBody.data.balances).toEqual([])

    const list = (await (await app.request('/api/transactions', { headers: { cookie } })).json()) as {
      data: { description: string; type: string }[]
    }
    expect(list.data.some((t) => t.description === 'Settlement with Alice' && t.type === 'transfer')).toBe(true)
  })

  it('rejects settlement when the provided amount does not match the sum', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')
    const alice = await createPerson(cookie, 'Alice')

    await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'Dinner',
        entries: [{ walletId, assetId, amount: '-60.00' }],
        splits: [{ personId: alice, amount: '30.00' }],
      }),
    })

    const settleRes = await app.request(`/api/people/${alice}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ walletId, assetId, amount: '999.00' }),
    })
    expect(settleRes.status).toBe(400)
    const body = (await settleRes.json()) as { error: { code: string } }
    expect(body.error.code).toBe('AMOUNT_MISMATCH')
  })

  it('rejects settlement when there is nothing unsettled', async () => {
    const { cookie } = await createTestUser(app)
    const { walletId, assetId } = await createWallet(cookie, 'Main Bank')
    const alice = await createPerson(cookie, 'Alice')

    const settleRes = await app.request(`/api/people/${alice}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ walletId, assetId }),
    })
    expect(settleRes.status).toBe(400)
    const body = (await settleRes.json()) as { error: { code: string } }
    expect(body.error.code).toBe('NOTHING_TO_SETTLE')
  })
})
