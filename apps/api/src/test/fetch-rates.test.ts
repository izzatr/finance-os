import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, exchangeRates } from '@finance-os/db'
import { eq } from 'drizzle-orm'
import { fetchDailyRates } from '../jobs/fetch-rates'
import { truncateAll } from './helpers'

const CANNED_PAYLOAD = { base: 'EUR', date: '2026-07-04', rates: { USD: 1.09, IDR: 17650.2 } }

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe('fetchDailyRates', () => {
  beforeEach(async () => await truncateAll())

  it('inserts one row per quote from the frankfurter payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(CANNED_PAYLOAD))

    const result = await fetchDailyRates(fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ fetched: 2 })

    const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.base, 'EUR'))
    expect(rows).toHaveLength(2)
    const byQuote = new Map(rows.map((r) => [r.quote, r]))
    expect(Number(byQuote.get('USD')?.rate)).toBe(1.09)
    expect(Number(byQuote.get('IDR')?.rate)).toBe(17650.2)
    expect(byQuote.get('USD')?.source).toBe('frankfurter')
    expect(byQuote.get('USD')?.asOf.toISOString()).toBe('2026-07-04T00:00:00.000Z')

    expect(fetchImpl).toHaveBeenCalledWith('https://api.frankfurter.app/latest?base=EUR')
  })

  it('does not duplicate rows on a second call for the same day', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(CANNED_PAYLOAD))

    const first = await fetchDailyRates(fetchImpl as unknown as typeof fetch)
    expect(first).toEqual({ fetched: 2 })

    const second = await fetchDailyRates(fetchImpl as unknown as typeof fetch)
    expect(second).toEqual({ fetched: 0 })

    const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.base, 'EUR'))
    expect(rows).toHaveLength(2)
  })

  it('returns { fetched: 0 } and never throws when the fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))

    const result = await fetchDailyRates(fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ fetched: 0 })

    const rows = await db.select().from(exchangeRates)
    expect(rows).toHaveLength(0)
  })

  it('returns { fetched: 0 } and never throws on a non-ok HTTP response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 503))

    const result = await fetchDailyRates(fetchImpl as unknown as typeof fetch)
    expect(result).toEqual({ fetched: 0 })
  })
})
