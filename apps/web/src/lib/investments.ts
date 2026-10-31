// Presentation helpers for investment holdings: short names, avatar marks, units and money.

export type InstrumentType = 'stock' | 'etf' | 'crypto' | 'commodity' | 'mutual_fund'

const GRAMS_PER_TROY_OUNCE = 31.1034768
// Precious-metal futures are quoted per troy ounce; people think about bars in grams.
const METALS: Record<string, { name: string; mark: string }> = {
  'GC=F': { name: 'Gold', mark: 'Au' },
  'SI=F': { name: 'Silver', mark: 'Ag' },
  'PL=F': { name: 'Platinum', mark: 'Pt' },
  'PA=F': { name: 'Palladium', mark: 'Pd' },
}

export type HoldingIdentity = { symbol: string; name: string; type?: InstrumentType }

export function isMetal(symbol: string) {
  return symbol in METALS
}

/** A short human name: "Gold" instead of "Gold Dec 26", fund names without legal suffixes. */
export function displayName({ symbol, name, type }: HoldingIdentity) {
  if (METALS[symbol]) return METALS[symbol].name
  let clean = name
    .replace(/(^|\s)(Inc\.?|Corporation|Corp\.?|N\.V\.?|plc|Tbk|Limited|Ltd\.?|S\.A\.?|Holding)(?=\s|,|$)/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[,.-]+$/, '')
  if (type === 'crypto') clean = clean.replace(/\s+(EUR|USD|IDR)$/i, '')
  return clean || symbol
}

/** Ticker without exchange suffix, or nothing for identifiers people never read (fund ISINs). */
export function displayTicker({ symbol, type }: HoldingIdentity) {
  if (METALS[symbol] || type === 'mutual_fund') return null
  return symbol.replace(/\.[A-Z]{1,3}$/, '').replace(/-(EUR|USD|IDR)$/, '')
}

/** One to four characters for the round avatar. */
export function avatarMark(identity: HoldingIdentity) {
  if (METALS[identity.symbol]) return METALS[identity.symbol].mark
  const ticker = displayTicker(identity)
  if (ticker) return ticker.slice(0, 4)
  const words = identity.name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word))
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('') || '•'
}

const UNIT: Record<InstrumentType, [string, string]> = {
  stock: ['share', 'shares'],
  etf: ['share', 'shares'],
  mutual_fund: ['unit', 'units'],
  crypto: ['', ''],
  commodity: ['oz', 'oz'],
}

/** "20 g", "0.0025 BTC", "1,800 shares". */
export function displayQuantity(identity: HoldingIdentity, quantity: number) {
  if (METALS[identity.symbol]) return `${formatNumber(quantity * GRAMS_PER_TROY_OUNCE, 2)} g`
  if (identity.type === 'crypto') return `${formatNumber(quantity, 8)} ${displayTicker(identity) ?? ''}`.trim()
  const [one, many] = UNIT[identity.type ?? 'stock'] ?? UNIT.stock
  return `${formatNumber(quantity, 4)} ${quantity === 1 ? one : many}`
}

/** Unit price as people quote it: per gram for metals, otherwise per share/unit. */
export function unitPrice(identity: HoldingIdentity, price: number) {
  return METALS[identity.symbol] ? { price: price / GRAMS_PER_TROY_OUNCE, unit: 'g' } : { price, unit: null }
}

export function formatNumber(value: number, maxFractionDigits = 2) {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits })
}

export function formatMoney(amount: number, currency: string, options: { compact?: boolean; signed?: boolean } = {}) {
  const abs = Math.abs(amount)
  let body: string
  try {
    body = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: options.compact ? 'compact' : 'standard',
      minimumFractionDigits: currency === 'IDR' || options.compact ? 0 : 2,
      maximumFractionDigits: currency === 'IDR' ? (options.compact ? 1 : 0) : 2,
    }).format(abs)
  } catch {
    body = `${currency} ${abs.toLocaleString('en-US')}`
  }
  if (currency === 'IDR') body = body.replace(/^(IDR|Rp)\s?/, 'Rp')
  const sign = amount < 0 ? '−' : options.signed ? '+' : ''
  return `${sign}${body}`
}

export function formatPercent(value: number, signed = true) {
  const sign = value < 0 ? '−' : signed ? '+' : ''
  return `${sign}${Math.abs(value).toFixed(2)}%`
}

/** Split a formatted amount into the main part and its decimals, for the large hero number. */
export function splitDecimals(formatted: string) {
  const match = formatted.match(/^(.*?)([.,]\d{1,2})$/)
  return match ? { main: match[1], decimals: match[2] } : { main: formatted, decimals: '' }
}
