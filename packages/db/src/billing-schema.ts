/**
 * Billing schema — Stripe-backed subscriptions for Finance OS Cloud.
 *
 * Tables:
 *   billing_customers   — Stripe customer record per user
 *   subscription_plans  — catalog of plans (weekly / monthly / yearly / lifetime)
 *   subscriptions       — active subscription per user
 */

import { pgTable, text, timestamp, boolean, integer, uuid } from 'drizzle-orm/pg-core'

// ── Billing customer ────────────────────────────────────────────────────────────

export const billingCustomers = pgTable('billing_customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),          // references auth.users.id
  stripeCustomerId: text('stripe_customer_id').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ── Subscription plans ────────────────────────────────────────────────────────

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Stable slug used in entitlement checks, e.g. "starter", "pro", "lifetime" */
  slug: text('slug').notNull().unique(),
  /** Human-readable name shown in the UI */
  label: text('label').notNull(),
  /** Stripe Price ID (null for lifetime) */
  stripePriceId: text('stripe_price_id').unique(),
  /** Price in smallest currency unit (e.g. cents), null for lifetime */
  priceKopecks: integer('price_kopecks'),
  /** ISO 4217 currency code, e.g. "USD" */
  currency: text('currency').notNull().default('USD'),
  /** Interval: 'week' | 'month' | 'year' | 'lifetime' */
  interval: text('interval').notNull(),
  /** Ordinal for display ordering */
  sortOrder: integer('sort_order').notNull().default(0),
  /** Whether this plan includes the hosted MCP gateway */
  includesHostedMcp: boolean('includes_hosted_mcp').notNull().default(false),
  /** Whether this plan includes in-app AI (future) */
  includesAi: boolean('includes_ai').notNull().default(false),
  /** Active / archived */
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique(),
  planId: uuid('plan_id').notNull().references(() => subscriptionPlans.id),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  /** 'active' | 'past_due' | 'canceled' | 'trialing' | 'lifetime' */
  status: text('status').notNull(),
  currentPeriodStart: timestamp('current_period_start'),
  currentPeriodEnd: timestamp('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  canceledAt: timestamp('canceled_at'),
  lifetimeGrantedAt: timestamp('lifetime_granted_at'),   // set when lifetime plan purchased
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
