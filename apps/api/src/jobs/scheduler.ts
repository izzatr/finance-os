import cron from 'node-cron'
import { materializeDueRules } from './materialize-recurring'
import { fetchDailyRates } from './fetch-rates'
import { generateWeeklyDigests } from './weekly-digest'

/**
 * Hourly recurring-rule materialization (minute 7, to stay off the top-of-hour
 * thundering herd) and a daily FX rate fetch (05:23, off-peak and off any
 * top-of-hour/day contention). Started from index.ts only — never from app.ts,
 * so tests importing the app never spin up cron.
 */
export function startScheduler(): void {
  cron.schedule('7 * * * *', async () => {
    try {
      const { posted, drafted, errors } = await materializeDueRules(new Date())
      console.log(`[scheduler] materialized recurring rules: posted=${posted} drafted=${drafted} errors=${errors}`)
    } catch (err) {
      console.error('[scheduler] materialization tick failed:', err)
    }
  })
  console.log('[scheduler] recurring materialization scheduled (hourly at :07)')

  cron.schedule('23 5 * * *', async () => {
    try {
      const { fetched } = await fetchDailyRates()
      console.log(`[scheduler] fetched daily fx rates: fetched=${fetched}`)
    } catch (err) {
      console.error('[scheduler] fx rate fetch tick failed:', err)
    }
  })
  console.log('[scheduler] daily fx rate fetch scheduled (05:23)')

  cron.schedule('45 5 * * 1', async () => {
    try {
      const { digests } = await generateWeeklyDigests(new Date())
      console.log(`[scheduler] weekly digests filed: ${digests}`)
    } catch (err) {
      console.error('[scheduler] weekly digest tick failed:', err)
    }
  })
  console.log('[scheduler] weekly digest scheduled (Mondays 05:45)')
}
