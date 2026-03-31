import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

const STORAGE_KEY = 'finance-os-default-currency'
const DEFAULT_CURRENCY = 'EUR'

type CurrencyContextValue = {
  defaultCurrency: string
  setDefaultCurrency: (currency: string) => void
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

function getStoredCurrency(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CURRENCY
  } catch {
    return DEFAULT_CURRENCY
  }
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [defaultCurrency, setDefaultCurrencyState] = useState(getStoredCurrency)

  const setDefaultCurrency = useCallback((currency: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, currency)
    } catch {
      // localStorage may be unavailable
    }
    setDefaultCurrencyState(currency)
  }, [])

  return (
    <CurrencyContext.Provider value={{ defaultCurrency, setDefaultCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useDefaultCurrency(): [string, (currency: string) => void] {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useDefaultCurrency must be used within CurrencyProvider')
  return [ctx.defaultCurrency, ctx.setDefaultCurrency]
}
