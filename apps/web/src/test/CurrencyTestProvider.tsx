import type { ReactNode } from 'react'
import { vi } from 'vitest'
import { CurrencyContext, type CurrencyContextValue } from '@/contexts/CurrencyContext'

/** Static account currency settings for component tests that do not exercise the settings API. */
export function CurrencyTestProvider({ children, ...overrides }: { children: ReactNode } & Partial<CurrencyContextValue>) {
  const defaultCurrency = overrides.defaultCurrency ?? 'EUR'
  const preferredCurrencies = overrides.preferredCurrencies ?? []
  const value: CurrencyContextValue = {
    status: 'ready',
    defaultCurrency,
    preferredCurrencies,
    defaultIsExplicit: true,
    pickerTop: [...new Set([defaultCurrency, ...preferredCurrencies])],
    setDefaultCurrency: vi.fn(),
    setPreferredCurrencies: vi.fn(),
    isSaving: false,
    pending: null,
    saveError: null,
    retrySave: vi.fn(),
    retryLoad: vi.fn(),
    legacyCurrency: null,
    acceptLegacyCurrency: vi.fn(),
    dismissLegacyCurrency: vi.fn(),
    ...overrides,
  }
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}
