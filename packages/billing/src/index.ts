/**
 * Stripe billing adapter for Finance OS Cloud.
 *
 * Responsibilities:
 * - Create/update Stripe customers on user sign-up
 * - Handle Stripe webhook events (checkout.session.completed, customer.subscription.updated/deleted, etc.)
 * - Map Stripe events to the billing schema (subscriptions table)
 *
 * The webhook handler lives at POST /webhooks/stripe and validates the
 * Stripe signature before processing events.
 */

import Stripe from 'stripe'
import { db } from '@finance-os/db'
import { billingCustomers, subscriptions, subscriptionPlans } from '@finance-os/db'
import { eq } from 'drizzle-orm'

// Lazily construct the Stripe client so importing this module never crashes
// when STRIPE_SECRET_KEY is unset (e.g. community edition, or the API booting
// before billing is configured). The client is only created once it's needed.
let stripeClient: Stripe | undefined

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-02-24.acacia',
    })
  }
  return stripeClient
}

// ── Customer management ────────────────────────────────────────────────────────

export async function getOrCreateStripeCustomer(userId: string, email: string, name?: string) {
  const existing = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId))
    .limit(1)
    .then(r => r[0] ?? null)

  if (existing) return existing

  const customer = await getStripe().customers.create({
    email,
    name: name ?? undefined,
    metadata: { userId },
  })

  await db.insert(billingCustomers).values({
    userId,
    stripeCustomerId: customer.id,
    email,
  })

  return db.select().from(billingCustomers).where(eq(billingCustomers.userId, userId)).limit(1).then(r => r[0])
}

// ── Checkout session ───────────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
}) {
  const session = await getStripe().checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    line_items: [{ price: params.priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  })
  return session
}

// ── Billing portal session ──────────────────────────────────────────────────────

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })
}

// ── Webhook processing ─────────────────────────────────────────────────────────

export async function handleStripeWebhook(payload: Buffer, sig: string): Promise<void> {
  const event = getStripe().webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      const customer = await db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.stripeCustomerId, customerId))
        .limit(1)
        .then(r => r[0] ?? null)
      if (!customer) break

      const sub = await getStripe().subscriptions.retrieve(subscriptionId)
      const priceId = sub.items.data[0]?.price.id

      const plan = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, priceId))
        .limit(1)
        .then(r => r[0] ?? null)

      if (!plan) break

      await db.insert(subscriptions).values({
        userId: customer.userId,
        planId: plan.id,
        stripeSubscriptionId: subscriptionId,
        status: 'active',
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      })
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await db
        .update(subscriptions)
        .set({
          status: sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled',
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await db
        .update(subscriptions)
        .set({ status: 'canceled', updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      break
    }
  }
}
