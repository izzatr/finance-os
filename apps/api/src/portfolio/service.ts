import { db, holdings, listingPrices, listings, providerSymbols, wallets } from '@finance-os/db'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { MarketDataProvider } from './yahoo'

export type RefreshResult = { listingId: string; upserted: number; error: string | null }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
}

export async function refreshListing(listingId: string, provider: MarketDataProvider, now = new Date()): Promise<RefreshResult> {
  const [mapping] = await db.select({ symbol: providerSymbols.symbol, currency: listings.currency })
    .from(providerSymbols).innerJoin(listings, eq(listings.id, providerSymbols.listingId))
    .where(and(eq(providerSymbols.listingId, listingId), eq(providerSymbols.provider, provider.name))).limit(1)
  if (!mapping) throw new Error(`No ${provider.name} symbol for listing`)

  // Yahoo period2 is exclusive. Include tomorrow and request a five-calendar-day safety window.
  const to = new Date(now)
  to.setUTCDate(to.getUTCDate() + 1)
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 5)
  const attemptedAt = new Date()
  try {
    const chart = await provider.dailyChart(mapping.symbol, from, to)
    if (chart.prices.length === 0) throw new Error('Yahoo returned no valid EOD prices')
    await db.insert(listingPrices).values(chart.prices.map((point) => ({
      listingId,
      priceDate: point.date,
      close: String(point.close),
      currency: chart.metadata.currency || mapping.currency,
      source: provider.name,
      updatedAt: attemptedAt,
    }))).onConflictDoUpdate({
      target: [listingPrices.listingId, listingPrices.priceDate, listingPrices.source],
      set: { close: sql`excluded.close`, currency: sql`excluded.currency`, updatedAt: attemptedAt },
    })
    const nextRefreshAt = new Date(attemptedAt)
    nextRefreshAt.setUTCHours(nextRefreshAt.getUTCHours() + 12)
    await db.update(listings).set({ lastRefreshAt: attemptedAt, lastSuccessAt: attemptedAt, refreshError: null, nextRefreshAt, updatedAt: attemptedAt }).where(eq(listings.id, listingId))
    return { listingId, upserted: chart.prices.length, error: null }
  } catch (error) {
    const message = errorMessage(error)
    const retryAt = new Date(attemptedAt)
    retryAt.setUTCMinutes(retryAt.getUTCMinutes() + 30)
    await db.update(listings).set({ lastRefreshAt: attemptedAt, refreshError: message, nextRefreshAt: retryAt, updatedAt: attemptedAt }).where(eq(listings.id, listingId))
    return { listingId, upserted: 0, error: message }
  }
}

async function mapBounded<T, R>(values: T[], concurrency: number, worker: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    for (;;) {
      const index = next++
      if (index >= values.length) return
      results[index] = await worker(values[index])
    }
  }))
  return results
}

export async function refreshListings(listingIds: string[], provider: MarketDataProvider, options: { concurrency?: number; now?: Date } = {}): Promise<RefreshResult[]> {
  const ids = [...new Set(listingIds)].slice(0, 500)
  return mapBounded(ids, Math.min(options.concurrency ?? 5, 10), (id) => refreshListing(id, provider, options.now))
}

export async function dueListingIds(options: { userId?: string; walletId?: string; now?: Date; limit?: number } = {}): Promise<string[]> {
  const now = options.now ?? new Date()
  const conditions = [
    eq(listings.isActive, true), eq(wallets.walletType, 'investment'), eq(wallets.isActive, true), isNull(wallets.deletedAt),
    or(isNull(listings.nextRefreshAt), lte(listings.nextRefreshAt, now))!,
  ]
  if (options.userId) conditions.push(eq(wallets.userId, options.userId))
  if (options.walletId) conditions.push(eq(wallets.id, options.walletId))
  const rows = await db.selectDistinct({ id: listings.id }).from(listings)
    .innerJoin(holdings, eq(holdings.listingId, listings.id))
    .innerJoin(wallets, eq(wallets.id, holdings.walletId))
    .where(and(...conditions)).limit(Math.min(options.limit ?? 200, 500))
  return rows.map((row) => row.id)
}

