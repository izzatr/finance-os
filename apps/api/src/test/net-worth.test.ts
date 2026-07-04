import { beforeEach, describe, expect, it } from 'vitest'
import { db, assetPrices } from '@finance-os/db'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function getAssetId(cookie: string, code: string): Promise<string> {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data } = (await res.json()) as { data: { id: string; code: string }[] }
  const asset = data.find((a) => a.code === code)
  if (!asset) throw new Error(`asset ${code} not seeded in test DB`)
  return asset.id
}

async function createWallet(cookie: string, name: string, assetId: string): Promise<string> {
  const res = await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name, walletType: 'bank', assetId }),
  })
  expect(res.status).toBe(201)
  return ((await res.json()) as { data: { id: string } }).data.id
}

async function post(cookie: string, walletId: string, assetId: string, amount: string, date: Date) {
  const type = amount.startsWith('-') ? 'expense' : 'income'
  const res = await app.request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      transactionDate: date.toISOString(),
      type,
      description: `${type} entry`,
      entries: [{ walletId, assetId, amount }],
    }),
  })
  expect(res.status).toBe(201)
}

async function postRate(cookie: string, base: string, quote: string, rate: string, asOf?: string) {
  const res = await app.request('/api/exchange-rates', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ base, quote, rate, ...(asOf ? { asOf } : {}) }),
  })
  expect(res.status).toBe(201)
}

// Calendar months used throughout: "previous" and "current", relative to whenever the
// test happens to run — the route buckets by the real clock, so the fixture must too.
const now = new Date()
const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
const previousMonthLabel = `${previousMonthDate.getUTCFullYear()}-${String(previousMonthDate.getUTCMonth() + 1).padStart(2, '0')}`
const currentMonthLabel = `${currentMonthDate.getUTCFullYear()}-${String(currentMonthDate.getUTCMonth() + 1).padStart(2, '0')}`

