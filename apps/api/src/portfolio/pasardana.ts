import type { DailyChartResult, MarketDataProvider, MarketSearchResult } from './yahoo'

// Indonesian mutual funds (reksadana) are not on Yahoo. Pasardana publishes the daily NAV of
// every OJK-registered fund in one public JSON list, keyed here by the fund's ISIN
// (IDN + 9 digits). Holdings use the ISIN as their provider symbol.
export const INDONESIAN_FUND_ISIN = /^IDN\d{9}$/

const DEFAULT_PASARDANA_URL = 'https://pasardana.id/api/FundSearchResult/GetAll'
const DEFAULT_SNAPSHOT_URL = 'https://pasardana.id/api/FundService/GetSnapshot'
const CACHE_TTL_MS = 60 * 60 * 1000
const CURRENCY_BY_CODE: Record<number, string> = { 0: 'IDR', 1: 'USD' }

type PasardanaFund = {
  Id?: unknown
  Name?: unknown
  IsinCode?: unknown
  Currency?: unknown
  NetAssetValue?: unknown
  LastUpdate?: unknown
  InvestmentManagerName?: unknown
}

export type IndonesianFund = {
  id: number | null
  isin: string
  name: string
  currency: string
  nav: number | null
  navDate: string | null
}

type PasardanaOptions = { fetchImpl?: typeof fetch; timeoutMs?: number; url?: string; snapshotUrl?: string; now?: () => number }

let sharedCache: { expiresAt: number; promise: Promise<IndonesianFund[]> } | null = null

export function clearPasardanaCache() {
  sharedCache = null
}

function normalizeFund(raw: PasardanaFund): IndonesianFund | null {
  if (typeof raw.IsinCode !== 'string' || !INDONESIAN_FUND_ISIN.test(raw.IsinCode.trim())) return null
  if (typeof raw.Name !== 'string' || !raw.Name.trim()) return null
  const currency = CURRENCY_BY_CODE[typeof raw.Currency === 'number' ? raw.Currency : 0]
  if (!currency) return null
  const nav = typeof raw.NetAssetValue === 'number' && Number.isFinite(raw.NetAssetValue) && raw.NetAssetValue > 0 ? raw.NetAssetValue : null
  const navDate = typeof raw.LastUpdate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw.LastUpdate) ? raw.LastUpdate.slice(0, 10) : null
  return { id: typeof raw.Id === 'number' && raw.Id > 0 ? raw.Id : null, isin: raw.IsinCode.trim(), name: raw.Name.trim(), currency, nav, navDate }
}

export class PasardanaFundProvider implements MarketDataProvider {
  readonly name = 'pasardana'
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly url: string
  private readonly snapshotUrl: string
  private readonly now: () => number

  constructor(options: PasardanaOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.url = options.url ?? process.env.PASARDANA_FUNDS_URL ?? DEFAULT_PASARDANA_URL
    this.snapshotUrl = options.snapshotUrl ?? DEFAULT_SNAPSHOT_URL
    this.now = options.now ?? Date.now
  }

  async funds(): Promise<IndonesianFund[]> {
    const now = this.now()
    if (sharedCache && sharedCache.expiresAt > now) return sharedCache.promise
    const promise = this.load().catch((error) => { sharedCache = null; throw error })
    sharedCache = { expiresAt: now + CACHE_TTL_MS, promise }
    return promise
  }

  async search(query: string, limit = 10): Promise<MarketSearchResult[]> {
    const needle = query.trim().toLowerCase()
    if (needle.length < 3) return []
    const terms = needle.split(/\s+/)
    const boundedLimit = Math.max(1, Math.min(25, Math.trunc(limit)))
    return (await this.funds())
      .filter((fund) => fund.isin.toLowerCase() === needle || terms.every((term) => fund.name.toLowerCase().includes(term)))
      .slice(0, boundedLimit)
      .map((fund) => ({
        provider: 'yahoo' as const,
        providerSymbol: fund.isin,
        name: fund.name,
        instrumentType: 'mutual_fund' as const,
        exchangeCode: 'IDFUND',
        exchangeName: 'Indonesian mutual funds',
        mic: null,
        currency: fund.currency,
        timezone: 'Asia/Jakarta',
      }))
  }

  /**
   * Daily NAVs between from (inclusive) and to (exclusive). The per-fund snapshot carries about a
   * year of history; when it is unavailable the latest NAV from the fund list is used instead.
   */
  async dailyChart(symbol: string, from: Date, to: Date): Promise<DailyChartResult> {
    const isin = symbol.trim().toUpperCase()
    const fund = (await this.funds()).find((item) => item.isin === isin)
    if (!fund) throw new Error('Pasardana fund was not found')
    const fromDay = from.toISOString().slice(0, 10)
    const toDay = to.toISOString().slice(0, 10)
    let prices: Array<{ date: string; close: number }> = []
    if (fund.id !== null) {
      try {
        const snapshot = await this.requestJson(`${this.snapshotUrl}?fundId=${fund.id}&username=anonymous`) as { NetAssetValues?: unknown }
        const navs = Array.isArray(snapshot.NetAssetValues) ? snapshot.NetAssetValues : []
        for (const raw of navs) {
          const point = raw as { Date?: unknown; Value?: unknown }
          if (typeof point.Date !== 'string' || typeof point.Value !== 'number' || !Number.isFinite(point.Value) || point.Value <= 0) continue
          const date = point.Date.slice(0, 10)
          if (date >= fromDay && date < toDay) prices.push({ date, close: point.Value })
        }
      } catch {
        prices = []
      }
    }
    if (prices.length === 0 && fund.nav && fund.navDate && fund.navDate >= fromDay && fund.navDate < toDay) {
      prices = [{ date: fund.navDate, close: fund.nav }]
    }
    return {
      metadata: { symbol: fund.isin, currency: fund.currency, exchangeCode: 'IDFUND', timezone: 'Asia/Jakarta' },
      prices: prices.sort((a, b) => a.date.localeCompare(b.date)),
    }
  }

  private async load(): Promise<IndonesianFund[]> {
    const payload = await this.requestJson(this.url)
    if (!Array.isArray(payload)) throw new Error('Pasardana returned a malformed fund list')
    return payload.map((raw) => normalizeFund(raw as PasardanaFund)).filter((fund): fund is IndonesianFund => fund !== null)
  }

  private async requestJson(url: string): Promise<unknown> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, this.timeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FinanceOS/0.1)' },
      })
      if (!response.ok) throw new Error(`Pasardana request failed with HTTP ${response.status}`)
      // The endpoint prefixes its JSON with a UTF-8 BOM.
      return JSON.parse((await response.text()).replace(/^\uFEFF/, '')) as unknown
    } catch (error) {
      if (timedOut) throw new Error('Pasardana request timed out')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
