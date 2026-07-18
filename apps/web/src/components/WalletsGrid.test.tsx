import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WalletsGrid } from './WalletsGrid'

const formatCurrency = (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`

describe('WalletsGrid', () => {
  it('shows portfolio market value instead of the investment wallet cash balance', () => {
    render(
      <MemoryRouter>
        <WalletsGrid
          formatCurrency={formatCurrency}
          wallets={[{
            id: 'wallet-1',
            name: 'European ETF',
            walletType: 'investment',
            assetId: 'asset-1',
            isActive: true,
            balance: 0,
            currency: 'EUR',
            portfolioValue: { value: 280, currency: 'EUR', asOf: '2026-07-17' },
          }]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('EUR 280.00')).toBeInTheDocument()
    expect(screen.getByText('Market value · EOD')).toBeInTheDocument()
    expect(screen.queryByText('EUR 0.00')).not.toBeInTheDocument()
  })
})
