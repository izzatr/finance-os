import 'dotenv/config'

import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required to run migrations')

const pool = new Pool({ connectionString })
try {
  const db = drizzle(pool)
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  await migrate(db, { migrationsFolder })
  console.log('Database migrations applied successfully.')
} finally {
  await pool.end()
}
