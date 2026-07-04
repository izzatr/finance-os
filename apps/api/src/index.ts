import 'dotenv/config'

import { serve } from '@hono/node-server'
import app from './app'
import { startScheduler } from './jobs/scheduler'

const port = Number(process.env.PORT ?? 8787)

serve({
  fetch: app.fetch,
  port,
})

console.log(`Finance OS API listening on http://localhost:${port}`)

startScheduler()
