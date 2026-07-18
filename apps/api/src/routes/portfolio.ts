import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { assets, db, exchanges, holdingPositionEvents, holdings, instruments, listingPrices, listings, providerSymbols, wallets } from '@finance-os/db'
import { holdingCreateSchema, holdingPatchSchema, marketSearchQuerySchema } from '@finance-os/domain'
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { convertAmount, getLatestRates } from '../lib/fx'
import { claimManualRefresh, listingIdsForWallet, refreshDueListings, refreshListing, refreshListings } from '../portfolio/service'
import { YahooMarketDataProvider } from '../portfolio/yahoo'
import type { MarketSearchResult } from '../portfolio/yahoo'

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) })
const dataUnknown = z.object({ data: z.any() })
const yahooSearchCache = new Map<string, { expiresAt: number; promise: Promise<MarketSearchResult[]> }>()

function cachedYahooSearch(query: string, limit: number): Promise<MarketSearchResult[]> {
  const key = `${query.trim().toUpperCase()}:${limit}`
  const now = Date.now()
  const cached = yahooSearchCache.get(key)
  if (cached && cached.expiresAt > now) return cached.promise
  if (yahooSearchCache.size >= 500) {
    for (const [cacheKey, entry] of yahooSearchCache) if (entry.expiresAt <= now) yahooSearchCache.delete(cacheKey)
    if (yahooSearchCache.size >= 500) yahooSearchCache.delete(yahooSearchCache.keys().next().value!)
  }
  const promise = new YahooMarketDataProvider().search(query, limit)
    .catch((error) => { yahooSearchCache.delete(key); throw error })
  yahooSearchCache.set(key, { expiresAt: now + 60_000, promise })
  return promise
}

async function resolveYahooSymbol(symbol: string): Promise<MarketSearchResult> {
  const normalized = symbol.trim().toUpperCase()
  const exact = (await cachedYahooSearch(normalized, 25)).find((item) => item.providerSymbol.toUpperCase() === normalized)
  if (!exact) throw new Error('Yahoo symbol was not found')
  return exact
}

async function userHoldingRows(userId: string, walletId?: string, holdingId?: string, listingId?: string) {
  const conditions = [
    eq(wallets.userId, userId),
    eq(wallets.walletType, 'investment'),
    eq(wallets.isActive, true),
    isNull(wallets.deletedAt),
    eq(listings.isActive, true),
  ]
  if (walletId) conditions.push(eq(wallets.id, walletId))
  if (holdingId) conditions.push(eq(holdings.id, holdingId))
  if (listingId) conditions.push(eq(listings.id, listingId))
  return db.select({
    id: holdings.id, walletId: holdings.walletId, walletName: wallets.name, quantity: holdings.quantity,
    averageCost: holdings.averageCost, costCurrency: holdings.costCurrency, listingId: listings.id, symbol: listings.symbol,
    currency: listings.currency, exchangeCode: exchanges.code, exchangeName: exchanges.name, timezone: exchanges.timezone,
    instrumentName: instruments.name, instrumentType: instruments.type, providerSymbol: providerSymbols.symbol,
    lastRefreshAt: listings.lastRefreshAt, lastSuccessAt: listings.lastSuccessAt, refreshError: listings.refreshError,
  }).from(holdings)
    .innerJoin(wallets, eq(wallets.id, holdings.walletId))
    .innerJoin(listings, eq(listings.id, holdings.listingId))
    .innerJoin(instruments, eq(instruments.id, listings.instrumentId))
    .innerJoin(exchanges, eq(exchanges.id, listings.exchangeId))
    .innerJoin(providerSymbols, and(eq(providerSymbols.listingId, listings.id), eq(providerSymbols.provider, 'yahoo')))
    .where(and(...conditions)).orderBy(asc(instruments.name), asc(listings.symbol))
}

