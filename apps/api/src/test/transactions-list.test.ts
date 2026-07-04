import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function setup(cookie: string) {
  const assetsRes = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await assetsRes.json()) as { data: { id: string; code: string }[] }
  const eur = assets.find((a) => a.code === 'EUR')!.id
  const walletRes = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Bank', walletType: 'bank', assetId: eur }),
  })
  const { data: wallet } = (await walletRes.json()) as { data: { id: string } }
  return { eur, walletId: wallet.id }
}

async function addTx(cookie: string, walletId: string, assetId: string, day: number, extra: Record<string, unknown> = {}) {
  const res = await app.request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      transactionDate: `2026-06-${String(day).padStart(2, '0')}T10:00:00.000Z`,
      type: 'expense',
      description: `day ${day}`,
      entries: [{ walletId, assetId, amount: '-10' }],
      ...extra,
    }),
  })
  expect(res.status).toBe(201)
}

describe('transaction listing', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('persists categoryId on create and surfaces categoryName in recent', async () => {
    const { cookie } = await createTestUser(app)
    const { eur, walletId } = await setup(cookie)
    const catRes = await app.request('/api/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Groceries', type: 'expense' }),
    })
    const { data: cat } = (await catRes.json()) as { data: { id: string } }

    await addTx(cookie, walletId, eur, 1, { categoryId: cat.id })

    const recent = await app.request('/api/analytics/recent', { headers: { cookie } })
    const { data } = (await recent.json()) as { data: { categoryName: string | null }[] }
    expect(data[0].categoryName).toBe('Groceries')
  })

  it('honors limit and before cursor for paging', async () => {
    const { cookie } = await createTestUser(app)
    const { eur, walletId } = await setup(cookie)
    for (const day of [1, 2, 3, 4, 5]) await addTx(cookie, walletId, eur, day)

    const page1 = await app.request('/api/analytics/recent?limit=2', { headers: { cookie } })
    const { data: p1 } = (await page1.json()) as { data: { description: string; transactionDate: string }[] }
    expect(p1.map((r) => r.description)).toEqual(['day 5', 'day 4'])

    const cursor = encodeURIComponent(p1[1].transactionDate)
    const page2 = await app.request(`/api/analytics/recent?limit=2&before=${cursor}`, { headers: { cookie } })
    const { data: p2 } = (await page2.json()) as { data: { description: string }[] }
    expect(p2.map((r) => r.description)).toEqual(['day 3', 'day 2'])
  })

  it('pages through tied timestamps without dropping rows (composite cursor)', async () => {
    const { cookie } = await createTestUser(app)
    const { eur, walletId } = await setup(cookie)
    // three transactions at the exact same instant — the quick-add pattern
    for (const n of [1, 2, 3]) {
      const res = await app.request('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          transactionDate: '2026-06-10T12:00:00.000Z',
          type: 'expense',
          description: `tied ${n}`,
          entries: [{ walletId, assetId: eur, amount: '-10' }],
        }),
      })
      expect(res.status).toBe(201)
    }

    const seen = new Set<string>()
    let cursor: { before: string; beforeEntryId: string } | undefined
    for (let page = 0; page < 4; page++) {
      const qs = new URLSearchParams({ limit: '2' })
      if (cursor) {
        qs.set('before', cursor.before)
        qs.set('beforeEntryId', cursor.beforeEntryId)
      }
      const res = await app.request(`/api/analytics/recent?${qs}`, { headers: { cookie } })
      const { data } = (await res.json()) as {
        data: { entryId: string; description: string; transactionDate: string }[]
      }
      if (data.length === 0) break
      for (const row of data) {
        expect(seen.has(row.entryId)).toBe(false) // no duplicates across pages
        seen.add(row.entryId)
      }
      const last = data[data.length - 1]
      cursor = { before: last.transactionDate, beforeEntryId: last.entryId }
    }
    expect(seen.size).toBe(3) // nothing dropped despite identical timestamps
  })
})