describe('GET /api/analytics/net-worth', () => {
  beforeEach(async () => await truncateAll())

  it('converts a two-currency net worth into EUR, hand-computed, excluding an unrated asset', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const idrAssetId = await getAssetId(cookie, 'IDR')
    const gbpAssetId = await getAssetId(cookie, 'GBP')

    const eurWallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    const idrWallet = await createWallet(cookie, 'IDR checking', idrAssetId)
    const gbpWallet = await createWallet(cookie, 'GBP checking', gbpAssetId)

    // 1 EUR = 15,000 IDR — a round rate so every expected total below is hand-computable.
    await postRate(cookie, 'EUR', 'IDR', '15000')

    // EUR wallet: +1000.00 in the previous month, -200.00 in the current month.
    // Cumulative: previous month = 1000.00, current month = 800.00.
    await post(cookie, eurWallet, eurAssetId, '1000.00', previousMonthDate)
    await post(cookie, eurWallet, eurAssetId, '-200.00', currentMonthDate)

    // IDR wallet: +15,000,000 previous month (= 1000 EUR), +3,000,000 current month (= 200 EUR).
    // Cumulative: previous month = 15,000,000, current month = 18,000,000.
    await post(cookie, idrWallet, idrAssetId, '15000000.00', previousMonthDate)
    await post(cookie, idrWallet, idrAssetId, '3000000.00', currentMonthDate)

    // GBP wallet: no rate is ever recorded for GBP, so it must land in `missing` and be
    // excluded from every total rather than silently treated as zero-value.
    await post(cookie, gbpWallet, gbpAssetId, '50.00', currentMonthDate)

    const res = await app.request('/api/analytics/net-worth?currency=EUR&months=2', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: { currency: string; total: number; series: { month: string; total: number }[]; missing: string[]; staleRates: boolean }
    }

    expect(data.currency).toBe('EUR')
    expect(data.missing).toEqual(['GBP'])
    expect(data.series).toEqual([
      { month: previousMonthLabel, total: 2000 }, // 1000.00 EUR + (15,000,000 / 15000) EUR
      { month: currentMonthLabel, total: 2000 }, // 800.00 EUR + (18,000,000 / 15000) EUR
    ])
    expect(data.total).toBe(2000)
    expect(data.staleRates).toBe(false)
  })

  it('inverts correctly when the display currency is IDR', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const idrAssetId = await getAssetId(cookie, 'IDR')
    const eurWallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    const idrWallet = await createWallet(cookie, 'IDR checking', idrAssetId)

    await postRate(cookie, 'EUR', 'IDR', '15000')
    await post(cookie, eurWallet, eurAssetId, '1000.00', previousMonthDate)
    await post(cookie, idrWallet, idrAssetId, '15000000.00', previousMonthDate)

    // months=1 is just the current month — the previous month's balances carry forward into it.
    const res = await app.request('/api/analytics/net-worth?currency=IDR&months=1', { headers: { cookie } })
    const { data } = (await res.json()) as { data: { total: number; series: { month: string; total: number }[] } }

    // 1000.00 EUR -> 15,000,000 IDR, plus the native 15,000,000 IDR balance = 30,000,000.
    expect(data.series).toEqual([{ month: currentMonthLabel, total: 30_000_000 }])
    expect(data.total).toBe(30_000_000)
  })

  it('values a quantity asset from its latest price, converting the price currency, hand-computed', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const goldAssetId = await getAssetId(cookie, 'XAU_G')

    const eurWallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    const goldWallet = await createWallet(cookie, 'Gold stash', goldAssetId)

    // 1 EUR = 2 USD — round, so the USD-priced gold below converts by hand.
    await postRate(cookie, 'EUR', 'USD', '2')

    // EUR wallet: flat 100.00 from the previous month onward.
    await post(cookie, eurWallet, eurAssetId, '100.00', previousMonthDate)

    // Gold: +10 g previous month, +5 g current month (cumulative 10 g -> 15 g).
    await post(cookie, goldWallet, goldAssetId, '10', previousMonthDate)
    await post(cookie, goldWallet, goldAssetId, '5', currentMonthDate)

    // Two dated price rows in a NON-display currency: the newest (100 USD/g) must win
    // over the older 90 USD/g for the entire series (documented latest-price method).
    await db.insert(assetPrices).values([
      { assetId: goldAssetId, price: '90', currency: 'USD', asOf: previousMonthDate, source: 'manual' },
      { assetId: goldAssetId, price: '100', currency: 'USD', asOf: currentMonthDate, source: 'manual' },
    ])

    const res = await app.request('/api/analytics/net-worth?currency=EUR&months=2', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as {
      data: { total: number; series: { month: string; total: number }[]; missing: string[] }
    }

    // 100 USD/g -> 50 EUR/g at the 1 EUR = 2 USD rate.
    // Previous month: 100 EUR + 10 g x 50 EUR = 600. Current month: 100 EUR + 15 g x 50 EUR = 850.
    expect(data.missing).toEqual([])
    expect(data.series).toEqual([
      { month: previousMonthLabel, total: 600 },
      { month: currentMonthLabel, total: 850 },
    ])
    expect(data.total).toBe(850)
  })

  it('puts a quantity asset with no price row into missing and excludes it from totals', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const goldAssetId = await getAssetId(cookie, 'XAU_G')

    const eurWallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    const goldWallet = await createWallet(cookie, 'Gold stash', goldAssetId)

    await post(cookie, eurWallet, eurAssetId, '100.00', currentMonthDate)
    await post(cookie, goldWallet, goldAssetId, '10', currentMonthDate) // no asset_prices row anywhere

    const res = await app.request('/api/analytics/net-worth?currency=EUR&months=1', { headers: { cookie } })
    const { data } = (await res.json()) as {
      data: { total: number; series: { month: string; total: number }[]; missing: string[] }
    }

    expect(data.missing).toEqual(['XAU_G'])
    expect(data.series).toEqual([{ month: currentMonthLabel, total: 100 }])
    expect(data.total).toBe(100)
  })

  it('flags staleRates when the newest EUR rate is older than 7 days', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const wallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    await post(cookie, wallet, eurAssetId, '100.00', currentMonthDate)

    const stale = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    await postRate(cookie, 'EUR', 'IDR', '15000', stale)

    const res = await app.request('/api/analytics/net-worth?currency=EUR&months=1', { headers: { cookie } })
    const { data } = (await res.json()) as { data: { staleRates: boolean } }
    expect(data.staleRates).toBe(true)
  })

  it('clamps months to the [1, 60] range', async () => {
    const { cookie } = await createTestUser(app)
    const eurAssetId = await getAssetId(cookie, 'EUR')
    const wallet = await createWallet(cookie, 'EUR checking', eurAssetId)
    await post(cookie, wallet, eurAssetId, '100.00', currentMonthDate)

    const tooMany = await app.request('/api/analytics/net-worth?months=999', { headers: { cookie } })
    const { data: tooManyData } = (await tooMany.json()) as { data: { series: unknown[] } }
    expect(tooManyData.series).toHaveLength(60)

    const tooFew = await app.request('/api/analytics/net-worth?months=0', { headers: { cookie } })
    const { data: tooFewData } = (await tooFew.json()) as { data: { series: unknown[] } }
    expect(tooFewData.series).toHaveLength(1)
  })

  it('defaults to EUR and 12 months', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/analytics/net-worth', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { currency: string; series: unknown[] } }
    expect(data.currency).toBe('EUR')
    expect(data.series).toHaveLength(12)
  })
})
