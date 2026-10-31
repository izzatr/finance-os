import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPasardanaCache, PasardanaFundProvider } from '../portfolio/pasardana'
import { MarketDataRouter } from '../portfolio/market-data'
import type { MarketDataProvider } from '../portfolio/yahoo'

const fundList = [
  { Id: 0, Name: 'PIRC-S', IsinCode: null },
  { Id: 2058, Name: 'Sucorinvest Money Market Fund', IsinCode: 'IDN000183902', Currency: 0, NetAssetValue: 2001.4, LastUpdate: '2026-10-30T00:00:00' },
  { Id: 5495, Name: 'Sucorinvest Money Market USD', IsinCode: 'IDN000539806', Currency: 1, NetAssetValue: 1.12, LastUpdate: '2026-10-30T00:00:00' },
  { Id: 1252, Name: 'Manulife Obligasi Unggulan Kelas A', IsinCode: 'IDN000020500', Currency: 0, NetAssetValue: 2572.09, LastUpdate: '2026-10-30T00:00:00' },
  { Id: 9, Name: 'Broken NAV fund', IsinCode: 'IDN000000009', Currency: 0, NetAssetValue: 0, LastUpdate: 'n/a' },
]

const snapshot = {
  Id: 2058,
  NetAssetValues: [
    { Date: '2026-10-27T00:00:00', Value: 2000.9 },
    { Date: '2026-10-28T00:00:00', Value: 2001.1 },
    { Date: '2026-10-29T00:00:00', Value: null },
    { Date: '2026-10-30T00:00:00', Value: 2001.4 },
  ],
}

function bom(value: unknown) {
  return new Response(`\uFEFF${JSON.stringify(value)}`, { status: 200 })
}

function fakeFetch(snapshotResponse: () => Response = () => bom(snapshot)) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('GetSnapshot')) return snapshotResponse()
    return bom(fundList)
  })
}

describe('PasardanaFundProvider', () => {
  beforeEach(() => clearPasardanaCache())

  it('searches funds by name terms or exact ISIN and skips entries without an ISIN', async () => {
    const provider = new PasardanaFundProvider({ fetchImpl: fakeFetch() })
    const byName = await provider.search('sucorinvest money')
    expect(byName.map((fund) => [fund.providerSymbol, fund.currency, fund.instrumentType])).toEqual([
      ['IDN000183902', 'IDR', 'mutual_fund'],
      ['IDN000539806', 'USD', 'mutual_fund'],
    ])
    expect((await provider.search('IDN000020500'))[0]).toMatchObject({ name: 'Manulife Obligasi Unggulan Kelas A', exchangeCode: 'IDFUND', timezone: 'Asia/Jakarta' })
    expect(await provider.search('pi')).toEqual([])
  })

  it('caches the fund list across provider instances', async () => {
    const fetchImpl = fakeFetch()
    await new PasardanaFundProvider({ fetchImpl }).search('manulife')
    await new PasardanaFundProvider({ fetchImpl }).search('sucorinvest')
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('returns snapshot NAV history inside the requested window and drops invalid points', async () => {
    const provider = new PasardanaFundProvider({ fetchImpl: fakeFetch() })
    const chart = await provider.dailyChart('IDN000183902', new Date('2026-10-28T00:00:00Z'), new Date('2026-10-31T00:00:00Z'))
    expect(chart.metadata).toMatchObject({ symbol: 'IDN000183902', currency: 'IDR' })
    expect(chart.prices).toEqual([{ date: '2026-10-28', close: 2001.1 }, { date: '2026-10-30', close: 2001.4 }])
  })

  it('falls back to the latest listed NAV when the snapshot is unavailable', async () => {
    const provider = new PasardanaFundProvider({ fetchImpl: fakeFetch(() => new Response('nope', { status: 500 })) })
    const chart = await provider.dailyChart('IDN000020500', new Date('2026-10-25T00:00:00Z'), new Date('2026-10-31T00:00:00Z'))
    expect(chart.prices).toEqual([{ date: '2026-10-30', close: 2572.09 }])
  })

  it('rejects unknown funds', async () => {
    const provider = new PasardanaFundProvider({ fetchImpl: fakeFetch() })
    await expect(provider.dailyChart('IDN999999999', new Date(), new Date())).rejects.toThrow('not found')
  })
})

describe('MarketDataRouter', () => {
  const chart = { metadata: { symbol: 'X', currency: 'EUR', exchangeCode: 'X', timezone: 'UTC' }, prices: [] }
  function stub(name: string, search: MarketDataProvider['search']): MarketDataProvider & { dailyChart: ReturnType<typeof vi.fn> } {
    return { name, search, dailyChart: vi.fn(async () => chart) }
  }

  it('routes Indonesian fund ISINs to the fund source and everything else to Yahoo', async () => {
    const yahoo = stub('yahoo', async () => [])
    const funds = stub('pasardana', async () => [])
    const router = new MarketDataRouter(yahoo, funds)
    const from = new Date('2026-10-01T00:00:00Z'); const to = new Date('2026-10-31T00:00:00Z')
    await router.dailyChart('idn000183902', from, to)
    await router.dailyChart('BBCA.JK', from, to)
    expect(funds.dailyChart).toHaveBeenCalledWith('idn000183902', from, to)
    expect(yahoo.dailyChart).toHaveBeenCalledWith('BBCA.JK', from, to)
    expect(router.name).toBe('yahoo')
  })

  it('merges search results and survives one failing source', async () => {
    const result = { provider: 'yahoo' as const, providerSymbol: 'BBCA.JK', name: 'BCA', instrumentType: 'stock' as const, exchangeCode: 'JKT', exchangeName: 'Jakarta', mic: null, currency: 'IDR', timezone: 'Asia/Jakarta' }
    const ok = new MarketDataRouter(stub('yahoo', async () => [result]), stub('pasardana', async () => { throw new Error('down') }))
    expect(await ok.search('bca')).toEqual([result])
    const down = new MarketDataRouter(stub('yahoo', async () => { throw new Error('yahoo down') }), stub('pasardana', async () => { throw new Error('down') }))
    await expect(down.search('bca')).rejects.toThrow('yahoo down')
  })
})
