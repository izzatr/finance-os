import { db, holdings, listingPrices, listings, wallets } from '@finance-os/db'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { convertAmount, FxError, getLatestRates } from '../lib/fx'

export type PortfolioWalletValue = {
  value: number
  currency: string
  asOf: string
}

/**
 * Values all holdings for a set of wallets with three bounded queries regardless
 * of wallet count. A wallet returns null when any holding has no EOD price or
 * cannot be converted into that wallet's currency; partial totals are never
 * presented as complete portfolio values.
 */
export async function latestPortfolioValuesForWallets(
  walletCurrencies: Map<string, string>,
): Promise<Map<string, PortfolioWalletValue | null>> {
  const values = new Map<string, PortfolioWalletValue | null>()
  for (const walletId of walletCurrencies.keys()) values.set(walletId, null)
  if (walletCurrencies.size === 0) return values

  const holdingRows = await db
    .select({
      walletId: holdings.walletId,
      listingId: holdings.listingId,
      quantity: holdings.quantity,
      listingCurrency: listings.currency,
    })
    .from(holdings)
    .innerJoin(listings, eq(holdings.listingId, listings.id))
    .innerJoin(wallets, eq(holdings.walletId, wallets.id))
    .where(and(
      inArray(holdings.walletId, [...walletCurrencies.keys()]), eq(wallets.walletType, 'investment'),
      eq(wallets.isActive, true), isNull(wallets.deletedAt), eq(listings.isActive, true),
    ))

  if (holdingRows.length === 0) return values

  const listingIds = [...new Set(holdingRows.map((row) => row.listingId))]
  const latestPrices = await db
    .selectDistinctOn([listingPrices.listingId], {
      listingId: listingPrices.listingId,
      close: listingPrices.close,
      currency: listingPrices.currency,
      priceDate: listingPrices.priceDate,
      createdAt: listingPrices.createdAt,
    })
    .from(listingPrices)
    .where(inArray(listingPrices.listingId, listingIds))
    .orderBy(listingPrices.listingId, desc(listingPrices.priceDate), desc(listingPrices.createdAt))

  const priceByListing = new Map(latestPrices.map((row) => [row.listingId, row]))
  const rates = await getLatestRates()
  const totals = new Map<string, { value: number; asOf: string; complete: boolean; count: number }>()

  for (const row of holdingRows) {
    const current = totals.get(row.walletId) ?? { value: 0, asOf: '', complete: true, count: 0 }
    current.count += 1
    const walletCurrency = walletCurrencies.get(row.walletId)!
    const price = priceByListing.get(row.listingId)
    if (!price) {
      current.complete = false
      totals.set(row.walletId, current)
      continue
    }

    const nativeValue = Number(row.quantity) * Number(price.close)
    try {
      current.value += convertAmount(nativeValue, price.currency || row.listingCurrency, walletCurrency, rates)
    } catch (error) {
      if (!(error instanceof FxError)) throw error
      current.complete = false
    }
    if (!current.asOf || price.priceDate < current.asOf) current.asOf = price.priceDate
    totals.set(row.walletId, current)
  }

  for (const [walletId, total] of totals) {
    const currency = walletCurrencies.get(walletId)!
    values.set(walletId, total.complete && total.count > 0
      ? { value: total.value, currency, asOf: total.asOf }
      : null)
  }

  return values
}
