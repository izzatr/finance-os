import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { db, assets, categories, statementImports, transactionEntries, transactions, wallets } from '@finance-os/db'
import { assetSchema, statementImportSchema, transactionSchema, walletSchema } from '@finance-os/domain'
import { and, desc, eq, gte, ilike, isNull, isNotNull, lte, sql } from 'drizzle-orm'
import { cors } from 'hono/cors'
import { auth } from '@finance-os/db'
import { checkAuth } from './middleware/auth'

const app = new OpenAPIHono()

// CORS — allow web UI and localhost dev
app.use('*', cors({
  origin: [process.env.WEB_ORIGIN ?? 'http://localhost:27031', 'http://localhost:5173'],
  credentials: true,
}))

// ── Auth API routes (OAuth, sessions, API keys) ──────────────────────────
// Better Auth handles sign-in, sign-up, OAuth, session management, API keys at /auth/*
app.all('/auth/*', async (c) => auth.handler(c.req.raw))

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
          schema: transactionSchema,
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Create transaction',
      content: {
        'application/json': {
          schema: z.object({ data: transactionSchema.extend({ id: z.string().uuid() }) }),
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
  },
})

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

const dashboardRoute = createRoute({
  method: 'get',
  path: '/api/dashboard',
  tags: ['dashboard'],
  responses: {
    200: {
      description: 'Dashboard snapshot',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              walletCount: z.number(),
              assetCount: z.number(),
              transactionCount: z.number(),
              importCount: z.number(),
            }),
          }),
        },
      },
    },
  },
})

app.openapi(healthRoute, (c) => c.json({ ok: true }, 200))

// ── Protected API routes (session or API key auth) ─────────────────────
// Apply auth middleware to all /api/* routes
app.use('/api/*', checkAuth)

app.openapi(listAssetsRoute, async (c) => {
  const rows = await db.select().from(assets).orderBy(assets.code)
  return c.json({ data: rows }, 200)
})

app.openapi(createWalletRoute, async (c) => {
  const payload = c.req.valid('json')
  const [row] = await db.insert(wallets).values({
    name: payload.name,
    walletType: payload.walletType,
    institution: payload.institution ?? null,
    assetId: payload.assetId,
    isActive: payload.isActive ?? true,
  }).returning()

  return c.json({ data: row }, 201)
})

app.openapi(listWalletsRoute, async (c) => {
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
    .where(and(isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
    .groupBy(wallets.id, assets.code)
    .orderBy(wallets.name)

  return c.json({ data: rows }, 200)
})

// ── Wallet detail: transactions per wallet ───────────────────────────────────

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

app.openapi(walletTransactionsRoute, async (c) => {
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
    .where(and(eq(wallets.id, id), isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
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
    })
    .from(transactions)
    .innerJoin(transactionEntries, and(
      eq(transactionEntries.transactionId, transactions.id),
      eq(transactionEntries.walletId, id),
    ))
    .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(isNull(transactions.deletedAt))
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
  }))

  return c.json({
    data: {
      wallet: { ...wallet, balance: Number(wallet.balance) },
      transactions: txData,
    },
  }, 200)
})

// ── Patch wallet ─────────────────────────────────────────────────────────────

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

app.openapi(patchWalletRoute, async (c) => {
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

  const [row] = await db.update(wallets).set(updates).where(and(eq(wallets.id, id), isNull(wallets.deletedAt))).returning()

  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
  }

  return c.json({ data: row }, 200)
})

// ── Patch transaction ────────────────────────────────────────────────────────

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

app.openapi(patchTransactionRoute, async (c) => {
  const { id } = c.req.valid('param')
  const payload = c.req.valid('json')

  // Update transaction header fields
  const txUpdates: Record<string, unknown> = {}
  if (payload.description !== undefined) txUpdates.description = payload.description
  if (payload.type !== undefined) txUpdates.type = payload.type
  if (payload.transactionDate !== undefined) txUpdates.transactionDate = new Date(payload.transactionDate)
  if (payload.notes !== undefined) txUpdates.notes = payload.notes
  if (payload.categoryId !== undefined) txUpdates.categoryId = payload.categoryId

  if (Object.keys(txUpdates).length > 0) {
    const [row] = await db.update(transactions).set(txUpdates).where(and(eq(transactions.id, id), isNull(transactions.deletedAt))).returning()
    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
    }
  }

  // Update entry amount if provided (updates first entry)
  if (payload.amount !== undefined) {
    const entries = await db.select().from(transactionEntries).where(eq(transactionEntries.transactionId, id))
    if (entries.length > 0) {
      await db.update(transactionEntries).set({ amount: payload.amount }).where(eq(transactionEntries.id, entries[0].id))
    }
  }

  // Return updated transaction
  const [updated] = await db.select().from(transactions).where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
  if (!updated) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
  }

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
  const txRows = await db.select().from(transactions).where(isNull(transactions.deletedAt)).orderBy(desc(transactions.transactionDate))
  const entryRows = await db.select().from(transactionEntries)

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
  }))

  return c.json({ data }, 200)
})

