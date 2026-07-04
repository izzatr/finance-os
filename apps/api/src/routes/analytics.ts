import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assets, categories, transactionEntries, transactions, wallets } from '@finance-os/db'
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'

export function registerAnalyticsRoutes(app: OpenAPIHono) {
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

  app.openapi(monthlyTrendRoute, async (c) => {
    const user = c.get('user')
    const { from, to } = c.req.valid('query')
    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt)]
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
    const user = c.get('user')
    const { from, to } = c.req.valid('query')
    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt)]
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
    const user = c.get('user')
    const { from, to } = c.req.valid('query')

    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt)]
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
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt), isNull(transactions.deletedAt)))
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
    const [wCount] = await db.select({ count: sql<number>`count(*)` }).from(wallets).where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt)))
    const [catCount] = await db.select({ count: sql<number>`count(*)` }).from(categories).where(eq(categories.userId, user.id))

    // Date range
    const [dateRange] = await db
      .select({
        minDate: sql<string>`min(${transactions.transactionDate})`,
        maxDate: sql<string>`max(${transactions.transactionDate})`,
      })
      .from(transactions)
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt)))

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
}
