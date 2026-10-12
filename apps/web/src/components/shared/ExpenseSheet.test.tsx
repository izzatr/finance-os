import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ME, ANA } = vi.hoisted(() => ({ ME: '00000000-0000-4000-8000-0000000000a1', ANA: '00000000-0000-4000-8000-0000000000b2' }))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    getSplitMe: vi.fn().mockResolvedValue({
      data: {
        personId: ME, displayName: 'Alex', booksStart: '1970-01-01T00:00:00.000Z', defaultCurrency: 'EUR', unreadActivity: 0,
        balances: { owedToMe: [], iOwe: [], net: [] },
        categories: [{ slug: 'general', label: 'General', group: 'Uncategorized' }, { slug: 'dining', label: 'Dining out', group: 'Food and drink' }],
      },
    }),
    getSplitFriends: vi.fn().mockResolvedValue({ data: [{ personId: ANA, name: 'Taylor', isGuest: true, email: null, isFriend: true, balances: [] }] }),
    getSplitGroups: vi.fn().mockResolvedValue({ data: [] }),
    getSplitGroup: vi.fn(),
    getWallets: vi.fn().mockResolvedValue({
      data: [
        { id: 'w-eur', name: 'Checking', walletType: 'bank', assetId: 'a-eur', isActive: true, balance: 100, currency: 'EUR' },
        { id: 'w-idr', name: 'Rupiah cash', walletType: 'bank', assetId: 'a-idr', isActive: true, balance: 100, currency: 'IDR' },
        { id: 'w-fr', name: 'Friends · EUR', walletType: 'custom', assetId: 'a-eur', isActive: true, balance: 0, currency: 'EUR', systemRole: 'split' },
      ],
    }),
    getCategories: vi.fn().mockResolvedValue({ data: [{ id: 'c-food', name: 'Eating out', slug: 'eating-out', type: 'expense', parentId: null, needsReview: false }] }),
    getRecentTransactions: vi.fn().mockResolvedValue({ data: [] }),
    createSharedExpense: vi.fn().mockResolvedValue({ data: { id: 'new-id' } }),
    updateSharedExpense: vi.fn(),
  }
})

import { createSharedExpense, getWallets } from '@/lib/api'
import { ExpenseSheet } from './ExpenseSheet'

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onSaved = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ExpenseSheet open mode={{ kind: 'new', friendIds: [ANA] }} onClose={() => {}} onSaved={onSaved} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onSaved }
}

