import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, categories, transactionEntries, transactionSplits, transactions, wallets } from '@finance-os/db'
import { transactionSchema } from '@finance-os/domain'
import { and, desc, eq, gte, inArray, isNull, isNotNull, lte, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'
import { createTransactionForUser, CreateTransactionError, userOwnsWallets } from '../lib/create-transaction'

const splitInputSchema = z.object({
  personId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/).refine((v) => Number(v) > 0, 'amount must be positive'),
})

const splitOutputShape = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  assetId: z.string().uuid(),
  amount: z.string(),
  settledAt: z.string().nullable(),
  settlementTransactionId: z.string().uuid().nullable(),
})

export function registerTransactionRoutes(app: OpenAPIHono) {
  const listTransactionsRoute = createRoute({
    method: 'get',
    path: '/api/transactions',
    tags: ['transactions'],
    responses: {
      200: {
        description: 'List transactions with entries',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                transactionSchema.extend({
                  id: z.string().uuid(),
                  splits: z.array(splitOutputShape).optional(),
                }),
              ),
            }),
          },
        },
      },
    },
  })

  const createTransactionRoute = createRoute({
    method: 'post',
    path: '/api/transactions',
    tags: ['transactions'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: transactionSchema.extend({ splits: z.array(splitInputSchema).optional() }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Create transaction',
        content: {
          'application/json': {
            schema: z.object({
              data: transactionSchema.extend({
                id: z.string().uuid(),
                splits: z.array(splitOutputShape).optional(),
              }),
            }),
          },
        },
      },
      400: {
        description: 'Invalid transaction payload',
        content: {
          'application/json': {
            schema: z.object({
              error: z.object({
                code: z.string(),
                message: z.string(),
              }),
            }),
          },
        },
      },
      404: {
        description: 'Referenced wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const patchTransactionRoute = createRoute({
    method: 'patch',
    path: '/api/transactions/{id}',
    tags: ['transactions'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              description: z.string().min(1).max(255).optional(),
              type: z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']).optional(),
              transactionDate: z.string().datetime({ offset: true }).optional(),
              notes: z.string().max(1000).nullable().optional(),
              categoryId: z.string().uuid().nullable().optional(),
              amount: z.string().regex(/^-?\d+(\.\d+)?$/).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated transaction',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({
              id: z.string().uuid(),
              description: z.string(),
              type: z.string(),
              transactionDate: z.string(),
              notes: z.string().nullable(),
            }) }),
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const deleteTransactionRoute = createRoute({
    method: 'delete',
    path: '/api/transactions/{id}',
    tags: ['transactions'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Soft-deleted transaction',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), deletedAt: z.string() }) }),
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const restoreTransactionRoute = createRoute({
    method: 'post',
    path: '/api/transactions/{id}/restore',
    tags: ['transactions'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Restored transaction',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid() }) }),
          },
        },
      },
      404: {
        description: 'Transaction not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const searchTransactionsRoute = createRoute({
    method: 'get',
    path: '/api/transactions/search',
    tags: ['transactions'],
    request: {
      query: z.object({
        q: z.string().optional(),
        wallet: z.string().uuid().optional(),
        category: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        includeDeleted: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Search transactions',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(z.object({
                id: z.string().uuid(),
                transactionDate: z.string(),
                type: z.string(),
                description: z.string(),
                notes: z.string().nullable(),
                categoryName: z.string().nullable(),
                amount: z.number(),
                currency: z.string(),
                walletName: z.string(),
              })),
            }),
          },
        },
      },
    },
  })

  const bulkCreateTransactionsRoute = createRoute({
    method: 'post',
    path: '/api/transactions/bulk',
    tags: ['transactions'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              transactions: z.array(transactionSchema).min(1).max(100),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Bulk created transactions',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ created: z.number(), ids: z.array(z.string().uuid()) }) }),
          },
        },
      },
      404: {
        description: 'Referenced wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  app.openapi(patchTransactionRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    // Verify ownership first — entries are only reachable through an owned transaction
    const [existing] = await db.select({ id: transactions.id }).from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
    if (!existing) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
    }

    // Update transaction header fields
    const txUpdates: Record<string, unknown> = {}
    if (payload.description !== undefined) txUpdates.description = payload.description
    if (payload.type !== undefined) txUpdates.type = payload.type
    if (payload.transactionDate !== undefined) txUpdates.transactionDate = new Date(payload.transactionDate)
    if (payload.notes !== undefined) txUpdates.notes = payload.notes
    if (payload.categoryId !== undefined) {
      // A referenced category must belong to the acting user
      if (payload.categoryId !== null) {
        const [category] = await db.select({ id: categories.id }).from(categories)
          .where(and(eq(categories.id, payload.categoryId), eq(categories.userId, user.id)))
        if (!category) {
          return c.json({ error: { code: 'NOT_FOUND', message: 'Category not found' } }, 404)
        }
      }
      txUpdates.categoryId = payload.categoryId
    }

    if (Object.keys(txUpdates).length > 0) {
      await db.update(transactions).set(txUpdates).where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
    }

    // Update entry amount if provided (updates first entry)
    if (payload.amount !== undefined) {
      const entries = await db.select().from(transactionEntries).where(eq(transactionEntries.transactionId, id))
      if (entries.length > 0) {
        await db.update(transactionEntries).set({ amount: payload.amount }).where(eq(transactionEntries.id, entries[0].id))
      }
    }

    // Return updated transaction
    const [updated] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
    if (!updated) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'transaction.update',
      resourceType: 'transaction',
      resourceId: updated.id,
    })

    return c.json({
      data: {
        id: updated.id,
        description: updated.description,
        type: updated.type,
        transactionDate: updated.transactionDate.toISOString(),
        notes: updated.notes,
      },
    }, 200)
  })

  app.openapi(listTransactionsRoute, async (c) => {
    const user = c.get('user')
    const txRows = await db.select().from(transactions)
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.transactionDate))
    const txIds = txRows.map((row) => row.id)
    const entryRows = txIds.length === 0 ? [] : await db
      .select({
        transactionId: transactionEntries.transactionId,
        walletId: transactionEntries.walletId,
        assetId: transactionEntries.assetId,
        amount: transactionEntries.amount,
        notes: transactionEntries.notes,
      })
      .from(transactionEntries)
      .where(inArray(transactionEntries.transactionId, txIds))
    const splitRows = txIds.length === 0 ? [] : await db
      .select({
        id: transactionSplits.id,
        transactionId: transactionSplits.transactionId,
        personId: transactionSplits.personId,
        assetId: transactionSplits.assetId,
        amount: transactionSplits.amount,
        settledAt: transactionSplits.settledAt,
        settlementTransactionId: transactionSplits.settlementTransactionId,
      })
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, txIds))

    const data = txRows.map((row) => ({
      ...row,
      entries: entryRows
        .filter((entry) => entry.transactionId === row.id)
        .map((entry) => ({
          walletId: entry.walletId,
          assetId: entry.assetId,
          amount: String(entry.amount),
          notes: entry.notes,
        })),
      splits: splitRows
        .filter((split) => split.transactionId === row.id)
        .map((split) => ({
          id: split.id,
          personId: split.personId,
          assetId: split.assetId,
          amount: String(split.amount),
          settledAt: split.settledAt ? split.settledAt.toISOString() : null,
          settlementTransactionId: split.settlementTransactionId,
        })),
    }))

    return c.json({ data }, 200)
  })

  app.openapi(createTransactionRoute, async (c) => {
    const user = c.get('user')
    const payload = c.req.valid('json')

    let created: { id: string }
    try {
      created = await createTransactionForUser(payload, { userId: user.id, actorType: c.get('authMethod') ?? 'user' })
    } catch (err) {
      if (err instanceof CreateTransactionError) {
        return c.json({ error: { code: err.code, message: err.message } }, err.status as 400 | 404)
      }
      throw err
    }

    // Splits are inserted by the lib; re-select them here to shape the response
    // exactly as before (id, settledAt, settlementTransactionId included).
    const splitRows = await db.select().from(transactionSplits).where(eq(transactionSplits.transactionId, created.id))

    return c.json({
      data: {
        ...payload,
        id: created.id,
        splits: splitRows.map((split) => ({
          id: split.id,
          personId: split.personId,
          assetId: split.assetId,
          amount: String(split.amount),
          settledAt: split.settledAt ? split.settledAt.toISOString() : null,
          settlementTransactionId: split.settlementTransactionId,
        })),
      },
    }, 201)
  })

  app.openapi(deleteTransactionRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const now = new Date()
    const [row] = await db.update(transactions).set({ deletedAt: now }).where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt))).returning()
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'transaction.delete',
      resourceType: 'transaction',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id, deletedAt: now.toISOString() } }, 200)
  })

  app.openapi(restoreTransactionRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const [row] = await db.update(transactions).set({ deletedAt: null }).where(and(eq(transactions.id, id), eq(transactions.userId, user.id), isNotNull(transactions.deletedAt))).returning()
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'transaction.restore',
      resourceType: 'transaction',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id } }, 200)
  })

  app.openapi(searchTransactionsRoute, async (c) => {
    const user = c.get('user')
    const { q, wallet, category, from, to, includeDeleted } = c.req.valid('query')

    const filters = [eq(transactions.userId, user.id)]
    if (includeDeleted !== 'true') {
      filters.push(isNull(transactions.deletedAt))
    }
    if (q) {
      filters.push(sql`${transactions.description} ILIKE ${'%' + q + '%'}`)
    }
    if (wallet) {
      filters.push(eq(transactionEntries.walletId, wallet))
    }
    if (category) {
      filters.push(eq(transactions.categoryId, category))
    }
    if (from) {
      filters.push(gte(transactions.transactionDate, new Date(from)))
    }
    if (to) {
      filters.push(lte(transactions.transactionDate, new Date(to)))
    }

    const condition = and(...filters)

    const rows = await db
      .select({
        id: transactions.id,
        transactionDate: transactions.transactionDate,
        type: transactions.type,
        description: transactions.description,
        notes: transactions.notes,
        categoryName: categories.name,
        amount: transactionEntries.amount,
        currency: assets.code,
        walletName: wallets.name,
      })
      .from(transactions)
      .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
      .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
      .innerJoin(wallets, eq(wallets.id, transactionEntries.walletId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(condition)
      .orderBy(desc(transactions.transactionDate))
      .limit(200)

    const data = rows.map((r) => ({
      id: r.id,
      transactionDate: r.transactionDate.toISOString(),
      type: r.type,
      description: r.description,
      notes: r.notes,
      categoryName: r.categoryName,
      amount: Number(r.amount),
      currency: r.currency,
      walletName: r.walletName,
    }))

    return c.json({ data }, 200)
  })

  app.openapi(bulkCreateTransactionsRoute, async (c) => {
    const user = c.get('user')
    const payload = c.req.valid('json')

    // Every referenced wallet across the batch must belong to the acting user
    const allWalletIds = payload.transactions.flatMap((tx) => tx.entries.map((e) => e.walletId))
    if (!(await userOwnsWallets(user.id, allWalletIds))) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    const ids: string[] = []

    // Sequential, non-atomic across items (matches prior behavior): each item is inserted
    // independently, so an item failing partway through does not roll back items already
    // committed earlier in the batch. Any thrown error (validation or DB) propagates
    // uncaught, aborting the request — same as before this refactor.
    for (const tx of payload.transactions) {
      const { id } = await createTransactionForUser(tx, { userId: user.id, actorType: c.get('authMethod') ?? 'user' })
      ids.push(id)
    }

    return c.json({ data: { created: ids.length, ids } }, 201)
  })
}
