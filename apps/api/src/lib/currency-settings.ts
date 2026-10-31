import { eq } from 'drizzle-orm'
import { db, assets, splitUserSettings, userCurrencySettings } from '@finance-os/db'
import { SUPPORTED_CURRENCY_CODES, currencyName, ensureCurrencyAsset, intlPrecision, isSupportedCurrency } from '../split/currencies'

export const FALLBACK_DEFAULT_CURRENCY = 'EUR'
export const MAX_PREFERRED_CURRENCIES = 20

export class CurrencySettingsError extends Error {
  constructor(public status: 422, public code: string, message: string) { super(message) }
}

export type CurrencySettings = {
  /** The one account default every screen uses. */
  defaultCurrency: string
  /** False until the account chose one; the value is then only a fallback (EUR). */
  defaultIsExplicit: boolean
  preferredCurrencies: string[]
  updatedAt: string | null
}

export type CatalogCurrency = { code: string; name: string; precision: number }

/** Upper-cases, validates against the supported catalog and removes duplicates, keeping the first position. */
export function normalizePreferred(input: readonly string[]): string[] {
  const out: string[] = []
  for (const raw of input) {
    const code = raw.trim().toUpperCase()
    if (!isSupportedCurrency(code)) throw new CurrencySettingsError(422, 'UNSUPPORTED_CURRENCY', `Unsupported currency: ${raw.trim().slice(0, 8)}`)
    if (!out.includes(code)) out.push(code)
  }
  if (out.length > MAX_PREFERRED_CURRENCIES) {
    throw new CurrencySettingsError(422, 'TOO_MANY_PREFERRED_CURRENCIES', `Choose at most ${MAX_PREFERRED_CURRENCIES} preferred currencies`)
  }
  return out
}

export function normalizeDefault(input: string): string {
  const code = input.trim().toUpperCase()
  if (!isSupportedCurrency(code)) throw new CurrencySettingsError(422, 'UNSUPPORTED_CURRENCY', 'Unsupported currency')
  return code
}

/** Settings for one account. Reads never create rows, split persons or wallets. */
export async function getCurrencySettings(userId: string): Promise<CurrencySettings> {
  const [row] = await db.select().from(userCurrencySettings).where(eq(userCurrencySettings.userId, userId))
  // Accounts that chose a default in Shared expenses before this setting existed keep that choice.
  const [legacy] = row?.defaultCurrency
    ? []
    : await db.select({ c: splitUserSettings.defaultCurrency }).from(splitUserSettings).where(eq(splitUserSettings.userId, userId))
  const legacyDefault = legacy && isSupportedCurrency(legacy.c) ? legacy.c : null
  return {
    defaultCurrency: row?.defaultCurrency ?? legacyDefault ?? FALLBACK_DEFAULT_CURRENCY,
    // The legacy column defaults to EUR, so only a different value proves a deliberate choice.
    defaultIsExplicit: Boolean(row?.defaultCurrency) || (legacyDefault !== null && legacyDefault !== FALLBACK_DEFAULT_CURRENCY),
    preferredCurrencies: (row?.preferredCurrencies ?? []).filter(isSupportedCurrency),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

/** Partial update: omitted fields stay as they are. Validates everything before writing. */
export async function updateCurrencySettings(
  userId: string,
  patch: { defaultCurrency?: string; preferredCurrencies?: string[] },
): Promise<CurrencySettings> {
  const defaultCurrency = patch.defaultCurrency === undefined ? undefined : normalizeDefault(patch.defaultCurrency)
  const preferred = patch.preferredCurrencies === undefined ? undefined : normalizePreferred(patch.preferredCurrencies)
  if (defaultCurrency === undefined && preferred === undefined) return getCurrencySettings(userId)

  await db.transaction(async (tx) => {
    // Reference rows only: a currency asset is global and creates no wallet or balance for anyone.
    for (const code of [defaultCurrency, ...(preferred ?? [])]) if (code) await ensureCurrencyAsset(code, tx)
    const set: { defaultCurrency?: string; preferredCurrencies?: string[]; updatedAt: Date } = { updatedAt: new Date() }
    if (defaultCurrency !== undefined) set.defaultCurrency = defaultCurrency
    if (preferred !== undefined) set.preferredCurrencies = preferred
    await tx.insert(userCurrencySettings)
      .values({ userId, defaultCurrency: defaultCurrency ?? null, preferredCurrencies: preferred ?? [] })
      .onConflictDoUpdate({ target: userCurrencySettings.userId, set })
    // Keep the legacy shared-expenses column from drifting (rollback safety); it is no longer read.
    if (defaultCurrency !== undefined) {
      await tx.update(splitUserSettings).set({ defaultCurrency }).where(eq(splitUserSettings.userId, userId))
    }
  })
  return getCurrencySettings(userId)
}

/** Every supported currency, with the stored asset precision where an asset already exists. */
export async function listCatalog(): Promise<CatalogCurrency[]> {
  const rows = await db.select({ code: assets.code, precision: assets.precision }).from(assets).where(eq(assets.type, 'currency'))
  const stored = new Map(rows.map((r) => [r.code, r.precision]))
  return SUPPORTED_CURRENCY_CODES.map((code) => ({ code, name: currencyName(code), precision: stored.get(code) ?? intlPrecision(code) }))
}
