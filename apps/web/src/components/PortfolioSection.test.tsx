import { render, screen } from '@testing-library/react'
import { PortfolioSection } from './PortfolioSection'

describe('PortfolioSection', () => {
  const portfolio = {
    walletId: 'wallet-1',
    baseCurrency: 'EUR',
    totalBaseValue: 6037.25,
    dailyChangeBase: 75.5,
    dailyChangePercent: 1.27,
    asOf: '2026-07-17T16:00:00.000Z',
    source: 'yahoo',
    status: 'fresh' as const,
    holdings: [
      {
        id: 'holding-bbca',
        quantity: 1000,
        averageCost: 6000,
        averageCostCurrency: 'IDR',
        listing: {
          id: 'listing-bbca',
          symbol: 'BBCA.JK',
          name: 'Bank Central Asia Tbk',
          exchange: 'Jakarta',
          quoteCurrency: 'IDR',
        },
        latestPrice: 6475,
        nativeValue: 6_475_000,
        baseValue: 336.25,
        dailyChangePercent: 4.02,
        priceAsOf: '2026-07-17T09:00:00.000Z',
        priceSource: 'yahoo',
        priceStatus: 'fresh' as const,
      },
      {
        id: 'holding-vwce',
        quantity: 35,
        averageCost: null,
        averageCostCurrency: null,
        listing: {
          id: 'listing-vwce',
          symbol: 'VWCE.DE',
          name: 'Vanguard FTSE All-World UCITS ETF',
          exchange: 'Xetra',
          quoteCurrency: 'EUR',
        },
        latestPrice: 162.8857,
        nativeValue: 5701,
        baseValue: 5701,
        dailyChangePercent: -0.4,
        priceAsOf: '2026-07-17T16:30:00.000Z',
        priceSource: 'yahoo',
        priceStatus: 'fresh' as const,
      },
    ],
    history: [
      { date: '2026-07-16', value: 5961.75 },
      { date: '2026-07-17', value: 6037.25 },
    ],
  }

  it('renders the account total, daily movement, and international holdings', () => {
    render(<PortfolioSection portfolio={portfolio} onAddHolding={() => {}} onRefresh={() => {}} onEditHolding={() => {}} onDeleteHolding={() => {}} refreshing={false} />)

    expect(screen.getByText(/€6,037\.25/)).toBeInTheDocument()
    expect(screen.getByText(/\+€75\.50/)).toBeInTheDocument()
    expect(screen.getByText(/1\.27%/)).toBeInTheDocument()
    expect(screen.getByText('BBCA.JK')).toBeInTheDocument()
    expect(screen.getByText(/Rp6,475,000/)).toBeInTheDocument()
    expect(screen.getByText(/≈ €336\.25/)).toBeInTheDocument()
    expect(screen.getByText('VWCE.DE')).toBeInTheDocument()
    expect(screen.getAllByText(/Yahoo/).length).toBeGreaterThan(0)
  })

  it('makes stale and unavailable prices explicit instead of presenting them as current', () => {
    const stale = {
      ...portfolio,
      status: 'stale' as const,
      holdings: [
        {
          ...portfolio.holdings[0],
          priceStatus: 'error' as const,
          priceError: 'Yahoo request timed out',
        },
      ],
    }
    render(<PortfolioSection portfolio={stale} onAddHolding={() => {}} onRefresh={() => {}} onEditHolding={() => {}} onDeleteHolding={() => {}} refreshing={false} />)

    expect(screen.getByText(/prices may be stale/i)).toBeInTheDocument()
    expect(screen.getByText(/Yahoo request timed out/i)).toBeInTheDocument()
  })

  it('renders a useful empty state', () => {
    render(<PortfolioSection portfolio={{ ...portfolio, totalBaseValue: 0, holdings: [], history: [] }} onAddHolding={() => {}} onRefresh={() => {}} onEditHolding={() => {}} onDeleteHolding={() => {}} refreshing={false} />)

    expect(screen.getByText(/add your first holding/i)).toBeInTheDocument()
  })
})
