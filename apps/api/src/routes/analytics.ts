import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { db, assetPrices, assets, categories, exchangeRates, transactionEntries, transactionSplits, transactions, wallets } from '@finance-os/db'
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import { convertAmount, getLatestRates } from '../lib/fx'
import { latestPortfolioValuesForWallets } from '../portfolio/valuation'
import { buildMonthReport, shiftMonth, type ReportRow } from '../analytics/month-report'

export function registerAnalyticsRoutes(app: OpenAPIHono) {
  const monthlyTrendRoute = createRoute({
    method: 'get',
    path: '/api/analytics/monthly-trend',
    tags: ['analytics'],
    request: {
      query: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        walletId: z.preprocess((value) => value === undefined ? [] : Array.isArray(value) ? value : [value], z.array(z.string().uuid())).optional(),
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
        type: z.enum(['income', 'expense', 'transfer']).default('expense'),
        walletId: z.preprocess((value) => value === undefined ? [] : Array.isArray(value) ? value : [value], z.array(z.string().uuid())).optional(),
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
        walletId: z.preprocess((value) => value === undefined ? [] : Array.isArray(value) ? value : [value], z.array(z.string().uuid())).optional(),
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

  const netWorthRoute = createRoute({
    method: 'get',
    path: '/api/analytics/net-worth',
    tags: ['analytics'],
    request: {
      query: z.object({
        currency: z.string().optional(),
        months: z.coerce.number().int().optional(),
        walletId: z.preprocess((value) => value === undefined ? [] : Array.isArray(value) ? value : [value], z.array(z.string().uuid())).optional(),
      }),
    },
    responses: {
      200: {
        description: 'Net worth over time, converted into a single display currency',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                currency: z.string(),
                asOf: z.string(),
                total: z.number(),
                series: z.array(z.object({ month: z.string(), total: z.number() })),
                staleRates: z.boolean(),
                missing: z.array(z.string()),
              }),
            }),
          },
        },
      },
    },
  })

  const monthReportRoute = createRoute({
    method: 'get',
    path: '/api/analytics/month-report',
    tags: ['analytics'],
    description: 'One month of income and spending in a single display currency: totals against the usual (average of up to 3 earlier active months), spending pace by day, categories, top merchants, biggest purchases and 12 months of cash flow. Spending is your share: split amounts other people owe you are excluded and reported as `fronted`.',
    request: {
      query: z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
        currency: z.string().length(3).optional(),
        today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        walletId: z.preprocess((value) => value === undefined ? [] : Array.isArray(value) ? value : [value], z.array(z.string().uuid())).optional(),
      }),
    },
    responses: {
      200: {
        description: 'Month report',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                month: z.string(),
                currency: z.string(),
                daysInMonth: z.number(),
                daysElapsed: z.number(),
                income: z.number(),
                spent: z.number(),
                fronted: z.number(),
                net: z.number(),
                savingsRate: z.number().nullable(),
                usual: z.object({ months: z.number(), income: z.number(), spent: z.number(), net: z.number(), savingsRate: z.number().nullable() }).nullable(),
                pace: z.array(z.object({ day: z.number(), current: z.number().nullable(), usual: z.number().nullable() })),
                spentByNow: z.number(),
                usualByNow: z.number().nullable(),
                categories: z.array(z.object({ id: z.string().nullable(), name: z.string(), spent: z.number(), usual: z.number().nullable(), count: z.number() })),
                merchants: z.array(z.object({ name: z.string(), spent: z.number(), count: z.number() })),
                biggest: z.array(z.object({ transactionId: z.string(), description: z.string(), date: z.string(), spent: z.number(), categoryName: z.string().nullable() })),
                incomeSources: z.array(z.object({ name: z.string(), amount: z.number() })),
                history: z.array(z.object({ month: z.string(), income: z.number(), spent: z.number(), net: z.number() })),
                missing: z.array(z.string()),
              }),
            }),
          },
        },
      },
    },
  })

  app.openapi(monthReportRoute, async (c) => {
    const user = c.get('user')
    const query = c.req.valid('query')
    const today = query.today ?? new Date().toISOString().slice(0, 10)
    const month = query.month ?? today.slice(0, 7)
    const currency = (query.currency ?? 'EUR').toUpperCase()
    const walletId = query.walletId ?? []

    // 12 months of history ending at `month`; the 3-month baseline falls inside it.
    const first = shiftMonth(month, -11)
    const from = new Date(`${first}-01T00:00:00.000Z`)
    const to = new Date(`${shiftMonth(month, 1)}-01T00:00:00.000Z`)

    const rows = await db
      .select({
        transactionId: transactions.id,
        transactionDate: transactions.transactionDate,
        type: transactions.type,
        amount: transactionEntries.amount,
        currency: assets.code,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        description: transactions.description,
      })
      .from(transactions)
      .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
      .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(
        eq(transactions.userId, user.id),
        isNull(transactions.deletedAt),
        inArray(transactions.type, ['income', 'expense']),
        gte(transactions.transactionDate, from),
        lt(transactions.transactionDate, to),
        ...(walletId.length ? [inArray(transactionEntries.walletId, walletId)] : []),
      ))

    const txIds = [...new Set(rows.map((r) => r.transactionId))]
    const splitRows = txIds.length === 0 ? [] : await db
      .select({ transactionId: transactionSplits.transactionId, amount: transactionSplits.amount, currency: assets.code })
      .from(transactionSplits)
      .innerJoin(assets, eq(assets.id, transactionSplits.assetId))
      .where(inArray(transactionSplits.transactionId, txIds))

    const rates = await getLatestRates()
    const report = buildMonthReport({
      month,
      currency,
      today,
      rows: rows.map((r): ReportRow => ({
        transactionId: r.transactionId,
        date: r.transactionDate.toISOString().slice(0, 10),
        type: r.type as 'income' | 'expense',
        amount: Number(r.amount),
        currency: r.currency,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        description: r.description ?? '',
      })),
      splits: splitRows.map((s) => ({ transactionId: s.transactionId, amount: Number(s.amount), currency: s.currency })),
      convert: (amount, fromCode) => (fromCode === currency || (rates.has(fromCode) && rates.has(currency)) ? convertAmount(amount, fromCode, currency, rates) : null),
    })

    return c.json({ data: report }, 200)
  })

  app.openapi(monthlyTrendRoute, async (c) => {
    const user = c.get('user')
    const { from, to, walletId = [] } = c.req.valid('query')
    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt)]
    if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
    if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
    if (walletId.length) dateFilters.push(inArray(transactionEntries.walletId, walletId))
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
    const { from, to, type, walletId = [] } = c.req.valid('query')
    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt), eq(categories.type, type)]
    if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
    if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
    if (walletId.length) dateFilters.push(inArray(transactionEntries.walletId, walletId))
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
      .innerJoin(categories, eq(categories.id, transactions.categoryId))
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
    const { from, to, walletId = [] } = c.req.valid('query')

    const dateFilters = [eq(transactions.userId, user.id), isNull(transactions.deletedAt)]
    if (from) dateFilters.push(gte(transactions.transactionDate, new Date(from)))
    if (to) dateFilters.push(lte(transactions.transactionDate, new Date(to)))
    if (walletId.length) dateFilters.push(inArray(transactionEntries.walletId, walletId))
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
      .where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt), isNull(transactions.deletedAt), ...(walletId.length ? [inArray(wallets.id, walletId)] : [])))
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
    const [wCount] = await db.select({ count: sql<number>`count(*)` }).from(wallets).where(and(eq(wallets.userId, user.id), isNull(wallets.deletedAt), ...(walletId.length ? [inArray(wallets.id, walletId)] : [])))
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

  app.openapi(netWorthRoute, async (c) => {
    const user = c.get('user')
    const { currency: rawCurrency, months: rawMonths, walletId = [] } = c.req.valid('query')
    const currency = (rawCurrency ?? 'EUR').toUpperCase()
    const months = Math.min(60, Math.max(1, rawMonths ?? 12))

    const now = new Date()
    // The `months` calendar months ending at (and including) the current UTC month.
    const targetMonths: string[] = []
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      targetMonths.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }

    // Per-asset monthly net movement, over ALL history (not just the window) — a month
    // with no activity still carries forward the balance built up in earlier months, so
    // the cumulative sum has to start from the asset's very first transaction.
    const rows = await db
      .select({
        assetId: transactionEntries.assetId,
        assetCode: assets.code,
        assetUnit: assets.unit,
        month: sql<string>`to_char(date_trunc('month', ${transactions.transactionDate}), 'YYYY-MM')`,
        // Numeric string straight from SQL — kept as a string until the cumulative-sum
        // step below, which is this route's Number() conversion boundary. This is
        // analytics display math, not ledger-of-record math, so double precision here
        // is an accepted tradeoff.
        total: sql<string>`sum(${transactionEntries.amount})`,
      })
      .from(transactions)
      .innerJoin(transactionEntries, eq(transactionEntries.transactionId, transactions.id))
      .innerJoin(assets, eq(assets.id, transactionEntries.assetId))
      .where(and(eq(transactions.userId, user.id), isNull(transactions.deletedAt), ...(walletId.length ? [inArray(transactionEntries.walletId, walletId)] : [])))
      .groupBy(transactionEntries.assetId, assets.code, assets.unit, sql`date_trunc('month', ${transactions.transactionDate})`)
      .orderBy(transactionEntries.assetId, sql`date_trunc('month', ${transactions.transactionDate})`)

    type AssetSeries = { code: string; unit: string | null; monthly: { month: string; cumulative: number }[] }
    const byAsset = new Map<string, AssetSeries>()
    for (const row of rows) {
      if (!byAsset.has(row.assetId)) byAsset.set(row.assetId, { code: row.assetCode, unit: row.assetUnit, monthly: [] })
      const series = byAsset.get(row.assetId)!
      const prevCumulative = series.monthly.length > 0 ? series.monthly[series.monthly.length - 1].cumulative : 0
      series.monthly.push({ month: row.month, cumulative: prevCumulative + Number(row.total) })
    }

    // Cumulative balance as of the end of `targetMonth` — the last data point at or
    // before it (months are sorted ascending, so this is a running carry-forward).
    function balanceAsOf(monthly: AssetSeries['monthly'], targetMonth: string): number {
      let balance = 0
      for (const entry of monthly) {
        if (entry.month > targetMonth) break
        balance = entry.cumulative
      }
      return balance
    }

    const rates = await getLatestRates()

    // Simplification (documented): the whole series is converted using TODAY's latest
    // rates, not the rate that was in effect at each historical month. Good enough for
    // a display chart; a historically-accurate series would need a rate lookup per month.
    function canConvert(from: string, to: string): boolean {
      return from === to || (rates.has(from) && rates.has(to))
    }

    // Freshness of the EUR-based rate set used above.
    const [{ maxAsOf }] = await db
      .select({ maxAsOf: sql<string | null>`max(${exchangeRates.asOf})` })
      .from(exchangeRates)
      .where(eq(exchangeRates.base, 'EUR'))
    const asOfDate = maxAsOf ? new Date(maxAsOf) : now
    const staleRates = now.getTime() - asOfDate.getTime() > 7 * 24 * 60 * 60 * 1000

    // Quantity assets (assets.unit set, e.g. XAU_G) are valued via the latest known
    // asset_prices row instead of an exchange rate: value = qty * price, with the
    // price's own currency converted into the display currency.
    const quantityAssetIds = [...byAsset.entries()].filter(([, s]) => s.unit !== null).map(([id]) => id)
    const priceByAsset = new Map<string, { price: number; currency: string }>()
    if (quantityAssetIds.length > 0) {
      const priceRows = await db
        .select()
        .from(assetPrices)
        .where(inArray(assetPrices.assetId, quantityAssetIds))
        .orderBy(desc(assetPrices.asOf))
      for (const p of priceRows) {
        if (!priceByAsset.has(p.assetId)) priceByAsset.set(p.assetId, { price: Number(p.price), currency: p.currency })
      }
    }

    const missing = new Set<string>()
    const seriesTotals = targetMonths.map(() => 0)

    for (const [assetId, series] of byAsset) {
      if (series.unit !== null) {
        const priceInfo = priceByAsset.get(assetId)
        if (!priceInfo || !canConvert(priceInfo.currency, currency)) {
          missing.add(series.code)
          continue
        }
        const priceInDisplay = convertAmount(priceInfo.price, priceInfo.currency, currency, rates)
        targetMonths.forEach((month, i) => {
          const qty = balanceAsOf(series.monthly, month)
          seriesTotals[i] += qty * priceInDisplay
        })
      } else {
        if (!canConvert(series.code, currency)) {
          missing.add(series.code)
          continue
        }
        targetMonths.forEach((month, i) => {
          const balance = balanceAsOf(series.monthly, month)
          seriesTotals[i] += convertAmount(balance, series.code, currency, rates)
        })
      }
    }

    // Holdings are a separate subledger from transaction balances. Add their
    // latest complete EOD value to the current month so wallet cash and market
    // positions both contribute to current net worth without double-counting.
    const investmentWallets = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.userId, user.id), eq(wallets.walletType, 'investment'), eq(wallets.isActive, true), isNull(wallets.deletedAt), ...(walletId.length ? [inArray(wallets.id, walletId)] : [])))
    const portfolioValues = await latestPortfolioValuesForWallets(new Map(investmentWallets.map((wallet) => [wallet.id, currency])))
    let currentPortfolioValue = 0
    for (const value of portfolioValues.values()) {
      if (value) currentPortfolioValue += value.value
    }
    if (seriesTotals.length > 0) seriesTotals[seriesTotals.length - 1] += currentPortfolioValue

    const series = targetMonths.map((month, i) => ({ month, total: Math.round(seriesTotals[i] * 100) / 100 }))
    const total = series.length > 0 ? series[series.length - 1].total : 0

    return c.json({
      data: {
        currency,
        asOf: asOfDate.toISOString(),
        total,
        series,
        staleRates,
        missing: [...missing].sort(),
      },
    }, 200)
  })
}
