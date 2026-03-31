import 'dotenv/config'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export * from './schema'
export * from './auth-setup'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:***@localhost:27033/finance_os'

export const pool = new Pool({ connectionString })
export const db = drizzle(pool)
