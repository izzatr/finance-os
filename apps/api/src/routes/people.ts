import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, people, transactions, transactionSplits } from '@finance-os/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'

const personShape = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
})

const errorShape = z.object({ error: z.object({ code: z.string(), message: z.string() }) })

const balanceEntryShape = z.object({
  assetCode: z.string(),
  amount: z.number(),
})

function toResponseShape(row: typeof people.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    notes: row.notes,
  }
}

/** True when the error is a Postgres unique-constraint violation (code 23505).
 * Drizzle wraps the underlying pg error in a DrizzleQueryError with `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  if (code === '23505') return true
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause
  return cause?.code === '23505'
}

export function registerPeopleRoutes(app: OpenAPIHono) {
  const listPeopleRoute = createRoute({
    method: 'get',
    path: '/api/people',
    tags: ['people'],
    responses: {
      200: {
        description: 'List all people',
        content: {
          'application/json': {
            schema: z.object({ data: z.array(personShape) }),
          },
        },
      },
    },
  })

  const createPersonRoute = createRoute({
    method: 'post',
    path: '/api/people',
    tags: ['people'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(1).max(120),
              email: z.string().email().max(255).optional(),
              notes: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Created person',
        content: {
          'application/json': {
            schema: z.object({ data: personShape }),
          },
        },
      },
      409: {
        description: 'A person with this name already exists for this user',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
    },
  })

  const patchPersonRoute = createRoute({
    method: 'patch',
    path: '/api/people/{id}',
    tags: ['people'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(1).max(120).optional(),
              email: z.string().email().max(255).nullable().optional(),
              notes: z.string().nullable().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated person',
        content: {
          'application/json': {
            schema: z.object({ data: personShape }),
          },
        },
      },
      404: {
        description: 'Person not found',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
      409: {
        description: 'A person with this name already exists for this user',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
    },
  })

  const deletePersonRoute = createRoute({
    method: 'delete',
    path: '/api/people/{id}',
    tags: ['people'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Soft-deleted person',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), deletedAt: z.string() }) }),
          },
        },
      },
      404: {
        description: 'Person not found',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
    },
  })

  const personBalanceRoute = createRoute({
    method: 'get',
    path: '/api/people/{id}/balance',
    tags: ['people'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Per-asset unsettled balance owed by/to this person',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                personId: z.string().uuid(),
                balances: z.array(balanceEntryShape),
              }),
            }),
          },
        },
      },
      404: {
        description: 'Person not found',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
    },
  })

  const sharedBalancesRoute = createRoute({
    method: 'get',
    path: '/api/analytics/shared-balances',
    tags: ['people'],
    responses: {
      200: {
        description: 'Per-asset unsettled balances across all people',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(z.object({
                personId: z.string().uuid(),
                name: z.string(),
                balances: z.array(balanceEntryShape),
              })),
            }),
          },
        },
      },
    },
  })

  app.openapi(listPeopleRoute, async (c) => {
    const user = c.get('user')
    const rows = await db.select().from(people)
      .where(and(eq(people.userId, user.id), isNull(people.deletedAt)))
      .orderBy(people.name)
    return c.json({ data: rows.map(toResponseShape) }, 200)
  })

  app.openapi(createPersonRoute, async (c) => {
    const user = c.get('user')
    const { name, email, notes } = c.req.valid('json')

    try {
      const [row] = await db.insert(people)
        .values({ userId: user.id, name, email: email ?? null, notes: notes ?? null })
        .returning()

      await recordAudit({
        actorType: c.get('authMethod') ?? 'user',
        actorId: user.id,
        action: 'person.create',
        resourceType: 'person',
        resourceId: row.id,
      })

      return c.json({ data: toResponseShape(row) }, 201)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: { code: 'CONFLICT', message: 'A person with this name already exists' } }, 409)
      }
      throw err
    }
  })

  app.openapi(patchPersonRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    if (payload.name === undefined && payload.email === undefined && payload.notes === undefined) {
      return c.json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } }, 404)
    }

    const updateSet: Partial<typeof people.$inferInsert> = {}
    if (payload.name !== undefined) updateSet.name = payload.name
    if (payload.email !== undefined) updateSet.email = payload.email
    if (payload.notes !== undefined) updateSet.notes = payload.notes

    try {
      const [row] = await db.update(people).set(updateSet)
        .where(and(eq(people.id, id), eq(people.userId, user.id), isNull(people.deletedAt)))
        .returning()

      if (!row) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, 404)
      }

      await recordAudit({
        actorType: c.get('authMethod') ?? 'user',
        actorId: user.id,
        action: 'person.update',
        resourceType: 'person',
        resourceId: row.id,
      })

      return c.json({ data: toResponseShape(row) }, 200)
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json({ error: { code: 'CONFLICT', message: 'A person with this name already exists' } }, 409)
      }
      throw err
    }
  })

  app.openapi(deletePersonRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const now = new Date()
    const [row] = await db.update(people).set({ deletedAt: now })
      .where(and(eq(people.id, id), eq(people.userId, user.id), isNull(people.deletedAt)))
      .returning()

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'person.delete',
      resourceType: 'person',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id, deletedAt: now.toISOString() } }, 200)
  })

  app.openapi(personBalanceRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    const [person] = await db.select().from(people)
      .where(and(eq(people.id, id), eq(people.userId, user.id), isNull(people.deletedAt)))
    if (!person) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, 404)
    }

    const rows = await db
      .select({ assetCode: assets.code, amount: sql<string>`sum(${transactionSplits.amount})` })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .innerJoin(assets, eq(transactionSplits.assetId, assets.id))
      .innerJoin(people, eq(transactionSplits.personId, people.id))
      .where(and(
        eq(transactionSplits.personId, id),
        eq(people.userId, user.id),
        eq(transactions.userId, user.id),
        isNull(transactions.deletedAt),
        isNull(transactionSplits.settledAt),
      ))
      .groupBy(assets.code)

    return c.json({
      data: {
        personId: id,
        balances: rows.map((r) => ({ assetCode: r.assetCode, amount: Number(r.amount) })),
      },
    }, 200)
  })

  app.openapi(sharedBalancesRoute, async (c) => {
    const user = c.get('user')

    const rows = await db
      .select({
        personId: people.id,
        name: people.name,
        assetCode: assets.code,
        amount: sql<string>`sum(${transactionSplits.amount})`,
      })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .innerJoin(assets, eq(transactionSplits.assetId, assets.id))
      .innerJoin(people, eq(transactionSplits.personId, people.id))
      .where(and(
        eq(people.userId, user.id),
        eq(transactions.userId, user.id),
        isNull(people.deletedAt),
        isNull(transactions.deletedAt),
        isNull(transactionSplits.settledAt),
      ))
      .groupBy(people.id, people.name, assets.code)
      .orderBy(people.name)

    const byPerson = new Map<string, { personId: string; name: string; balances: { assetCode: string; amount: number }[] }>()
    for (const row of rows) {
      if (!byPerson.has(row.personId)) {
        byPerson.set(row.personId, { personId: row.personId, name: row.name, balances: [] })
      }
      byPerson.get(row.personId)!.balances.push({ assetCode: row.assetCode, amount: Number(row.amount) })
    }

    return c.json({ data: [...byPerson.values()] }, 200)
  })
}
