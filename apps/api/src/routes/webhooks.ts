import type { OpenAPIHono } from '@hono/zod-openapi'
import { handleStripeWebhook } from '@finance-os/billing'

export function registerWebhookRoutes(app: OpenAPIHono) {
  // ── Stripe webhook ─────────────────────────────────────────────────────────────
  // Must be BEFORE auth middleware — webhook verification uses raw body
  app.post('/webhooks/stripe', async (c) => {
    const sig = c.req.header('stripe-signature')
    if (!sig) return c.json({ error: 'Missing stripe-signature header' }, 400)

    let payload: ArrayBuffer
    try {
      payload = await c.req.arrayBuffer()
    } catch {
      return c.json({ error: 'Could not read request body' }, 400)
    }

    try {
      await handleStripeWebhook(Buffer.from(payload), sig)
      return c.json({ received: true })
    } catch (err) {
      console.error('Stripe webhook error:', err)
      return c.json({ error: 'Webhook processing failed' }, 400)
    }
  })
}
