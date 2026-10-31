import { beforeEach, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

const url = process.env.DATABASE_URL!
const SETTINGS = '/api/settings/currencies'

const patch = (cookie: string, body: unknown, path = SETTINGS) =>
  app.request(path, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const get = async (cookie: string, path = SETTINGS) => {
  const res = await app.request(path, { headers: { cookie } })
  return { status: res.status, body: (await res.json()) as { data: any; error?: any } }
}
async function count(sql: string, params: unknown[] = []): Promise<number> {
  const pool = new Pool({ connectionString: url })
  try { return Number((await pool.query(sql, params)).rows[0].n) } finally { await pool.end() }
}
async function signIn(email: string): Promise<string> {
  const res = await app.request('/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.9.9' },
    body: JSON.stringify({ email, password: 'test-password-123' }),
  })
  expect(res.status).toBe(200)
  return res.headers.get('set-cookie')!.split(';')[0]
}

describe('account currency settings', () => {
  beforeEach(truncateAll)

  it('requires authentication', async () => {
    expect((await app.request(SETTINGS)).status).toBe(401)
    expect((await app.request('/api/currencies')).status).toBe(401)
  })

  it('starts as an EUR fallback and a read never creates shared-expense or wallet rows', async () => {
    const u = await createTestUser(app)
    const { body } = await get(u.cookie)
    expect(body.data).toEqual({ defaultCurrency: 'EUR', defaultIsExplicit: false, preferredCurrencies: [], updatedAt: null })
    expect(await count('select count(*) n from split_persons')).toBe(0)
    expect(await count('select count(*) n from split_user_settings')).toBe(0)
    expect(await count('select count(*) n from user_currency_settings')).toBe(0)
  })

  it('lets an account with zero wallets pick any supported default, persisted across sessions', async () => {
    const u = await createTestUser(app)
    expect(await count('select count(*) n from wallets')).toBe(0)
    const res = await patch(u.cookie, { defaultCurrency: 'nok' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).data).toMatchObject({ defaultCurrency: 'NOK', defaultIsExplicit: true })
    // A second device signs in independently and reads the same account value.
    const otherDevice = await signIn(u.email)
    expect(otherDevice).not.toBe(u.cookie)
    expect((await get(otherDevice)).body.data.defaultCurrency).toBe('NOK')
    // Nothing else was created for the user: no wallets, transactions, split person.
    for (const t of ['wallets', 'transactions', 'split_persons']) expect(await count(`select count(*) n from ${t}`)).toBe(0)
    // The currency itself exists as a global reference asset, ready for an optional wallet.
    expect(await count("select count(*) n from assets where code = 'NOK' and type = 'currency'")).toBe(1)
  })

  it('rejects unsupported, non-currency and malformed defaults without changing anything', async () => {
    const u = await createTestUser(app)
    await patch(u.cookie, { defaultCurrency: 'USD' })
    for (const bad of ['XDR', 'ZZZ', 'XAU_G']) {
      const res = await patch(u.cookie, { defaultCurrency: bad })
      expect([400, 422]).toContain(res.status)
    }
    expect((await patch(u.cookie, { defaultCurrency: 'ZZZ' })).status).toBe(422)
    expect((await patch(u.cookie, { defaultCurrency: 'XDR' })).status).toBe(422)
    expect((await patch(u.cookie, { defaultCurrency: 'US' })).status).toBe(400)
    expect((await get(u.cookie)).body.data.defaultCurrency).toBe('USD')
  })

  it('stores preferred currencies de-duplicated, upper-cased and in order', async () => {
    const u = await createTestUser(app)
    const res = await patch(u.cookie, { preferredCurrencies: ['idr', 'USD', 'IDR', 'jpy', 'usd'] })
    expect(res.status).toBe(200)
    expect(((await res.json()) as any).data.preferredCurrencies).toEqual(['IDR', 'USD', 'JPY'])
    // Preferred-only change leaves the default alone and does not make EUR "explicit".
    expect((await get(u.cookie)).body.data).toMatchObject({ defaultCurrency: 'EUR', defaultIsExplicit: false, preferredCurrencies: ['IDR', 'USD', 'JPY'] })
    // Removing and clearing works.
    expect(((await (await patch(u.cookie, { preferredCurrencies: ['USD'] })).json()) as any).data.preferredCurrencies).toEqual(['USD'])
    expect(((await (await patch(u.cookie, { preferredCurrencies: [] })).json()) as any).data.preferredCurrencies).toEqual([])
  })

  it('validates preferred list atomically and bounds it after de-duplication', async () => {
    const u = await createTestUser(app)
    await patch(u.cookie, { defaultCurrency: 'GBP', preferredCurrencies: ['USD'] })
    const bad = await patch(u.cookie, { defaultCurrency: 'JPY', preferredCurrencies: ['EUR', 'ZZZ'] })
    expect(bad.status).toBe(422)
    // Neither field was applied.
    expect((await get(u.cookie)).body.data).toMatchObject({ defaultCurrency: 'GBP', preferredCurrencies: ['USD'] })

    const codes = (await get(u.cookie, '/api/currencies')).body.data.map((c: any) => c.code) as string[]
    const many = codes.slice(0, 21)
    expect((await patch(u.cookie, { preferredCurrencies: many })).status).toBe(422)
    // 20 distinct codes repeated is fine once de-duplicated.
    const twenty = codes.slice(0, 20)
    expect((await patch(u.cookie, { preferredCurrencies: [...twenty, ...twenty.slice(0, 10)] })).status).toBe(200)
    expect((await get(u.cookie)).body.data.preferredCurrencies).toEqual(twenty)
    // The transport bound rejects absurd payloads before any work.
    expect((await patch(u.cookie, { preferredCurrencies: Array(101).fill('USD') })).status).toBe(400)
    expect((await patch(u.cookie, { preferredCurrencies: 'USD' })).status).toBe(400)
  })

  it('keeps settings private per account', async () => {
    const a = await createTestUser(app), b = await createTestUser(app)
    await patch(a.cookie, { defaultCurrency: 'IDR', preferredCurrencies: ['USD', 'SGD'] })
    expect((await get(b.cookie)).body.data).toMatchObject({ defaultCurrency: 'EUR', defaultIsExplicit: false, preferredCurrencies: [] })
    await patch(b.cookie, { defaultCurrency: 'CHF' })
    expect((await get(a.cookie)).body.data).toMatchObject({ defaultCurrency: 'IDR', preferredCurrencies: ['USD', 'SGD'] })
    // Another user's id cannot be addressed at all: the API takes no user parameter.
    expect((await patch(a.cookie, { defaultCurrency: 'AUD', userId: b.userId })).status).toBe(200)
    expect((await get(b.cookie)).body.data.defaultCurrency).toBe('CHF')
  })

  it('blocks read and propose scoped keys from writing but lets them read', async () => {
    const u = await createTestUser(app)
    await patch(u.cookie, { defaultCurrency: 'USD' })
    for (const scope of ['read', 'propose'] as const) {
      const created = await app.request('/auth/api-key/create', {
        method: 'POST', headers: { 'content-type': 'application/json', cookie: u.cookie },
        body: JSON.stringify({ name: `${scope}-key`, metadata: { scope } }),
      })
      const { key } = (await created.json()) as { key: string }
      const read = await app.request(SETTINGS, { headers: { 'x-api-key': key } })
      expect(read.status).toBe(200)
      const write = await app.request(SETTINGS, { method: 'PATCH', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ defaultCurrency: 'JPY' }) })
      expect(write.status).toBe(403)
      const asset = await app.request('/api/assets/currency', { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'SEK' }) })
      expect(asset.status).toBe(403)
    }
    expect((await get(u.cookie)).body.data.defaultCurrency).toBe('USD')
  })

  it('unifies with the shared-expenses default instead of keeping two', async () => {
    const u = await createTestUser(app)
    // Shared PATCH writes the account setting...
    expect((await patch(u.cookie, { defaultCurrency: 'GBP' }, '/api/split/me')).status).toBe(200)
    expect((await get(u.cookie)).body.data).toMatchObject({ defaultCurrency: 'GBP', defaultIsExplicit: true })
    // ...and the account setting is what Shared reads back.
    await patch(u.cookie, { defaultCurrency: 'CHF' })
    expect((await get(u.cookie, '/api/split/me')).body.data.defaultCurrency).toBe('CHF')
    expect((await patch(u.cookie, { defaultCurrency: 'ZZZ' }, '/api/split/me')).status).toBe(422)
  })

  it('honours a pre-existing shared-expenses default as the account default', async () => {
    const legacy = await createTestUser(app), untouched = await createTestUser(app)
    // Both users already have shared-expense settings from before this feature; one chose USD.
    await get(legacy.cookie, '/api/split/me'); await get(untouched.cookie, '/api/split/me')
    const pool = new Pool({ connectionString: url })
    await pool.query("update split_user_settings set default_currency = 'USD' where user_id = $1", [legacy.userId])
    await pool.end()
    expect((await get(legacy.cookie)).body.data).toMatchObject({ defaultCurrency: 'USD', defaultIsExplicit: true })
    expect((await get(legacy.cookie, '/api/split/me')).body.data.defaultCurrency).toBe('USD')
    // Never chosen: the EUR column default is not treated as a deliberate choice.
    expect((await get(untouched.cookie)).body.data).toMatchObject({ defaultCurrency: 'EUR', defaultIsExplicit: false })
    // Saving preferred currencies must not erase the inherited default.
    await patch(legacy.cookie, { preferredCurrencies: ['EUR'] })
    expect((await get(legacy.cookie)).body.data).toMatchObject({ defaultCurrency: 'USD', preferredCurrencies: ['EUR'] })
  })

  it('serves a catalog consistent with backend validation and asset precision', async () => {
    const u = await createTestUser(app)
    const { body } = await get(u.cookie, '/api/currencies')
    const byCode = new Map<string, any>(body.data.map((c: any) => [c.code, c]))
    expect(byCode.get('EUR')).toMatchObject({ name: 'Euro', precision: 2 })
    expect(byCode.get('JPY').precision).toBe(0)
    expect(byCode.get('KWD').precision).toBe(3)
    // Stored asset precision wins where an asset exists (the wallet minor-unit scale).
    const pool = new Pool({ connectionString: url })
    const stored = (await pool.query("select precision from assets where code = 'IDR'")).rows[0]?.precision
    await pool.end()
    expect(byCode.get('IDR').precision).toBe(stored)
    expect(byCode.has('XDR')).toBe(false)
    expect(byCode.has('XAU_G')).toBe(false)
    // Everything offered is accepted by the setting endpoint.
    for (const code of ['EUR', 'ZWG', 'TND']) expect((await patch(u.cookie, { defaultCurrency: code })).status).toBe(200)
  })

  it('creates a currency asset on demand without wallets and rejects arbitrary codes', async () => {
    const u = await createTestUser(app)
    const post = (code: string) => app.request('/api/assets/currency', { method: 'POST', headers: { cookie: u.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ code }) })
    const first = (await (await post('sek')).json()) as any
    const second = (await (await post('SEK')).json()) as any
    expect(first.data.code).toBe('SEK')
    expect(second.data.id).toBe(first.data.id)
    expect((await post('ABC')).status).toBe(422)
    expect(await count("select count(*) n from assets where code in ('SEK','ABC')")).toBe(1)
    expect(await count('select count(*) n from wallets')).toBe(0)
  })

  it('enforces shape in the database and cascades with the user', async () => {
    const u = await createTestUser(app)
    await patch(u.cookie, { defaultCurrency: 'USD', preferredCurrencies: ['EUR'] })
    const pool = new Pool({ connectionString: url })
    try {
      await expect(pool.query("update user_currency_settings set default_currency = 'usd' where user_id = $1", [u.userId])).rejects.toMatchObject({ code: '23514' })
      await expect(pool.query("update user_currency_settings set preferred_currencies = '{EUR,bad}' where user_id = $1", [u.userId])).rejects.toMatchObject({ code: '23514' })
      const many = Array.from({ length: 21 }, (_, i) => `A${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`)
      await expect(pool.query('update user_currency_settings set preferred_currencies = $2 where user_id = $1', [u.userId, many])).rejects.toMatchObject({ code: '23514' })
      await pool.query('delete from users where id = $1', [u.userId])
      expect((await pool.query('select count(*)::int n from user_currency_settings')).rows[0].n).toBe(0)
    } finally { await pool.end() }
  })
})
