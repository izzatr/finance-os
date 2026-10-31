import { db, exchangeRates } from '@finance-os/db'
import { desc, eq } from 'drizzle-orm'

/** Thrown by convertAmount when either side of the conversion has no known rate. */
export class FxError extends Error {
  code: 'MISSING_RATE'

  constructor(code: 'MISSING_RATE', message: string) {
    super(message)
    this.name = 'FxError'
    this.code = code
  }
}

/**
 * Latest EUR-based rate per quote currency (max asOf per quote), plus EUR->EUR = 1.
 * Only rows with base = 'EUR' are considered — this is the set fetchDailyRates writes,
 * and the set convertAmount's EUR-cross math assumes. Rows are ordered newest-first and
 * the first one seen per quote wins, so a later (older) duplicate never overwrites it.
 */
export async function getLatestRates(): Promise<Map<string, number>> {
  const rows = await db
    .select({ quote: exchangeRates.quote, rate: exchangeRates.rate })
    .from(exchangeRates)
    .where(eq(exchangeRates.base, 'EUR'))
    .orderBy(desc(exchangeRates.asOf))

  const rates = new Map<string, number>()
  rates.set('EUR', 1)
  for (const row of rows) {
    if (!rates.has(row.quote)) rates.set(row.quote, Number(row.rate))
  }
  return rates
}

/**
 * Converts `amount` from one currency to another via an EUR cross rate: amount is first
 * expressed in EUR (amount / rates[from]), then in the target currency (* rates[to]).
 * Same-currency conversion is always a no-op, even if the map has no entry for it.
 * Throws FxError('MISSING_RATE') when `from` or `to` isn't in the map.
 */
export function convertAmount(amount: number, from: string, to: string, rates: Map<string, number>): number {
  if (from === to) return amount

  const fromRate = rates.get(from)
  if (fromRate === undefined) throw new FxError('MISSING_RATE', `No rate known for ${from}`)

  const toRate = rates.get(to)
  if (toRate === undefined) throw new FxError('MISSING_RATE', `No rate known for ${to}`)

  const amountInEur = amount / fromRate
  return amountInEur * toRate
}
