import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, categories, transactionEntries, transactions, wallets } from '@finance-os/db'
import { walletSchema } from '@finance-os/domain'
import { and, desc, eq, isNull, isNotNull, sql } from 'drizzle-orm'
import { recordAudit } from '../lib/audit'

export function registerWalletRoutes(app: OpenAPIHono) {
  const createWalletRoute = createRoute({
    method: 'post',
    path: '/api/wallets',
    tags: ['wallets'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: walletSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Create wallet',
        content: {
          'application/json': {
            schema: z.object({ data: walletSchema.extend({ id: z.string().uuid() }) }),
          },
        },
      },
    },
  })

  const listWalletsRoute = createRoute({
    method: 'get',
    path: '/api/wallets',
    tags: ['wallets'],
    responses: {
      200: {
        description: 'List wallets with current balance',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(
                walletSchema.extend({
                  id: z.string().uuid(),
                  balance: z.number(),
                  currency: z.string(),
                }),
              ),
            }),
          },
        },
      },
    },
  })

  const walletTransactionsRoute = createRoute({
    method: 'get',
    path: '/api/wallets/{id}/transactions',
    tags: ['wallets'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Wallet detail with transactions',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                wallet: z.object({
                  id: z.string().uuid(),
                  name: z.string(),
                  walletType: z.string(),
                  institution: z.string().nullable(),
                  currency: z.string(),
                  balance: z.number(),
                }),
                transactions: z.array(z.object({
                  id: z.string().uuid(),
                  transactionDate: z.string(),
                  type: z.string(),
                  description: z.string(),
                  notes: z.string().nullable(),
                  categoryName: z.string().nullable(),
                  amount: z.number(),
                  currency: z.string(),
                  createdAt: z.string(),
                })),
              }),
            }),
          },
        },
      },
      404: {
        description: 'Wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const patchWalletRoute = createRoute({
    method: 'patch',
    path: '/api/wallets/{id}',
    tags: ['wallets'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              name: z.string().min(1).max(120).optional(),
              walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']).optional(),
              institution: z.string().max(120).nullable().optional(),
              isActive: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated wallet',
        content: {
          'application/json': {
            schema: z.object({ data: walletSchema.extend({ id: z.string().uuid() }) }),
          },
        },
      },
      404: {
        description: 'Wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const deleteWalletRoute = createRoute({
    method: 'delete',
    path: '/api/wallets/{id}',
    tags: ['wallets'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Soft-deleted wallet',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid(), deletedAt: z.string() }) }),
          },
        },
      },
      404: {
        description: 'Wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const restoreWalletRoute = createRoute({
    method: 'post',
    path: '/api/wallets/{id}/restore',
    tags: ['wallets'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Restored wallet',
        content: {
          'application/json': {
            schema: z.object({ data: z.object({ id: z.string().uuid() }) }),
          },
        },
      },
      404: {
        description: 'Wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  const walletMonthlySummaryRoute = createRoute({
    method: 'get',
    path: '/api/wallets/{id}/monthly-summary',
    tags: ['wallets'],
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Monthly income/expense/net for a wallet',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                wallet: z.object({
                  id: z.string().uuid(),
                  name: z.string(),
                  currency: z.string(),
                }),
                months: z.array(z.object({
                  month: z.string(),
                  income: z.number(),
                  expense: z.number(),
                  net: z.number(),
                })),
              }),
            }),
          },
        },
      },
      404: {
        description: 'Wallet not found',
        content: {
          'application/json': {
            schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          },
        },
      },
    },
  })

  app.openapi(createWalletRoute, async (c) => {
    const user = c.get('user')
    const payload = c.req.valid('json')
    const [row] = await db.insert(wallets).values({
      userId: user.id,
      name: payload.name,
      walletType: payload.walletType,
      institution: payload.institution ?? null,
      assetId: payload.assetId,
      isActive: payload.isActive ?? true,
    }).returning()

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'wallet.create',
      resourceType: 'wallet',
      resourceId: row.id,
    })

    return c.json({ data: row }, 201)
  })

  app.openapi(listWalletsRoute, async (c) => {
    const user = c.get('user')
    const rows = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        walletType: wallets.walletType,
        institution: wallets.institution,
        assetId: wallets.assetId,
        isActive: wallets.isActive,
        balance: sql<number>`coalesce(sum(${transactionEntries.amount}), 0)`,
        currency: assets.code,
      })
      .from(wallets)
      .innerJoin(assets, eq(assets.id, wallets.assetId))
      .leftJoin(transactionEntries, eq(transactionEntries.walletId, wallets.id))
      .leftJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
      .groupBy(wallets.id, assets.code)
      .orderBy(wallets.name)

    return c.json({ data: rows }, 200)
  })

  app.openapi(walletTransactionsRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    // Get wallet with balance
    const [wallet] = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        walletType: wallets.walletType,
        institution: wallets.institution,
        currency: assets.code,
        balance: sql<number>`coalesce(sum(${transactionEntries.amount}), 0)`,
      })
      .from(wallets)
      .innerJoin(assets, eq(assets.id, wallets.assetId))
      .leftJoin(transactionEntries, eq(transactionEntries.walletId, wallets.id))
      .leftJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
      .where(and(eq(wallets.id, id), eq(wallets.userId, user.id), isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
      .groupBy(wallets.id, assets.code)

    if (!wallet) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    // Get transactions for this wallet
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
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .innerJoin(transactionEntries, and(
        eq(transactionEntries.transactionId, transactions.id),
        eq(transactionEntries.walletId, id),
      ))
      .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .orderBy(desc(transactions.transactionDate))

    const txData = rows.map((r) => ({
      id: r.id,
      transactionDate: r.transactionDate.toISOString(),
      type: r.type,
      description: r.description,
      notes: r.notes,
      categoryName: r.categoryName,
      amount: Number(r.amount),
      currency: r.currency,
      createdAt: r.createdAt.toISOString(),
    }))

    return c.json({
      data: {
        wallet: { ...wallet, balance: Number(wallet.balance) },
        transactions: txData,
      },
    }, 200)
  })

  app.openapi(patchWalletRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const payload = c.req.valid('json')

    const updates: Record<string, unknown> = {}
    if (payload.name !== undefined) updates.name = payload.name
    if (payload.walletType !== undefined) updates.walletType = payload.walletType
    if (payload.institution !== undefined) updates.institution = payload.institution
    if (payload.isActive !== undefined) updates.isActive = payload.isActive

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { code: 'NO_CHANGES', message: 'No fields to update' } }, 404)
    }

    const [row] = await db.update(wallets).set(updates).where(and(eq(wallets.id, id), eq(wallets.userId, user.id), isNull(wallets.deletedAt))).returning()

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'wallet.update',
      resourceType: 'wallet',
      resourceId: row.id,
    })

    return c.json({ data: row }, 200)
  })

  app.openapi(deleteWalletRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const now = new Date()
    const [row] = await db.update(wallets).set({ deletedAt: now }).where(and(eq(wallets.id, id), eq(wallets.userId, user.id), isNull(wallets.deletedAt))).returning()
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'wallet.delete',
      resourceType: 'wallet',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id, deletedAt: now.toISOString() } }, 200)
  })

  app.openapi(restoreWalletRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')
    const [row] = await db.update(wallets).set({ deletedAt: null }).where(and(eq(wallets.id, id), eq(wallets.userId, user.id), isNotNull(wallets.deletedAt))).returning()
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    await recordAudit({
      actorType: c.get('authMethod') ?? 'user',
      actorId: user.id,
      action: 'wallet.restore',
      resourceType: 'wallet',
      resourceId: row.id,
    })

    return c.json({ data: { id: row.id } }, 200)
  })

  app.openapi(walletMonthlySummaryRoute, async (c) => {
    const user = c.get('user')
    const { id } = c.req.valid('param')

    const [wallet] = await db
      .select({
        id: wallets.id,
        name: wallets.name,
        currency: assets.code,
      })
      .from(wallets)
      .innerJoin(assets, eq(assets.id, wallets.assetId))
      .where(and(eq(wallets.id, id), eq(wallets.userId, user.id), isNull(wallets.deletedAt)))

    if (!wallet) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    }

    const rows = await db
      .select({
        month: sql<string>`to_char(${transactions.transactionDate}, 'YYYY-MM')`,
        type: transactions.type,
        total: sql<number>`sum(${transactionEntries.amount})`,
      })
      .from(transactions)
      .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
      .where(and(eq(transactionEntries.walletId, id), eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
      .groupBy(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`, transactions.type)
      .orderBy(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`)

    const pivoted = new Map<string, { month: string; income: number; expense: number; net: number }>()

    for (const row of rows) {
      if (!pivoted.has(row.month)) {
        pivoted.set(row.month, { month: row.month, income: 0, expense: 0, net: 0 })
      }
      const entry = pivoted.get(row.month)!
      const amount = Number(row.total)

      if (row.type === 'income') {
        entry.income += amount
      } else if (row.type === 'expense') {
        entry.expense += Math.abs(amount)
      }
    }

    for (const entry of pivoted.values()) {
      entry.net = entry.income - entry.expense
      entry.income = Math.round(entry.income * 100) / 100
      entry.expense = Math.round(entry.expense * 100) / 100
      entry.net = Math.round(entry.net * 100) / 100
    }

    return c.json({
      data: {
        wallet,
        months: [...pivoted.values()],
      },
    }, 200)
  })
}
