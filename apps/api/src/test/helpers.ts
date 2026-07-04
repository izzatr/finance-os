import { Pool } from 'pg'
import type { OpenAPIHono } from '@hono/zod-openapi'

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'

let counter = 0

/** Sign up a fresh user through the real Better Auth endpoint; return its session cookie. */
export async function createTestUser(app: OpenAPIHono): Promise<{ cookie: string; userId: string; email: string }> {
  counter += 1
  const email = `user${counter}-${Date.now()}@test.local`
  const prev = process.env.ALLOW_REGISTRATION
  process.env.ALLOW_REGISTRATION = 'true'
  let res: Response
  try {
    res = await app.request('/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'test-password-123', name: `Test User ${counter}` }),
    })
  } finally {
    if (prev === undefined) delete process.env.ALLOW_REGISTRATION
    else process.env.ALLOW_REGISTRATION = prev
  }
  if (res.status !== 200) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`)
  }
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) throw new Error('sign-up returned no session cookie')
  const cookie = setCookie.split(';')[0]
  const body = (await res.json()) as { user: { id: string } }
  return { cookie, userId: body.user.id, email }
}

/** Wipe all data between tests (order respects FKs; auth tables cascade). */
export async function truncateAll(): Promise<void> {
  // Safety guard: never truncate anything but a *_test database. The real
  // finance_os DB lives on the same Postgres instance, differentiated only by
  // name — if this helper is ever imported outside the vitest harness (where
  // DATABASE_URL points at the real DB), refuse to run.
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1)
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to truncate non-test database: ${dbName}`)
  }
  const pool = new Pool({ connectionString: TEST_DATABASE_URL })
  await pool.query(`
    TRUNCATE TABLE
      transaction_entries, transactions, wallets, categories, statement_imports,
      audit_logs, subscriptions, billing_customers,
      api_keys, sessions, accounts, verifications, users
    CASCADE
  `)
  await pool.end()
}
