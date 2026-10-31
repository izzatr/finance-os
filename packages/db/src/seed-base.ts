import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { assets } from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os'
const pool = new Pool({ connectionString })
const db = drizzle(pool)

type BaseAsset = {
  code: string
  name: string
  type: 'currency' | 'crypto' | 'stock' | 'commodity' | 'custom'
  precision: number
  unit?: string
}

const BASE_ASSETS: BaseAsset[] = [
  { code: 'EUR', name: 'Euro', type: 'currency', precision: 2 },
  { code: 'USD', name: 'US Dollar', type: 'currency', precision: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', type: 'currency', precision: 2 },
  { code: 'GBP', name: 'British Pound', type: 'currency', precision: 2 },
  { code: 'JPY', name: 'Japanese Yen', type: 'currency', precision: 0 },
  { code: 'CHF', name: 'Swiss Franc', type: 'currency', precision: 2 },
  { code: 'SGD', name: 'Singapore Dollar', type: 'currency', precision: 2 },
  { code: 'AUD', name: 'Australian Dollar', type: 'currency', precision: 2 },
  { code: 'CAD', name: 'Canadian Dollar', type: 'currency', precision: 2 },
  { code: 'XAU_G', name: 'Gold (grams)', type: 'commodity', precision: 4, unit: 'g' },
]

// Categories are per-user (tenancy) and are created through the API,
// so the base seed only provisions shared reference data (assets).

export async function seedBase() {
  for (const asset of BASE_ASSETS) {
    await db.insert(assets).values(asset).onConflictDoNothing()
  }

  const seeded = await db.select().from(assets).where(
    inArray(assets.code, BASE_ASSETS.map((asset) => asset.code)),
  )

  if (seeded.length < BASE_ASSETS.length) {
    throw new Error('Failed to prepare base assets.')
  }

  console.log('Seeded Finance OS with base assets.')
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectRun) {
  seedBase().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
