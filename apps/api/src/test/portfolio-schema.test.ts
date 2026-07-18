import { beforeEach, describe, expect, it } from 'vitest'
import { assets, db, exchanges, holdings, instruments, listingPrices, listings, providerSymbols, wallets } from '@finance-os/db'
import { eq } from 'drizzle-orm'
import { createTestUser, truncateAll } from './helpers'
import app from '../app'

async function seedWallet(userId: string) {
  const [asset] = await db.select().from(assets).where(eq(assets.code, 'EUR')).limit(1)
  const [wallet] = await db.insert(wallets).values({ userId, name: 'Broker', walletType: 'investment', assetId: asset.id }).returning()
  return wallet
}

describe('portfolio database model', () => {
  beforeEach(truncateAll)

  it('stores global instruments/listings/provider mappings and wallet-owned holdings', async () => {
    const { userId } = await createTestUser(app)
    const wallet = await seedWallet(userId)
    const [exchange] = await db.insert(exchanges).values({ code: 'JKT', name: 'Jakarta', mic: 'XIDX', timezone: 'Asia/Jakarta' }).returning()
    const [instrument] = await db.insert(instruments).values({ name: 'Bank Central Asia Tbk', type: 'stock' }).returning()
    const [listing] = await db.insert(listings).values({ instrumentId: instrument.id, exchangeId: exchange.id, symbol: 'BBCA', currency: 'IDR' }).returning()
    await db.insert(providerSymbols).values({ listingId: listing.id, provider: 'yahoo', symbol: 'BBCA.JK' })
    const [holding] = await db.insert(holdings).values({ walletId: wallet.id, listingId: listing.id, quantity: '100', averageCost: '8500', costCurrency: 'IDR' }).returning()

    expect(holding.quantity).toBe('100.00000000')
  })

  it('upserts one price per listing/date/source without duplicating rows', async () => {
    const { userId } = await createTestUser(app)
    const wallet = await seedWallet(userId)
    const [exchange] = await db.insert(exchanges).values({ code: 'GER', name: 'XETRA', timezone: 'Europe/Berlin' }).returning()
    const [instrument] = await db.insert(instruments).values({ name: 'Vanguard FTSE All-World UCITS ETF', type: 'etf' }).returning()
    const [listing] = await db.insert(listings).values({ instrumentId: instrument.id, exchangeId: exchange.id, symbol: 'VWCE', currency: 'EUR' }).returning()
    await db.insert(holdings).values({ walletId: wallet.id, listingId: listing.id, quantity: '2' })
    await db.insert(listingPrices).values({ listingId: listing.id, priceDate: '2026-07-17', close: '140', currency: 'EUR', source: 'yahoo' })
    await db.insert(listingPrices).values({ listingId: listing.id, priceDate: '2026-07-17', close: '141', currency: 'EUR', source: 'yahoo' })
      .onConflictDoUpdate({ target: [listingPrices.listingId, listingPrices.priceDate, listingPrices.source], set: { close: '141' } })

    const rows = await db.select().from(listingPrices)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].close)).toBe(141)
  })
})
