/**
 * Finance OS Edition
 *
 * Controls feature availability between self-hosted (community) and cloud editions.
 * Set via FINANCE_OS_EDITION environment variable.
 *
 * community (default): free, self-hosted, single-user
 * cloud: hosted, multi-tenant, managed auth, bank sync, AI insights
 */

export type Edition = 'community' | 'cloud'

export const EDITION: Edition =
  (process.env.FINANCE_OS_EDITION as Edition) ?? 'community'

export const isCloud = EDITION === 'cloud'
export const isCommunity = EDITION === 'community'

/**
 * Feature flags gated by edition.
 * Add new flags here as cloud features are built.
 */
export const features = {
  /** Multi-tenant user isolation (userId on all resources) */
  multiTenancy: isCloud,

  /** Automatic bank sync via Plaid/GoCardless */
  bankSync: isCloud,

  /** Built-in AI financial insights (uses platform API key) */
  aiInsights: isCloud,

  /** Automated daily backups */
  managedBackups: isCloud,

  /** Stripe billing integration */
  billing: isCloud,

  /** Priority support channel */
  prioritySupport: isCloud,

  /** Usage analytics / telemetry */
  telemetry: isCloud,

  /** Self-serve sign-up (vs invite-only or single-user) */
  publicSignUp: isCloud,
} as const

export type FeatureFlags = typeof features
