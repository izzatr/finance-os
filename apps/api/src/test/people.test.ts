import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function createPerson(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/people', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

describe('people directory', () => {
  beforeEach(async () => await truncateAll())

  it('creates a person and returns it in the list', async () => {
    const { cookie } = await createTestUser(app)
    const res = await createPerson(cookie, { name: 'Alex', email: 'alex@example.com', notes: 'roommate' })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: string; name: string; email: string | null; notes: string | null } }
    expect(data).toMatchObject({ name: 'Alex', email: 'alex@example.com', notes: 'roommate' })

    const list = (await (await app.request('/api/people', { headers: { cookie } })).json()) as {
      data: { name: string }[]
    }
    expect(list.data).toHaveLength(1)
    expect(list.data[0]).toMatchObject({ name: 'Alex' })
  })

  it('list excludes soft-deleted people', async () => {
    const { cookie } = await createTestUser(app)
    const created = (await (await createPerson(cookie, { name: 'Bailey' })).json()) as { data: { id: string } }
    await app.request(`/api/people/${created.data.id}`, { method: 'DELETE', headers: { cookie } })
    const list = (await (await app.request('/api/people', { headers: { cookie } })).json()) as { data: unknown[] }
    expect(list.data).toEqual([])
  })

  it("cannot read or update another user's person (404)", async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const person = (await (await createPerson(alice.cookie, { name: 'Casey' })).json()) as { data: { id: string } }

    const getRes = await app.request(`/api/people/${person.data.id}/balance`, { headers: { cookie: bob.cookie } })
    expect(getRes.status).toBe(404)

    const patchRes = await app.request(`/api/people/${person.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: bob.cookie },
      body: JSON.stringify({ name: 'Hacked' }),
    })
    expect(patchRes.status).toBe(404)

    const deleteRes = await app.request(`/api/people/${person.data.id}`, {
      method: 'DELETE',
      headers: { cookie: bob.cookie },
    })
    expect(deleteRes.status).toBe(404)
  })

  it('rejects a duplicate person name for the same user with a 4xx', async () => {
    const { cookie } = await createTestUser(app)
    const first = await createPerson(cookie, { name: 'Dana' })
    expect(first.status).toBe(201)
    const second = await createPerson(cookie, { name: 'Dana' })
    expect(second.status).toBeGreaterThanOrEqual(400)
    expect(second.status).toBeLessThan(500)
    const body = (await second.json()) as { error: { code: string; message: string } }
    expect(body.error).toBeDefined()
    expect(typeof body.error.code).toBe('string')
  })

  it('allows the same person name across different users', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const first = await createPerson(alice.cookie, { name: 'Erin' })
    const second = await createPerson(bob.cookie, { name: 'Erin' })
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })

  it('updates a person', async () => {
    const { cookie } = await createTestUser(app)
    const created = (await (await createPerson(cookie, { name: 'Finley' })).json()) as { data: { id: string } }
    const res = await app.request(`/api/people/${created.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ email: 'finley@example.com' }),
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { email: string | null } }
    expect(data.email).toBe('finley@example.com')
  })

  it('soft deletes a person', async () => {
    const { cookie } = await createTestUser(app)
    const created = (await (await createPerson(cookie, { name: 'Gray' })).json()) as { data: { id: string } }
    const res = await app.request(`/api/people/${created.data.id}`, { method: 'DELETE', headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { id: string; deletedAt: string } }
    expect(data.id).toBe(created.data.id)
    expect(data.deletedAt).toBeTruthy()
  })

  it('returns 404 for a nonexistent person id', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/people/00000000-0000-0000-0000-000000000000/balance', { headers: { cookie } })
    expect(res.status).toBe(404)
  })

  it('balance returns an empty array when there are no splits', async () => {
    const { cookie } = await createTestUser(app)
    const created = (await (await createPerson(cookie, { name: 'Harper' })).json()) as { data: { id: string } }
    const res = await app.request(`/api/people/${created.data.id}/balance`, { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { personId: string; balances: unknown[] } }
    expect(data.personId).toBe(created.data.id)
    expect(data.balances).toEqual([])
  })

  it('shared-balances returns an empty array when no person has unsettled splits', async () => {
    const { cookie } = await createTestUser(app)
    await createPerson(cookie, { name: 'Ivy' })
    const res = await app.request('/api/analytics/shared-balances', { headers: { cookie } })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: unknown[] }
    expect(data).toEqual([])
  })
})
