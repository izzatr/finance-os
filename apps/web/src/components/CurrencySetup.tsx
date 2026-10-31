import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Dropdown } from '@/components/ui/dropdown'
import { MAX_PREFERRED_CURRENCIES, currencyName, currencyPickerOptions, SUPPORTED_CURRENCY_CODES } from '@/lib/currencies'
import { getCurrencyCatalog, getWallets, pickableWallets } from '@/lib/api'
import { useCurrencySettings } from '@/contexts/CurrencyContext'
import { SectionDivider } from './SectionDivider'
import { CreateWalletForm } from './CreateWalletForm'

const rowButton =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ink)]/20 disabled:opacity-40'

/**
 * Account currency setup: one default, an ordered list of preferred currencies, and an optional
 * (separate) "Create wallet" action per currency. Nothing here creates a wallet implicitly or
 * converts history; every change saves immediately to the account.
 */
export function CurrencySetup() {
  const currency = useCurrencySettings()
  const [walletFor, setWalletFor] = useState<string | null>(null)
  const catalogQuery = useQuery({ queryKey: ['currency-catalog'], queryFn: getCurrencyCatalog, staleTime: Infinity })
  const walletsQuery = useQuery({ queryKey: ['wallets'], queryFn: getWallets })

  const catalog = catalogQuery.data?.data.map((c) => c.code) ?? [...SUPPORTED_CURRENCY_CODES]
  const ready = currency.status === 'ready'
  const busy = currency.isSaving || !ready

  const shownDefault = currency.pending?.defaultCurrency ?? currency.defaultCurrency
  const shownPreferred = currency.pending?.preferredCurrencies ?? currency.preferredCurrencies
  const rows = [shownDefault, ...shownPreferred.filter((c) => c !== shownDefault)]

  const walletCount = new Map<string, number>()
  for (const w of pickableWallets(walletsQuery.data?.data ?? [])) walletCount.set(w.currency, (walletCount.get(w.currency) ?? 0) + 1)

  const addable = catalog.filter((c) => !rows.includes(c))
  const atLimit = shownPreferred.length >= MAX_PREFERRED_CURRENCIES

  return (
    <>
      <SectionDivider title="Default currency" className="mb-3 mt-2" />
      <div className="rounded-2xl bg-[var(--tint)] px-4 py-4">
        <Dropdown
          aria-label="Default currency"
          searchable
          disabled={busy}
          value={shownDefault}
          onChange={(code) => currency.setDefaultCurrency(code)}
          options={currencyPickerOptions([...new Set([shownDefault, ...shownPreferred])], catalog)}
          popupClassName="sm:min-w-[22rem]"
        />
        <p className="mt-2.5 text-[13.5px] text-[var(--text-secondary)]">
          Totals, reports and new entries use {currencyName(shownDefault)}. It is saved to your account, so it follows you to every device.
          Changing it creates no wallets and converts no past amounts.
        </p>
        <p role="status" aria-live="polite" className="mt-1.5 min-h-5 text-[13px] text-[var(--text-tertiary)]">
          {currency.isSaving && 'Saving…'}
          {currency.status === 'error' && 'Could not load your settings.'}
        </p>
        {currency.status === 'error' && (
          <button type="button" className={`${rowButton} bg-white`} onClick={currency.retryLoad}>Retry</button>
        )}
        {currency.saveError && !currency.isSaving && (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-[var(--negative)]">
            <span>Could not save: {currency.saveError.message}</span>
            <button type="button" className={`${rowButton} bg-white text-[var(--ink)]`} onClick={currency.retrySave}>Retry</button>
          </div>
        )}
      </div>

      <SectionDivider title="Preferred currencies" badge={`${shownPreferred.length}/${MAX_PREFERRED_CURRENCIES} added`} className="mb-3 mt-8" />
      <p className="mb-3 text-[13.5px] text-[var(--text-secondary)]">
        These come first in Quick add and in shared expense, edit and settlement pickers. Every other currency stays searchable.
      </p>
      <ul aria-label="Your currencies" className="rounded-2xl bg-[var(--tint)] px-4 py-1">
        {rows.map((code, i) => {
          const isDefault = i === 0
          const count = walletCount.get(code) ?? 0
          return (
            <li key={code} className="flex items-center gap-x-3 border-b border-[var(--tint-strong)] py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">
                  {code}
                  {isDefault && <span className="ml-1.5 text-[13px] font-medium text-[var(--text-tertiary)]">· Default</span>}
                </p>
                <p className="text-[13px] text-[var(--text-tertiary)]">
                  {currencyName(code)} · {count === 0 ? 'No wallet' : `${count} wallet${count === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className={`${rowButton} bg-white text-[var(--ink)]`} aria-label={`Create ${code} wallet`} onClick={() => setWalletFor(code)}>
                  Create wallet
                </button>
                {isDefault ? (
                  <span aria-hidden className="w-11" />
                ) : (
                  <button
                    type="button"
                    className={`${rowButton} w-11 px-0 text-[var(--text-secondary)] hover:bg-white`}
                    aria-label={`Remove ${code} from preferred`}
                    disabled={busy}
                    onClick={() => currency.setPreferredCurrencies(shownPreferred.filter((c) => c !== code))}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3">
        <Dropdown
          aria-label="Add preferred currency"
          searchable
          disabled={busy || atLimit}
          value=""
          onChange={(code) => currency.setPreferredCurrencies([...shownPreferred, code])}
          options={currencyPickerOptions([], addable)}
          className={`${rowButton} w-full justify-start bg-[var(--ink)] text-[var(--cream)] sm:w-auto`}
          popupClassName="sm:min-w-[22rem]"
          trigger={<><Plus aria-hidden className="size-4" />{atLimit ? `Limit of ${MAX_PREFERRED_CURRENCIES} reached` : 'Add currency'}</>}
        />
      </div>

      {walletFor && <CreateWalletForm initialCurrency={walletFor} onClose={() => setWalletFor(null)} />}
    </>
  )
}
