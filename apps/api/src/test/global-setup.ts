import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import path from 'node:path'

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'

export default async function setup() {
  // Create the test database if it doesn't exist (connect to the default DB first)
  const adminUrl = new URL(TEST_DATABASE_URL)
  const dbName = adminUrl.pathname.slice(1)
  adminUrl.pathname = '/postgres'
  const admin = new Pool({ connectionString: adminUrl.toString() })
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`)
  }
  await admin.end()

  // Run migrations
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  const db = drizzle(pool)
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../../../packages/db/drizzle'),
  })

  // Seed base assets (shared reference data; idempotent, survives truncateAll).
  // Kept as inline SQL (rather than importing seedBase() from @finance-os/db)
  // because seedBase() reads process.env.DATABASE_URL at module-import time,
  // which is NOT set to TEST_DATABASE_URL in this globalSetup process (Vitest's
  // `test.env` config only applies inside the test/runner context, not here) —
  // importing it as-is would silently seed the real dev database instead.
  // Keep this list in sync with BASE_ASSETS in packages/db/src/seed-base.ts.
  await pool.query(`
    INSERT INTO assets (code, name, type, precision, unit) VALUES
      ('EUR', 'Euro', 'currency', 2, NULL),
      ('USD', 'US Dollar', 'currency', 2, NULL),
      ('IDR', 'Indonesian Rupiah', 'currency', 2, NULL),
      ('GBP', 'British Pound', 'currency', 2, NULL),
      ('JPY', 'Japanese Yen', 'currency', 0, NULL),
      ('CHF', 'Swiss Franc', 'currency', 2, NULL),
      ('SGD', 'Singapore Dollar', 'currency', 2, NULL),
      ('AUD', 'Australian Dollar', 'currency', 2, NULL),
      ('CAD', 'Canadian Dollar', 'currency', 2, NULL),
      ('XAU_G', 'Gold (grams)', 'commodity', 4, 'g')
    ON CONFLICT (code) DO NOTHING
  `)

  await pool.end()
}
