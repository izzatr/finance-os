import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, holdingPositionEvents, holdings, instruments, listingPrices, listings, pool, providerSymbols, wallets } from '@finance-os/db'
import { eq } from 'drizzle-orm'
import app from '../app'
import { claimManualRefresh, listingIdsForWallet, refreshClaimedDueListings } from '../portfolio/service'
import { createTestUser, truncateAll } from './helpers'

const bbca = { symbol: 'BBCA.JK', shortname: 'Bank Central Asia Tbk', quoteType: 'EQUITY', exchange: 'JKT', exchDisp: 'Jakarta', currency: 'IDR', exchangeTimezoneName: 'Asia/Jakarta' }
const vwce = { symbol: 'VWCE.DE', longname: 'Vanguard FTSE All-World UCITS ETF', quoteType: 'ETF', exchange: 'XETR', exchDisp: 'XETRA', currency: 'EUR', exchangeTimezoneName: 'Europe/Berlin' }
const chart = { chart: { result: [{ meta: { symbol: 'BBCA.JK', currency: 'IDR', exchangeName: 'JKT', timezone: 'Asia/Jakarta' }, timestamp: [1784073600, 1784160000], indicators: { adjclose: [{ adjclose: [9000, 9100] }], quote: [{ close: [9000, 9100] }] } }], error: null } }

async function assetId(cookie: string, code: string) {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const body = await res.json() as { data: Array<{ id: string; code: string }> }
  return body.data.find((asset) => asset.code === code)!.id
}

async function wallet(cookie: string, name = 'Broker', walletType = 'investment') {
  const res = await app.request('/api/wallets', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name, walletType, assetId: await assetId(cookie, 'EUR') }) })
  return (await res.json() as { data: { id: string } }).data.id
}

async function addHolding(cookie: string, walletId: string, overrides: Record<string, unknown> = {}) {
  return app.request('/api/portfolio/holdings', {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ walletId, provider: 'yahoo', providerSymbol: 'BBCA.JK', name: 'Bank Central Asia Tbk', instrumentType: 'stock', exchangeCode: 'JKT', exchangeName: 'Jakarta', mic: 'XIDX', currency: 'IDR', timezone: 'Asia/Jakarta', quantity: '100', averageCost: '8500', costCurrency: 'IDR', ...overrides }),
  })
}

