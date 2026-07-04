import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { assets } from './schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os'
const pool = new Pool({ connectionString })
const db = drizzle(pool)

const BASE_ASSETS = [
  { code: 'EUR', name: 'Euro', type: 'currency' as const, precision: 2 },
  { code: 'USD', name: 'US Dollar', type: 'currency' as const, precision: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', type: 'currency' as const, precision: 2 },
]

// Categories are per-user (tenancy) and are created through the API,
// so the base seed only provisions shared reference data (assets).

export async function seedBase() {
  for (const asset of BASE_ASSETS) {
    await db.insert(assets).values(asset).onConflictDoNothing()
  }

  const [eur] = await db.select().from(assets).where(eq(assets.code, 'EUR'))
  const [usd] = await db.select().from(assets).where(eq(assets.code, 'USD'))
  const [idr] = await db.select().from(assets).where(eq(assets.code, 'IDR'))

  if (!eur || !usd || !idr) {
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
