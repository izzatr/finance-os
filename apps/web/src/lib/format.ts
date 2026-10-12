const CURRENCY_SYMBOLS: Record<string, string> = { IDR: 'Rp', EUR: '\u20ac', USD: '$', GBP: '\u00a3', SGD: 'S$', JPY: '\u00a5' }

export function currencySymbol(currency: string): string {
  // Codes without a symbol get a space: `AUD 128.40`, not `AUD128.40`.
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `
}

function toNumber(amount: number | string): number {
  return typeof amount === 'string' ? parseFloat(amount) : amount
}

/** Minor-unit digits for display: Rupiah stays whole (existing choice); others follow ISO via Intl (JPY 0, KWD 3). */
const digitsCache = new Map<string, number>()
function currencyDigits(currency: string): number {
  if (currency === 'IDR') return 0
  let d = digitsCache.get(currency)
  if (d === undefined) {
    try { d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2 } catch { d = 2 }
    digitsCache.set(currency, d)
  }
  return d
}

/** Rupiah is shown without decimals (id-ID grouping); other currencies use their own minor-unit digits (en-US grouping). */
function formatAbs(abs: number, currency: string): string {
  if (currency === 'IDR') return abs.toLocaleString('id-ID', { maximumFractionDigits: 0 })
  const digits = currencyDigits(currency)
  return abs.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** `-€1,234.50`, `Rp50.000`. Sign is only ever a leading minus. */
export function formatCurrency(amount: number | string, currency: string): string {
  const num = toNumber(amount)
  return `${num < 0 ? '-' : ''}${currencySymbol(currency)}${formatAbs(Math.abs(num), currency)}`
}

/** Whole units for sentences and headlines (`$1,284`); keeps cents under 10 so `$3.80` stays honest. */
export function formatMoney(amount: number | string, currency: string): string {
  const num = toNumber(amount)
  const abs = Math.abs(num)
  if (abs < 10 || currency === 'IDR') return formatCurrency(num, currency)
  return `${num < 0 ? '-' : ''}${currencySymbol(currency)}${Math.round(abs).toLocaleString('en-US')}`
}

/** For tight spots (wallet tiles): millions and up collapse to `Rp18.4M`, smaller values stay exact. */
export function formatCurrencyShort(amount: number | string, currency: string): string {
  const num = toNumber(amount)
  const abs = Math.abs(num)
  if (abs < 1_000_000) return formatCurrency(num, currency)
  const compact = abs.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  return `${num < 0 ? '-' : ''}${currencySymbol(currency)}${compact}`
}

/** Like formatCurrency, but always signed (`+€10.00`, `−€4.20`) with a true minus sign for lists. */
export function formatSigned(amount: number | string, currency: string): string {
  const num = toNumber(amount)
  const sign = num < 0 ? '\u2212' : '+'
  return `${sign}${currencySymbol(currency)}${formatAbs(Math.abs(num), currency)}`
}

/**
 * Split a formatted amount into the whole part and the decimal part so the hero can render
 * the cents smaller: `€39,421` + `.80`. Currencies without decimals return an empty `cents`.
 */
export function splitMoney(amount: number | string, currency: string): { whole: string; cents: string } {
  const full = formatCurrency(amount, currency)
  if (currency === 'IDR') return { whole: full, cents: '' }
  const dot = full.lastIndexOf('.')
  return dot === -1 ? { whole: full, cents: '' } : { whole: full.slice(0, dot), cents: full.slice(dot) }
}

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Calendar day a transaction belongs to. Transactions are stored as a calendar date anchored at
 * 12:00 UTC, so the UTC date IS the day the user picked, wherever they are now.
 */
export function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

/** "Today", "Yesterday" (relative to the user's local day), "Mon 6 Oct", or "Mon 6 Oct 2025" outside this year. */
export function dayLabel(key: string, now: Date = new Date()): string {
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (key === localKey(now)) return 'Today'
  if (key === localKey(y)) return 'Yesterday'
  const [yy, mm, dd] = key.split('-').map(Number)
  const date = new Date(yy, mm - 1, dd)
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(yy !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export type DayGroup<T> = {
  key: string
  label: string
  items: T[]
  /** Net movement per currency for the day, in first-seen order. Moves between own wallets are excluded. */
  totals: Array<{ currency: string; amount: number }>
}

const OWN_MOVES = new Set(['transfer', 'exchange', 'adjustment'])

type GroupableTx = { transactionDate: string; amount: number; currency: string; type: string }

/** Group transactions (already sorted newest first) into calendar days with per-currency net totals. */
export function groupByDay<T extends GroupableTx>(transactions: T[], now: Date = new Date()): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>()
  for (const tx of transactions) {
    const key = dayKey(tx.transactionDate)
    let group = groups.get(key)
    if (!group) {
      group = { key, label: dayLabel(key, now), items: [], totals: [] }
      groups.set(key, group)
    }
    group.items.push(tx)
    // transfer/exchange/adjustment move money between your own wallets — not spend or income.
    if (OWN_MOVES.has(tx.type)) continue
    const total = group.totals.find((t) => t.currency === tx.currency)
    if (total) total.amount += tx.amount
    else group.totals.push({ currency: tx.currency, amount: tx.amount })
  }
  return [...groups.values()]
}
