import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

type AssetRow = { id: string; code: string }

async function getAsset(cookie: string, code: string): Promise<AssetRow> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data } = (await res.json()) as { data: AssetRow[] }
  const asset = data.find((a) => a.code === code)
  if (!asset) throw new Error(`asset ${code} not seeded`)
  return asset
}

async function postPrice(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/asset-prices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

async function createWallet(cookie: string, name: string, assetId: string) {
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'investment', assetId }),
  })
  expect(res.status).toBe(201)
  const { data } = (await res.json()) as { data: { id: string } }
  return data.id
}

async function addEntry(cookie: string, walletId: string, assetId: string, amount: string) {
  const res = await app.request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      transactionDate: new Date().toISOString(),
      type: 'income',
      description: 'buy gold',
      entries: [{ walletId, assetId, amount }],
    }),
  })
  expect(res.status).toBe(201)
}

describe('asset prices and wallet valuation', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('posts a price for a quantity asset and lists it latest-first', async () => {
    const { cookie } = await createTestUser(app)
    const gold = await getAsset(cookie, 'XAU_G')

    const older = await postPrice(cookie, {
      assetId: gold.id,
      price: '90',
      currency: 'EUR',
      asOf: '2026-06-01T00:00:00.000Z',
    })
    expect(older.status).toBe(201)
    const newer = await postPrice(cookie, {
      assetId: gold.id,
      price: '100',
      currency: 'EUR',
      asOf: '2026-07-01T00:00:00.000Z',
    })
    expect(newer.status).toBe(201)

    const list = await app.request(`/api/asset-prices?assetId=${gold.id}`, { headers: { cookie } })
    expect(list.status).toBe(200)
    const { data } = (await list.json()) as { data: { price: string; asOf: string }[] }
    expect(data).toHaveLength(2)
    expect(Number(data[0].price)).toBe(100) // latest first
  })

  it('404s for an unknown asset', async () => {
    const { cookie } = await createTestUser(app)
    const res = await postPrice(cookie, {
      assetId: '00000000-0000-0000-0000-000000000000',
      price: '1',
      currency: 'EUR',
    })
    expect(res.status).toBe(404)
  })

  it('values a quantity-asset wallet at balance x latest price', async () => {
    const { cookie } = await createTestUser(app)
    const gold = await getAsset(cookie, 'XAU_G')
    const walletId = await createWallet(cookie, 'Gold Stash', gold.id)
    await addEntry(cookie, walletId, gold.id, '10') // 10 grams

    await postPrice(cookie, { assetId: gold.id, price: '90', currency: 'EUR', asOf: '2026-06-01T00:00:00.000Z' })
    await postPrice(cookie, { assetId: gold.id, price: '100', currency: 'EUR', asOf: '2026-07-01T00:00:00.000Z' })

    const res = await app.request('/api/wallets', { headers: { cookie } })
    const { data } = (await res.json()) as {
      data: { id: string; valuation: { quantity: number; price: number; currency: string; value: number } | null }[]
    }
    const wallet = data.find((w) => w.id === walletId)
    expect(wallet?.valuation).toMatchObject({
      quantity: 10,
      price: 100, // latest wins
      currency: 'EUR',
      value: 1000, // 10g x 100 EUR/g
    })
  })

  it('quantity-asset wallet without any price has null valuation', async () => {
    const { cookie } = await createTestUser(app)
    const gold = await getAsset(cookie, 'XAU_G')
    const walletId = await createWallet(cookie, 'Gold Stash', gold.id)
    await addEntry(cookie, walletId, gold.id, '5')

    const res = await app.request('/api/wallets', { headers: { cookie } })
    const { data } = (await res.json()) as { data: { id: string; valuation?: unknown }[] }
    const wallet = data.find((w) => w.id === walletId)
    expect(wallet?.valuation ?? null).toBeNull()
  })

  it('fiat wallets carry no valuation', async () => {
    const { cookie } = await createTestUser(app)
    const eur = await getAsset(cookie, 'EUR')
    const walletId = await createWallet(cookie, 'Bank', eur.id)

    const res = await app.request('/api/wallets', { headers: { cookie } })
    const { data } = (await res.json()) as { data: { id: string; valuation?: unknown }[] }
    const wallet = data.find((w) => w.id === walletId)
    expect(wallet?.valuation ?? null).toBeNull()
  })

  it('wallet detail also carries the valuation', async () => {
    const { cookie } = await createTestUser(app)
    const gold = await getAsset(cookie, 'XAU_G')
    const walletId = await createWallet(cookie, 'Gold Stash', gold.id)
    await addEntry(cookie, walletId, gold.id, '2.5')
    await postPrice(cookie, { assetId: gold.id, price: '100', currency: 'EUR' })

    const res = await app.request(`/api/wallets/${walletId}/transactions`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: { wallet: { valuation: { value: number } | null } }
    }
    expect(data.wallet.valuation?.value).toBe(250)
  })
})
