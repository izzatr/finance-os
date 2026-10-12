import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const auth = vi.hoisted(() => ({ state: { status: 'authenticated', user: { id: 'user-a' } } as { status: string; user?: { id: string } } }))
vi.mock('./AuthContext', () => ({ useAuth: () => ({ state: auth.state }) }))
vi.mock('@/lib/api', () => ({
  getCurrencySettings: vi.fn(),
  patchCurrencySettings: vi.fn(),
}))
vi.mock('@/hooks/use-split', () => ({ splitKeys: { me: ['split', 'me'] } }))

import { getCurrencySettings, patchCurrencySettings } from '@/lib/api'
import { CurrencyProvider, LEGACY_STORAGE_KEY, useCurrencySettings } from './CurrencyContext'

const settings = (over: Partial<{ defaultCurrency: string; defaultIsExplicit: boolean; preferredCurrencies: string[] }> = {}) => ({
  data: { defaultCurrency: 'EUR', defaultIsExplicit: false, preferredCurrencies: [], updatedAt: null, ...over },
})

function Probe() {
  const c = useCurrencySettings()
  return (
    <div>
      <p data-testid="state">{c.status}|{c.defaultCurrency}|{c.preferredCurrencies.join(',')}|{c.pickerTop.join(',')}|{String(c.isSaving)}|{c.legacyCurrency ?? '-'}</p>
      <p data-testid="error">{c.saveError?.message ?? ''}</p>
      <button onClick={() => c.setDefaultCurrency('NOK')}>set-nok</button>
      <button onClick={() => c.setPreferredCurrencies(['USD', 'JPY'])}>set-pref</button>
      <button onClick={c.retrySave}>retry</button>
      <button onClick={c.acceptLegacyCurrency}>accept-legacy</button>
      <button onClick={c.dismissLegacyCurrency}>dismiss-legacy</button>
    </div>
  )
}
const state = () => screen.getByTestId('state').textContent

function mount(ui: ReactNode = <Probe />) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(<QueryClientProvider client={qc}><CurrencyProvider>{ui}</CurrencyProvider></QueryClientProvider>)
  return { qc, rerender: () => view.rerender(<QueryClientProvider client={qc}><CurrencyProvider>{ui}</CurrencyProvider></QueryClientProvider>) }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  auth.state = { status: 'authenticated', user: { id: 'user-a' } }
})

