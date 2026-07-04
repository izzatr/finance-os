import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, people, transactionEntries, transactions, transactionSplits, wallets } from '@finance-os/db'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'
import { isUniqueViolation } from '../lib/db-errors'

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

const DECIMAL_SCALE = 8

/** Parses a decimal string (as validated by the `\d+(\.\d+)?` amount regex) into a scaled
 * bigint at `numeric(20,8)` precision, so sums/comparisons never suffer float drift. */
function toScaledBigInt(value: string): bigint {
  const [whole, frac = ''] = value.split('.')
  const paddedFrac = (frac + '0'.repeat(DECIMAL_SCALE)).slice(0, DECIMAL_SCALE)
  return BigInt(whole) * 10n ** BigInt(DECIMAL_SCALE) + BigInt(paddedFrac)
}

function scaledBigIntToDecimalString(scaled: bigint): string {
  const factor = 10n ** BigInt(DECIMAL_SCALE)
  const whole = scaled / factor
  const frac = scaled % factor
  return `${whole}.${frac.toString().padStart(DECIMAL_SCALE, '0')}`
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

  const settlePersonRoute = createRoute({
    method: 'post',
    path: '/api/people/{id}/settle',
    tags: ['people'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              walletId: z.string().uuid(),
              assetId: z.string().uuid(),
              amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
              splitIds: z.array(z.string().uuid()).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Settlement transaction created; matching splits marked settled',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                transactionId: z.string().uuid(),
                amount: z.string(),
                settledSplitIds: z.array(z.string().uuid()),
              }),
            }),
          },
        },
      },
      400: {
        description: 'Amount mismatch or nothing to settle',
        content: {
          'application/json': {
            schema: errorShape,
          },
        },
      },
      404: {
        description: 'Person or wallet not found',
        content: {
          'application/json': {
            schema: errorShape,
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

  app.openapi(settlePersonRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const { walletId, assetId, amount, splitIds } = c.req.valid('json')

    const [person] = await db.select().from(people)
      .where(and(eq(people.id, id), eq(people.userId, user.id), isNull(people.deletedAt)))
    if (!person) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Person not found' } }, 404)
    }

    const [settleWallet] = await db
      .select({ id: wallets.id, assetId: wallets.assetId })
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
    if (!settleWallet) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }
    // The settlement entry lands in this wallet — its asset must match the splits' asset,
    // or the wallet balance would be silently corrupted with a foreign-currency amount.
    if (settleWallet.assetId !== assetId) {
      return c.json({ error: { code: 'ASSET_MISMATCH', message: "Settlement asset does not match the wallet's asset" } }, 400)
    }

    // Gather the candidate unsettled splits: either an explicit list (each must belong to
    // this person + asset + one of this user's transactions) or all unsettled splits for
    // this person/asset.
    const baseFilters = [
      eq(transactionSplits.personId, id),
      eq(transactionSplits.assetId, assetId),
      eq(transactions.userId, user.id),
      isNull(transactions.deletedAt),
      isNull(transactionSplits.settledAt),
    ]
    if (splitIds && splitIds.length > 0) {
      baseFilters.push(inArray(transactionSplits.id, splitIds))
    }

    const candidates = await db
      .select({ id: transactionSplits.id, amount: transactionSplits.amount })
      .from(transactionSplits)
      .innerJoin(transactions, eq(transactionSplits.transactionId, transactions.id))
      .where(and(...baseFilters))

    if (splitIds && splitIds.length > 0 && candidates.length !== splitIds.length) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Split not found' } }, 404)
    }

    if (candidates.length === 0) {
      return c.json({ error: { code: 'NOTHING_TO_SETTLE', message: 'Nothing to settle' } }, 400)
    }

    const sumScaled = candidates.reduce((acc, s) => acc + toScaledBigInt(s.amount), 0n)
    if (amount !== undefined && toScaledBigInt(amount) !== sumScaled) {
      return c.json({ error: { code: 'AMOUNT_MISMATCH', message: 'Amount does not match the sum of unsettled splits' } }, 400)
    }
    const sum = scaledBigIntToDecimalString(sumScaled)

    const now = new Date()
    const settledIds = candidates.map((s) => s.id)

    const txRow = await db.transaction(async (tx) => {
      const [txRow] = await tx.insert(transactions).values({
        userId: user.id,
        transactionDate: now,
        type: 'transfer',
        description: `Settlement with ${person.name}`,
        externalRef: `settlement:${id}:${now.toISOString()}`,
      }).returning()

      await tx.insert(transactionEntries).values({
        transactionId: txRow.id,
        walletId,
        assetId,
        amount: sum,
      })

      await tx.update(transactionSplits)
        .set({ settledAt: now, settlementTransactionId: txRow.id })
        .where(inArray(transactionSplits.id, settledIds))

      return txRow
    })

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'person.settle',
      resourceType: 'person',
      resourceId: id,
      metadata: { transactionId: txRow.id, amount: sum, splitIds: settledIds },
    })

    return c.json({
      data: {
        transactionId: txRow.id,
        amount: sum,
        settledSplitIds: settledIds,
      },
    }, 201)
  })
}
