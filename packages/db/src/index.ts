import 'dotenv/config'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export * from './schema'
export * from './auth-schema'
export * from './auth-setup'
export * from './billing-schema'
export * from './audit-schema'
export * from './entitlements'
export { seedBase } from './seed-base'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:***@localhost:27033/finance_os'

export const pool = new Pool({ connectionString })
export const db = drizzle(pool)
