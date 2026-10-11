import { db, assets } from '@finance-os/db'
import type { Dbx } from './core'
import { eq } from 'drizzle-orm'

const SUPPORTED = new Set<string>(
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : ['EUR', 'USD'],
)
const names = new Intl.DisplayNames(['en'], { type: 'currency' })

export function isSupportedCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && SUPPORTED.has(code)
}

export type CurrencyAsset = { id: string; code: string; precision: number }

/**
 * Returns the asset row for an ISO 4217 currency, creating it on first use. Only codes the
 * runtime knows (Intl) are accepted, so this cannot be used to create arbitrary assets.
 */
export async function ensureCurrencyAsset(code: string, dbx: Dbx = db): Promise<CurrencyAsset | null> {
  const upper = code.toUpperCase()
  const [existing] = await dbx.select({ id: assets.id, code: assets.code, precision: assets.precision, type: assets.type })
    .from(assets).where(eq(assets.code, upper))
  if (existing) return existing.type === 'currency' ? { id: existing.id, code: existing.code, precision: existing.precision } : null
  if (!isSupportedCurrency(upper)) return null
  const precision = new Intl.NumberFormat('en', { style: 'currency', currency: upper }).resolvedOptions().maximumFractionDigits ?? 2
  await dbx.insert(assets)
    .values({ code: upper, name: names.of(upper) ?? upper, type: 'currency', precision })
    .onConflictDoNothing({ target: assets.code })
  const [row] = await dbx.select({ id: assets.id, code: assets.code, precision: assets.precision }).from(assets).where(eq(assets.code, upper))
  return row ?? null
}

export async function getAssetById(id: string, dbx: Dbx = db): Promise<CurrencyAsset | null> {
  const [row] = await dbx.select({ id: assets.id, code: assets.code, precision: assets.precision }).from(assets).where(eq(assets.id, id))
  return row ?? null
}
