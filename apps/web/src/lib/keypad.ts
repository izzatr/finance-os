export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '000' | 'back'

const MAX_INTEGER_DIGITS = 12

/**
 * Apply one keypad press to the amount string the quick-add sheet holds.
 * Keeps the string parseable: one decimal point, at most `decimals` fraction digits,
 * no leading zeros, and a sane length.
 */
export function pressKey(amount: string, key: KeypadKey, decimals = 2): string {
  if (key === 'back') return amount.slice(0, -1)

  const [int, frac] = amount.split('.')
  const hasDot = amount.includes('.')

  if (key === '.') {
    if (decimals === 0 || hasDot) return amount
    return amount === '' ? '0.' : `${amount}.`
  }

  if (key === '000') {
    if (hasDot || amount === '' || amount === '0') return amount
    const next = `${amount}000`
    return next.length > MAX_INTEGER_DIGITS ? amount : next
  }

  // digit
  if (hasDot) {
    if ((frac ?? '').length >= decimals) return amount
    return `${amount}${key}`
  }
  if (int === '0') return key // replace a lone leading zero
  if (int.length >= MAX_INTEGER_DIGITS) return amount
  return `${amount}${key}`
}

/** Currencies that are normally written without minor units. */
export function currencyDecimals(currency: string | undefined): number {
  return currency && ['IDR', 'JPY', 'KRW', 'VND'].includes(currency) ? 0 : 2
}

/** Group the integer part for display while typing: `35000` → `35.000` (IDR) or `1250.5` → `1,250.5`. */
export function groupAmountDisplay(raw: string, currency: string | undefined): string {
  if (raw === '') return '0'
  const [int, frac] = raw.split('.')
  const sep = currency === 'IDR' ? '.' : ','
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  return raw.includes('.') ? `${grouped}.${frac ?? ''}` : grouped
}
