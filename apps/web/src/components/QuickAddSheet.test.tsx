import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'

vi.mock('@/lib/api', () => ({
  createTransaction: vi.fn().mockResolvedValue({ data: {} }),
  getAssets: vi.fn().mockResolvedValue({ data: [
    { id: 'a-eur', code: 'EUR', name: 'Euro', type: 'currency', precision: 2 },
    { id: 'a-usd', code: 'USD', name: 'US Dollar', type: 'currency', precision: 2 },
    { id: 'a-idr', code: 'IDR', name: 'Indonesian Rupiah', type: 'currency', precision: 2 },
    { id: 'a-jpy', code: 'JPY', name: 'Japanese Yen', type: 'currency', precision: 0 },
  ] }),
  createWallet: vi.fn().mockResolvedValue({ data: { id: 'w-new', name: 'Cash', assetId: 'a-usd', currency: 'USD', isActive: true } }),
  ensureCurrencyAsset: vi.fn().mockResolvedValue({ data: { id: 'a-nok', code: 'NOK', precision: 2 } }),
  getAiStatus: vi.fn().mockResolvedValue({ data: { enabled: false } }),
  getCategories: vi.fn().mockResolvedValue({
    data: [
      { id: 'c-groc', name: 'Groceries', slug: 'groceries', type: 'expense', parentId: null, needsReview: false },
      { id: 'c-food', name: 'Eating out', slug: 'eating-out', type: 'expense', parentId: null, needsReview: false },
      { id: 'c-sal', name: 'Salary', slug: 'salary', type: 'income', parentId: null, needsReview: false },
    ],
  }),
  getSplitFriends: vi.fn().mockResolvedValue({
    data: [
      { personId: 'p-ana', name: 'Taylor', isGuest: true, email: null, isFriend: true, balances: [] },
      { personId: 'p-bo', name: 'Bo', isGuest: false, email: null, isFriend: true, balances: [] },
    ],
  }),
  getSplitMe: vi.fn().mockResolvedValue({ data: { personId: 'p-me', displayName: 'Me', defaultCurrency: 'EUR', unreadActivity: 0, balances: { owedToMe: [], iOwe: [], net: [] }, categories: [] } }),
  createSharedExpense: vi.fn().mockResolvedValue({ data: { id: 'x' } }),
  pickableWallets: (ws: Array<{ isActive: boolean; systemRole?: string | null }>) => ws.filter((w) => w.isActive && !w.systemRole),
  getRecentTransactions: vi.fn().mockResolvedValue({
    data: [
      { id: 't1', entryId: 'e1', transactionDate: '2026-10-09T12:00:00Z', type: 'expense', description: 'Market', notes: null, categoryName: 'Groceries', amount: -42.18, currency: 'EUR', walletName: 'Checking' },
      { id: 't2', entryId: 'e2', transactionDate: '2026-10-08T12:00:00Z', type: 'expense', description: 'market', notes: null, categoryName: 'Groceries', amount: -10, currency: 'EUR', walletName: 'Checking' },
    ],
  }),
  getWallets: vi.fn().mockResolvedValue({
    data: [
      { id: 'w-eur', name: 'Checking', walletType: 'bank', assetId: 'a-eur', isActive: true, balance: 100, currency: 'EUR' },
      { id: 'w-idr', name: 'Rupiah cash', walletType: 'bank', assetId: 'a-idr', isActive: true, balance: 1000000, currency: 'IDR' },
      { id: 'w-old', name: 'Closed', walletType: 'bank', assetId: 'a-eur', isActive: false, balance: 0, currency: 'EUR' },
      { id: 'w-fr', name: 'Friends · EUR', walletType: 'custom', assetId: 'a-eur', isActive: true, balance: 0, currency: 'EUR', systemRole: 'split' },
    ],
  }),
  parseTransactionText: vi.fn(),
}))

import { createSharedExpense, createTransaction, createWallet, ensureCurrencyAsset, getWallets } from '@/lib/api'
import { QuickAddProvider, useQuickAdd } from '@/contexts/QuickAddContext'
import { QuickAddSheet } from './QuickAddSheet'
import { CurrencyTestProvider } from '@/test/CurrencyTestProvider'

function OpenOnMount() {
  const { openQuickAdd, isOpen } = useQuickAdd()
  if (!isOpen) queueMicrotask(openQuickAdd)
  return null
}

