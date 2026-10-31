import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets } from '@finance-os/db'
import { assetSchema } from '@finance-os/domain'
import { sql } from 'drizzle-orm'

export function registerSystemRoutes(app: OpenAPIHono) {
  const healthRoute = createRoute({
    method: 'get',
    path: '/health',
    tags: ['system'],
    responses: {
      200: {
        description: 'Health check response',
        content: {
          'application/json': {
            schema: z.object({ ok: z.literal(true) }),
          },
        },
      },
    },
  })

  const readinessRoute = createRoute({
    method: 'get',
    path: '/ready',
    tags: ['system'],
    responses: {
      200: {
        description: 'Database-backed readiness check',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      503: {
        description: 'Database is unavailable',
        content: { 'application/json': { schema: z.object({ ok: z.literal(false) }) } },
      },
    },
  })

  const listAssetsRoute = createRoute({
    method: 'get',
    path: '/api/assets',
    tags: ['assets'],
    responses: {
      200: {
        description: 'List assets',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(assetSchema.extend({ id: z.string().uuid() })) }),
          },
        },
      },
    },
  })

  app.openapi(healthRoute, (c) => c.json({ ok: true }, 200))
  app.openapi(readinessRoute, async (c) => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ ok: true } as const, 200)
    } catch {
      return c.json({ ok: false } as const, 503)
    }
  })

  app.openapi(listAssetsRoute, async (c) => {
    const rows = await db.select().from(assets).orderBy(assets.code)
    return c.json({ data: rows }, 200)
  })

  const meRoute = createRoute({
    method: 'get',
    path: '/api/me',
    tags: ['system'],
    responses: {
      200: {
        description: 'Who am I: the acting user and credential capabilities',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                userId: z.string(),
                authMethod: z.string(),
                keyScope: z.string(),
                keyName: z.string().nullable(),
              }),
            }),
          },
        },
      },
    },
  })

  app.openapi(meRoute, async (c) => {
    const user = c.get('user')
    return c.json({
      data: {
        userId: user.id,
        authMethod: c.get('authMethod') ?? 'user',
        keyScope: c.get('keyScope') ?? 'write',
        keyName: c.get('keyName') ?? null,
      },
    }, 200)
  })
}
