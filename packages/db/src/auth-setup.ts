/**
 * Better Auth instance for Finance OS
 *
 * Lives in packages/db to avoid circular deps.
 * Creates its own DB pool so it doesn't depend on the db export from index.ts.
 */

import { drizzle } from 'drizzle-orm/node-postgres'
import { count } from 'drizzle-orm'
import { Pool } from 'pg'
import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { apiKey } from '@better-auth/api-key'
import { users, sessions, accounts, verifications, apiKeys } from './auth-schema'

const connectionString = process.env.DATABASE_URL ?? 'postgres://finance:***@localhost:27033/finance_os'
const authPool = new Pool({ connectionString })
const authDb = drizzle(authPool)

function optionalSocialProvider(name: string, clientId?: string, clientSecret?: string) {
  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(`${name} OAuth requires both client ID and client secret`)
  }
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

const githubProvider = optionalSocialProvider('GitHub', process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)
const googleProvider = optionalSocialProvider('Google', process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:27031'
const trustedOrigins = process.env.NODE_ENV === 'production'
  ? [webOrigin]
  : [webOrigin, 'http://localhost:5173']

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

  trustedOrigins,

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
    ...(githubProvider ? { github: githubProvider } : {}),
    ...(googleProvider ? { google: googleProvider } : {}),
  },

  // enableMetadata: API keys carry {scope: 'read'|'propose'|'write'} in metadata
  plugins: [apiKey({ enableMetadata: true })],

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (process.env.ALLOW_REGISTRATION === 'true') return { data: user }
          const [{ value }] = await authDb.select({ value: count() }).from(users)
          if (value > 0) {
            throw new APIError('FORBIDDEN', {
              message: 'Registration is disabled on this instance',
            })
          }
          return { data: user }
        },
      },
    },
  },
})

export type Session = typeof auth.$Infer.Session
