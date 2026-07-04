import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, statementImports } from '@finance-os/db'
import { statementImportSchema } from '@finance-os/domain'
import { desc, eq } from 'drizzle-orm'

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
    const user = c.get('user')
    const rows = await db.select().from(statementImports).where(eq(statementImports.userId, user.id)).orderBy(desc(statementImports.createdAt))
    return c.json({ data: rows }, 200)
  })
}