export async function listingIdsForWallet(userId: string, walletId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ id: listings.id }).from(listings)
    .innerJoin(holdings, eq(holdings.listingId, listings.id))
    .innerJoin(wallets, eq(wallets.id, holdings.walletId))
    .where(and(eq(wallets.userId, userId), eq(wallets.id, walletId), eq(wallets.walletType, 'investment'), eq(wallets.isActive, true), isNull(wallets.deletedAt), eq(listings.isActive, true)))
    .limit(500)
  return rows.map((row) => row.id)
}

export async function refreshDueListings(provider: MarketDataProvider, options: { userId?: string; walletId?: string; now?: Date; limit?: number; concurrency?: number } = {}) {
  const ids = await dueListingIds(options)
  return refreshListings(ids, provider, options)
}

/** Atomically enforces a cross-replica cooldown for user-triggered refreshes. */
export async function claimManualRefresh(listingId: string, userId: string, cooldownSeconds = 60): Promise<boolean> {
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE listings l
    SET last_refresh_at = now(), updated_at = now()
    WHERE l.id = ${listingId}::uuid
      AND l.is_active = true
      AND (l.last_refresh_at IS NULL OR l.last_refresh_at <= now() - (${cooldownSeconds} * interval '1 second'))
      AND EXISTS (
        SELECT 1 FROM holdings h
        JOIN wallets w ON w.id = h.wallet_id
        WHERE h.listing_id = l.id AND w.user_id = ${userId}
          AND w.wallet_type = 'investment' AND w.is_active = true AND w.deleted_at IS NULL
      )
    RETURNING l.id
  `)
  return claimed.rows.length === 1
}

/** Atomically leases due listings so horizontally-scaled replicas do not issue duplicate Yahoo requests. */
export async function refreshClaimedDueListings(provider: MarketDataProvider, options: { limit?: number; concurrency?: number; now?: Date } = {}) {
  const limit = Math.min(options.limit ?? 200, 500)
  const claimed = await db.execute<{ id: string }>(sql`
    WITH due AS (
      SELECT l.id FROM listings l
      WHERE l.is_active = true
        AND (l.next_refresh_at IS NULL OR l.next_refresh_at <= now())
        AND EXISTS (
          SELECT 1 FROM holdings h JOIN wallets w ON w.id = h.wallet_id
          WHERE h.listing_id = l.id
            AND w.wallet_type = 'investment' AND w.is_active = true AND w.deleted_at IS NULL
        )
      ORDER BY l.next_refresh_at NULLS FIRST
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE listings l
    SET next_refresh_at = now() + interval '15 minutes', updated_at = now()
    FROM due WHERE l.id = due.id
    RETURNING l.id
  `)
  return refreshListings(claimed.rows.map((row) => row.id), provider, options)
}

/** Drain successive leased batches within a bounded request/runtime budget. */
export async function drainClaimedDueListings(
  provider: MarketDataProvider,
  options: { batchSize?: number; maxBatches?: number; maxDurationMs?: number; concurrency?: number } = {},
): Promise<RefreshResult[]> {
  const batchSize = Math.min(options.batchSize ?? 200, 500)
  const maxBatches = Math.min(options.maxBatches ?? 5, 20)
  const deadline = Date.now() + Math.min(options.maxDurationMs ?? 5 * 60_000, 15 * 60_000)
  const results: RefreshResult[] = []
  for (let batch = 0; batch < maxBatches && Date.now() < deadline; batch++) {
    const next = await refreshClaimedDueListings(provider, { limit: batchSize, concurrency: options.concurrency })
    results.push(...next)
    if (next.length < batchSize) break
  }
  return results
}

export async function assertUserOwnsListings(userId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const rows = await db.selectDistinct({ id: listings.id }).from(listings)
    .innerJoin(holdings, eq(holdings.listingId, listings.id))
    .innerJoin(wallets, eq(wallets.id, holdings.walletId))
    .where(and(eq(wallets.userId, userId), inArray(listings.id, ids)))
  return rows.length === new Set(ids).size
}
