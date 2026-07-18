import { randomUUID } from 'node:crypto'
import { db, holdings, listingPrices, listings, providerSymbols, wallets } from '@finance-os/db'
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type { MarketDataProvider } from './yahoo'

export type RefreshResult = { listingId: string; upserted: number; error: string | null }
type RefreshOptions = { now?: Date; leaseOwner?: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000)
}

function listingUpdateWhere(listingId: string, leaseOwner?: string) {
  return leaseOwner
    ? and(eq(listings.id, listingId), eq(listings.refreshLeaseOwner, leaseOwner))
    : eq(listings.id, listingId)
}

export async function refreshListing(listingId: string, provider: MarketDataProvider, options: RefreshOptions | Date = {}): Promise<RefreshResult> {
  const normalizedOptions = options instanceof Date ? { now: options } : options
  const now = normalizedOptions.now ?? new Date()
  const attemptedAt = new Date(now)
  try {
    const [mapping] = await db.select({
      symbol: providerSymbols.symbol,
      currency: listings.currency,
      historyBackfilledAt: listings.historyBackfilledAt,
    }).from(providerSymbols).innerJoin(listings, eq(listings.id, providerSymbols.listingId))
      .where(and(eq(providerSymbols.listingId, listingId), eq(providerSymbols.provider, provider.name))).limit(1)
    if (!mapping) throw new Error(`No ${provider.name} symbol for listing`)

    // Yahoo period2 is exclusive. New/existing unbackfilled listings receive one
    // bounded year of history; routine reconciliation only requests five days.
    const to = new Date(now)
    to.setUTCDate(to.getUTCDate() + 1)
    const from = new Date(to)
    from.setUTCDate(from.getUTCDate() - (mapping.historyBackfilledAt ? 5 : 370))
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
    await db.update(listings).set({
      lastRefreshAt: attemptedAt,
      lastSuccessAt: attemptedAt,
      refreshError: null,
      nextRefreshAt,
      historyBackfilledAt: mapping.historyBackfilledAt ?? attemptedAt,
      ...(normalizedOptions.leaseOwner ? { refreshLeaseOwner: null, refreshLeaseUntil: null } : {}),
      updatedAt: attemptedAt,
    }).where(listingUpdateWhere(listingId, normalizedOptions.leaseOwner))
    return { listingId, upserted: chart.prices.length, error: null }
  } catch (error) {
    const message = errorMessage(error)
    const retryAt = new Date(attemptedAt)
    retryAt.setUTCMinutes(retryAt.getUTCMinutes() + 30)
    await db.update(listings).set({
      lastRefreshAt: attemptedAt,
      refreshError: message,
      nextRefreshAt: retryAt,
      ...(normalizedOptions.leaseOwner ? { refreshLeaseOwner: null, refreshLeaseUntil: null } : {}),
      updatedAt: attemptedAt,
    }).where(listingUpdateWhere(listingId, normalizedOptions.leaseOwner))
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

export async function refreshListings(
  listingIds: string[],
  provider: MarketDataProvider,
  options: { concurrency?: number; now?: Date; leaseOwner?: string } = {},
): Promise<RefreshResult[]> {
  const ids = [...new Set(listingIds)]
  return mapBounded(ids, Math.min(options.concurrency ?? 5, 10), (id) => refreshListing(id, provider, options))
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
  return rows.map((row) => row.id)
}

export async function claimManualRefreshBatch(
  listingIds: string[], userId: string, cooldownSeconds = 60,
): Promise<{ ids: string[]; leaseOwner: string }> {
  const ids = [...new Set(listingIds)]
  const leaseOwner = randomUUID()
  if (ids.length === 0) return { ids: [], leaseOwner }
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE listings l
    SET refresh_lease_owner = ${leaseOwner}, refresh_lease_until = now() + interval '15 minutes', updated_at = now()
    WHERE l.id IN (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      AND l.is_active = true
      AND (l.refresh_lease_until IS NULL OR l.refresh_lease_until <= now())
      AND (l.last_refresh_at IS NULL OR l.last_refresh_at <= now() - (${cooldownSeconds} * interval '1 second'))
      AND EXISTS (
        SELECT 1 FROM holdings h JOIN wallets w ON w.id = h.wallet_id
        WHERE h.listing_id = l.id AND w.user_id = ${userId}
          AND w.wallet_type = 'investment' AND w.is_active = true AND w.deleted_at IS NULL
      )
    RETURNING l.id
  `)
  return { ids: claimed.rows.map((row) => row.id), leaseOwner }
}

export async function claimManualRefresh(listingId: string, userId: string, cooldownSeconds = 60): Promise<string | null> {
  const claim = await claimManualRefreshBatch([listingId], userId, cooldownSeconds)
  return claim.ids.length === 1 ? claim.leaseOwner : null
}

async function claimDueBatch(options: { userId?: string; walletId?: string; limit?: number; now?: Date } = {}) {
  const limit = Math.min(options.limit ?? 200, 500)
  const now = options.now ?? new Date()
  const leaseUntil = new Date(now.getTime() + 15 * 60_000)
  const leaseOwner = randomUUID()
  const claimed = await db.execute<{ id: string }>(sql`
    WITH due AS (
      SELECT l.id FROM listings l
      WHERE l.is_active = true
        AND (l.next_refresh_at IS NULL OR l.next_refresh_at <= ${now})
        AND (l.refresh_lease_until IS NULL OR l.refresh_lease_until <= ${now})
        AND EXISTS (
          SELECT 1 FROM holdings h JOIN wallets w ON w.id = h.wallet_id
          WHERE h.listing_id = l.id
            AND w.wallet_type = 'investment' AND w.is_active = true AND w.deleted_at IS NULL
            AND (${options.userId ?? null}::text IS NULL OR w.user_id = ${options.userId ?? null})
            AND (${options.walletId ?? null}::uuid IS NULL OR w.id = ${options.walletId ?? null}::uuid)
        )
      ORDER BY l.next_refresh_at NULLS FIRST
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE listings l
    SET refresh_lease_owner = ${leaseOwner}, refresh_lease_until = ${leaseUntil}, updated_at = ${now}
    FROM due WHERE l.id = due.id
    RETURNING l.id
  `)
  return { ids: claimed.rows.map((row) => row.id), leaseOwner }
}

export async function refreshDueListings(provider: MarketDataProvider, options: { userId?: string; walletId?: string; now?: Date; limit?: number; concurrency?: number } = {}) {
  return refreshClaimedDueListings(provider, options)
}

/** Atomically leases due listings for both user-scoped and scheduled workers. */
export async function refreshClaimedDueListings(
  provider: MarketDataProvider,
  options: { userId?: string; walletId?: string; limit?: number; concurrency?: number; now?: Date } = {},
) {
  const claim = await claimDueBatch(options)
  return refreshListings(claim.ids, provider, { ...options, leaseOwner: claim.leaseOwner })
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
