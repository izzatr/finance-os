/**
 * Better Auth database tables for Drizzle ORM (Postgres)
 * These tables are required by the better-auth library.
 *
 * IMPORTANT: Run migrations after adding these tables.
 * In the Docker container, the API entrypoint already runs `db:migrate`.
 * After adding these, rebuild the API container and it will auto-migrate.
 */

import { boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// ── Users ──────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: varchar('image', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Sessions ────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 255 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  sessionUserIdx: index('session_user_idx').on(table.userId),
}))

// ── Accounts (OAuth) ─────────────────────────────────────────────────────

export const accounts = pgTable('accounts', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  accountUserIdx: index('account_user_idx').on(table.userId),
  accountProviderIdx: index('account_provider_idx').on(table.providerId, table.accountId),
}))

// ── Verifications (email, magic links, etc.) ───────────────────────────────

export const verifications = pgTable('verifications', {
  id: varchar('id', { length: 255 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  verificationIdentifierIdx: index('verification_identifier_idx').on(table.identifier),
}))

// ── API Keys ──────────────────────────────────────────────────────────────
// Column set matches the @better-auth/api-key plugin's `apikey` model
// (referenceId is the owning user's id — the plugin's `references: "user"`
// default — rather than a fixed `userId` column, since the model is generic
// enough to also reference organizations).

export const apiKeys = pgTable('api_keys', {
  id: varchar('id', { length: 255 }).primaryKey(),
  configId: varchar('config_id', { length: 255 }).notNull().default('default'),
  name: varchar('name', { length: 255 }),
  start: varchar('start', { length: 50 }),
  prefix: varchar('prefix', { length: 50 }),
  key: varchar('key', { length: 255 }).notNull().unique(),
  referenceId: varchar('reference_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  refillInterval: integer('refill_interval'),
  refillAmount: integer('refill_amount'),
  lastRefillAt: timestamp('last_refill_at', { withTimezone: true }),
  enabled: boolean('enabled').notNull().default(true),
  rateLimitEnabled: boolean('rate_limit_enabled').notNull().default(true),
  rateLimitTimeWindow: integer('rate_limit_time_window'),
  rateLimitMax: integer('rate_limit_max'),
  requestCount: integer('request_count').notNull().default(0),
  remaining: integer('remaining'),
  lastRequest: timestamp('last_request', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  permissions: text('permissions'),
  metadata: text('metadata'),
}, (table) => ({
  apiKeyReferenceIdx: index('api_key_reference_idx').on(table.referenceId),
}))
