import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets } from '@finance-os/db'
import { assetSchema } from '@finance-os/domain'

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

  app.openapi(listAssetsRoute, async (c) => {
    const rows = await db.select().from(assets).orderBy(assets.code)
    return c.json({ data: rows }, 200)
  })
}