app.openapi(createTransactionRoute, async (c) => {
  const payload = c.req.valid('json')

  if (payload.type === 'transfer' && payload.entries.length < 2) {
    return c.json({
      error: {
        code: 'INVALID_TRANSFER',
        message: 'Transfer transactions must include at least two entries.',
      },
    }, 400)
  }

  const [txRow] = await db.insert(transactions).values({
    transactionDate: new Date(payload.transactionDate),
    type: payload.type,
    description: payload.description,
    notes: payload.notes ?? null,
    externalRef: payload.externalRef ?? null,
  }).returning()

  await db.insert(transactionEntries).values(
    payload.entries.map((entry) => ({
      transactionId: txRow.id,
      walletId: entry.walletId,
      assetId: entry.assetId,
      amount: entry.amount,
      notes: entry.notes ?? null,
    })),
  )

  return c.json({ data: { ...payload, id: txRow.id } }, 201)
})

app.openapi(listImportsRoute, async (c) => {
  const rows = await db.select().from(statementImports).orderBy(desc(statementImports.createdAt))
  return c.json({ data: rows }, 200)
})

app.openapi(dashboardRoute, async (c) => {
  const [walletRow] = await db.select({ count: sql<number>`count(*)` }).from(wallets).where(isNull(wallets.deletedAt))
  const [assetRow] = await db.select({ count: sql<number>`count(*)` }).from(assets)
  const [transactionRow] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(isNull(transactions.deletedAt))
  const [importRow] = await db.select({ count: sql<number>`count(*)` }).from(statementImports)

  return c.json({
    data: {
      walletCount: Number(walletRow?.count ?? 0),
      assetCount: Number(assetRow?.count ?? 0),
      transactionCount: Number(transactionRow?.count ?? 0),
      importCount: Number(importRow?.count ?? 0),
    },
  }, 200)
})

// ── Analytics endpoints ──────────────────────────────────────────────────────

const monthlyTrendRoute = createRoute({
  method: 'get',
  path: '/api/analytics/monthly-trend',
  tags: ['analytics'],
  request: {
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Monthly income vs expense trend',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(z.object({
              month: z.string(),
              income: z.number(),
              expense: z.number(),
              net: z.number(),
              currency: z.string(),
            })),
          }),
        },
      },
    },
  },
})

const categoryBreakdownRoute = createRoute({
  method: 'get',
  path: '/api/analytics/category-breakdown',
  tags: ['analytics'],
  request: {
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Spending totals by category',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(z.object({
              categoryId: z.string().uuid().nullable(),
              categoryName: z.string().nullable(),
              categorySlug: z.string().nullable(),
              total: z.number(),
              count: z.number(),
              type: z.string(),
              currency: z.string(),
            })),
          }),
        },
      },
    },
  },
})

const summaryRoute = createRoute({
  method: 'get',
  path: '/api/analytics/summary',
  tags: ['analytics'],
  request: {
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Overall financial summary',
      content: {
        'application/json': {
          schema: z.object({
            data: z.object({
              totalIncome: z.number(),
              totalExpense: z.number(),
              totalTransfers: z.number(),
              net: z.number(),
              transactionCount: z.number(),
              walletCount: z.number(),
              categoryCount: z.number(),
              dateRange: z.object({
                from: z.string().nullable(),
                to: z.string().nullable(),
              }),
              byCurrency: z.array(z.object({
                currency: z.string(),
                income: z.number(),
                expense: z.number(),
                transfer: z.number(),
                adjustment: z.number(),
                fee: z.number(),
                net: z.number(),
              })),
            }),
          }),
        },
      },
    },
  },
})

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

