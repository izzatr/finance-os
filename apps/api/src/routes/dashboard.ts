import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, categories, statementImports, transactionEntries, transactions, wallets } from '@finance-os/db'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'

export function registerDashboardRoutes(app: OpenAPIHono) {
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

  const recentTransactionsRoute = createRoute({
    method: 'get',
    path: '/api/analytics/recent',
    tags: ['analytics'],
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        before: z.string().datetime({ offset: true }).optional(),
        // Composite cursor: quick-added rows share identical timestamps, so paging on
        // the date alone drops tied rows. beforeEntryId (globally unique) breaks ties.
        beforeEntryId: z.string().uuid().optional(),
      }),
    },
    responses: {
      200: {
        description: 'Recent transactions with wallet and category info',
        content: {
          'application/json': {
            schema: z.object({
              data: z.array(z.object({
                id: z.string().uuid(),
                entryId: z.string().uuid(),
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

  app.openapi(dashboardRoute, async (c) => {
    const user = c.get('user')
    const [walletRow] = await db.select({ count: sql<number>`count(*)` }).from(wallets).where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
    // Assets are shared reference data — the count stays global
    const [assetRow] = await db.select({ count: sql<number>`count(*)` }).from(assets)
    const [transactionRow] = await db.select({ count: sql<number>`count(*)` }).from(transactions).where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))
    const [importRow] = await db.select({ count: sql<number>`count(*)` }).from(statementImports).where(eq(statementImports.userId, user.id))

    return c.json({
      data: {
        walletCount: Number(walletRow?.count ?? 0),
        assetCount: Number(assetRow?.count ?? 0),
        transactionCount: Number(transactionRow?.count ?? 0),
        importCount: Number(importRow?.count ?? 0),
      },
    }, 200)
  })

  app.openapi(recentTransactionsRoute, async (c) => {
    const user = c.get('user')
    const { limit, before, beforeEntryId } = c.req.valid('query')
    const cursorDate = before ? new Date(before) : null
    const rows = await db
      .select({
        id: transactions.id,
        entryId: transactionEntries.id,
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
      .where(and(
        eq(transactions.userId, user.id),
        isNull(transactions.deletedAt),
        isNull(wallets.deletedAt),
        ...(cursorDate
          ? [beforeEntryId
              ? or(
                  lt(transactions.transactionDate, cursorDate),
                  and(eq(transactions.transactionDate, cursorDate), lt(transactionEntries.id, beforeEntryId)),
                )!
              : lt(transactions.transactionDate, cursorDate)]
          : []),
      ))
      .orderBy(desc(transactions.transactionDate), desc(transactionEntries.id))
      .limit(limit)

    const data = rows.map((r) => ({
      id: r.id,
      entryId: r.entryId,
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

  app.openapi(assetGrowthRoute, async (c) => {
    const user = c.get('user')
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
          AND t.user_id = ${user.id}
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
}