describe('ExpenseSheet', () => {
  beforeEach(() => vi.mocked(createSharedExpense).mockClear())

  it('validates an exact split live and posts the full payload with my books', async () => {
    const user = userEvent.setup()
    renderSheet()

    await user.type(await screen.findByLabelText('Description'), 'Dinner')
    await user.type(screen.getByLabelText('Amount'), '30')
    expect(screen.getByRole('button', { name: /Paid by you/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Split equally\. Change split options/ }))
    await user.click(screen.getByRole('tab', { name: 'Split by exact amounts' }))
    await user.type(screen.getByLabelText('Amount for You'), '10')
    await user.type(screen.getByLabelText('Amount for Taylor'), '15')
    expect(screen.getByTestId('split-summary')).toHaveTextContent('€25.00 of €30.00 · €5.00 left')
    expect(screen.getByRole('alert')).toHaveTextContent('€5.00 still to assign')
    await user.clear(screen.getByLabelText('Amount for Taylor'))
    await user.type(screen.getByLabelText('Amount for Taylor'), '20')
    expect(screen.getByTestId('split-summary')).toHaveTextContent('€30.00 of €30.00 · €0.00 left')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Done' }))

    // Friends wallets are never offered as the paying wallet.
    await user.click(screen.getByLabelText('Paid from a wallet'))
    await user.click(screen.getByRole('combobox', { name: 'Wallet' }))
    expect(await screen.findByRole('option', { name: /Checking/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Friends/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: /Rupiah cash/ }))
    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveTextContent('Rupiah cash')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter what Rupiah cash was charged in IDR')
    await user.type(screen.getByLabelText('Charged to Rupiah cash in IDR'), '520000')
    // Searchable dropdown: type to filter, Enter picks the highlighted option.
    await user.click(screen.getByRole('combobox', { name: 'My category' }))
    expect(await screen.findByRole('option', { name: 'Automatic · Uncategorized' })).toBeInTheDocument()
    expect(screen.getByText('Only changes how your share shows up in your own reports.')).toBeInTheDocument()
    await user.type(await screen.findByRole('textbox', { name: 'Search options' }), 'eat')
    expect(screen.queryByRole('option', { name: 'Automatic' })).not.toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('combobox', { name: 'My category' })).toHaveTextContent('Eating out')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(createSharedExpense).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createSharedExpense).mock.calls[0][0]).toEqual({
      groupId: null,
      kind: 'expense',
      description: 'Dinner',
      cost: '30',
      currency: 'EUR',
      date: expect.stringMatching(/T12:00:00.000Z$/),
      category: 'general',
      notes: null,
      paid: { kind: 'single', personId: ME },
      split: { method: 'exact', amounts: { [ME]: '10', [ANA]: '20' } },
      repeatInterval: 'never',
      myBooks: { fundingWalletId: 'w-idr', fundingAmount: '520000', linkedTransactionId: null, categoryId: 'c-food' },
    })
  })

  it('records a chosen currency without owning any wallets', async () => {
    vi.mocked(getWallets).mockResolvedValueOnce({ data: [] })
    const user = userEvent.setup()
    renderSheet()
    await user.type(await screen.findByLabelText('Description'), 'Lunch')
    await user.type(screen.getByLabelText('Amount'), '20.25')
    await user.click(screen.getByRole('combobox', { name: 'Currency' }))
    await user.type(screen.getByRole('textbox', { name: 'Search options' }), 'USD')
    await user.click(screen.getByRole('option', { name: /USD/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createSharedExpense).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD', cost: '20.25', myBooks: { fundingWalletId: null, fundingAmount: null, linkedTransactionId: null, categoryId: null } })))
  })

  it('requires a new explicit funding amount after changing the expense currency', async () => {
    const user = userEvent.setup()
    renderSheet()
    await user.type(await screen.findByLabelText('Description'), 'Lunch')
    await user.type(screen.getByLabelText('Amount'), '20')
    await user.click(screen.getByLabelText('Paid from a wallet'))
    await user.click(screen.getByRole('combobox', { name: 'Wallet' }))
    await user.click(await screen.findByRole('option', { name: /Rupiah cash/ }))
    await user.type(screen.getByLabelText('Charged to Rupiah cash in IDR'), '400000')
    await user.click(screen.getByRole('combobox', { name: 'Currency' }))
    await user.type(screen.getByRole('textbox', { name: 'Search options' }), 'USD')
    await user.click(screen.getByRole('option', { name: /USD/ }))
    expect(screen.getByLabelText('Charged to Rupiah cash in IDR')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter what Rupiah cash was charged in IDR')
    expect(createSharedExpense).not.toHaveBeenCalled()
  })

  it('sends an equal split without the people you untick', async () => {
    const user = userEvent.setup()
    renderSheet()
    await user.type(await screen.findByLabelText('Description'), 'Taxi')
    await user.type(screen.getByLabelText('Amount'), '12')
    await user.click(screen.getByRole('button', { name: /Change split options/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Include You' }))
    expect(screen.getByTestId('split-summary')).toHaveTextContent('€12.00/person · 1 person')
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(createSharedExpense).toHaveBeenCalled())
    expect(vi.mocked(createSharedExpense).mock.calls[0][0]).toMatchObject({
      split: { method: 'equal', personIds: [ANA] },
      myBooks: { fundingWalletId: null, linkedTransactionId: null, categoryId: null },
    })
  })
})