const recentTransactionsRoute = createRoute({
  method: 'get',
  path: '/api/analytics/recent',
  tags: ['analytics'],
  responses: {
    200: {
      description: 'Recent transactions with wallet and category info',
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

app.openapi(listCategoriesRoute, async (c) => {
  const rows = await db.select().from(categories).orderBy(categories.name)
  return c.json({ data: rows }, 200)
})

app.openapi(monthlyTrendRoute, async (c) => {
  const { from, to } = c.req.valid('query')
  const dateFilters = [isNull(transactions.deletedAt)]
  if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
  if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
  const dateCondition = and(...dateFilters)

  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.transactionDate}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<number>`sum(${transactionEntries.amount})`,
      currency: assets.code,
    })
    .from(transactions)
    .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
    .where(dateCondition)
    .groupBy(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`, transactions.type, assets.code)
    .orderBy(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`)

  // Pivot by month+currency
  const pivoted = new Map<string, { month: string; income: number; expense: number; net: number; currency: string }>()

  for (const row of rows) {
    const key = `${row.month}:${row.currency}`
    if (!pivoted.has(key)) {
      pivoted.set(key, { month: row.month, income: 0, expense: 0, net: 0, currency: row.currency })
    }
    const entry = pivoted.get(key)!
    const amount = Number(row.total)

    if (row.type === 'income') {
      entry.income += amount
    } else if (row.type === 'expense') {
      entry.expense += Math.abs(amount)
    }
    // transfers, adjustments, fees not counted in income/expense trend
  }

  for (const entry of pivoted.values()) {
    entry.net = entry.income - entry.expense
    entry.income = Math.round(entry.income * 100) / 100
    entry.expense = Math.round(entry.expense * 100) / 100
    entry.net = Math.round(entry.net * 100) / 100
  }

  return c.json({ data: [...pivoted.values()] }, 200)
})

app.openapi(categoryBreakdownRoute, async (c) => {
  const { from, to } = c.req.valid('query')
  const dateFilters = [isNull(transactions.deletedAt)]
  if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
  if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
  const dateCondition = and(...dateFilters)

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
      total: sql<number>`sum(abs(${transactionEntries.amount}))`,
      count: sql<number>`count(distinct ${transactions.id})`,
      type: transactions.type,
      currency: assets.code,
    })
    .from(transactions)
    .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(dateCondition)
    .groupBy(transactions.categoryId, categories.name, categories.slug, transactions.type, assets.code)
    .orderBy(sql`sum(abs(${transactionEntries.amount})) desc`)

  const data = rows.map((r) => ({
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categorySlug: r.categorySlug,
    total: Math.round(Number(r.total) * 100) / 100,
    count: Number(r.count),
    type: r.type,
    currency: r.currency,
  }))

  return c.json({ data }, 200)
})