describe('account currency settings context', () => {
  it('uses the account default, ignoring the old browser value', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'USD')
    vi.mocked(getCurrencySettings).mockResolvedValue(settings({ defaultCurrency: 'GBP', defaultIsExplicit: true, preferredCurrencies: ['CHF'] }))
    mount()
    expect(state()).toContain('loading|EUR')
    await waitFor(() => expect(state()).toBe('ready|GBP|CHF|GBP,CHF|false|-'))
  })

  it('does not request settings while signed out', () => {
    auth.state = { status: 'unauthenticated' }
    mount()
    expect(state()).toContain('idle|EUR')
    expect(getCurrencySettings).not.toHaveBeenCalled()
  })

  it('saves to the account, shows pending, then the stored value, and never writes localStorage', async () => {
    vi.mocked(getCurrencySettings).mockResolvedValue(settings({ defaultIsExplicit: true }))
    let finish!: (v: unknown) => void
    vi.mocked(patchCurrencySettings).mockReturnValue(new Promise((r) => { finish = r }) as never)
    mount()
    await waitFor(() => expect(state()).toContain('ready|EUR'))
    await userEvent.click(screen.getByText('set-nok'))
    await waitFor(() => expect(state()).toContain('|true|'))
    expect(patchCurrencySettings).toHaveBeenCalledWith({ defaultCurrency: 'NOK' })
    await act(async () => { finish(settings({ defaultCurrency: 'NOK', defaultIsExplicit: true })) })
    await waitFor(() => expect(state()).toBe('ready|NOK||NOK|false|-'))
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
  })

  it('surfaces a failed save, keeps the old value, and retries the same change', async () => {
    vi.mocked(getCurrencySettings).mockResolvedValue(settings({ defaultCurrency: 'USD', defaultIsExplicit: true }))
    vi.mocked(patchCurrencySettings).mockRejectedValueOnce(new Error('Network down'))
    mount()
    await waitFor(() => expect(state()).toContain('ready|USD'))
    await userEvent.click(screen.getByText('set-pref'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('Network down'))
    expect(state()).toContain('ready|USD||')
    vi.mocked(patchCurrencySettings).mockResolvedValueOnce(settings({ defaultCurrency: 'USD', defaultIsExplicit: true, preferredCurrencies: ['USD', 'JPY'] }))
    await userEvent.click(screen.getByText('retry'))
    await waitFor(() => expect(state()).toBe('ready|USD|USD,JPY|USD,JPY|false|-'))
    expect(patchCurrencySettings).toHaveBeenLastCalledWith({ preferredCurrencies: ['USD', 'JPY'] })
    expect(screen.getByTestId('error').textContent).toBe('')
  })

  it('reports a failed load instead of pretending EUR is the stored default', async () => {
    vi.mocked(getCurrencySettings).mockRejectedValue(new Error('boom'))
    mount()
    await waitFor(() => expect(state()).toContain('error|EUR'))
  })

  it('offers the old browser value only as a suggestion until the account has chosen', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'USD')
    vi.mocked(getCurrencySettings).mockResolvedValue(settings())
    mount()
    await waitFor(() => expect(state()).toBe('ready|EUR||EUR|false|USD'))
    // Nothing was applied or sent.
    expect(patchCurrencySettings).not.toHaveBeenCalled()
    vi.mocked(patchCurrencySettings).mockResolvedValue(settings({ defaultCurrency: 'USD', defaultIsExplicit: true }))
    await userEvent.click(screen.getByText('accept-legacy'))
    await waitFor(() => expect(state()).toBe('ready|USD||USD|false|-'))
    expect(patchCurrencySettings).toHaveBeenCalledWith({ defaultCurrency: 'USD' })
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
  })

  it('does not suggest the old browser value to an account that already chose, and dismissing clears it', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, 'USD')
    vi.mocked(getCurrencySettings).mockResolvedValue(settings({ defaultCurrency: 'JPY', defaultIsExplicit: true }))
    mount()
    await waitFor(() => expect(state()).toBe('ready|JPY||JPY|false|-'))

    localStorage.setItem(LEGACY_STORAGE_KEY, 'CAD')
    vi.mocked(getCurrencySettings).mockResolvedValue(settings())
    auth.state = { status: 'authenticated', user: { id: 'user-b' } }
    mount()
    await waitFor(() => expect(screen.getAllByTestId('state')[1].textContent).toContain('|CAD'))
    await userEvent.click(screen.getAllByText('dismiss-legacy')[1])
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(patchCurrencySettings).not.toHaveBeenCalled()
  })

  it('gives a switched user their own settings with no leftovers from the previous user', async () => {
    vi.mocked(getCurrencySettings).mockImplementation(async () => (
      auth.state.user?.id === 'user-a'
        ? settings({ defaultCurrency: 'IDR', defaultIsExplicit: true, preferredCurrencies: ['USD'] })
        : settings({ defaultCurrency: 'CHF', defaultIsExplicit: true })
    ))
    vi.mocked(patchCurrencySettings).mockRejectedValue(new Error('first user failure'))
    const { rerender } = mount()
    await waitFor(() => expect(state()).toBe('ready|IDR|USD|IDR,USD|false|-'))
    await userEvent.click(screen.getByText('set-nok'))
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('first user failure'))

    auth.state = { status: 'authenticated', user: { id: 'user-b' } }
    rerender()
    expect(state()).toContain('loading|EUR||') // never the previous user's IDR while loading
    await waitFor(() => expect(state()).toBe('ready|CHF||CHF|false|-'))
    expect(screen.getByTestId('error').textContent).toBe('')
  })
})
