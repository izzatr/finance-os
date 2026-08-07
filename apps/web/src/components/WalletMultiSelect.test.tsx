import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { WalletMultiSelect } from './WalletMultiSelect'

const wallets = [
  { id: 'wallet-1', name: 'Checking', currency: 'EUR' },
  { id: 'wallet-2', name: 'Savings', currency: 'EUR' },
]

function Harness() {
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([])
  return <WalletMultiSelect wallets={wallets} selectedWalletIds={selectedWalletIds} onChange={setSelectedWalletIds} />
}

describe('WalletMultiSelect', () => {
  it('supports selecting more than one wallet and clearing the filter', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: /all wallets/i }))
    await user.click(screen.getByRole('checkbox', { name: /checking/i }))
    await user.click(screen.getByRole('checkbox', { name: /savings/i }))
    expect(screen.getByRole('button', { name: /2 wallets selected/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /clear wallet filter/i }))
    expect(screen.getByRole('button', { name: /all wallets/i })).toBeInTheDocument()
  })
})
