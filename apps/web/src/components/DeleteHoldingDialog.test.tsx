import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeleteHoldingDialog } from './DeleteHoldingDialog'

describe('DeleteHoldingDialog', () => {
  it('requires explicit confirmation and surfaces deletion failures', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockRejectedValue(new Error('Holding could not be deleted'))
    render(<DeleteHoldingDialog open symbol="BBCA.JK" onClose={() => {}} onConfirm={onConfirm} />)

    expect(screen.getByText(/BBCA\.JK/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /remove holding/i }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/could not be deleted/i)).toBeInTheDocument()
  })
})
