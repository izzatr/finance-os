import { INDONESIAN_FUND_ISIN, PasardanaFundProvider } from './pasardana'
import { YahooMarketDataProvider, type DailyChartResult, type MarketDataProvider, type MarketSearchResult } from './yahoo'

/**
 * The market-data entry point for holdings. Listings are stored under the `yahoo` provider
 * mapping (existing rows depend on it); symbols that are Indonesian fund ISINs are priced from
 * Pasardana's daily NAV instead, everything else from Yahoo. Search merges both sources, and a
 * failure in the fund source never hides Yahoo results.
 */
export class MarketDataRouter implements MarketDataProvider {
  readonly name = 'yahoo'

  constructor(
    private readonly yahoo: MarketDataProvider = new YahooMarketDataProvider(),
    private readonly funds: MarketDataProvider = new PasardanaFundProvider(),
  ) {}

  async search(query: string, limit = 10): Promise<MarketSearchResult[]> {
    const [yahoo, funds] = await Promise.allSettled([this.yahoo.search(query, limit), this.funds.search(query, limit)])
    if (yahoo.status === 'rejected' && funds.status === 'rejected') throw yahoo.reason
    const results = [
      ...(yahoo.status === 'fulfilled' ? yahoo.value : []),
      ...(funds.status === 'fulfilled' ? funds.value : []),
    ]
    return results.slice(0, Math.max(1, Math.min(25, Math.trunc(limit))))
  }

  dailyChart(symbol: string, from: Date, to: Date): Promise<DailyChartResult> {
    return INDONESIAN_FUND_ISIN.test(symbol.trim().toUpperCase())
      ? this.funds.dailyChart(symbol, from, to)
      : this.yahoo.dailyChart(symbol, from, to)
  }
}

export function createMarketDataProvider(): MarketDataProvider {
  return new MarketDataRouter()
}
