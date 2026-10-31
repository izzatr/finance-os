/**
 * Audit log schema — immutable append-only log of important account mutations.
 *
 * Every row is append-only; rows are never updated or deleted.
 * Use this for: compliance, security reviews, debugging, and billing events.
 */

import { pgTable, text, timestamp, jsonb, uuid } from 'drizzle-orm/pg-core'

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** ISO-8601 timestamp of when the event occurred (server clock) */
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),

  /** 'user_id' | 'api_key_id' | 'subscription_id' | 'wallet_id' | 'transaction_id' | 'system' */
  actorType: text('actor_type').notNull(),

  /** The actual ID of the actor (userId, apiKeyId, etc.) */
  actorId: text('actor_id').notNull(),

  /** 'create' | 'update' | 'delete' | 'revoke' | 'sign_in' | 'sign_up' | 'sign_out' | 'subscribe' | 'cancel' */
  action: text('action').notNull(),

  /** e.g. 'wallet', 'subscription', 'api_key', 'session', 'user' */
  resourceType: text('resource_type').notNull(),

  /** ID of the affected resource */
  resourceId: text('resource_id'),

  /**
   * Arbitrary context — e.g.
   *   { ipAddress: '1.2.3.4', userAgent: '...' }
   *   { newPlan: 'yearly', oldPlan: 'monthly' }
   *   { reason: 'user_requested' }
   */
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
})