function renderSheet(currency: Partial<ComponentProps<typeof CurrencyTestProvider>> = {}, sheet: ComponentProps<typeof QuickAddSheet> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={qc}>
      <CurrencyTestProvider {...currency}><QuickAddProvider>{ui}</QuickAddProvider></CurrencyTestProvider>
    </QueryClientProvider>
  )
  return { ...render(wrap(<><OpenOnMount /><QuickAddSheet {...sheet} /></>)), qc }
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
    vi.mocked(createSharedExpense).mockClear()
    vi.mocked(createWallet).mockClear()
    vi.mocked(ensureCurrencyAsset).mockClear()
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

  it('defaults to the wallet whose page is open over the remembered one', async () => {
    setPointer(true)
    localStorage.setItem('finance-os-quick-add-wallet', 'w-eur')
    const user = userEvent.setup()
    renderSheet({}, { pageWalletId: 'w-idr' })

    await user.click(await screen.findByRole('button', { name: '5' }))
    await waitFor(() => expect(screen.getAllByText('Rupiah cash').length).toBeGreaterThan(0))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createTransaction).mock.calls[0][0]).toMatchObject({
      type: 'expense',
      entries: [{ walletId: 'w-idr', assetId: 'a-idr', amount: '-5' }],
    })
  })

  it('offers distinct recent merchants and refills description and category in one tap', async () => {
    setPointer(true)
    const user = userEvent.setup()
    renderSheet()

    const market = await screen.findAllByRole('button', { name: /^market$/i })
    expect(market).toHaveLength(1) // "Market" and "market" collapse into one chip
    await user.click(market[0])
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(createTransaction).toHaveBeenCalled())
    expect(vi.mocked(createTransaction).mock.calls[0][0]).toMatchObject({ description: 'Market', categoryId: 'c-groc' })
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
    await user.click(screen.getByRole('combobox', { name: 'Wallet' }))
    expect(await screen.findByRole('option', { name: /Checking/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Closed/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Friends/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: /Checking/ }))
    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveTextContent('Checking')
  })

  it('splitting with friends saves a shared expense paid by me from the wallet, split equally', async () => {
    setPointer(true)
    localStorage.setItem('finance-os-quick-add-wallet', 'w-eur')
    const user = userEvent.setup()
    renderSheet()

    for (const key of ['3', '0']) await user.click(await screen.findByRole('button', { name: key }))
    await user.click(await screen.findByRole('button', { name: 'Groceries' }))
    await user.click(screen.getByRole('button', { name: /Split with someone/ }))
    await user.click(screen.getByRole('button', { name: 'Save shared expense' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick who you split with')

    await user.click(await screen.findByRole('button', { name: 'Taylor' }))
    await user.click(screen.getByRole('button', { name: 'Bo' }))
    await user.click(screen.getByRole('button', { name: 'Save shared expense' }))

    await waitFor(() => expect(createSharedExpense).toHaveBeenCalledTimes(1))
    expect(createTransaction).not.toHaveBeenCalled()
    expect(vi.mocked(createSharedExpense).mock.calls[0][0]).toEqual({
      kind: 'expense',
      description: 'Groceries',
      cost: '30',
      currency: 'EUR',
      date: expect.stringMatching(/T12:00:00.000Z$/),
      category: 'general',
      paid: { kind: 'single', personId: 'p-me' },
      split: { method: 'equal', personIds: ['p-me', 'p-ana', 'p-bo'] },
      myBooks: { fundingWalletId: 'w-eur', categoryId: 'c-groc' },
    })
  })

  it('selects a currency with no compatible wallet and creates one without converting the amount', async () => {
    setPointer(false)
    const user = userEvent.setup()
    const { qc } = renderSheet()
    await user.type(await screen.findByRole('textbox', { name: 'Amount' }), '12.50')
    await user.click(await screen.findByRole('combobox', { name: 'Currency' }))
    await user.click(await screen.findByRole('option', { name: /USD/ }))
    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveTextContent('No wallet')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('12.50')
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: 'Wallet name' }), 'Cash')
    await user.click(screen.getByRole('button', { name: 'Create USD wallet' }))
    await waitFor(() => expect(createWallet).toHaveBeenCalledWith({ name: 'Cash', walletType: 'cash', assetId: 'a-usd', isActive: true }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled())
    qc.setQueryData(['wallets'], { data: [{ id: 'w-new', name: 'Cash', assetId: 'a-usd', currency: 'USD', isActive: true }] })
    await user.click(screen.getByRole('combobox', { name: 'Wallet' }))
    expect(await screen.findAllByRole('option', { name: /Cash/ })).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: /Cash/ }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))
    await waitFor(() => expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ entries: [{ walletId: 'w-new', assetId: 'a-usd', amount: '-12.50' }] })))
  })

  it('switches to a compatible wallet with explicit feedback and leaves the amount unchanged', async () => {
    setPointer(false)
    const user = userEvent.setup()
    renderSheet()
    await user.type(await screen.findByRole('textbox', { name: 'Amount' }), '20')
    await user.click(await screen.findByRole('combobox', { name: 'Currency' }))
    await user.click(await screen.findByRole('option', { name: /IDR/ }))
    expect(screen.getByRole('combobox', { name: 'Wallet' })).toHaveTextContent('Rupiah cash')
    expect(screen.getByRole('status')).toHaveTextContent('Using Rupiah cash in IDR. Amount unchanged; no currency conversion.')
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('20')
  })

  it('starts in the account default currency with no wallets and creates a wallet only on request', async () => {
    vi.mocked(getWallets).mockResolvedValueOnce({ data: [] })
    setPointer(false)
    const user = userEvent.setup()
    renderSheet({ defaultCurrency: 'NOK' })
    const currency = await screen.findByRole('combobox', { name: 'Currency' })
    expect(currency).toHaveTextContent('NOK')
    expect(createWallet).not.toHaveBeenCalled()
    // NOK has no asset row yet: it is created on first use, then the wallet is opened.
    await user.type(await screen.findByRole('textbox', { name: 'Wallet name' }), 'Cash')
    await user.click(screen.getByRole('button', { name: 'Create NOK wallet' }))
    await waitFor(() => expect(ensureCurrencyAsset).toHaveBeenCalledWith('NOK'))
    await waitFor(() => expect(createWallet).toHaveBeenCalledWith({ name: 'Cash', walletType: 'cash', assetId: 'a-nok', isActive: true }))
  })

  it('lists the default and preferred currencies first, then everything else, still searchable', async () => {
    setPointer(false)
    const user = userEvent.setup()
    renderSheet({ defaultCurrency: 'GBP', preferredCurrencies: ['SGD', 'NOK'] })
    await user.click(await screen.findByRole('combobox', { name: 'Currency' }))
    const options = await screen.findAllByRole('option')
    expect(options.slice(0, 3).map((o) => o.textContent?.slice(0, 3))).toEqual(['GBP', 'SGD', 'NOK'])
    expect(options.length).toBeGreaterThan(100)
    await user.type(screen.getByRole('textbox', { name: 'Search options' }), 'yen')
    expect(screen.getAllByRole('option').map((o) => o.textContent?.slice(0, 3))).toContain('JPY')
  })

  it('records a shared USD expense with zero personal wallets', async () => {
    vi.mocked(getWallets).mockResolvedValueOnce({ data: [] })
    setPointer(false)
    const user = userEvent.setup()
    renderSheet()
    await user.click(await screen.findByRole('combobox', { name: 'Currency' }))
    await user.click(await screen.findByRole('option', { name: /USD/ }))
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '20')
    await user.click(screen.getByRole('button', { name: 'Split with someone' }))
    await user.click(await screen.findByRole('button', { name: 'Taylor' }))
    await user.click(screen.getByRole('button', { name: 'Save shared expense' }))
    await waitFor(() => expect(createSharedExpense).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD', cost: '20' })))
    expect(vi.mocked(createSharedExpense).mock.calls[0][0].myBooks?.fundingWalletId).toBeFalsy()
    expect(createTransaction).not.toHaveBeenCalled()
  })

  it('rejects fractional yen without truncating the amount', async () => {
    setPointer(false)
    const user = userEvent.setup()
    renderSheet()
    await user.click(await screen.findByRole('combobox', { name: 'Currency' }))
    await user.click(await screen.findByRole('option', { name: /JPY/ }))
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '1.5')
    await user.click(screen.getByRole('button', { name: 'Split with someone' }))
    await user.click(await screen.findByRole('button', { name: 'Taylor' }))
    await user.click(screen.getByRole('button', { name: 'Save shared expense' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no decimals')
    expect(createSharedExpense).not.toHaveBeenCalled()
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
