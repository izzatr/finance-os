import type { DropdownOption } from '@/components/ui/dropdown'

/** Units of account that nobody holds as money (matches the API catalog). */
const NOT_CURRENCIES = new Set(['XDR', 'XSU'])
const FALLBACK = ['EUR', 'USD']

/** Same ISO currency catalog used by the API; never arbitrary codes. */
export const SUPPORTED_CURRENCY_CODES: readonly string[] = (
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : FALLBACK
).filter((c) => !NOT_CURRENCIES.has(c))
const supported = new Set<string>(SUPPORTED_CURRENCY_CODES)

export function isSupportedCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && supported.has(code)
}

/** Product limit, mirrored from the API; the server is authoritative. */
export const MAX_PREFERRED_CURRENCIES = 20

const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'currency' }) : null

export function currencyName(code: string): string {
  return names?.of(code) ?? code
}

/**
 * Picker options: the account's own currencies first (default, then preferred in the order the
 * user added them), then every other supported currency A-Z. Everything stays searchable by code
 * or English name. Unsupported codes are dropped and duplicates collapse onto their first place.
 */
export function currencyPickerOptions(top: readonly string[] = [], all: readonly string[] = SUPPORTED_CURRENCY_CODES): DropdownOption[] {
  const allowed = new Set(all)
  const first = [...new Set(top)].filter((c) => allowed.has(c))
  const firstSet = new Set(first)
  const rest = [...all].filter((c) => !firstSet.has(c)).sort()
  const option = (code: string, group: string | undefined): DropdownOption => {
    const name = currencyName(code)
    return { value: code, label: code, hint: name !== code ? name : undefined, keywords: [name], group }
  }
  return [
    ...first.map((c) => option(c, 'Your currencies')),
    ...rest.map((c) => option(c, first.length > 0 ? 'All currencies' : undefined)),
  ]
}

/**
 * Units of `to` per 1 unit of `from`, from EUR-based rates (`rates[X]` = X per 1 EUR).
 * Returns null when either side has no rate: a missing rate is never treated as 1.
 */
export function rateBetween(rates: Record<string, number> | undefined, from: string, to: string): number | null {
  if (!rates) return null
  if (from === to) return 1
  const perEur = (code: string) => (code === 'EUR' ? 1 : rates[code])
  const a = perEur(from)
  const b = perEur(to)
  if (!(typeof a === 'number' && a > 0 && Number.isFinite(a)) || !(typeof b === 'number' && b > 0 && Number.isFinite(b))) return null
  return b / a
}
