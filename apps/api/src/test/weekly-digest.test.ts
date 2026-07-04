import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'
import { generateWeeklyDigests, isoWeekKey } from '../jobs/weekly-digest'

async function seedActivity(cookie: string, daysAgo: number) {
  const assetsRes = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await assetsRes.json()) as { data: { id: string; code: string }[] }
  const eur = assets.find((a) => a.code === 'EUR')!.id
  const walletRes = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Bank', walletType: 'bank', assetId: eur }),
  })
  const { data: wallet } = (await walletRes.json()) as { data: { id: string } }
  const res = await app.request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      transactionDate: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
      type: 'expense',
      description: 'Weekly groceries',
      entries: [{ walletId: wallet.id, assetId: eur, amount: '-42.00' }],
    }),
  })
  expect(res.status).toBe(201)
}

describe('weekly digest', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('computes ISO week keys correctly', () => {
    expect(isoWeekKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
    expect(isoWeekKey(new Date('2026-07-05T00:00:00Z'))).toBe('2026-W27')
    // Jan 1 2027 is a Friday belonging to ISO week 53 of 2026
    expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53')
  })

  it('files one digest per active user per week, idempotently', async () => {
    const { cookie } = await createTestUser(app)
    await seedActivity(cookie, 3)

    const first = await generateWeeklyDigests(new Date())
    expect(first.digests).toBe(1)
    const second = await generateWeeklyDigests(new Date())
    expect(second.digests).toBe(0)

    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    const { data: items } = (await inbox.json()) as {
      data: Array<{ source: string; actorLabel: string; status: string; payload: { stats?: { transactionCount: number } } }>
    }
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: 'digest', actorLabel: 'Weekly digest', status: 'pending' })
    expect(items[0].payload.stats?.transactionCount).toBe(1)
  })

  it('skips users with no activity in the window', async () => {
    const { cookie } = await createTestUser(app)
    await seedActivity(cookie, 30) // outside the 7-day window
    const { digests } = await generateWeeklyDigests(new Date())
    expect(digests).toBe(0)
    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    expect(((await inbox.json()) as { data: unknown[] }).data).toEqual([])
  })

  it('digest proposals cannot be approved (nothing to book), only dismissed', async () => {
    const { cookie } = await createTestUser(app)
    await seedActivity(cookie, 2)
    await generateWeeklyDigests(new Date())

    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    const { data: items } = (await inbox.json()) as { data: Array<{ id: string }> }

    const approve = await app.request(`/api/inbox/${items[0].id}/approve`, { method: 'POST', headers: { cookie } })
    expect(approve.status).toBe(409)

    const reject = await app.request(`/api/inbox/${items[0].id}/reject`, { method: 'POST', headers: { cookie } })
    expect(reject.status).toBe(200)
  })
})
