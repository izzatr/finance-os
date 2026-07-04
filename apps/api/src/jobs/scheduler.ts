import cron from 'node-cron'
import { materializeDueRules } from './materialize-recurring'

/**
 * Hourly recurring-rule materialization (minute 7, to stay off the top-of-hour
 * thundering herd). Started from index.ts only — never from app.ts, so tests
 * importing the app never spin up cron.
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
}
