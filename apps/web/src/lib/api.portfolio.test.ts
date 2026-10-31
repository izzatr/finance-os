import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPortfolioHolding,
  deletePortfolioHolding,
  getPortfolioHistory,
  getPortfolioSummary,
  refreshPortfolioWallet,
  searchPortfolioInstruments,
  updatePortfolioHolding,
} from './api'

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('portfolio API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('encodes Yahoo search and bounded result count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await searchPortfolioInstruments('Bank Central Asia & Indonesia', 8)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portfolio/search?q=Bank+Central+Asia+%26+Indonesia&limit=8')
  })

  it('requests a wallet summary and bounded history in the selected base currency', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    await getPortfolioSummary('wallet-1', 'EUR')
    await getPortfolioHistory('wallet-1', 'EUR', '2026-01-01', '2026-07-18')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portfolio/summary?walletId=wallet-1&baseCurrency=EUR')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/portfolio/history?walletId=wallet-1&baseCurrency=EUR&from=2026-01-01&to=2026-07-18')
  })

  it('creates, updates, refreshes and deletes holdings with JSON credentials', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ id: 'holding-1' }))
    vi.stubGlobal('fetch', fetchMock)
    await createPortfolioHolding({
      walletId: 'wallet-1', provider: 'yahoo', providerSymbol: 'BBCA.JK',
      quantity: '1000', averageCost: '6000', costCurrency: 'IDR',
    })
    await updatePortfolioHolding('holding-1', { quantity: '1250', averageCost: null, costCurrency: null })
    await refreshPortfolioWallet('wallet-1')
    await deletePortfolioHolding('holding-1')

    expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ['/api/portfolio/holdings', 'POST'],
      ['/api/portfolio/holdings/holding-1', 'PATCH'],
      ['/api/portfolio/wallets/wallet-1/refresh', 'POST'],
      ['/api/portfolio/holdings/holding-1', 'DELETE'],
    ])
  })
})
