import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

const send = (cookie: string, path: string, body: unknown, method = 'PATCH') => app.request(path, { method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) })
const read = async (cookie: string, path: string) => (await app.request(path, { headers: { cookie } })).json() as Promise<{ data: any }>

describe('persisted curated icons', () => {
  beforeEach(truncateAll)
  it('persists and resets personal icons without allowing another tenant to edit', async () => {
    const a = await createTestUser(app), b = await createTestUser(app)
    const res = await send(a.cookie, '/api/categories', { name: 'Picnics', icon: 'coffee' }, 'POST')
    expect(res.status).toBe(201)
    const { data } = await res.json() as { data: { id: string; icon: string } }
    expect(data.icon).toBe('coffee')
    expect((await read(a.cookie, '/api/categories')).data[0].icon).toBe('coffee')
    expect((await send(b.cookie, `/api/categories/${data.id}`, { icon: 'plane' })).status).toBe(404)
    expect((await send(a.cookie, `/api/categories/${data.id}`, { icon: '<svg/>' })).status).toBe(400)
    expect((await send(a.cookie, `/api/categories/${data.id}`, { icon: null })).status).toBe(200)
    expect((await read(a.cookie, '/api/categories')).data[0].icon).toBeNull()
  })
  it('persists shared group icons, preserves omitted fields, and blocks outsiders', async () => {
    const a = await createTestUser(app), b = await createTestUser(app)
    const res = await send(a.cookie, '/api/split/groups', { name: 'Picnic crew', icon: 'coffee' }, 'POST')
    expect(res.status).toBe(201)
    const { data } = await res.json() as { data: { id: string } }
    const path = `/api/split/groups/${data.id}`
    expect((await read(a.cookie, path)).data.icon).toBe('coffee')
    expect((await read(a.cookie, '/api/split/groups')).data[0].icon).toBe('coffee')
    expect((await send(b.cookie, path, { icon: 'plane' })).status).toBe(404)
    const guestRes = await send(a.cookie, `${path}/members`, { name: 'Test member' }, 'POST')
    const guest = (await guestRes.json()) as { data: { id: string } }
    const inviteRes = await send(a.cookie, `/api/split/persons/${guest.data.id}/invite`, {}, 'POST')
    const invite = (await inviteRes.json()) as { data: { token: string } }
    expect((await send(b.cookie, `/api/split/invites/${invite.data.token}/claim`, {}, 'POST')).status).toBe(200)
    expect((await read(b.cookie, path)).data.icon).toBe('coffee')
    expect((await send(b.cookie, path, { icon: 'gift' })).status).toBe(200)
    expect((await read(a.cookie, path)).data.icon).toBe('gift')
    await send(a.cookie, path, { icon: 'coffee' })
    expect((await send(a.cookie, path, { icon: 'unknown' })).status).toBe(400)
    await send(a.cookie, path, { name: 'Weekend crew' })
    expect((await read(a.cookie, path)).data.icon).toBe('coffee')
    expect((await send(a.cookie, path, { icon: null })).status).toBe(200)
    expect((await read(a.cookie, path)).data.icon).toBeNull()
  })
  it('shared category overrides affect only the caller and reset to automatic', async () => {
    const a = await createTestUser(app), b = await createTestUser(app)
    const icon = async (cookie: string) => (await read(cookie, '/api/split/me')).data.categories.find((c: any) => c.slug === 'groceries').icon
    expect(await icon(a.cookie)).toBeNull()
    expect((await send(a.cookie, '/api/split/category-icons/groceries', { icon: 'gift' })).status).toBe(200)
    expect(await icon(a.cookie)).toBe('gift')
    expect(await icon(b.cookie)).toBeNull()
    expect((await send(a.cookie, '/api/split/category-icons/unknown', { icon: 'gift' })).status).toBe(404)
    expect((await send(a.cookie, '/api/split/category-icons/groceries', { icon: 'javascript:alert(1)' })).status).toBe(400)
    await send(a.cookie, '/api/split/category-icons/groceries', { icon: null })
    expect(await icon(a.cookie)).toBeNull()
  })
})
