import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

vi.mock('@/lib/api', () => ({
  getCurrencyCatalog: vi.fn(),
  getWallets: vi.fn(),
  getAssets: vi.fn(),
  createWallet: vi.fn(),
  getSummary: vi.fn(),
  getExchangeRates: vi.fn(),
  pickableWallets: (ws: Array<{ isActive: boolean; systemRole?: string | null }>) => ws.filter((w) => w.isActive && !w.systemRole),
}))

import { createWallet, getAssets, getCurrencyCatalog, getExchangeRates, getSummary, getWallets } from '@/lib/api'
import { CurrenciesPage } from './CurrenciesPage'
import { CurrencyTestProvider } from '@/test/CurrencyTestProvider'

const CODES = ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'IDR', 'JPY', 'NOK', 'SGD', 'USD']
const emptySummary = { data: { walletCount: 0, transactionCount: 0, byCurrency: [] } }

function renderPage(ctx: Partial<ComponentProps<typeof CurrencyTestProvider>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CurrencyTestProvider {...ctx}><CurrenciesPage /></CurrencyTestProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCurrencyCatalog).mockResolvedValue({ data: CODES.map((code) => ({ code, name: code, precision: 2 })) })
  vi.mocked(getWallets).mockResolvedValue({ data: [] } as never)
  vi.mocked(getSummary).mockResolvedValue(emptySummary as never)
  vi.mocked(getExchangeRates).mockResolvedValue({ base: 'EUR', rates: { EUR: 1, USD: 1.25, IDR: 20000 } })
  vi.mocked(getAssets).mockResolvedValue({ data: [{ id: 'a-nok', code: 'NOK', name: 'Norwegian Krone', type: 'currency', precision: 2 }] })
})

