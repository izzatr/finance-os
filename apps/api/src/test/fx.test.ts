import { beforeEach, describe, expect, it } from 'vitest'
import { db, exchangeRates } from '@finance-os/db'
import { convertAmount, FxError, getLatestRates } from '../lib/fx'
import { truncateAll } from './helpers'

describe('convertAmount', () => {
  it('converts EUR to USD directly via the rate', () => {
    const rates = new Map([['EUR', 1], ['USD', 1.09]])
    expect(convertAmount(100, 'EUR', 'USD', rates)).toBeCloseTo(109, 8)
  })

  it('converts USD to IDR via an EUR cross rate', () => {
    const rates = new Map([['EUR', 1], ['USD', 1.09], ['IDR', 17650.2]])
    // 100 USD -> EUR -> IDR: (100 / 1.09) * 17650.2
    expect(convertAmount(100, 'USD', 'IDR', rates)).toBeCloseTo((100 / 1.09) * 17650.2, 6)
  })

  it('is a no-op for identical currencies, even absent from the rate map', () => {
    const rates = new Map<string, number>()
    expect(convertAmount(42.5, 'USD', 'USD', rates)).toBe(42.5)
  })

  it('throws FxError(MISSING_RATE) when the source currency is unknown', () => {
    const rates = new Map([['EUR', 1]])
    expect(() => convertAmount(100, 'GBP', 'EUR', rates)).toThrow(FxError)
    try {
      convertAmount(100, 'GBP', 'EUR', rates)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(FxError)
      expect((err as FxError).code).toBe('MISSING_RATE')
    }
  })

  it('throws FxError(MISSING_RATE) when the target currency is unknown', () => {
    const rates = new Map([['EUR', 1]])
    expect(() => convertAmount(100, 'EUR', 'GBP', rates)).toThrow(FxError)
  })
})

describe('getLatestRates', () => {
  beforeEach(async () => await truncateAll())

  it('always includes EUR -> 1', async () => {
    const rates = await getLatestRates()
    expect(rates.get('EUR')).toBe(1)
  })

  it('picks the latest of two dated rows per quote', async () => {
    await db.insert(exchangeRates).values([
      { base: 'EUR', quote: 'USD', rate: '1.05', asOf: new Date('2026-06-01T00:00:00Z'), source: 'frankfurter' },
      { base: 'EUR', quote: 'USD', rate: '1.09', asOf: new Date('2026-07-01T00:00:00Z'), source: 'frankfurter' },
      { base: 'EUR', quote: 'IDR', rate: '17000.0', asOf: new Date('2026-06-01T00:00:00Z'), source: 'frankfurter' },
      { base: 'EUR', quote: 'IDR', rate: '17650.2', asOf: new Date('2026-07-01T00:00:00Z'), source: 'frankfurter' },
    ])

    const rates = await getLatestRates()
    expect(rates.get('USD')).toBe(1.09)
    expect(rates.get('IDR')).toBe(17650.2)
  })

  it('ignores non-EUR-based rows', async () => {
    await db.insert(exchangeRates).values([
      { base: 'USD', quote: 'IDR', rate: '16000.0', asOf: new Date('2026-07-01T00:00:00Z'), source: 'manual' },
    ])
    const rates = await getLatestRates()
    expect(rates.has('IDR')).toBe(false)
  })
})

describe('rates cold-start bootstrap', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('fetches on an empty table and skips once rates exist', async () => {
    const { bootstrapRatesIfEmpty } = await import('../jobs/fetch-rates')
    const stub = (async () =>
      new Response(JSON.stringify({ base: 'EUR', date: '2026-07-05', rates: { USD: 1.09, IDR: 17650 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    const first = await bootstrapRatesIfEmpty(stub)
    expect(first).toMatchObject({ skipped: false, fetched: 2 })

    const second = await bootstrapRatesIfEmpty(stub)
    expect(second).toMatchObject({ skipped: true, fetched: 0 })
  })
})
