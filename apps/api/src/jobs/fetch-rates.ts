import { db, exchangeRates } from '@finance-os/db'
import { eq } from 'drizzle-orm'

type FrankfurterResponse = {
  base: string
  date: string
  rates: Record<string, number>
}

/**
 * Pulls the latest EUR-based rates from the Frankfurter API and upserts one row per quote,
 * dated at the payload's `date`. onConflictDoNothing against rate_base_quote_asof_unique
 * makes repeat runs on the same day a no-op instead of duplicate rows.
 *
 * Network/HTTP failure never throws — the scheduler tick logs it and moves on, and the
 * app keeps converting against whatever rates it already has.
 */
export async function fetchDailyRates(fetchImpl: typeof fetch = fetch): Promise<{ fetched: number }> {
  try {
    const res = await fetchImpl('https://api.frankfurter.app/latest?base=EUR')
    if (!res.ok) {
      console.error(`fetchDailyRates: frankfurter request failed with status ${res.status}`)
      return { fetched: 0 }
    }

    const payload = (await res.json()) as FrankfurterResponse
    const asOf = new Date(`${payload.date}T00:00:00.000Z`)

    let fetched = 0
    for (const [quote, rate] of Object.entries(payload.rates)) {
      const [row] = await db
        .insert(exchangeRates)
        .values({
          base: payload.base,
          quote,
          rate: String(rate),
          asOf,
          source: 'frankfurter',
        })
        .onConflictDoNothing()
        .returning()
      if (row) fetched += 1
    }

    return { fetched }
  } catch (err) {
    console.error('fetchDailyRates: fetch failed:', err)
    return { fetched: 0 }
  }
}

/** Cold-start bootstrap: a fresh deployment has no rates until the first daily
 *  cron run, which makes multi-currency totals silently collapse to the display
 *  currency. Fetch immediately when the table has no ECB rows. */
export async function bootstrapRatesIfEmpty(fetchImpl: typeof fetch = fetch): Promise<{ fetched: number; skipped: boolean }> {
  const [existing] = await db.select({ id: exchangeRates.id }).from(exchangeRates)
    .where(eq(exchangeRates.base, 'EUR')).limit(1)
  if (existing) return { fetched: 0, skipped: true }
  const { fetched } = await fetchDailyRates(fetchImpl)
  return { fetched, skipped: false }
}
