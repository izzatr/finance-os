import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, categories } from '@finance-os/db'
import { eq } from 'drizzle-orm'

export function registerCategoryRoutes(app: OpenAPIHono) {
  const listCategoriesRoute = createRoute({
    method: 'get',
    path: '/api/categories',
    tags: ['categories'],
    responses: {
      200: {
        description: 'List all categories',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(z.object({
                id: z.string().uuid(),
                name: z.string(),
                slug: z.string(),
              })),
            }),
          },
        },
      },
    },
  })

  const createCategoryRoute = createRoute({
    method: 'post',
    path: '/api/categories',
    tags: ['categories'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ name: z.string().min(1).max(120) }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Created category',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() }) }),
          },
        },
      },
    },
  })

  const patchCategoryRoute = createRoute({
    method: 'patch',
    path: '/api/categories/{id}',
    tags: ['categories'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({ name: z.string().min(1).max(120).optional() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated category',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), name: z.string(), slug: z.string() }) }),
          },
        },
      },
      404: {
        description: 'Category not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  app.openapi(listCategoriesRoute, async (c) => {
    const rows = await db.select().from(categories).orderBy(categories.name)
    return c.json({ data: rows }, 200)
  })

  app.openapi(createCategoryRoute, async (c) => {
    const { name } = c.req.valid('json')
    const slug = name.toLowerCase().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    const [row] = await db.insert(categories).values({ name, slug }).onConflictDoNothing().returning()

    if (row) {
      return c.json({ data: { id: row.id, name: row.name, slug: row.slug } }, 201)
    }

    // Conflict — return existing
    const [existing] = await db.select().from(categories).where(eq(categories.slug, slug))
    return c.json({ data: { id: existing.id, name: existing.name, slug: existing.slug } }, 201)
  })

  app.openapi(patchCategoryRoute, async (c) => {
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    if (!payload.name) {
      return c.json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } }, 404)
    }

    const slug = payload.name.toLowerCase().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const [row] = await db.update(categories).set({ name: payload.name, slug }).where(eq(categories.id, id)).returning()

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404)
    }

    return c.json({ data: { id: row.id, name: row.name, slug: row.slug } }, 200)
  })
}