app.openapi(summaryRoute, async (c) => {
  const { from, to } = c.req.valid('query')

  const dateFilters = [isNull(transactions.deletedAt)]
  if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
  if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
  const dateCondition = and(...dateFilters)

  // Income/expense by currency (for display)
  const byCurrencyRows = await db
    .select({
      currency: assets.code,
      type: transactions.type,
      total: sql<number>`sum(${transactionEntries.amount})`,
    })
    .from(transactions)
    .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
    .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
    .where(dateCondition)
    .groupBy(assets.code, transactions.type)

  // Actual net balance per currency (sum of all wallet balances)
  const balanceRows = await db
    .select({
      currency: assets.code,
      balance: sql<number>`coalesce(sum(${transactionEntries.amount}), 0)`,
    })
    .from(wallets)
    .innerJoin(assets, eq(assets.id, wallets.assetId))
    .leftJoin(transactionEntries, eq(transactionEntries.walletId, wallets.id))
    .leftJoin(transactions, eq(transactions.id, transactionEntries.transactionId))
    .where(and(isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
    .groupBy(assets.code)

  const balanceByCurrency = new Map(balanceRows.map((r) => [r.currency, Number(r.balance)]))

  type CurrencyEntry = { income: number; expense: number; transfer: number; adjustment: number; fee: number }
  const currencyMap = new Map<string, CurrencyEntry>()
  let totalIncome = 0
  let totalExpense = 0
  let totalTransfers = 0

  const emptyEntry = (): CurrencyEntry => ({ income: 0, expense: 0, transfer: 0, adjustment: 0, fee: 0 })

  for (const row of byCurrencyRows) {
    const amount = Number(row.total)
    if (!currencyMap.has(row.currency)) {
      currencyMap.set(row.currency, emptyEntry())
    }
    const entry = currencyMap.get(row.currency)!

    if (row.type === 'income') {
      entry.income += amount
      totalIncome += amount
    } else if (row.type === 'expense') {
      entry.expense += amount // keep as negative
      totalExpense += Math.abs(amount)
    } else if (row.type === 'transfer') {
      entry.transfer += amount
      totalTransfers += Math.abs(amount)
    } else if (row.type === 'adjustment') {
      entry.adjustment += amount
    } else if (row.type === 'fee') {
      entry.fee += amount
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100

  const byCurrency = [...currencyMap.entries()].map(([currency, vals]) => ({
    currency,
    income: r2(vals.income),
    expense: r2(vals.expense),
    transfer: r2(vals.transfer),
    adjustment: r2(vals.adjustment),
    fee: r2(vals.fee),
    net: r2(balanceByCurrency.get(currency) ?? 0),
  }))

  // Counts
  const [txCount] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(dateCondition)
  const [wCount] = await db.select({ count: sql<number>`count(*)` }).from(wallets).where(isNull(wallets.deletedAt))
  const [catCount] = await db.select({ count: sql<number>`count(*)` }).from(categories)

  // Date range
  const [dateRange] = await db
    .select({
      minDate: sql<string>`min(${transactions.transactionDate})`,
      maxDate: sql<string>`max(${transactions.transactionDate})`,
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))

  return c.json({
    data: {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      totalTransfers: Math.round(totalTransfers * 100) / 100,
      net: Math.round((totalIncome - totalExpense) * 100) / 100,
      transactionCount: Number(txCount?.count ?? 0),
      walletCount: Number(wCount?.count ?? 0),
      categoryCount: Number(catCount?.count ?? 0),
      dateRange: {
        from: dateRange?.minDate ?? null,
        to: dateRange?.maxDate ?? null,
      },
      byCurrency,
    },
  }, 200)
})

app.openapi(recentTransactionsRoute, async (c) => {
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
    .where(and(isNull(transactions.deletedAt), isNull(wallets.deletedAt)))
    .orderBy(desc(transactions.transactionDate))
    .limit(50)

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

// ── Monthly asset growth (cumulative balance per month per currency) ─────────

const assetGrowthRoute = createRoute({
  method: 'get',
  path: '/api/analytics/asset-growth',
  tags: ['analytics'],
  request: {
    query: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Cumulative balance per month per currency',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(z.object({
              month: z.string(),
              currency: z.string(),
              balance: z.number(),
            })),
          }),
        },
      },
    },
  },
})

app.openapi(assetGrowthRoute, async (c) => {
  // Always compute cumulative from all time — from/to only filters the output range
  const rows = await db.execute(sql`
    SELECT
      month,
      currency,
      ROUND(CAST(SUM(month_total) OVER (PARTITION BY currency ORDER BY month) AS numeric), 2) AS balance
    FROM (
      SELECT
        to_char(t.transaction_date, 'YYYY-MM') AS month,
        a.code AS currency,
        SUM(te.amount) AS month_total
      FROM transactions t
      INNER JOIN transaction_entries te ON te.transaction_id = t.id
      INNER JOIN assets a ON a.id = te.asset_id
      WHERE t.deleted_at IS NULL
      GROUP BY to_char(t.transaction_date, 'YYYY-MM'), a.code
    ) monthly
    ORDER BY month, currency
  `)

  const { from, to } = c.req.valid('query')
  const resultRows = rows.rows as Array<{ month: string; currency: string; balance: string }>

  // Collect all months and all currencies
  const allMonths = [...new Set(resultRows.map((r) => r.month))].sort()
  const allCurrencies = [...new Set(resultRows.map((r) => r.currency))]

  // Build a lookup of existing data
  const lookup = new Map<string, number>()
  for (const r of resultRows) {
    lookup.set(`${r.month}:${r.currency}`, Number(r.balance))
  }

  // Fill gaps: for each month, carry forward the last known balance per currency
  const lastBalance = new Map<string, number>()
  const allData: Array<{ month: string; currency: string; balance: number }> = []

  for (const month of allMonths) {
    for (const currency of allCurrencies) {
      const key = `${month}:${currency}`
      const balance = lookup.get(key)
      if (balance !== undefined) {
        lastBalance.set(currency, balance)
        allData.push({ month, currency, balance })
      } else {
        const prev = lastBalance.get(currency)
        if (prev !== undefined) {
          allData.push({ month, currency, balance: prev })
        }
      }
    }
  }

  // Filter output by date range (from/to are YYYY-MM-DD, months are YYYY-MM)
  const fromMonth = from ? from.substring(0, 7) : null
  const toMonth = to ? to.substring(0, 7) : null
  const data = allData.filter((d) => {
    if (fromMonth && d.month < fromMonth) return false
    if (toMonth && d.month > toMonth) return false
    return true
  })

  return c.json({ data }, 200)
})

