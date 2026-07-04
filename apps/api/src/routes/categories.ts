import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, categories } from '@finance-os/db'
import { and, eq } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'

const categoryTypeValues = ['income', 'expense', 'transfer'] as const

const categoryShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  type: z.enum(categoryTypeValues),
  parentId: z.string().uuid().nullable(),
  needsReview: z.boolean(),
})

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

function toResponseShape(row: typeof categories.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
    parentId: row.parentId,
    needsReview: row.needsReview,
  }
}

/** Validates a candidate parent category: must exist, belong to this user, not itself be
 * nested (one level of hierarchy max), and match the child's type. */
async function validateParent(userId: string, parentId: string, type: string) {
  const [parent] = await db.select().from(categories)
    .where(and(eq(categories.id, parentId), eq(categories.userId, userId)))
  if (!parent) return { error: { status: 404 as const, code: 'NOT_FOUND', message: 'Parent category not found' } }
  if (parent.parentId) return { error: { status: 400 as const, code: 'INVALID_PARENT', message: 'Categories can only nest one level deep' } }
  if (parent.type !== type) return { error: { status: 400 as const, code: 'TYPE_MISMATCH', message: 'Parent category has a different type' } }
  return { parent }
}

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
              data: z.array(categoryShape),
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
            schema: z.object({
              name: z.string().min(1).max(120),
              type: z.enum(categoryTypeValues).default('expense'),
              parentId: z.string().uuid().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Created category',
        content: {
          'application/json': {
            schema: z.object({ data: categoryShape }),
          },
        },
      },
      400: {
        description: 'Invalid parent category',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
      404: {
        description: 'Parent category not found',
        content: {
          'application/json': {
            schema: errorShape,
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
            schema: z.object({
              name: z.string().min(1).max(120).optional(),
              type: z.enum(categoryTypeValues).optional(),
              parentId: z.string().uuid().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated category',
        content: {
          'application/json': {
            schema: z.object({ data: categoryShape }),
          },
        },
      },
      400: {
        description: 'Invalid parent category',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
      404: {
        description: 'Category not found',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
    },
  })

  app.openapi(listCategoriesRoute, async (c) => {
    const user = c.get('user')
    const rows = await db.select().from(categories).where(eq(categories.userId, user.id)).orderBy(categories.type, categories.name)
    return c.json({ data: rows.map(toResponseShape) }, 200)
  })

  app.openapi(createCategoryRoute, async (c) => {
    const user = c.get('user')
    const { name, type, parentId } = c.req.valid('json')
    const slug = name.toLowerCase().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    if (parentId) {
      const result = await validateParent(user.id, parentId, type)
      if (result.error) {
        return c.json({ error: { code: result.error.code, message: result.error.message } }, result.error.status)
      }
    }

    const [row] = await db.insert(categories)
      .values({ userId: user.id, name, slug, type, parentId: parentId ?? null })
      .onConflictDoNothing()
      .returning()

    if (row) {
      await recordAudit({
        actorType: c.get('authMethod') ?? 'user',
        actorId: user.id,
        action: 'category.create',
        resourceType: 'category',
        resourceId: row.id,
      })
      return c.json({ data: toResponseShape(row) }, 201)
    }

    // Conflict — return this user's existing category
    const [existing] = await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.userId, user.id)))
    return c.json({ data: toResponseShape(existing) }, 201)
  })

  app.openapi(patchCategoryRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    if (payload.name === undefined && payload.type === undefined && payload.parentId === undefined) {
      return c.json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } }, 404)
    }

    const [existing] = await db.select().from(categories).where(and(eq(categories.id, id), eq(categories.userId, user.id)))
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404)
    }

    const nextType = payload.type ?? existing.type

    if (payload.parentId && payload.parentId === id) {
      return c.json({ error: { code: 'INVALID_PARENT', message: 'A category cannot be its own parent' } }, 400)
    }

    if (payload.parentId) {
      const result = await validateParent(user.id, payload.parentId, nextType)
      if (result.error) {
        return c.json({ error: { code: result.error.code, message: result.error.message } }, result.error.status)
      }
    }

    const updateSet: Partial<typeof categories.$inferInsert> = { needsReview: false }
    if (payload.name !== undefined) {
      updateSet.name = payload.name
      updateSet.slug = payload.name.toLowerCase().replace(/[&]/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }
    if (payload.type !== undefined) updateSet.type = payload.type
    if (payload.parentId !== undefined) updateSet.parentId = payload.parentId

    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(categories).set(updateSet)
        .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
        .returning()

      if (payload.type !== undefined && payload.type !== existing.type) {
        await tx.update(categories).set({ type: payload.type })
          .where(and(eq(categories.parentId, id), eq(categories.userId, user.id)))
      }

      return updated
    })

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'category.update',
      resourceType: 'category',
      resourceId: row.id,
    })

    return c.json({ data: toResponseShape(row) }, 200)
  })
}
