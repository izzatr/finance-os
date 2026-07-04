import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

describe('auth', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('rejects unauthenticated /api requests with 401', async () => {
    const res = await app.request('/api/wallets')
    expect(res.status).toBe(401)
  })

  it('rejects an invalid API key with 401', async () => {
    const res = await app.request('/api/wallets', {
      headers: { 'x-api-key': 'not-a-real-key' },
    })
    expect(res.status).toBe(401)
  })

  it('accepts a valid API key', async () => {
    const { cookie } = await createTestUser(app)
    // create an API key through the plugin endpoint
    const createRes = await app.request('/auth/api-key/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'test-key' }),
    })
    expect(createRes.status).toBe(200)
    const { key } = (await createRes.json()) as { key: string }
    const res = await app.request('/api/wallets', { headers: { 'x-api-key': key } })
    expect(res.status).toBe(200)
  })

  it('accepts Bearer token form', async () => {
    const { cookie } = await createTestUser(app)
    const createRes = await app.request('/auth/api-key/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'bearer-key' }),
    })
    const { key } = (await createRes.json()) as { key: string }
    const res = await app.request('/api/wallets', {
      headers: { authorization: `Bearer ${key}` },
    })
    expect(res.status).toBe(200)
  })
})
