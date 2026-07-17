import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddHoldingDialog } from './AddHoldingDialog'

describe('AddHoldingDialog', () => {
  const results = [
    {
      provider: 'yahoo' as const,
      providerSymbol: 'BBCA.JK',
      symbol: 'BBCA',
      name: 'Bank Central Asia Tbk',
      type: 'stock' as const,
      exchange: 'Jakarta',
      exchangeCode: 'JKT',
      quoteCurrency: 'IDR',
      timezone: 'Asia/Jakarta',
    },
    {
      provider: 'yahoo' as const,
      providerSymbol: 'BZG.F',
      symbol: 'BZG',
      name: 'Bank Central Asia Tbk',
      type: 'stock' as const,
      exchange: 'Frankfurt',
      exchangeCode: 'FRA',
      quoteCurrency: 'EUR',
      timezone: 'Europe/Berlin',
    },
  ]

  it('searches listings, requires an exact exchange selection, and submits quantity and optional cost', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn().mockResolvedValue(results)
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(<AddHoldingDialog open onClose={() => {}} onSearch={onSearch} onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/search stocks and etfs/i), 'Bank Central Asia')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('Bank Central Asia'))
    expect(await screen.findByText(/BBCA · Jakarta · IDR/i)).toBeInTheDocument()
    expect(screen.getByText(/BZG · Frankfurt · EUR/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /BBCA · Jakarta · IDR/i }))
    await user.type(screen.getByLabelText(/^quantity$/i), '1000')
    await user.type(screen.getByLabelText(/average cost/i), '6000')
    await user.click(screen.getByRole('button', { name: /add holding/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      candidate: results[0],
      quantity: '1000',
      averageCost: '6000',
      averageCostCurrency: 'IDR',
    }))
  })

  it('shows provider failures and keeps the dialog usable for retry', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn().mockRejectedValue(new Error('Yahoo is temporarily unavailable'))

    render(<AddHoldingDialog open onClose={() => {}} onSearch={onSearch} onSubmit={vi.fn()} />)

    await user.type(screen.getByLabelText(/search stocks and etfs/i), 'BBCA')
    await user.click(screen.getByRole('button', { name: /^search$/i }))

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^search$/i })).toBeEnabled()
  })
})
