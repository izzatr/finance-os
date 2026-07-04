import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function signUp(email: string) {
  return app.request('/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password-123', name: 'X' }),
  })
}

describe('registration lock', () => {
  beforeEach(async () => {
    await truncateAll()
    delete process.env.ALLOW_REGISTRATION
  })
  afterEach(() => {
    delete process.env.ALLOW_REGISTRATION
  })

  it('allows the first sign-up', async () => {
    const res = await signUp('first@test.local')
    expect(res.status).toBe(200)
  })

  it('rejects the second sign-up', async () => {
    await createTestUser(app)
    const res = await signUp('second@test.local')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('allows more sign-ups when ALLOW_REGISTRATION=true', async () => {
    await createTestUser(app)
    process.env.ALLOW_REGISTRATION = 'true'
    const res = await signUp('third@test.local')
    expect(res.status).toBe(200)
  })
})
