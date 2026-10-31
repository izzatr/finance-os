import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api', () => ({
  getWallets: vi.fn().mockResolvedValue({ data: [] }),
  patchSplitMe: vi.fn(),
  adoptFriendsWallet: vi.fn(),
  isFriendsWallet: (w: { systemRole?: string | null }) => w.systemRole === 'split',
}))

import { patchSplitMe } from '@/lib/api'
import { SharedSettingsSheet } from './SharedDialogs'
import { currencyDropdown } from './ExpenseSheet'

const me = { personId: 'p', displayName: 'Me', booksStart: '1970-01-01T00:00:00.000Z', defaultCurrency: 'NOK', unreadActivity: 0, balances: { owedToMe: [], iOwe: [], net: [] }, categories: [] }

describe('Shared settings and the account default', () => {
  it('shows the account default read-only with a link instead of a second, separate control', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><SharedSettingsSheet open onClose={() => {}} me={me} /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Default currency')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Default currency' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Change in Currencies' })).toHaveAttribute('href', '/currencies')
    expect(screen.getByText(/NOK/)).toBeInTheDocument()
    expect(patchSplitMe).not.toHaveBeenCalled()
  })
})

describe('shared expense / edit / settlement currency options', () => {
  it('put the account default and preferred currencies first and keep the rest', () => {
    const options = currencyDropdown(['NOK', 'GBP', 'SGD'])
    expect(options.slice(0, 3).map((o) => o.value)).toEqual(['NOK', 'GBP', 'SGD'])
    expect(options.slice(0, 3).every((o) => o.group === 'Your currencies')).toBe(true)
    expect(options.length).toBeGreaterThan(100)
    expect(options.find((o) => o.value === 'EUR')?.group).toBe('All currencies')
  })
})