describe('/currencies setup', () => {
  it('lets a user with no wallets pick the default from the full catalogue and saves it immediately', async () => {
    const setDefaultCurrency = vi.fn()
    const user = userEvent.setup()
    renderPage({ setDefaultCurrency })
    expect(await screen.findByText(/No balances yet/)).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Default currency' }))
    await user.click(await screen.findByRole('option', { name: /NOK/ }))
    expect(setDefaultCurrency).toHaveBeenCalledWith('NOK')
  })

  it('shows the default first, preferred in saved order, and removing one saves the shorter list', async () => {
    const setPreferredCurrencies = vi.fn()
    const user = userEvent.setup()
    renderPage({ defaultCurrency: 'GBP', preferredCurrencies: ['USD', 'JPY'], setPreferredCurrencies })
    const list = await screen.findByRole('list', { name: 'Your currencies' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('p')?.textContent)).toEqual(['GBP· Default', 'USD', 'JPY'])
    // The default cannot be removed from here; preferred ones can.
    expect(screen.queryByRole('button', { name: 'Remove GBP from preferred' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove USD from preferred' }))
    expect(setPreferredCurrencies).toHaveBeenCalledWith(['JPY'])
  })

  it('adds a preferred currency from the searchable catalogue, excluding ones already listed', async () => {
    const setPreferredCurrencies = vi.fn()
    const user = userEvent.setup()
    renderPage({ defaultCurrency: 'EUR', preferredCurrencies: ['USD'], setPreferredCurrencies })
    await user.click(await screen.findByRole('combobox', { name: 'Add preferred currency' }))
    const options = await screen.findAllByRole('option')
    const values = options.map((o) => o.textContent ?? '')
    expect(values.some((v) => v.startsWith('USD') || v.startsWith('EUR'))).toBe(false)
    await user.click(screen.getByRole('option', { name: /SGD/ }))
    expect(setPreferredCurrencies).toHaveBeenCalledWith(['USD', 'SGD'])
  })

  it('resets to an empty preferred list by removing the last entry', async () => {
    const setPreferredCurrencies = vi.fn()
    renderPage({ preferredCurrencies: ['USD'], setPreferredCurrencies })
    await userEvent.click(await screen.findByRole('button', { name: 'Remove USD from preferred' }))
    expect(setPreferredCurrencies).toHaveBeenCalledWith([])
  })

  it('disables controls while saving and shows the in-flight value', async () => {
    renderPage({ isSaving: true, pending: { defaultCurrency: 'NOK' } })
    expect(await screen.findByRole('combobox', { name: 'Default currency' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Default currency' })).toHaveTextContent('NOK')
    expect(screen.getByRole('status', { name: '' })).toBeTruthy()
    expect(screen.getByText('Saving…')).toBeInTheDocument()
  })

  it('shows a save failure with a retry that replays the same change', async () => {
    const retrySave = vi.fn()
    renderPage({ saveError: new Error('Unsupported currency'), retrySave })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not save: Unsupported currency')
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(retrySave).toHaveBeenCalledTimes(1)
  })

  it('keeps controls disabled and offers retry when the settings failed to load', async () => {
    const retryLoad = vi.fn()
    renderPage({ status: 'error', retryLoad })
    expect(await screen.findByRole('combobox', { name: 'Default currency' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryLoad).toHaveBeenCalled()
  })

  it('offers a separate, optional Create wallet action per currency using the existing dialog', async () => {
    vi.mocked(getWallets).mockResolvedValue({ data: [{ id: 'w1', name: 'Main', walletType: 'bank', assetId: 'a-usd', isActive: true, currency: 'USD', balance: 1 }] } as never)
    const user = userEvent.setup()
    renderPage({ defaultCurrency: 'EUR', preferredCurrencies: ['USD', 'NOK'] })
    const list = await screen.findByRole('list', { name: 'Your currencies' })
    expect(list).toBeInTheDocument()
    await waitFor(() => expect(list).toHaveTextContent('1 wallet'))
    expect(list).toHaveTextContent('No wallet')
    // Nothing was created just by listing currencies.
    expect(createWallet).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Create NOK wallet' }))
    expect(await screen.findByRole('heading', { name: 'New wallet' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('NOK — Norwegian Krone'))
    // The currency is preselected from the row, still changeable, and no wallet exists until submit.
    expect(screen.getByRole('button', { name: 'Create wallet' })).toBeDisabled()
    expect(createWallet).not.toHaveBeenCalled()
  })

  it('shows a missing exchange rate as missing, never as 1', async () => {
    renderPage({ defaultCurrency: 'NOK', preferredCurrencies: ['USD'] })
    expect(await screen.findByText(/No exchange rate is recorded for NOK/)).toBeInTheDocument()
    const rates = screen.getByRole('list', { name: 'Exchange rates' })
    expect(within(rates).getAllByText('No rate').length).toBeGreaterThan(5)
    expect(within(rates).queryByText('1.0000')).not.toBeInTheDocument()
  })

  it('shows real rates for a default that has one, and No rate only for currencies without one', async () => {
    renderPage({ defaultCurrency: 'USD' })
    const rates = await screen.findByRole('list', { name: 'Exchange rates' })
    await waitFor(() => expect(within(rates).getByText('0.8000')).toBeInTheDocument()) // EUR per USD
    expect(within(rates).getByText('16,000')).toBeInTheDocument() // IDR per USD
    expect(within(rates).getAllByText('No rate').length).toBeGreaterThan(0) // GBP, JPY, ... have none in the fixture
  })

  it('keeps the balances section when wallets exist', async () => {
    vi.mocked(getSummary).mockResolvedValue({ data: { walletCount: 1, transactionCount: 1, byCurrency: [{ currency: 'EUR', net: 100, income: 100, expense: 0, transfer: 0, adjustment: 0, fee: 0 }] } } as never)
    renderPage()
    expect(await screen.findByText('€100.00')).toBeInTheDocument()
    expect(screen.queryByText(/No balances yet/)).not.toBeInTheDocument()
  })
})
