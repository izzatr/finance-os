import { eq, inArray } from 'drizzle-orm'
import { assets, db, seedBase } from '@finance-os/db'
import { beforeEach, describe, expect, it } from 'vitest'
import { truncateAll } from './helpers'

describe('seedBase', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('seeds the major currencies plus gold, and is idempotent', async () => {
    await seedBase()
    // Run twice to prove onConflictDoNothing keeps it idempotent.
    await seedBase()

    const codes = ['EUR', 'USD', 'IDR', 'GBP', 'JPY', 'CHF', 'SGD', 'AUD', 'CAD', 'XAU_G']
    const seeded = await db.select().from(assets).where(inArray(assets.code, codes))
    expect(seeded).toHaveLength(codes.length)

    const currencies = seeded.filter((asset) => asset.type === 'currency')
    expect(currencies.length).toBeGreaterThanOrEqual(9)

    const [gold] = await db.select().from(assets).where(eq(assets.code, 'XAU_G'))
    expect(gold).toMatchObject({ type: 'commodity', unit: 'g', precision: 4 })

    const [jpy] = await db.select().from(assets).where(eq(assets.code, 'JPY'))
    expect(jpy).toMatchObject({ precision: 0, unit: null })
  })
})
