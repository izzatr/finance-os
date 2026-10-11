import { Pool } from 'pg'
import { expect } from 'vitest'
import type { OpenAPIHono } from '@hono/zod-openapi'

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://finance:finance@localhost:27033/finance_os_test'
let pool: Pool | null = null
export function testPool(): Pool {
  pool ??= new Pool({ connectionString: TEST_DATABASE_URL, max: 4 })
  return pool
}

export type Session = { cookie: string; userId: string; email: string }

export function api(app: OpenAPIHono, s: Session | null) {
  const call = async (method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(s ? { cookie: s.cookie } : {}), ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { status: res.status, body: json, headers: res.headers }
  }
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b?: unknown, h?: Record<string, string>) => call('POST', p, b ?? {}, h),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b),
    del: (p: string) => call('DELETE', p),
  }
}

export async function me(app: OpenAPIHono, s: Session) {
  const r = await api(app, s).get('/api/split/me')
  expect(r.status).toBe(200)
  return r.body.data as { personId: string; balances: { owedToMe: any[]; iOwe: any[]; net: Array<{ currency: string; amount: string }> } }
}

export async function addGuest(app: OpenAPIHono, s: Session, name: string): Promise<string> {
  const r = await api(app, s).post('/api/split/friends', { name })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.data.id
}

export async function assetId(app: OpenAPIHono, s: Session, code: string): Promise<string> {
  const r = await api(app, s).get('/api/assets')
  const found = (r.body.data as Array<{ id: string; code: string }>).find((a) => a.code === code)
  if (!found) throw new Error(`asset ${code} missing`)
  return found.id
}

export async function wallet(app: OpenAPIHono, s: Session, name: string, code = 'EUR'): Promise<string> {
  const r = await api(app, s).post('/api/wallets', { name, walletType: 'bank', assetId: await assetId(app, s, code) })
  expect(r.status).toBe(201)
  return r.body.data.id
}

export async function walletsOf(app: OpenAPIHono, s: Session) {
  const r = await api(app, s).get('/api/wallets')
  expect(r.status).toBe(200)
  return (r.body.data as Array<{ id: string; name: string; balance: number | string; currency: string; systemRole: string | null }>)
    .map((w) => ({ ...w, balance: Number(w.balance) }))
}

export async function friendsWalletBalance(app: OpenAPIHono, s: Session, code: string): Promise<number> {
  const w = (await walletsOf(app, s)).find((x) => x.systemRole === 'split' && x.currency === code)
  return w ? Number(w.balance) : 0
}

/**
 * The core accounting invariant: every user's Friends wallet equals sum(paid - owed) over their
 * live shares, per currency; and every live expense's debts add up to each person's net.
 */
export async function assertInvariants() {
  const p = testPool()
  const wallets = await p.query(`
    SELECT s.user_id, a.code,
      coalesce((SELECT sum(e.amount) FROM transaction_entries e JOIN transactions t ON t.id = e.transaction_id
        WHERE e.wallet_id = w.id AND t.deleted_at IS NULL), 0) AS wallet_balance,
      coalesce((SELECT sum(sh.paid_share - sh.owed_share) FROM split_expense_shares sh JOIN split_expenses x ON x.id = sh.expense_id
        WHERE sh.person_id = s.person_id AND x.asset_id = w.asset_id AND x.deleted_at IS NULL), 0) AS ledger
    FROM split_user_settings s
    JOIN wallets w ON w.user_id = s.user_id AND w.system_role = 'split' AND w.deleted_at IS NULL
    JOIN assets a ON a.id = w.asset_id`)
  for (const row of wallets.rows) {
    expect(Number(row.wallet_balance), `Friends wallet ${row.code} of ${row.user_id}`).toBeCloseTo(Number(row.ledger), 6)
  }
  // Users with a ledger balance must have the wallet to hold it.
  const missing = await p.query(`
    SELECT s.user_id, x.asset_id, sum(sh.paid_share - sh.owed_share) AS net
    FROM split_user_settings s
    JOIN split_expense_shares sh ON sh.person_id = s.person_id
    JOIN split_expenses x ON x.id = sh.expense_id AND x.deleted_at IS NULL
    WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.user_id = s.user_id AND w.asset_id = x.asset_id AND w.system_role = 'split' AND w.deleted_at IS NULL)
    GROUP BY s.user_id, x.asset_id HAVING sum(sh.paid_share - sh.owed_share) <> 0`)
  expect(missing.rows).toEqual([])
  const debts = await p.query(`
    SELECT sh.expense_id, sh.person_id, sh.paid_share - sh.owed_share AS net,
      coalesce((SELECT sum(amount) FROM split_expense_debts d WHERE d.expense_id = sh.expense_id AND d.to_person_id = sh.person_id), 0)
      - coalesce((SELECT sum(amount) FROM split_expense_debts d WHERE d.expense_id = sh.expense_id AND d.from_person_id = sh.person_id), 0) AS debt_net
    FROM split_expense_shares sh JOIN split_expenses x ON x.id = sh.expense_id AND x.deleted_at IS NULL`)
  for (const row of debts.rows) expect(Number(row.debt_net)).toBeCloseTo(Number(row.net), 6)
}
