/**
 * Entitlement resolver — checks what a user can access based on their subscription.
 *
 * Call checkEntitlement(userId, feature) to get a boolean.
 *
 * Features:
 *   hosted_mcp    — remote MCP gateway access
 *   ai            — in-app AI agent (v2+)
 */

import { db } from './index'
import { subscriptions, subscriptionPlans } from './billing-schema'
import { eq, and } from 'drizzle-orm'

export type Feature = 'hosted_mcp' | 'ai'

const PLAN_FEATURES: Record<string, Feature[]> = {
  // Weekly plans — MCP only, no AI
  weekly: ['hosted_mcp'],

  // Monthly plans — MCP + no AI yet
  monthly: ['hosted_mcp'],

  // Yearly plans — MCP (full access)
  yearly: ['hosted_mcp'],

  // Lifetime — everything available
  lifetime: ['hosted_mcp', 'ai'],
}

/**
 * Returns true if the user's subscription includes the requested feature.
 * Returns false for unauthenticated users or if no subscription is found.
 */
export async function checkEntitlement(userId: string, feature: Feature): Promise<boolean> {
  const sub = await db
    .select({ status: subscriptions.status, planId: subscriptions.planId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
    .limit(1)
    .then(rows => rows[0] ?? null)

  if (!sub) return false

  // Lifetime is always true for all features
  const lifetimeSub = await db
    .select({ interval: subscriptionPlans.interval })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, sub.planId))
    .limit(1)
    .then(rows => rows[0] ?? null)

  if (lifetimeSub?.interval === 'lifetime') return true

  const features = PLAN_FEATURES[lifetimeSub?.interval ?? ''] ?? []
  return features.includes(feature)
}
