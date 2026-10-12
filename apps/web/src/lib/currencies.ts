/** Same ISO currency catalog used by the shared-expense API; never arbitrary codes. */
const supported = new Set<string>(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR', 'USD'])
export function isSupportedCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && supported.has(code)
}
