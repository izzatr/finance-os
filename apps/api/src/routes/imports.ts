import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, statementImports } from '@finance-os/db'
import { statementImportSchema } from '@finance-os/domain'
import { desc } from 'drizzle-orm'

export function registerImportRoutes(app: OpenAPIHono) {
  const listImportsRoute = createRoute({
    method: 'get',
    path: '/api/imports',
    tags: ['imports'],
    responses: {
      200: {
        description: 'List statement imports',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(statementImportSchema.extend({ id: z.string().uuid() })),
            }),
          },
        },
      },
    },
  })

  app.openapi(listImportsRoute, async (c) => {
    const rows = await db.select().from(statementImports).orderBy(desc(statementImports.createdAt))
    return c.json({ data: rows }, 200)
  })
}