function holdingResponse(row: Awaited<ReturnType<typeof userHoldingRows>>[number]) {
  return { id: row.id, walletId: row.walletId, walletName: row.walletName, quantity: row.quantity, averageCost: row.averageCost, costCurrency: row.costCurrency,
    listing: { id: row.listingId, symbol: row.symbol, provider: 'yahoo', providerSymbol: row.providerSymbol, currency: row.currency,
      exchangeCode: row.exchangeCode, exchangeName: row.exchangeName, timezone: row.timezone, instrumentName: row.instrumentName, instrumentType: row.instrumentType,
      lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null, lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null, refreshError: row.refreshError } }
}

async function ownedWallet(userId: string, walletId: string) {
  const [row] = await db.select({ id: wallets.id, assetCode: assets.code, walletType: wallets.walletType }).from(wallets).innerJoin(assets, eq(assets.id, wallets.assetId))
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId), eq(wallets.walletType, 'investment'), eq(wallets.isActive, true), isNull(wallets.deletedAt))).limit(1)
  return row
}

export function registerPortfolioRoutes(app: OpenAPIHono) {
  const searchRoute = createRoute({ method: 'get', path: '/api/portfolio/search', tags: ['portfolio'], request: { query: marketSearchQuerySchema }, responses: { 200: { description: 'Search Yahoo instruments', content: { 'application/json': { schema: dataUnknown } } }, 400: { description: 'Invalid query', content: { 'application/json': { schema: errorSchema } } }, 502: { description: 'Yahoo unavailable', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(searchRoute, async (c) => {
    try {
      return c.json({ data: await cachedYahooSearch(c.req.valid('query').q, c.req.valid('query').limit) }, 200)
    } catch (error) {
      return c.json({ error: { code: 'PROVIDER_ERROR', message: error instanceof Error ? error.message : 'Yahoo search failed' } }, 502)
    }
  })

  const createRouteDef = createRoute({ method: 'post', path: '/api/portfolio/holdings', tags: ['portfolio'], request: { body: { content: { 'application/json': { schema: holdingCreateSchema } } } }, responses: { 201: { description: 'Create holding', content: { 'application/json': { schema: dataUnknown } } }, 404: { description: 'Wallet or Yahoo symbol not found', content: { 'application/json': { schema: errorSchema } } }, 409: { description: 'Holding exists', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(createRouteDef, async (c) => {
    const user = c.get('user'); const input = c.req.valid('json')
    const wallet = await ownedWallet(user.id, input.walletId)
    if (!wallet) return c.json({ error: { code: 'NOT_FOUND', message: 'Investment wallet not found' } }, 404)

    const [knownMapping] = await db.select({ listingId: providerSymbols.listingId }).from(providerSymbols)
      .where(and(eq(providerSymbols.provider, 'yahoo'), eq(providerSymbols.symbol, input.providerSymbol))).limit(1)
    let canonical: Awaited<ReturnType<YahooMarketDataProvider['resolveSymbol']>> | null = null
    if (!knownMapping) {
      try {
        canonical = await resolveYahooSymbol(input.providerSymbol)
      } catch {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Yahoo symbol not found' } }, 404)
      }
    }

    try {
      const holdingId = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'yahoo:' + input.providerSymbol}))`)
        let [mapping] = await tx.select({ listingId: providerSymbols.listingId }).from(providerSymbols).where(and(eq(providerSymbols.provider, 'yahoo'), eq(providerSymbols.symbol, input.providerSymbol))).limit(1)
        if (!mapping) {
          if (!canonical) throw new Error('Yahoo metadata resolution failed')
          let [exchange] = await tx.insert(exchanges).values({
            code: canonical.exchangeCode, name: canonical.exchangeName, mic: canonical.mic, timezone: canonical.timezone ?? 'UTC',
          }).onConflictDoNothing({ target: exchanges.code }).returning()
          if (!exchange) [exchange] = await tx.select().from(exchanges).where(eq(exchanges.code, canonical.exchangeCode)).limit(1)

          let [listing] = await tx.select().from(listings)
            .where(and(eq(listings.exchangeId, exchange.id), eq(listings.symbol, canonical.providerSymbol))).limit(1)
          if (!listing) {
            // Yahoo does not expose a reliable ISIN. Keep this identity provisional until a later reconciliation links listings.
            const [instrument] = await tx.insert(instruments).values({ name: canonical.name, type: canonical.instrumentType }).returning()
            ;[listing] = await tx.insert(listings).values({
              instrumentId: instrument.id, exchangeId: exchange.id, symbol: canonical.providerSymbol, currency: canonical.currency,
            }).returning()
          }
          await tx.insert(providerSymbols).values({ listingId: listing.id, provider: 'yahoo', symbol: canonical.providerSymbol })
          mapping = { listingId: listing.id }
        }
        const [created] = await tx.insert(holdings).values({ walletId: input.walletId, listingId: mapping.listingId, quantity: input.quantity, averageCost: input.averageCost, costCurrency: input.costCurrency }).returning({ id: holdings.id })
        await tx.insert(holdingPositionEvents).values({ walletId: input.walletId, listingId: mapping.listingId, quantity: input.quantity, reason: 'created' })
        return created.id
      })
      const [row] = await userHoldingRows(user.id, undefined, holdingId)
      if (!row) throw new Error('Created holding could not be read back')
      return c.json({ data: holdingResponse(row) }, 201)
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return c.json({ error: { code: 'CONFLICT', message: 'Holding already exists in this wallet' } }, 409)
      throw error
    }
  })

  const listRoute = createRoute({ method: 'get', path: '/api/portfolio/holdings', tags: ['portfolio'], request: { query: z.object({ walletId: z.string().uuid().optional() }) }, responses: { 200: { description: 'List holdings', content: { 'application/json': { schema: dataUnknown } } } } })
  app.openapi(listRoute, async (c) => c.json({ data: (await userHoldingRows(c.get('user').id, c.req.valid('query').walletId)).map(holdingResponse) }, 200))

  const patchRoute = createRoute({
    method: 'patch', path: '/api/portfolio/holdings/{id}', tags: ['portfolio'],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: { content: { 'application/json': { schema: holdingPatchSchema } } },
    },
    responses: {
      200: { description: 'Update holding', content: { 'application/json': { schema: dataUnknown } } },
      404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } },
    },
  })
  app.openapi(patchRoute, async (c) => {
    const input = c.req.valid('json'); const id = c.req.valid('param').id; const now = new Date()
    const [owned] = await userHoldingRows(c.get('user').id, undefined, id)
    if (!owned) return c.json({ error: { code: 'NOT_FOUND', message: 'Holding not found' } }, 404)
    await db.transaction(async (tx) => {
      await tx.update(holdings).set({ ...input, updatedAt: now }).where(eq(holdings.id, id))
      if (input.quantity !== undefined) await tx.insert(holdingPositionEvents).values({
        walletId: owned.walletId, listingId: owned.listingId, quantity: input.quantity, effectiveAt: now, reason: 'updated',
      })
    })
    const [row] = await userHoldingRows(c.get('user').id, undefined, id)
    return c.json({ data: holdingResponse(row) }, 200)
  })

  const deleteRoute = createRoute({ method: 'delete', path: '/api/portfolio/holdings/{id}', tags: ['portfolio'], request: { params: z.object({ id: z.string().uuid() }) }, responses: { 200: { description: 'Delete holding', content: { 'application/json': { schema: dataUnknown } } }, 404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(deleteRoute, async (c) => {
    const id = c.req.valid('param').id
    const [owned] = await userHoldingRows(c.get('user').id, undefined, id)
    if (!owned) return c.json({ error: { code: 'NOT_FOUND', message: 'Holding not found' } }, 404)
    const [deleted] = await db.transaction(async (tx) => {
      await tx.insert(holdingPositionEvents).values({ walletId: owned.walletId, listingId: owned.listingId, quantity: '0', reason: 'deleted' })
      return tx.delete(holdings).where(eq(holdings.id, id)).returning({ id: holdings.id })
    })
    return c.json({ data: deleted }, 200)
  })

  const refreshListingRoute = createRoute({ method: 'post', path: '/api/portfolio/listings/{id}/refresh', tags: ['portfolio'], request: { params: z.object({ id: z.string().uuid() }) }, responses: { 200: { description: 'Refresh listing', content: { 'application/json': { schema: dataUnknown } } }, 404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } }, 429: { description: 'Refresh cooldown', content: { 'application/json': { schema: errorSchema } } }, 502: { description: 'Provider error', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(refreshListingRoute, async (c) => {
    const id = c.req.valid('param').id
    const [owns] = await userHoldingRows(c.get('user').id, undefined, undefined, id)
    if (!owns) return c.json({ error: { code: 'NOT_FOUND', message: 'Listing not found' } }, 404)
    if (!await claimManualRefresh(id, c.get('user').id)) return c.json({ error: { code: 'RATE_LIMITED', message: 'This listing was refreshed recently' } }, 429)
    const result = await refreshListing(id, new YahooMarketDataProvider())
    if (result.error) return c.json({ error: { code: 'PROVIDER_ERROR', message: result.error } }, 502)
    return c.json({ data: result }, 200)
  })

  const refreshWalletRoute = createRoute({ method: 'post', path: '/api/portfolio/wallets/{id}/refresh', tags: ['portfolio'], request: { params: z.object({ id: z.string().uuid() }) }, responses: { 200: { description: 'Refresh wallet listings', content: { 'application/json': { schema: dataUnknown } } }, 404: { description: 'Not found', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(refreshWalletRoute, async (c) => {
    const id = c.req.valid('param').id
    if (!await ownedWallet(c.get('user').id, id)) return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
    const listingIds = await listingIdsForWallet(c.get('user').id, id)
    const claimedIds: string[] = []
    for (const listingId of listingIds) if (await claimManualRefresh(listingId, c.get('user').id)) claimedIds.push(listingId)
    return c.json({ data: await refreshListings(claimedIds, new YahooMarketDataProvider()) }, 200)
  })

  const refreshDueRoute = createRoute({ method: 'post', path: '/api/portfolio/refresh-due', tags: ['portfolio'], responses: { 200: { description: 'Refresh user due listings', content: { 'application/json': { schema: dataUnknown } } } } })
  app.openapi(refreshDueRoute, async (c) => c.json({ data: await refreshDueListings(new YahooMarketDataProvider(), { userId: c.get('user').id }) }, 200))

  registerPortfolioValuationRoutes(app)
}

function registerPortfolioValuationRoutes(app: OpenAPIHono) {
  const query = z.object({ walletId: z.string().uuid().optional(), baseCurrency: z.string().min(3).max(16).optional() })
  const summaryRoute = createRoute({ method: 'get', path: '/api/portfolio/summary', tags: ['portfolio'], request: { query }, responses: { 200: { description: 'Portfolio EOD summary', content: { 'application/json': { schema: dataUnknown } } } } })
  app.openapi(summaryRoute, async (c) => {
    const userId = c.get('user').id; const filters = c.req.valid('query'); const rows = await userHoldingRows(userId, filters.walletId)
    const walletRows = await db.selectDistinct({ id: wallets.id, assetCode: assets.code }).from(wallets).innerJoin(assets, eq(assets.id, wallets.assetId)).where(and(eq(wallets.userId, userId), filters.walletId ? eq(wallets.id, filters.walletId) : undefined))
    const baseCurrency = filters.baseCurrency ?? (new Set(walletRows.map((row) => row.assetCode)).size === 1 ? walletRows[0]?.assetCode ?? null : null)
    const ids = rows.map((row) => row.listingId)
    const byListing = new Map<string, Array<{ priceDate: string; close: string; currency: string; source: string }>>()
    if (ids.length) {
      const priceRows = await db.execute<{ listingId: string; priceDate: string; close: string; currency: string; source: string }>(sql`
        SELECT listing_id AS "listingId", price_date::text AS "priceDate", close::text, currency, source
        FROM (
          SELECT lp.*, row_number() OVER (PARTITION BY listing_id ORDER BY price_date DESC, updated_at DESC) AS rn
          FROM listing_prices lp WHERE listing_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
        ) ranked WHERE rn <= 2 ORDER BY listing_id, price_date DESC
      `)
      for (const price of priceRows.rows) byListing.set(price.listingId, [...(byListing.get(price.listingId) ?? []), price])
    }
    const rates = baseCurrency ? await getLatestRates() : new Map<string, number>()
    const now = Date.now()
    const valued = rows.map((row) => {
      const [price, previous] = byListing.get(row.listingId) ?? []
      const nativeValue = price ? Number(row.quantity) * Number(price.close) : null
      const previousNativeValue = previous ? Number(row.quantity) * Number(previous.close) : null
      let baseValue: number | null = null
      let previousBaseValue: number | null = null
      if (nativeValue !== null && baseCurrency) try { baseValue = convertAmount(nativeValue, price.currency, baseCurrency, rates) } catch { baseValue = null }
      if (previousNativeValue !== null && baseCurrency) try { previousBaseValue = convertAmount(previousNativeValue, previous.currency, baseCurrency, rates) } catch { previousBaseValue = null }
      const priceAge = price ? now - new Date(`${price.priceDate}T23:59:59Z`).getTime() : Infinity
      const priceStatus = !price ? 'missing' : row.refreshError ? 'error' : priceAge > 96 * 3_600_000 ? 'stale' : 'fresh'
      const dailyChangePercent = price && previous && Number(previous.close) !== 0 ? ((Number(price.close) - Number(previous.close)) / Number(previous.close)) * 100 : null
      return { ...holdingResponse(row), price: price ? Number(price.close) : null, previousClose: previous ? Number(previous.close) : null, priceDate: price?.priceDate ?? null, nativeCurrency: price?.currency ?? row.currency, nativeValue, baseValue, previousBaseValue, dailyChangePercent, priceStatus }
    })
    const baseValues = valued.map((row) => row.baseValue)
    const totalBaseValue = valued.length > 0 && baseValues.every((value) => value !== null) ? baseValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
    const previousBaseValues = valued.map((row) => row.previousBaseValue)
    const previousTotal = valued.length > 0 && previousBaseValues.every((value) => value !== null) ? previousBaseValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null
    const dailyChangeBase = totalBaseValue !== null && previousTotal !== null ? totalBaseValue - previousTotal : null
    const dailyChangePercent = dailyChangeBase !== null && previousTotal ? (dailyChangeBase / previousTotal) * 100 : null
    const nativeTotals: Record<string, number> = {}; for (const row of valued) if (row.nativeValue !== null) nativeTotals[row.nativeCurrency] = (nativeTotals[row.nativeCurrency] ?? 0) + row.nativeValue
    const statuses = valued.map((row) => row.priceStatus)
    const status = valued.length === 0 ? 'empty' : statuses.every((value) => value === 'fresh') ? 'fresh' : statuses.every((value) => value === 'stale') ? 'stale' : 'partial'
    const asOf = rows.map((row) => row.lastSuccessAt?.toISOString() ?? null).filter(Boolean).sort().at(-1) ?? null
    return c.json({ data: { baseCurrency, totalBaseValue, dailyChangeBase, dailyChangePercent, nativeTotals, asOf, source: 'yahoo', status, holdings: valued } }, 200)
  })

  const historyRoute = createRoute({ method: 'get', path: '/api/portfolio/history', tags: ['portfolio'], request: { query: query.extend({ from: z.string().date(), to: z.string().date() }).refine((v) => v.from <= v.to) }, responses: { 200: { description: 'Portfolio EOD history', content: { 'application/json': { schema: dataUnknown } } }, 400: { description: 'Range too large', content: { 'application/json': { schema: errorSchema } } } } })
  app.openapi(historyRoute, async (c) => {
    const filters = c.req.valid('query'); const start = new Date(`${filters.from}T00:00:00Z`); const end = new Date(`${filters.to}T00:00:00Z`)
    if ((end.getTime() - start.getTime()) / 86_400_000 > 366) return c.json({ error: { code: 'RANGE_TOO_LARGE', message: 'History is limited to 366 days' } }, 400)
    const endExclusive = new Date(end); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    const events = await db.select({
      walletId: holdingPositionEvents.walletId, listingId: holdingPositionEvents.listingId,
      quantity: holdingPositionEvents.quantity, effectiveAt: holdingPositionEvents.effectiveAt,
    }).from(holdingPositionEvents).innerJoin(wallets, eq(wallets.id, holdingPositionEvents.walletId)).where(and(
      eq(wallets.userId, c.get('user').id), eq(wallets.walletType, 'investment'), eq(wallets.isActive, true), isNull(wallets.deletedAt),
      filters.walletId ? eq(wallets.id, filters.walletId) : undefined,
      lt(holdingPositionEvents.effectiveAt, endExclusive),
    )).orderBy(asc(holdingPositionEvents.effectiveAt))
    const ids = [...new Set(events.map((event) => event.listingId))]
    type HistoryPrice = { listingId: string; priceDate: string; close: string; currency: string; source: string }
    const prices = ids.length ? (await db.execute<HistoryPrice>(sql`
      WITH selected AS (
        SELECT listing_id AS "listingId", price_date::text AS "priceDate", close::text, currency, source
        FROM listing_prices
        WHERE listing_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
          AND price_date BETWEEN ${filters.from}::date AND ${filters.to}::date
        UNION ALL
        (SELECT DISTINCT ON (listing_id) listing_id AS "listingId", price_date::text AS "priceDate", close::text, currency, source
        FROM listing_prices
        WHERE listing_id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
          AND price_date < ${filters.from}::date
        ORDER BY listing_id, price_date DESC, updated_at DESC)
      )
      SELECT * FROM selected ORDER BY "listingId", "priceDate"
    `)).rows : []
    const pricesByListing = new Map<string, HistoryPrice[]>()
    for (const price of prices) pricesByListing.set(price.listingId, [...(pricesByListing.get(price.listingId) ?? []), price])
    const priceCursors = new Map<string, number>()
    const currentPrices = new Map<string, HistoryPrice>()
    const positions = new Map<string, { listingId: string; quantity: number }>()
    let eventCursor = 0
    const baseCurrency = filters.baseCurrency ?? (filters.walletId ? (await ownedWallet(c.get('user').id, filters.walletId))?.assetCode ?? null : null)
    const rates = baseCurrency ? await getLatestRates() : new Map<string, number>()
    const points: Array<{ date: string; nativeTotals: Record<string, number>; baseValue: number | null }> = []
    for (let date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const day = date.toISOString().slice(0, 10)
      while (eventCursor < events.length && events[eventCursor].effectiveAt.toISOString().slice(0, 10) <= day) {
        const event = events[eventCursor++]
        positions.set(`${event.walletId}:${event.listingId}`, { listingId: event.listingId, quantity: Number(event.quantity) })
      }
      const activePositions = [...positions.values()].filter((position) => position.quantity > 0)
      const nativeTotals: Record<string, number> = {}; let complete = activePositions.length > 0; let baseValue = 0
      for (const position of activePositions) {
        const series = pricesByListing.get(position.listingId) ?? []; let cursor = priceCursors.get(position.listingId) ?? 0
        while (cursor < series.length && series[cursor].priceDate <= day) { currentPrices.set(position.listingId, series[cursor]); cursor++ }
        priceCursors.set(position.listingId, cursor)
        const price = currentPrices.get(position.listingId); if (!price) { complete = false; continue }
        const value = position.quantity * Number(price.close); nativeTotals[price.currency] = (nativeTotals[price.currency] ?? 0) + value
        if (baseCurrency) try { baseValue += convertAmount(value, price.currency, baseCurrency, rates) } catch { complete = false } else complete = false
      }
      points.push({ date: day, nativeTotals, baseValue: complete ? baseValue : null })
    }
    return c.json({ data: { baseCurrency, points } }, 200)
  })
}
