import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { rateLimit } from './rate-limit'

function appWith(max: number) {
  const app = new Hono()
  app.use('/limited/*', rateLimit({ windowMs: 60_000, max, keyPrefix: 'test' + Math.random() }))
  app.get('/limited/x', (c) => c.json({ ok: true }))
  return app
}

describe('rateLimit', () => {
  it('allows up to max requests then returns 429', async () => {
    const app = appWith(3)
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/limited/x', { headers: { 'x-forwarded-for': '1.2.3.4' } })
      expect(res.status).toBe(200)
    }
    const res = await app.request('/limited/x', { headers: { 'x-forwarded-for': '1.2.3.4' } })
    expect(res.status).toBe(429)
  })

  it('tracks IPs independently', async () => {
    const app = appWith(1)
    await app.request('/limited/x', { headers: { 'x-forwarded-for': '1.1.1.1' } })
    const res = await app.request('/limited/x', { headers: { 'x-forwarded-for': '2.2.2.2' } })
    expect(res.status).toBe(200)
  })
})
