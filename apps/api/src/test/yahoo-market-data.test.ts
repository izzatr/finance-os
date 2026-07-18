import { describe, expect, it, vi } from 'vitest'
import { YahooMarketDataProvider } from '../portfolio/yahoo'

const searchPayload = {
  quotes: [
    { symbol: 'BBCA.JK', shortname: 'Bank Central Asia Tbk', quoteType: 'EQUITY', exchange: 'JKT', exchDisp: 'Jakarta', currency: 'IDR', exchangeTimezoneName: 'Asia/Jakarta' },
    { symbol: 'VWCE.DE', longname: 'Vanguard FTSE All-World UCITS ETF', quoteType: 'ETF', exchange: 'GER', exchDisp: 'XETRA', currency: 'EUR', exchangeTimezoneName: 'Europe/Berlin' },
    { symbol: null, quoteType: 'EQUITY' },
    { symbol: 'EURUSD=X', quoteType: 'CURRENCY' },
  ],
}

const chartPayload = {
  chart: {
    result: [{
      meta: { symbol: '7203.T', currency: 'JPY', exchangeName: 'JPX', timezone: 'Asia/Tokyo' },
      timestamp: [1784073600, 1784160000, 1784246400],
      indicators: {
        quote: [{ close: [2500.5, 0, -5] }],
        adjclose: [{ adjclose: [2490, 2510, null] }],
      },
    }],
    error: null,
  },
}

describe('YahooMarketDataProvider', () => {
  it('searches international listings with encoded bounded queries and normalizes supported results', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(searchPayload), { status: 200 }))
    const provider = new YahooMarketDataProvider({ fetchImpl })
    const results = await provider.search('Bank & ETF', 100)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const calls = fetchImpl.mock.calls as unknown as Array<[string | URL | Request, RequestInit | undefined]>
    const [url, init] = calls[0]
    expect(String(url)).toContain('q=Bank+%26+ETF')
    expect(String(url)).toContain('quotesCount=25')
    expect((init?.headers as Record<string, string>)['User-Agent']).toContain('FinanceOS')
    expect(results).toEqual([
      { provider: 'yahoo', providerSymbol: 'BBCA.JK', name: 'Bank Central Asia Tbk', instrumentType: 'stock', exchangeCode: 'JKT', exchangeName: 'Jakarta', mic: null, currency: 'IDR', timezone: 'Asia/Jakarta' },
      { provider: 'yahoo', providerSymbol: 'VWCE.DE', name: 'Vanguard FTSE All-World UCITS ETF', instrumentType: 'etf', exchangeCode: 'GER', exchangeName: 'XETRA', mic: null, currency: 'EUR', timezone: 'Europe/Berlin' },
    ])
  })

  it('enriches search results when Yahoo search omits currency and timezone', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v1/finance/search')) return new Response(JSON.stringify({ quotes: [{ symbol: 'BBCA.JK', shortname: 'Bank Central Asia Tbk', quoteType: 'EQUITY', exchange: 'JKT', exchDisp: 'Jakarta' }] }))
      return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: 'BBCA.JK', currency: 'IDR', exchangeName: 'JKT', fullExchangeName: 'Jakarta', exchangeTimezoneName: 'Asia/Jakarta' }, timestamp: [], indicators: { quote: [{ close: [] }] } }], error: null } }))
    })
    const provider = new YahooMarketDataProvider({ fetchImpl })
    await expect(provider.search('BBCA')).resolves.toEqual([
      { provider: 'yahoo', providerSymbol: 'BBCA.JK', name: 'Bank Central Asia Tbk', instrumentType: 'stock', exchangeCode: 'JKT', exchangeName: 'Jakarta', mic: null, currency: 'IDR', timezone: 'Asia/Jakarta' },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('normalizes daily chart data using raw closing prices and drops null or malformed points', async () => {
    const provider = new YahooMarketDataProvider({ fetchImpl: async () => new Response(JSON.stringify(chartPayload)) })
    const result = await provider.dailyChart('7203.T', new Date('2026-07-14T00:00:00Z'), new Date('2026-07-19T00:00:00Z'))

    expect(result.metadata).toEqual({ symbol: '7203.T', currency: 'JPY', exchangeCode: 'JPX', timezone: 'Asia/Tokyo' })
    expect(result.prices).toEqual([
      { date: '2026-07-15', close: 2500.5 },
    ])
  })

  it('rejects malformed payloads and aborts timed-out requests', async () => {
    const malformed = new YahooMarketDataProvider({ fetchImpl: async () => new Response(JSON.stringify({ chart: { result: null, error: null } })) })
    await expect(malformed.dailyChart('BBCA.JK', new Date(), new Date())).rejects.toThrow('Yahoo chart returned no result')

    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const timed = new YahooMarketDataProvider({ fetchImpl: fetchImpl as typeof fetch, timeoutMs: 5 })
    await expect(timed.search('VWCE.DE')).rejects.toThrow('Yahoo request timed out')
  })
})
