export type InstrumentType = 'stock' | 'etf'

export interface MarketSearchResult {
  provider: 'yahoo'
  providerSymbol: string
  name: string
  instrumentType: InstrumentType
  exchangeCode: string
  exchangeName: string
  mic: string | null
  currency: string
  timezone: string | null
}

export interface DailyChartResult {
  metadata: { symbol: string; currency: string; exchangeCode: string; timezone: string }
  prices: Array<{ date: string; close: number }>
}

export interface MarketDataProvider {
  readonly name: string
  search(query: string, limit?: number): Promise<MarketSearchResult[]>
  dailyChart(symbol: string, from: Date, to: Date): Promise<DailyChartResult>
}

type YahooOptions = { fetchImpl?: typeof fetch; timeoutMs?: number; baseUrl?: string }

const DEFAULT_YAHOO_BASE_URL = 'https://query1.finance.yahoo.com'

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly name = 'yahoo'
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly baseUrl: string

  constructor(options: YahooOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.baseUrl = (options.baseUrl ?? process.env.YAHOO_FINANCE_BASE_URL ?? DEFAULT_YAHOO_BASE_URL).replace(/\/+$/, '')
  }

  async search(query: string, limit = 10): Promise<MarketSearchResult[]> {
    const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)))
    const params = new URLSearchParams({ q: query.trim(), quotesCount: String(boundedLimit), newsCount: '0', enableFuzzyQuery: 'false' })
    const payload = await this.requestJson(`${this.baseUrl}/v1/finance/search?${params}`) as { quotes?: unknown[] }
    const output: MarketSearchResult[] = []
    for (const raw of payload.quotes ?? []) {
      const q = raw as Record<string, unknown>
      if (typeof q.symbol !== 'string' || (q.quoteType !== 'EQUITY' && q.quoteType !== 'ETF')) continue
      const name = typeof q.longname === 'string' ? q.longname : typeof q.shortname === 'string' ? q.shortname : q.symbol
      output.push({
        provider: 'yahoo',
        providerSymbol: q.symbol,
        name,
        instrumentType: q.quoteType === 'ETF' ? 'etf' : 'stock',
        exchangeCode: typeof q.exchange === 'string' ? q.exchange : 'UNKNOWN',
        exchangeName: typeof q.exchDisp === 'string' ? q.exchDisp : typeof q.exchange === 'string' ? q.exchange : 'Unknown',
        // Yahoo does not return an ISO 10383 MIC in search results.
        mic: null,
        currency: typeof q.currency === 'string' ? q.currency : '',
        timezone: typeof q.exchangeTimezoneName === 'string' ? q.exchangeTimezoneName : null,
      })
    }
    const needsMetadata = output.filter((item) => !item.currency || !item.timezone)
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(5, needsMetadata.length) }, async () => {
      while (cursor < needsMetadata.length) {
        const item = needsMetadata[cursor++]
        try {
          const to = new Date()
          const from = new Date(to.getTime() - 7 * 86_400_000)
          const chart = await this.dailyChart(item.providerSymbol, from, to)
          item.currency = chart.metadata.currency
          item.timezone = chart.metadata.timezone
          item.exchangeCode = chart.metadata.exchangeCode === 'UNKNOWN' ? item.exchangeCode : chart.metadata.exchangeCode
        } catch {
          // One unavailable symbol must not make the complete Yahoo search fail.
        }
      }
    }))
    return output.filter((item) => item.currency && item.timezone)
  }

  /** Resolve an exact Yahoo symbol to provider-authoritative listing metadata. */
  async resolveSymbol(symbol: string): Promise<MarketSearchResult> {
    const normalized = symbol.trim().toUpperCase()
    const exact = (await this.search(normalized, 25))
      .find((item) => item.providerSymbol.toUpperCase() === normalized)
    if (!exact) throw new Error('Yahoo symbol was not found')
    return exact
  }

  async dailyChart(symbol: string, from: Date, to: Date): Promise<DailyChartResult> {
    const encodedSymbol = encodeURIComponent(symbol.trim())
    const params = new URLSearchParams({
      period1: String(Math.floor(from.getTime() / 1000)),
      period2: String(Math.floor(to.getTime() / 1000)),
      interval: '1d',
      events: 'history',
    })
    const payload = await this.requestJson(`${this.baseUrl}/v8/finance/chart/${encodedSymbol}?${params}`) as Record<string, any>
    const result = payload.chart?.result?.[0]
    if (!result || !Array.isArray(result.timestamp)) throw new Error('Yahoo chart returned no result')
    const meta = result.meta ?? {}
    const rawClose = result.indicators?.quote?.[0]?.close
    const closes: unknown[] = Array.isArray(rawClose) ? rawClose : []
    const prices: Array<{ date: string; close: number }> = []
    result.timestamp.forEach((timestamp: unknown, index: number) => {
      const close = closes[index]
      if (typeof timestamp !== 'number' || typeof close !== 'number' || !Number.isFinite(close) || close <= 0) return
      prices.push({ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close })
    })
    return {
      metadata: {
        symbol: typeof meta.symbol === 'string' ? meta.symbol : symbol,
        currency: typeof meta.currency === 'string' ? meta.currency : '',
        exchangeCode: typeof meta.exchangeName === 'string' ? meta.exchangeName : 'UNKNOWN',
        timezone: typeof meta.exchangeTimezoneName === 'string' ? meta.exchangeTimezoneName : typeof meta.timezone === 'string' ? meta.timezone : 'UTC',
      },
      prices,
    }
  }

  private async requestJson(url: string): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'FinanceOS/0.1 (+https://github.com/finance-os)', Accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`Yahoo request failed with status ${response.status}`)
      return await response.json()
    } catch (error) {
      if (timedOut) throw new Error('Yahoo request timed out', { cause: error })
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
