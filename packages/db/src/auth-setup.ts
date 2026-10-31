/**
 * Better Auth instance for Finance OS
 *
 * Lives in packages/db to avoid circular deps.
 * Creates its own DB pool so it doesn't depend on the db export from index.ts.
 */

import { createHash } from 'node:crypto'
import { drizzle } from 'drizzle-orm/node-postgres'
import { count, sql } from 'drizzle-orm'
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

/** Reads an invite token from the `x-finance-invite` header or the `fos_invite` cookie. */
export function inviteTokenFrom(headers: Headers | null): string | null {
  if (!headers) return null
  const header = headers.get('x-finance-invite')
  if (header) return header
  const cookie = headers.get('cookie') ?? ''
  const match = cookie.match(/(?:^|;\s*)fos_invite=([A-Za-z0-9_-]{20,100})/)
  return match ? match[1] : null
}

async function hasLiveInvite(headers: Headers | null): Promise<boolean> {
  const token = inviteTokenFrom(headers)
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return false
  const hash = createHash('sha256').update(token).digest('hex')
  // Reserve atomically: one invite link opens registration for exactly one account.
  const result = await authDb.execute(sql`
    UPDATE split_invites SET signup_used_at = now()
    WHERE token_hash = ${hash} AND signup_used_at IS NULL AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
    RETURNING id`)
  return result.rows.length > 0
}

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

  // Better Auth defaults API keys to only 10 requests per 24 hours. MCP uses
  // one verification per protocol request (and another for a tool's loopback
  // REST call), so that default makes a healthy agent key appear invalid after
  // a few discovery/test calls. Keep per-key protection, but use an
  // agent-appropriate limit; /mcp also has a stricter 120 requests/minute IP
  // limit at the HTTP boundary.
  plugins: [apiKey({
    enableMetadata: true,
    rateLimit: {
      enabled: true,
      timeWindow: 60_000,
      maxRequests: 300,
    },
  })],

  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          if (process.env.ALLOW_REGISTRATION === 'true') return { data: user }
          // Someone invited by a friend may always create an account (see split invites).
          if (await hasLiveInvite(context?.headers ?? context?.request?.headers ?? null)) return { data: user }
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
