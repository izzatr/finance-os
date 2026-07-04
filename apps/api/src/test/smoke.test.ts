import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

describe('smoke', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('GET /health returns ok without auth', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('sign-up returns a session and /api/wallets works with it', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/wallets', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: unknown[] }
    expect(body.data).toEqual([])
  })
})
