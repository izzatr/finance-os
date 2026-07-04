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
  await pool.end()
}
