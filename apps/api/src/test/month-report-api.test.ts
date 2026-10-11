import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

describe('GET /api/analytics/month-report', () => {
  beforeEach(async () => await truncateAll())

  it('reports your share of spending against the usual, scoped to the user', async () => {
    const { cookie } = await createTestUser(app)
    const other = await createTestUser(app)
    const { data: assets } = await json<{ data: { id: string; code: string }[] }>(await app.request('/api/assets', { headers: { cookie } }))
    const usd = assets.find((a) => a.code === 'USD')!.id

    const wallet = async (c: string) => json<{ data: { id: string } }>(await app.request('/api/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: c },
      body: JSON.stringify({ name: 'Checking', walletType: 'bank', assetId: usd }),
    })).then((b) => b.data.id)
    const walletId = await wallet(cookie)
    const otherWallet = await wallet(other.cookie)
    const person = await json<{ data: { id: string } }>(await app.request('/api/people', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Sam' }),
    })).then((b) => b.data.id)

    const post = async (c: string, w: string, date: string, type: string, amount: string, extra: object = {}) => {
      const res = await app.request('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: c },
        body: JSON.stringify({ transactionDate: `${date}T12:00:00.000Z`, type, description: `${type} ${amount}`, entries: [{ walletId: w, assetId: usd, amount }], ...extra }),
      })
      expect(res.status).toBe(201)
    }
    await post(cookie, walletId, '2026-09-01', 'income', '2000.00')
    await post(cookie, walletId, '2026-09-03', 'expense', '-500.00')
    await post(cookie, walletId, '2026-10-01', 'income', '2000.00')
    await post(cookie, walletId, '2026-10-04', 'expense', '-80.00', { splits: [{ personId: person, amount: '40.00' }] })
    await post(cookie, walletId, '2026-10-06', 'expense', '-100.00')
    await post(other.cookie, otherWallet, '2026-10-05', 'expense', '-999.00')

    const res = await app.request('/api/analytics/month-report?month=2026-10&currency=USD&today=2026-10-10', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = await json<{ data: Record<string, unknown> & { usual: { spent: number; months: number }; history: unknown[] } }>(res)
    expect(data.spent).toBe(140)
    expect(data.fronted).toBe(40)
    expect(data.income).toBe(2000)
    expect(data.net).toBe(1860)
    expect(data.usual).toMatchObject({ months: 1, spent: 500, income: 2000 })
    expect(data.spentByNow).toBe(140)
    expect(data.usualByNow).toBe(500)
    expect(data.history).toHaveLength(12)
  })

  it('rejects a malformed month', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/analytics/month-report?month=2026-13', { headers: { cookie } })
    expect(res.status).toBe(400)
  })
})
