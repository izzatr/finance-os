import { describe, expect, it } from 'vitest'
import app from '../app'

describe('openapi document', () => {
  it('exposes the full route inventory', async () => {
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    const doc = (await res.json()) as { paths: Record<string, Record<string, unknown>> }
    const operations = Object.entries(doc.paths).flatMap(([p, methods]) =>
      Object.keys(methods).map((m) => `${m.toUpperCase()} ${p}`),
    )
    expect(operations.sort()).toMatchSnapshot()
  })
})
