import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function getAssets(cookie: string) {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data } = (await res.json()) as { data: { id: string; code: string }[] }
  return Object.fromEntries(data.map((a) => [a.code, a.id]))
}

async function createWallet(cookie: string, name: string, assetId: string) {
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'bank', assetId }),
  })
  const { data } = (await res.json()) as { data: { id: string } }
  return data.id
}

describe('milestone 2 hardening', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('rejects a zero exchange rate', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/exchange-rates', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ base: 'EUR', quote: 'USD', rate: '0' }),
    })
    expect(res.status).toBe(400)
  })

  it('rejects an entry whose asset does not match the wallet asset', async () => {
    const { cookie } = await createTestUser(app)
    const assets = await getAssets(cookie)
    const eurWallet = await createWallet(cookie, 'EUR Bank', assets.EUR)

    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'usd into eur wallet',
        entries: [{ walletId: eurWallet, assetId: assets.USD, amount: '-10' }],
      }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('ASSET_MISMATCH')

    // nothing was written
    const list = await app.request('/api/transactions', { headers: { cookie } })
    const { data } = (await list.json()) as { data: unknown[] }
    expect(data).toEqual([])
  })

  it('rejects settling into a wallet of a different asset', async () => {
    const { cookie } = await createTestUser(app)
    const assets = await getAssets(cookie)
    const idrWallet = await createWallet(cookie, 'IDR Cash', assets.IDR)

    const personRes = await app.request('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Nadia' }),
    })
    const { data: person } = (await personRes.json()) as { data: { id: string } }

    const res = await app.request(`/api/people/${person.id}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ walletId: idrWallet, assetId: assets.EUR }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('ASSET_MISMATCH')
  })

  it('enforces the recurring dedupe ref uniqueness at the database level', async () => {
    const { cookie, userId } = await createTestUser(app)
    const assets = await getAssets(cookie)
    const wallet = await createWallet(cookie, 'Bank', assets.EUR)

    const mk = () =>
      app.request('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          transactionDate: new Date().toISOString(),
          type: 'expense',
          description: 'rent',
          externalRef: 'recurring:some-rule:2026-07-01',
          entries: [{ walletId: wallet, assetId: assets.EUR, amount: '-100' }],
        }),
      })

    expect((await mk()).status).toBe(201)
    // the second insert with the same recurring: ref must be blocked by the partial unique index
    const second = await mk()
    expect(second.status).toBeGreaterThanOrEqual(400)

    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM transactions WHERE user_id = $1 AND external_ref = 'recurring:some-rule:2026-07-01'`,
      [userId],
    )
    await pool.end()
    expect(rows[0].n).toBe(1)
  })
})