// ── Soft-delete endpoints ────────────────────────────────────────────────────

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

app.openapi(deleteTransactionRoute, async (c) => {
  const { id } = c.req.valid('param')
  const now = new Date()
  const [row] = await db.update(transactions).set({ deletedAt: now }).where(and(eq(transactions.id, id), isNull(transactions.deletedAt))).returning()
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
  }
  return c.json({ data: { id: row.id, deletedAt: now.toISOString() } }, 200)
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

app.openapi(deleteWalletRoute, async (c) => {
  const { id } = c.req.valid('param')
  const now = new Date()
  const [row] = await db.update(wallets).set({ deletedAt: now }).where(and(eq(wallets.id, id), isNull(wallets.deletedAt))).returning()
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
  }
  return c.json({ data: { id: row.id, deletedAt: now.toISOString() } }, 200)
})

// ── Restore endpoints ───────────────────────────────────────────────────────

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

app.openapi(restoreTransactionRoute, async (c) => {
  const { id } = c.req.valid('param')
  const [row] = await db.update(transactions).set({ deletedAt: null }).where(and(eq(transactions.id, id), isNotNull(transactions.deletedAt))).returning()
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } }, 404)
  }
  return c.json({ data: { id: row.id } }, 200)
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

app.openapi(restoreWalletRoute, async (c) => {
  const { id } = c.req.valid('param')
  const [row] = await db.update(wallets).set({ deletedAt: null }).where(and(eq(wallets.id, id), isNotNull(wallets.deletedAt))).returning()
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
  }
  return c.json({ data: { id: row.id } }, 200)
})

// ── Search transactions ─────────────────────────────────────────────────────

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

app.openapi(searchTransactionsRoute, async (c) => {
  const { q, wallet, category, from, to, includeDeleted } = c.req.valid('query')

  const filters = []
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

  const condition = filters.length > 0 ? and(...filters) : undefined

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

// ── Bulk create transactions ────────────────────────────────────────────────

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
  },
})

app.openapi(bulkCreateTransactionsRoute, async (c) => {
  const payload = c.req.valid('json')
  const ids: string[] = []

  for (const tx of payload.transactions) {
    const [txRow] = await db.insert(transactions).values({
      transactionDate: new Date(tx.transactionDate),
      type: tx.type,
      description: tx.description,
      notes: tx.notes ?? null,
      externalRef: tx.externalRef ?? null,
    }).returning()

    await db.insert(transactionEntries).values(
      tx.entries.map((entry) => ({
        transactionId: txRow.id,
        walletId: entry.walletId,
        assetId: entry.assetId,
        amount: entry.amount,
        notes: entry.notes ?? null,
      })),
    )

    ids.push(txRow.id)
  }

  return c.json({ data: { created: ids.length, ids } }, 201)
})

// ── Create category ─────────────────────────────────────────────────────────

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

// ── Patch category ──────────────────────────────────────────────────────────

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

// ── Wallet monthly summary ──────────────────────────────────────────────────

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

app.openapi(walletMonthlySummaryRoute, async (c) => {
  const { id } = c.req.valid('param')

  const [wallet] = await db
    .select({
      id: wallets.id,
      name: wallets.name,
      currency: assets.code,
    })
    .from(wallets)
    .innerJoin(assets, eq(assets.id, wallets.assetId))
    .where(and(eq(wallets.id, id), isNull(wallets.deletedAt)))

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
    .where(and(eq(transactionEntries.walletId, id), isNull(transactions.deletedAt)))
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

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Finance OS API',
    version: '0.1.0',
    description: 'AI-ready API for wallets, assets, transactions, and imports.',
  },
})

export default app
