import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditHoldingDialog } from './EditHoldingDialog'

describe('EditHoldingDialog', () => {
  const holding = {
    id: 'holding-1',
    symbol: 'BBCA.JK',
    name: 'Bank Central Asia Tbk',
    exchange: 'Jakarta',
    quoteCurrency: 'IDR',
    quantity: 1000,
    averageCost: 6000,
  }

  it('updates quantity and optional average cost', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<EditHoldingDialog open holding={holding} onClose={() => {}} onSubmit={onSubmit} />)

    const quantity = screen.getByLabelText(/^quantity$/i)
    await user.clear(quantity)
    await user.type(quantity, '1250')
    const cost = screen.getByLabelText(/average cost/i)
    await user.clear(cost)
    await user.type(cost, '6100')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ quantity: '1250', averageCost: '6100', averageCostCurrency: 'IDR' }))
  })

  it('does not submit a zero quantity', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<EditHoldingDialog open holding={holding} onClose={() => {}} onSubmit={onSubmit} />)

    const quantity = screen.getByLabelText(/^quantity$/i)
    await user.clear(quantity)
    await user.type(quantity, '0')

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
