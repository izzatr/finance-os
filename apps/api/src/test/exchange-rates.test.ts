import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { db, auditLogs } from '@finance-os/db'
import { eq } from 'drizzle-orm'
import { createTestUser, truncateAll } from './helpers'

async function postRate(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/exchange-rates', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

describe('exchange rates routes', () => {
  beforeEach(async () => await truncateAll())

  it('creates a manual rate, defaulting asOf to now, and audits it', async () => {
    const { cookie } = await createTestUser(app)
    const res = await postRate(cookie, { base: 'EUR', quote: 'IDR', rate: '17650.20' })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: string; base: string; quote: string; rate: number; asOf: string; source: string } }
    expect(data.base).toBe('EUR')
    expect(data.quote).toBe('IDR')
    expect(data.rate).toBe(17650.2)
    expect(data.source).toBe('manual')
    expect(new Date(data.asOf).getTime()).not.toBeNaN()

    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, data.id))
    expect(audit.action).toBe('exchange_rate.create')
    expect(audit.resourceType).toBe('exchange_rate')
  })

  it('accepts an explicit asOf', async () => {
    const { cookie } = await createTestUser(app)
    const res = await postRate(cookie, { base: 'EUR', quote: 'USD', rate: '1.09', asOf: '2026-07-01T00:00:00.000Z' })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { asOf: string } }
    expect(data.asOf).toBe('2026-07-01T00:00:00.000Z')
  })

  it('rejects lowercase or too-short currency codes', async () => {
    const { cookie } = await createTestUser(app)
    expect((await postRate(cookie, { base: 'eur', quote: 'USD', rate: '1.09' })).status).toBe(400)
    expect((await postRate(cookie, { base: 'EU', quote: 'USD', rate: '1.09' })).status).toBe(400)
  })

  it('rejects a non-numeric rate', async () => {
    const { cookie } = await createTestUser(app)
    expect((await postRate(cookie, { base: 'EUR', quote: 'USD', rate: 'abc' })).status).toBe(400)
  })

  it('lists the latest rate per pair', async () => {
    const { cookie } = await createTestUser(app)
    await postRate(cookie, { base: 'EUR', quote: 'USD', rate: '1.05', asOf: '2026-06-01T00:00:00.000Z' })
    await postRate(cookie, { base: 'EUR', quote: 'USD', rate: '1.09', asOf: '2026-07-01T00:00:00.000Z' })
    await postRate(cookie, { base: 'EUR', quote: 'IDR', rate: '17650.2', asOf: '2026-07-01T00:00:00.000Z' })

    const res = await app.request('/api/exchange-rates', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { base: string; quote: string; rate: number }[] }
    expect(data).toHaveLength(2)
    const usd = data.find((r) => r.quote === 'USD')
    expect(usd?.rate).toBe(1.09)
    const idr = data.find((r) => r.quote === 'IDR')
    expect(idr?.rate).toBe(17650.2)
  })
})