describe('portfolio API', () => {
  beforeEach(async () => {
    await truncateAll()
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      return new Response(JSON.stringify(url.includes('/v1/finance/search') ? { quotes: [url.includes('VWCE') ? vwce : bbca] } : chart))
    }))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('requires authentication and searches Yahoo without persisting results', async () => {
    expect((await app.request('/api/portfolio/search?q=BBCA')).status).toBe(401)
    const { cookie } = await createTestUser(app)
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ quotes: [bbca] })))
    vi.stubGlobal('fetch', fetchMock)
    const res = await app.request('/api/portfolio/search?q=BBCA%20Indonesia&limit=5', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = await res.json() as { data: Array<{ providerSymbol: string; timezone: string }> }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ providerSymbol: 'BBCA.JK', timezone: 'Asia/Jakarta' })
  })

  it('creates, lists, updates and deletes holdings with strict wallet tenancy', async () => {
    const owner = await createTestUser(app)
    const stranger = await createTestUser(app)
    const walletId = await wallet(owner.cookie)
    const created = await addHolding(owner.cookie, walletId)
    expect(created.status).toBe(201)
    const holding = (await created.json() as { data: { id: string; listing: { providerSymbol: string } } }).data
    expect(holding.listing.providerSymbol).toBe('BBCA.JK')

    expect((await addHolding(stranger.cookie, walletId)).status).toBe(404)
    expect((await app.request('/api/portfolio/holdings', { headers: { cookie: stranger.cookie } })).status).toBe(200)
    const strangers = await (await app.request('/api/portfolio/holdings', { headers: { cookie: stranger.cookie } })).json() as { data: unknown[] }
    expect(strangers.data).toEqual([])
    expect((await app.request(`/api/portfolio/holdings/${holding.id}`, { method: 'PATCH', headers: { cookie: stranger.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ quantity: '2' }) })).status).toBe(404)

    const updated = await app.request(`/api/portfolio/holdings/${holding.id}`, { method: 'PATCH', headers: { cookie: owner.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ quantity: '125.5', averageCost: null }) })
    expect(updated.status).toBe(200)
    expect(Number((await updated.json() as { data: { quantity: string } }).data.quantity)).toBe(125.5)
    expect((await app.request(`/api/portfolio/holdings/${holding.id}`, { method: 'DELETE', headers: { cookie: owner.cookie } })).status).toBe(200)
  })

  it('rejects holdings on non-investment wallets', async () => {
    const { cookie } = await createTestUser(app)
    const bankWallet = await wallet(cookie, 'Checking', 'bank')
    expect((await addHolding(cookie, bankWallet)).status).toBe(404)
  })

  it('uses Yahoo metadata instead of allowing a tenant to poison shared listings', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const created = await addHolding(cookie, walletId, {
      name: 'Attacker supplied name', exchangeCode: 'EVIL', exchangeName: 'Fake exchange', mic: null,
      currency: 'USD', timezone: 'Etc/Unknown', instrumentType: 'etf',
    })
    expect(created.status).toBe(201)
    const data = (await created.json() as { data: { listing: Record<string, unknown> } }).data.listing
    expect(data).toMatchObject({
      providerSymbol: 'BBCA.JK', instrumentName: 'Bank Central Asia Tbk', instrumentType: 'stock',
      exchangeCode: 'JKT', exchangeName: 'Jakarta', currency: 'IDR', timezone: 'Asia/Jakarta',
    })
  })

  it('excludes inactive or non-investment wallets from every portfolio operation', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    await db.update(wallets).set({ isActive: false }).where(eq(wallets.id, walletId))
    expect((await addHolding(cookie, walletId)).status).toBe(404)

    await db.update(wallets).set({ isActive: true }).where(eq(wallets.id, walletId))
    const created = await addHolding(cookie, walletId)
    expect(created.status).toBe(201)
    expect((await app.request(`/api/wallets/${walletId}`, {
      method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ walletType: 'bank' }),
    })).status).toBe(409)
    expect((await app.request(`/api/wallets/${walletId}`, { method: 'DELETE', headers: { cookie } })).status).toBe(409)
    await expect(db.update(wallets).set({ walletType: 'bank' }).where(eq(wallets.id, walletId))).rejects.toThrow()
    const listed = await app.request(`/api/portfolio/holdings?walletId=${walletId}`, { headers: { cookie } })
    expect((await listed.json() as { data: unknown[] }).data).toHaveLength(1)
  })

  it('serializes holding creation against concurrent wallet invalidation', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const created = await addHolding(cookie, walletId)
    const holding = (await created.json() as { data: { id: string; listing: { id: string } } }).data
    await app.request(`/api/portfolio/holdings/${holding.id}`, { method: 'DELETE', headers: { cookie } })

    const insertClient = await pool.connect()
    const updateClient = await pool.connect()
    try {
      await insertClient.query('BEGIN')
      await updateClient.query('BEGIN')
      await insertClient.query('INSERT INTO holdings (wallet_id, listing_id, quantity) VALUES ($1, $2, $3)', [walletId, holding.listing.id, '1'])
      const update = updateClient.query('UPDATE wallets SET wallet_type = $1 WHERE id = $2', ['bank', walletId])
        .then(() => ({ code: 'ok' })).catch((error: { code?: string }) => ({ code: error.code }))
      await new Promise((resolve) => setTimeout(resolve, 50))
      await insertClient.query('COMMIT')
      expect((await update).code).toBe('23514')
      await updateClient.query('ROLLBACK')
      const [state] = await db.select().from(wallets).where(eq(wallets.id, walletId))
      expect(state.walletType).toBe('investment')
    } finally {
      await insertClient.query('ROLLBACK').catch(() => undefined)
      await updateClient.query('ROLLBACK').catch(() => undefined)
      insertClient.release()
      updateClient.release()
    }
  }, 10_000)

  it('rejects decimal values that cannot fit numeric(28,8)', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    expect((await addHolding(cookie, walletId, { quantity: '1e309' })).status).toBe(400)
    expect((await addHolding(cookie, walletId, { quantity: '123456789012345678901' })).status).toBe(400)
    expect((await addHolding(cookie, walletId, { quantity: '1.123456789' })).status).toBe(400)
  })

  it('refreshes trailing prices idempotently, records freshness, and retains prices after errors', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const holding = (await (await addHolding(cookie, walletId)).json() as { data: { listing: { id: string } } }).data
    const firstFetch = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(chart)))
    vi.stubGlobal('fetch', firstFetch)

    const first = await app.request(`/api/portfolio/listings/${holding.listing.id}/refresh`, { method: 'POST', headers: { cookie } })
    expect(first.status).toBe(200)
    expect((await first.json() as { data: { upserted: number } }).data.upserted).toBe(2)
    const firstUrl = new URL(String(firstFetch.mock.calls[0][0]))
    expect(Number(firstUrl.searchParams.get('period2')) - Number(firstUrl.searchParams.get('period1'))).toBeGreaterThanOrEqual(360 * 86_400)
    const [backfilled] = await db.select().from(listings).where(eq(listings.id, holding.listing.id))
    expect(backfilled.historyBackfilledAt).not.toBeNull()

    const cooledDown = await app.request(`/api/portfolio/listings/${holding.listing.id}/refresh`, { method: 'POST', headers: { cookie } })
    expect(cooledDown.status).toBe(429)
    expect(await db.select().from(listingPrices)).toHaveLength(2)

    await db.update(listings).set({ lastRefreshAt: new Date(0) }).where(eq(listings.id, holding.listing.id))
    const routineFetch = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify(chart)))
    vi.stubGlobal('fetch', routineFetch)
    expect((await app.request(`/api/portfolio/listings/${holding.listing.id}/refresh`, { method: 'POST', headers: { cookie } })).status).toBe(200)
    const routineUrl = new URL(String(routineFetch.mock.calls[0][0]))
    expect(Number(routineUrl.searchParams.get('period2')) - Number(routineUrl.searchParams.get('period1'))).toBeLessThanOrEqual(6 * 86_400)

    await db.update(listings).set({ lastRefreshAt: new Date(0) }).where(eq(listings.id, holding.listing.id))
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    const failed = await app.request(`/api/portfolio/listings/${holding.listing.id}/refresh`, { method: 'POST', headers: { cookie } })
    expect(failed.status).toBe(502)
    expect(await db.select().from(listingPrices)).toHaveLength(2)
    const [state] = await db.select().from(listings).where(eq(listings.id, holding.listing.id))
    expect(state.lastSuccessAt).not.toBeNull()
    expect(state.refreshError).toContain('503')
  })

  it('coordinates manual and scheduled refreshes through one lease', async () => {
    const { cookie, userId } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const holding = (await (await addHolding(cookie, walletId)).json() as { data: { listing: { id: string } } }).data
    const leaseOwner = await claimManualRefresh(holding.listing.id, userId)
    expect(leaseOwner).toBeTruthy()
    const dailyChart = vi.fn()
    const provider = { name: 'yahoo', search: vi.fn(), dailyChart }

    expect(await refreshClaimedDueListings(provider, { limit: 10 })).toEqual([])
    expect(dailyChart).not.toHaveBeenCalled()
  })

  it('treats an empty Yahoo chart as a failed refresh without advancing success state', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const holding = (await (await addHolding(cookie, walletId)).json() as { data: { listing: { id: string } } }).data
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'BBCA.JK', currency: 'IDR' }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }))))
    const response = await app.request(`/api/portfolio/listings/${holding.listing.id}/refresh`, { method: 'POST', headers: { cookie } })
    expect(response.status).toBe(502)
    const [state] = await db.select().from(listings).where(eq(listings.id, holding.listing.id))
    expect(state.lastSuccessAt).toBeNull()
    expect(state.refreshError).toContain('no valid EOD prices')
  })

  it('does not truncate portfolios at 1,000 holdings', async () => {
    const { cookie, userId } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const created = await addHolding(cookie, walletId)
    const first = (await created.json() as { data: { listing: { id: string } } }).data
    const [seedListing] = await db.select().from(listings).where(eq(listings.id, first.listing.id))
    const extraInstruments = await db.insert(instruments).values(Array.from({ length: 1000 }, (_, index) => ({
      name: `Scale instrument ${index}`, type: 'stock' as const,
    }))).returning({ id: instruments.id })
    const extraListings = await db.insert(listings).values(extraInstruments.map((instrument, index) => ({
      instrumentId: instrument.id, exchangeId: seedListing.exchangeId, symbol: `SCALE${index}`, currency: 'IDR', timezone: 'Asia/Jakarta',
    }))).returning({ id: listings.id, symbol: listings.symbol })
    await db.insert(providerSymbols).values(extraListings.map((listing) => ({ listingId: listing.id, provider: 'yahoo', symbol: listing.symbol })))
    await db.insert(holdings).values(extraListings.map((listing) => ({ walletId, listingId: listing.id, quantity: '1' })))

    const response = await app.request(`/api/portfolio/holdings?walletId=${walletId}`, { headers: { cookie } })
    expect(response.status).toBe(200)
    expect((await response.json() as { data: unknown[] }).data).toHaveLength(1001)
    expect(await listingIdsForWallet(userId, walletId)).toHaveLength(1001)
  }, 15_000)

  it('includes investment holdings in wallet cards and total net worth', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie, 'European ETF')
    const created = await addHolding(cookie, walletId, {
      providerSymbol: 'VWCE.DE',
      name: 'Vanguard FTSE All-World UCITS ETF',
      instrumentType: 'etf',
      exchangeCode: 'XETR',
      exchangeName: 'XETRA',
      mic: 'XETR',
      currency: 'EUR',
      timezone: 'Europe/Berlin',
      quantity: '2',
      averageCost: '120',
      costCurrency: 'EUR',
    })
    const holding = (await created.json() as { data: { listing: { id: string } } }).data
    await db.insert(listingPrices).values({ listingId: holding.listing.id, priceDate: '2026-07-17', close: '140', currency: 'EUR', source: 'yahoo' })

    const walletList = await app.request('/api/wallets', { headers: { cookie } })
    expect(walletList.status).toBe(200)
    const walletData = (await walletList.json() as { data: Array<{ id: string; portfolioValue: { value: number; currency: string } | null }> }).data
    expect(walletData.find((item) => item.id === walletId)?.portfolioValue).toMatchObject({ value: 280, currency: 'EUR' })

    const netWorth = await app.request('/api/analytics/net-worth?currency=EUR&months=1', { headers: { cookie } })
    expect(netWorth.status).toBe(200)
    const netWorthData = (await netWorth.json() as { data: { total: number; series: Array<{ total: number }> } }).data
    expect(netWorthData.total).toBe(280)
    expect(netWorthData.series.at(-1)?.total).toBe(280)
  })

  it('returns native and nullable base valuations plus EOD history without fabricating missing FX', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const holding = (await (await addHolding(cookie, walletId)).json() as { data: { listing: { id: string } } }).data
    await db.insert(listingPrices).values([
      { listingId: holding.listing.id, priceDate: '2026-07-15', close: '9000', currency: 'IDR', source: 'yahoo' },
      { listingId: holding.listing.id, priceDate: '2026-07-16', close: '9100', currency: 'IDR', source: 'yahoo' },
    ])

    const summary = await app.request(`/api/portfolio/summary?walletId=${walletId}`, { headers: { cookie } })
    expect(summary.status).toBe(200)
    const summaryData = (await summary.json() as { data: { baseCurrency: string; totalBaseValue: number | null; holdings: Array<{ nativeValue: number; baseValue: number | null; priceDate: string }> } }).data
    expect(summaryData.baseCurrency).toBe('EUR')
    expect(summaryData.totalBaseValue).toBeNull()
    expect(summaryData.holdings[0]).toMatchObject({ nativeValue: 910000, baseValue: null, priceDate: '2026-07-16' })

    const history = await app.request(`/api/portfolio/history?walletId=${walletId}&from=2026-07-15&to=2026-07-16`, { headers: { cookie } })
    expect(history.status).toBe(200)
    const points = (await history.json() as { data: { points: Array<{ date: string; nativeTotals: Record<string, number>; baseValue: number | null }> } }).data.points
    expect(points).toEqual([
      { date: '2026-07-15', nativeTotals: {}, baseValue: null },
      { date: '2026-07-16', nativeTotals: {}, baseValue: null },
    ])
  })

  it('uses position events for quantity changes and deletions in portfolio history', async () => {
    const { cookie } = await createTestUser(app)
    const walletId = await wallet(cookie)
    const created = await addHolding(cookie, walletId, { quantity: '100' })
    const holding = (await created.json() as { data: { listing: { id: string } } }).data
    await db.insert(holdingPositionEvents).values([
      { walletId, listingId: holding.listing.id, quantity: '100', effectiveAt: new Date('2026-07-15T12:00:00Z'), reason: 'created' },
      { walletId, listingId: holding.listing.id, quantity: '200', effectiveAt: new Date('2026-07-16T12:00:00Z'), reason: 'updated' },
      { walletId, listingId: holding.listing.id, quantity: '0', effectiveAt: new Date('2026-07-17T23:59:59Z'), reason: 'deleted' },
    ])
    await db.insert(listingPrices).values([
      { listingId: holding.listing.id, priceDate: '2026-07-15', close: '9000', currency: 'IDR', source: 'yahoo' },
      { listingId: holding.listing.id, priceDate: '2026-07-16', close: '9100', currency: 'IDR', source: 'yahoo' },
    ])

    const history = await app.request(`/api/portfolio/history?walletId=${walletId}&from=2026-07-15&to=2026-07-17`, { headers: { cookie } })
    const points = (await history.json() as { data: { points: Array<{ date: string; nativeTotals: Record<string, number>; baseValue: number | null }> } }).data.points
    expect(points.map((point) => point.nativeTotals)).toEqual([
      { IDR: 900000 },
      { IDR: 1820000 },
      {},
    ])
    expect(points[2].baseValue).toBe(0)
  })

  it('rate-limits Yahoo search abuse', async () => {
    const { cookie } = await createTestUser(app)
    const statuses: number[] = []
    for (let index = 0; index < 35; index++) {
      const response = await app.request(`/api/portfolio/search?q=rate-limit-${index}`, { headers: { cookie } })
      statuses.push(response.status)
    }
    expect(statuses).toContain(429)
  })
})
