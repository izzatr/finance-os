import { beforeEach, describe, expect, it } from 'vitest'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

async function createCategory(cookie: string, body: Record<string, unknown>) {
  return app.request('/api/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

describe('categories with types and hierarchy', () => {
  beforeEach(async () => await truncateAll())

  it('creates a category with a type and returns it in list', async () => {
    const { cookie } = await createTestUser(app)
    const res = await createCategory(cookie, { name: 'Salary', type: 'income' })
    expect(res.status).toBe(201)
    const { data } = (await res.json()) as { data: { id: string; type: string; parentId: string | null } }
    expect(data.type).toBe('income')
    expect(data.parentId).toBeNull()
    const list = (await (await app.request('/api/categories', { headers: { cookie } })).json()) as {
      data: { name: string; type: string }[]
    }
    expect(list.data[0]).toMatchObject({ name: 'Salary', type: 'income' })
  })

  it('defaults type to expense', async () => {
    const { cookie } = await createTestUser(app)
    const { data } = (await (await createCategory(cookie, { name: 'Misc' })).json()) as { data: { type: string } }
    expect(data.type).toBe('expense')
  })

  it('nests one level and rejects deeper nesting', async () => {
    const { cookie } = await createTestUser(app)
    const parent = (await (await createCategory(cookie, { name: 'Food', type: 'expense' })).json()) as { data: { id: string } }
    const child = await createCategory(cookie, { name: 'Café', type: 'expense', parentId: parent.data.id })
    expect(child.status).toBe(201)
    const childId = ((await child.json()) as { data: { id: string } }).data.id
    const grandchild = await createCategory(cookie, { name: 'Espresso', type: 'expense', parentId: childId })
    expect(grandchild.status).toBe(400)
  })

  it('rejects a parent of a different type or another user', async () => {
    const alice = await createTestUser(app)
    const bob = await createTestUser(app)
    const aliceParent = (await (await createCategory(alice.cookie, { name: 'Income Src', type: 'income' })).json()) as { data: { id: string } }
    // different type
    const wrongType = await createCategory(alice.cookie, { name: 'Rent', type: 'expense', parentId: aliceParent.data.id })
    expect(wrongType.status).toBe(400)
    // cross-user parent
    const crossUser = await createCategory(bob.cookie, { name: 'X', type: 'income', parentId: aliceParent.data.id })
    expect(crossUser.status).toBe(404)
  })

  it('patch clears needsReview', async () => {
    const { cookie, userId } = await createTestUser(app)
    const cat = (await (await createCategory(cookie, { name: 'Odd' })).json()) as { data: { id: string } }
    // simulate migration-flagged row
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: process.env.DATABASE_URL })
    await pool.query('UPDATE categories SET needs_review = true WHERE id = $1', [cat.data.id])
    await pool.end()
    const res = await app.request(`/api/categories/${cat.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'income' }),
    })
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { type: string; needsReview: boolean } }
    expect(data).toMatchObject({ type: 'income', needsReview: false })
  })
})
