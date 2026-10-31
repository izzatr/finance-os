import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getCurrencySettings, patchCurrencySettings, type CurrencySettings } from '@/lib/api'
import { isSupportedCurrency } from '@/lib/currencies'
import { splitKeys } from '@/hooks/use-split'
import { useAuth } from './AuthContext'

/**
 * The browser-local default used before currency settings moved to the account. It is only ever
 * offered to the signed-in user as a suggestion; it is never applied silently, because the browser
 * may have last been used by someone else.
 */
export const LEGACY_STORAGE_KEY = 'finance-os-default-currency'
export const FALLBACK_CURRENCY = 'EUR'

export function readLegacyCurrency(): string | null {
  try {
    const value = localStorage.getItem(LEGACY_STORAGE_KEY)
    return value && isSupportedCurrency(value) ? value : null
  } catch {
    return null
  }
}

function clearLegacyCurrency() {
  try { localStorage.removeItem(LEGACY_STORAGE_KEY) } catch { /* storage may be unavailable */ }
}

export type CurrencyStatus = 'idle' | 'loading' | 'ready' | 'error'
type Patch = { defaultCurrency?: string; preferredCurrencies?: string[] }

export type CurrencyContextValue = {
  /** idle = signed out; loading/error describe the account settings request. */
  status: CurrencyStatus
  defaultCurrency: string
  preferredCurrencies: string[]
  defaultIsExplicit: boolean
  /** Account default and preferred currencies in picker order, without duplicates. */
  pickerTop: string[]
  setDefaultCurrency: (currency: string) => void
  setPreferredCurrencies: (currencies: string[]) => void
  isSaving: boolean
  /** The values being saved right now, so controls can show them before the server answers. */
  pending: Patch | null
  saveError: Error | null
  retrySave: () => void
  retryLoad: () => void
  /** Old browser-only default that differs from the account's, offered once for confirmation. */
  legacyCurrency: string | null
  acceptLegacyCurrency: () => void
  dismissLegacyCurrency: () => void
}

export const CurrencyContext = createContext<CurrencyContextValue | null>(null)

export const currencySettingsKey = (userId: string) => ['currency-settings', userId] as const

/** Outer shell: a new user gets a brand-new store, so nothing from the previous account can leak. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.status === 'authenticated' ? state.user.id : null
  return <CurrencyStore key={userId ?? 'signed-out'} userId={userId}>{children}</CurrencyStore>
}

function CurrencyStore({ userId, children }: { userId: string | null; children: ReactNode }) {
  const qc = useQueryClient()
  const [legacy, setLegacy] = useState<string | null>(readLegacyCurrency)

  const query = useQuery({
    queryKey: currencySettingsKey(userId ?? ''),
    queryFn: async () => (await getCurrencySettings()).data,
    enabled: userId !== null,
    staleTime: 5 * 60_000,
  })

  const mutation = useMutation({
    mutationFn: async (patch: Patch) => (await patchCurrencySettings(patch)).data,
    onSuccess: (data: CurrencySettings) => {
      qc.setQueryData(currencySettingsKey(userId ?? ''), data)
      // Shared expenses read the same account default; refresh its copy.
      void qc.invalidateQueries({ queryKey: splitKeys.me })
      void qc.invalidateQueries({ queryKey: ['assets'] })
    },
  })

  const settings = query.data
  const defaultCurrency = settings?.defaultCurrency ?? FALLBACK_CURRENCY
  const preferredCurrencies = useMemo(() => settings?.preferredCurrencies ?? [], [settings])
  const defaultIsExplicit = settings?.defaultIsExplicit ?? false
  const status: CurrencyStatus = userId === null ? 'idle' : settings ? 'ready' : query.isError ? 'error' : 'loading'

  const setDefaultCurrency = useCallback((currency: string) => mutation.mutate({ defaultCurrency: currency }), [mutation])
  const setPreferredCurrencies = useCallback((currencies: string[]) => mutation.mutate({ preferredCurrencies: currencies }), [mutation])
  const retrySave = useCallback(() => { if (mutation.variables) mutation.mutate(mutation.variables) }, [mutation])
  const retryLoad = useCallback(() => { void query.refetch() }, [query])

  const acceptLegacyCurrency = useCallback(() => {
    if (!legacy) return
    mutation.mutate({ defaultCurrency: legacy }, { onSuccess: () => { clearLegacyCurrency(); setLegacy(null) } })
  }, [legacy, mutation])
  const dismissLegacyCurrency = useCallback(() => { clearLegacyCurrency(); setLegacy(null) }, [])

  const legacyCurrency = status === 'ready' && !defaultIsExplicit && legacy && legacy !== defaultCurrency ? legacy : null
  const pickerTop = useMemo(() => [...new Set([defaultCurrency, ...preferredCurrencies])], [defaultCurrency, preferredCurrencies])

  const value: CurrencyContextValue = {
    status, defaultCurrency, preferredCurrencies, defaultIsExplicit, pickerTop,
    setDefaultCurrency, setPreferredCurrencies,
    isSaving: mutation.isPending,
    pending: mutation.isPending ? mutation.variables ?? null : null,
    saveError: mutation.error,
    retrySave, retryLoad,
    legacyCurrency, acceptLegacyCurrency, dismissLegacyCurrency,
  }
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrencySettings(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrencySettings must be used within CurrencyProvider')
  return ctx
}

/** The account default currency and a setter that saves it to the account (same tuple as before). */
export function useDefaultCurrency(): [string, (currency: string) => void] {
  const ctx = useCurrencySettings()
  return [ctx.defaultCurrency, ctx.setDefaultCurrency]
}
