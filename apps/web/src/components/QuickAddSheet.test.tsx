import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/lib/api', () => ({
  createTransaction: vi.fn().mockResolvedValue({ data: {} }),
  getAiStatus: vi.fn().mockResolvedValue({ data: { enabled: false } }),
  getCategories: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-groc', name: 'Groceries', slug: 'groceries', type: 'expense', parentId: null, needsReview: false },
      { id: 'c-food', name: 'Eating out', slug: 'eating-out', type: 'expense', parentId: null, needsReview: false },
      { id: 'c-sal', name: 'Salary', slug: 'salary', type: 'income', parentId: null, needsReview: false },
    ],
  }),
  getPeople: vi.fn().mockResolvedValue({ data: [] }),
  getRecentTransactions: vi.fn().mockResolvedValue({
    data: [
      { id: 't1', entryId: 'e1', transactionDate: '2026-10-09T12:00:00Z', type: 'expense', description: 'REWE', notes: null, categoryName: 'Groceries', amount: -42.18, currency: 'EUR', walletName: 'Sparkasse' },
      { id: 't2', entryId: 'e2', transactionDate: '2026-10-08T12:00:00Z', type: 'expense', description: 'rewe', notes: null, categoryName: 'Groceries', amount: -10, currency: 'EUR', walletName: 'Sparkasse' },
    ],
  }),
  getWallets: vi.fn().mockResolvedValue({
    data: [
      { id: 'w-eur', name: 'Sparkasse', walletType: 'bank', assetId: 'a-eur', isActive: true, balance: 100, currency: 'EUR' },
      { id: 'w-idr', name: 'Jago', walletType: 'bank', assetId: 'a-idr', isActive: true, balance: 1000000, currency: 'IDR' },
      { id: 'w-old', name: 'Closed', walletType: 'bank', assetId: 'a-eur', isActive: false, balance: 0, currency: 'EUR' },
    ],
  }),
  parseTransactionText: vi.fn(),
}))

import { createTransaction } from '@/lib/api'
import { QuickAddProvider, useQuickAdd } from '@/contexts/QuickAddContext'
import { QuickAddSheet } from './QuickAddSheet'

function OpenOnMount() {
  const { openQuickAdd, isOpen } = useQuickAdd()
  if (!isOpen) queueMicrotask(openQuickAdd)
  return null
}

function renderSheet() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={qc}>
      <QuickAddProvider>{ui}</QuickAddProvider>
    </QueryClientProvider>
  )
  return render(wrap(<><OpenOnMount /><QuickAddSheet /></>))
}

function setPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: coarse && q.includes('coarse'),
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('QuickAddSheet', () => {
  beforeEach(() => {
    vi.mocked(createTransaction).mockClear()
    localStorage.clear()
  })
  afterEach(() => {
    // @ts-expect-error reset the jsdom default
    delete window.matchMedia
  })

  it('logs an expense from the keypad with a category and the remembered wallet', async () => {
    setPointer(true)
    localStorage.setItem('finance-os-quick-add-wallet', 'w-eur')
    const user = userEvent.setup()
    renderSheet()

    expect(await screen.findByRole('group', { name: 'Keypad' })).toBeInTheDocument()
    for (const key of ['4', '2', 'Decimal point', '1', '8']) {
      await user.click(screen.getByRole('button', { name: key }))
    }
    expect(screen.getByLabelText('Amount')).toHaveTextContent('42.18')

    await user.click(await screen.findByRole('button', { name: 'Groceries' }))
    expect(screen.getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1))
    const body = vi.mocked(createTransaction).mock.calls[0][0]
    expect(body).toMatchObject({
      type: 'expense',
      categoryId: 'c-groc',
      description: 'Groceries',
      entries: [{ walletId: 'w-eur', assetId: 'a-eur', amount: '-42.18' }],
    })
  })

  it('offers distinct recent merchants and refills description and category in one tap', async () => {
    setPointer(true)
    const user = userEvent.setup()
    renderSheet()

    const rewe = await screen.findAllByRole('button', { name: /^rewe$/i })
    expect(rewe).toHaveLength(1) // "REWE" and "rewe" collapse into one chip
    await user.click(rewe[0])
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalled())
    expect(vi.mocked(createTransaction).mock.calls[0][0]).toMatchObject({ description: 'REWE', categoryId: 'c-groc' })
  })

  it('swaps the decimal key for 000 on rupiah wallets and hides inactive wallets', async () => {
    setPointer(true)
    localStorage.setItem('finance-os-quick-add-wallet', 'w-idr')
    const user = userEvent.setup()
    renderSheet()

    await user.click(await screen.findByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '000' }))
    expect(screen.queryByRole('button', { name: 'Decimal point' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toHaveTextContent('35.000')
    expect(screen.queryByRole('option', { name: /Closed/ })).not.toBeInTheDocument()
  })

  it('uses a normal input without the keypad on desktop and rejects an empty amount', async () => {
    setPointer(false)
    const user = userEvent.setup()
    renderSheet()

    const input = await screen.findByRole('textbox', { name: 'Amount' })
    expect(screen.queryByRole('group', { name: 'Keypad' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled()
    await user.type(input, '0')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount greater than zero')

    await user.clear(input)
    await user.type(input, '12,50')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(createTransaction).toHaveBeenCalled())
    expect(vi.mocked(createTransaction).mock.calls[0][0].entries[0].amount).toBe('-12.50')
  })
})
