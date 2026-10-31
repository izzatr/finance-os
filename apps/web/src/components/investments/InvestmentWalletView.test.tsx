import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InvestmentWalletView } from './InvestmentWalletView'
import { sliceTrend } from './ValueChart'

const summary = {
  baseCurrency: 'USD', totalBaseValue: 12_500, totalCostBase: 10_000, totalUnrealizedBase: 2_500, totalUnrealizedPercent: 25,
  dailyChangeBase: -10, dailyChangePercent: -0.08, nativeTotals: {}, asOf: '2026-10-31T10:00:00Z', source: 'yahoo', status: 'fresh',
  holdings: [
    fund('h1', 'l1', 'VTI', 'Vanguard Total Stock Market ETF', '10', 300, 3_000, 2_500, 'etf'),
    fund('h2', 'l2', 'US0000000001', 'Example Treasury Fund', '9500', 1, 9_500, 7_500, 'mutual_fund'),
  ],
}

function fund(id: string, listingId: string, symbol: string, name: string, quantity: string, price: number, baseValue: number, cost: number, type: string) {
  return {
    id, walletId: 'w1', walletName: 'Funds', quantity, averageCost: String(cost / Number(quantity)), costCurrency: 'USD',
    listing: { id: listingId, symbol, provider: 'yahoo', providerSymbol: symbol, currency: 'USD', exchangeCode: 'NYQ', exchangeName: 'NYSE', timezone: 'America/New_York', instrumentName: name, instrumentType: type, lastRefreshAt: null, lastSuccessAt: null, refreshError: null },
    price, previousClose: price, priceDate: '2026-10-30', nativeCurrency: 'USD', nativeValue: baseValue, baseValue, previousBaseValue: baseValue,
    dailyChangePercent: 0, costBaseValue: cost, unrealizedBase: baseValue - cost, unrealizedPercent: ((baseValue - cost) / cost) * 100, priceStatus: 'fresh',
  }
}

function json(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function renderView() {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/api/portfolio/summary')) return json(summary)
    if (url.includes('/api/portfolio/history')) return json({ baseCurrency: 'USD', points: [{ date: '2026-10-31', nativeTotals: {}, baseValue: 12_500 }] })
    if (url.includes('/prices')) return json({ listingId: 'l2', currency: 'USD', points: [{ date: '2026-09-01', close: 0.96, currency: 'USD' }, { date: '2026-10-30', close: 1, currency: 'USD' }] })
    return json(null)
  }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InvestmentWalletView
        wallet={{ id: 'w1', name: 'Brokerage', currency: 'USD', balance: 0, subtitle: 'Investments' }}
        ledgerTrend={[{ date: '2026-01-10T12:00:00Z', balance: 9_000 }, { date: '2026-10-31T12:00:00Z', balance: 0 }]}
        icon={null}
        actions={null}
      />
    </QueryClientProvider>,
  )
}

describe('InvestmentWalletView', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('leads with total value and all-time return, then compact holdings rows', async () => {
    renderView()
    expect(await screen.findByLabelText('Value $12,500.00')).toBeInTheDocument()
    expect(screen.getByText(/▲ \$2,500\.00 · 25\.00%/)).toBeInTheDocument()
    expect(screen.getByText('Invested')).toBeInTheDocument()
    const rows = within(screen.getByRole('list')).getAllByRole('button')
    expect(rows[0]).toHaveAccessibleName(/Example Treasury Fund, \$9,500\.00/)
    expect(within(rows[0]).getByText('9,500 units')).toBeInTheDocument()
    expect(within(rows[0]).getByText(/▲ 26\.67%/)).toBeInTheDocument()
    expect(within(rows[1]).getByText('10 shares')).toBeInTheDocument()
    expect(screen.queryByText(/US0000000001/)).not.toBeInTheDocument()
  })

  it('opens a holding sheet with its price chart and position facts', async () => {
    renderView()
    fireEvent.click(await screen.findByRole('button', { name: /Example Treasury Fund/ }))
    expect(await screen.findByText('Average cost')).toBeInTheDocument()
    expect(screen.getByText('Total return')).toBeInTheDocument()
    expect(await screen.findByText(/\+4\.17% 6M/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument()
  })
})

describe('sliceTrend', () => {
  it('carries the value in from before the range and extends to today', () => {
    const points = [{ date: '2026-01-01', balance: 10 }, { date: '2026-06-01', balance: 20 }, { date: '2026-10-01', balance: 30 }]
    expect(sliceTrend(points, new Date('2026-05-01T12:00:00Z'), '2026-10-31')).toEqual([
      { date: '2026-05-01', balance: 10 },
      { date: '2026-06-01', balance: 20 },
      { date: '2026-10-01', balance: 30 },
      { date: '2026-10-31', balance: 30 },
    ])
  })
})
