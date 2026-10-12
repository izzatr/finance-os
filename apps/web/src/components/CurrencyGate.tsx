import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useCurrencySettings } from '@/contexts/CurrencyContext'

const action = 'inline-flex min-h-11 items-center rounded-lg px-3 text-[14px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/20 disabled:opacity-40'

/**
 * Holds the signed-in screens until the account's currency settings arrive, so no page briefly
 * queries with a placeholder default. If loading fails it says so instead of silently using EUR.
 * Also offers an old browser-only default once, for confirmation (never applied automatically).
 */
export function CurrencyGate({ children }: { children: ReactNode }) {
  const c = useCurrencySettings()
  const { pathname } = useLocation()
  if (c.status === 'loading') {
    return <p role="status" className="px-4 py-10 text-center text-sm text-muted-foreground">Loading your settings…</p>
  }
  return (
    <>
      {c.status === 'error' && (
        <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--tint)] px-4 py-2 text-[14px] lg:mx-12">
          <span className="min-w-0 flex-1 basis-56">Could not load your currency settings. Amounts show in EUR until this works.</span>
          <button type="button" className={`${action} bg-white`} onClick={c.retryLoad}>Retry</button>
        </div>
      )}
      {c.legacyCurrency && (
        <div role="region" aria-label="Browser currency" className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-[var(--tint)] px-4 py-2 text-[14px] lg:mx-12">
          <span className="min-w-0 flex-1 basis-56">
            This browser used {c.legacyCurrency} as its currency before it was saved to accounts. Use {c.legacyCurrency} for your account?
          </span>
          <span className="flex gap-1">
            <button type="button" className={`${action} bg-[var(--ink)] text-[var(--cream)]`} disabled={c.isSaving} onClick={c.acceptLegacyCurrency}>
              {c.isSaving ? 'Saving…' : `Use ${c.legacyCurrency}`}
            </button>
            <button type="button" className={`${action} bg-white`} disabled={c.isSaving} onClick={c.dismissLegacyCurrency}>
              Keep {c.defaultCurrency}
            </button>
          </span>
        </div>
      )}
      {c.saveError && !c.isSaving && pathname !== '/currencies' && (
        <p role="alert" className="mx-4 mt-2 text-[13.5px] text-[var(--negative)] lg:mx-12">
          Could not save: {c.saveError.message}{' '}
          <button type="button" className="font-semibold underline" onClick={c.retrySave}>Retry</button>
        </p>
      )}
      {children}
    </>
  )
}
