/**
 * Better Auth instance for Finance OS
 *
 * Lives in packages/db to avoid circular deps.
 * Creates its own DB pool so it doesn't depend on the db export from index.ts.
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { apiKey } from '@better-auth/api-key'
import { users, sessions, accounts, verifications, apiKeys } from './auth-schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:***@localhost:27033/finance_os'
const authPool = new Pool({ connectionString })
const authDb = drizzle(authPool)

export const auth = betterAuth({
  basePath: '/auth',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:27032',
  database: drizzleAdapter(authDb, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      apikey: apiKeys,
    },
  }),

  trustedOrigins: [
    process.env.WEB_ORIGIN ?? 'http://localhost:27031',
    'http://localhost:5173',
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,         // update every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  plugins: [apiKey()],
})

export type Session = typeof auth.$Infer.Session
