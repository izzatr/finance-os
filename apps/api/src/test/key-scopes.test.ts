import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function createKey(cookie: string, scope?: 'read' | 'propose' | 'write') {
  const res = await app.request('/auth/api-key/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: `${scope ?? 'legacy'}-key`, ...(scope ? { metadata: { scope } } : {}) }),
  })
  expect(res.status).toBe(200)
  const { key } = (await res.json()) as { key: string }
  return key
}

async function firstAsset(cookie: string) {
  const res = await app.request('/api/assets', { headers: { cookie } })
  const { data } = (await res.json()) as { data: { id: string; code: string }[] }
  return data.find((a) => a.code === 'EUR')!.id
}

describe('api key scopes', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('read keys can GET but not write', async () => {
    const { cookie } = await createTestUser(app)
    const key = await createKey(cookie, 'read')

    const list = await app.request('/api/wallets', { headers: { 'x-api-key': key } })
    expect(list.status).toBe(200)

    const assetId = await firstAsset(cookie)
    const create = await app.request('/api/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ name: 'Blocked', walletType: 'bank', assetId }),
    })
    expect(create.status).toBe(403)
    const body = (await create.json()) as { error: { code: string } }
    expect(body.error.code).toBe('WRITE_SCOPE_REQUIRED')
  })

  it('propose keys cannot write directly', async () => {
    const { cookie } = await createTestUser(app)
    const key = await createKey(cookie, 'propose')
    const assetId = await firstAsset(cookie)

    const create = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        transactionDate: new Date().toISOString(),
        type: 'expense',
        description: 'nope',
        entries: [{ walletId: '00000000-0000-0000-0000-000000000000', assetId, amount: '-1' }],
      }),
    })
    expect(create.status).toBe(403)
  })

  it('keys without scope metadata keep full write access (backward compat)', async () => {
    const { cookie } = await createTestUser(app)
    const key = await createKey(cookie) // no metadata
    const assetId = await firstAsset(cookie)

    const create = await app.request('/api/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ name: 'Allowed', walletType: 'bank', assetId }),
    })
    expect(create.status).toBe(201)
  })

  it('sessions keep full write power regardless', async () => {
    const { cookie } = await createTestUser(app)
    const assetId = await firstAsset(cookie)
    const create = await app.request('/api/wallets', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Human', walletType: 'bank', assetId }),
    })
    expect(create.status).toBe(201)
  })
})
