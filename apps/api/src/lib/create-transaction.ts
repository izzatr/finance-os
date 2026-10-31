import { db, categories, transactionEntries, transactions, wallets } from '@finance-os/db'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { recordAudit } from './audit'

export type NewTransactionInput = {
  transactionDate: string // ISO
  type: 'expense' | 'income' | 'transfer' | 'exchange' | 'adjustment' | 'fee'
  description: string
  notes?: string | null
  externalRef?: string | null
  categoryId?: string | null
  entries: { walletId: string; assetId: string; amount: string; notes?: string | null }[]
  splits?: { personId: string; assetId?: string; amount: string }[]
}

export type CreateTxActor = { userId: string; actorType: 'user' | 'api_key' | 'scheduler' | 'ai_chat' }

/** Thrown by createTransactionForUser on validation failure; carries the HTTP envelope the route should return. */
export class CreateTransactionError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'CreateTransactionError'
    this.status = status
    this.code = code
  }
}

/** All referenced wallets must exist, be live, and belong to the user. */
export async function userOwnsWallets(userId: string, walletIds: string[]): Promise<boolean> {
  const uniqueIds = [...new Set(walletIds)]
  const owned = await db
    .select({ id: wallets.id })
    .from(wallets)
    .where(and(inArray(wallets.id, uniqueIds), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
  return owned.length === uniqueIds.length
}

/**
 * Ownership + consistency checks for a would-be transaction, without writing anything.
 * Shared by the direct write path and the proposals intake (a proposal must be valid
 * at intake so approving it later cannot fail on bad references).
 * Throws CreateTransactionError with {status, code, message} on failure.
 */
export async function validateNewTransaction(input: NewTransactionInput, userId: string): Promise<void> {
  if (input.type === 'transfer' && input.entries.length < 2) {
    throw new CreateTransactionError(400, 'INVALID_TRANSFER', 'Transfer transactions must include at least two entries.')
  }

  // Every referenced wallet must belong to the acting user, and every entry's asset
  // must match its wallet's asset — a USD entry booked into an IDR wallet would
  // silently corrupt that wallet's balance.
  const uniqueWalletIds = [...new Set(input.entries.map((e) => e.walletId))]
  const ownedWallets = await db
    .select({ id: wallets.id, assetId: wallets.assetId, systemRole: wallets.systemRole })
    .from(wallets)
    .where(and(inArray(wallets.id, uniqueWalletIds), eq(wallets.userId, userId), isNull(wallets.deletedAt)))
  if (ownedWallets.length !== uniqueWalletIds.length) {
    throw new CreateTransactionError(404, 'NOT_FOUND', 'Wallet not found')
  }
  // The Friends wallets are kept in step with shared expenses; writing to them directly would
  // make them disagree with what friends actually owe.
  if (ownedWallets.some((w) => w.systemRole)) {
    throw new CreateTransactionError(422, 'SYSTEM_WALLET', 'Friends wallets change through shared expenses (POST /api/split/expenses), not directly')
  }
  const walletAssetById = new Map(ownedWallets.map((w) => [w.id, w.assetId]))
  for (const entry of input.entries) {
    if (walletAssetById.get(entry.walletId) !== entry.assetId) {
      throw new CreateTransactionError(400, 'ASSET_MISMATCH', "Entry asset does not match the wallet's asset")
    }
  }

  // A referenced category must belong to the acting user
  if (input.categoryId) {
    const [category] = await db.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.id, input.categoryId), eq(categories.userId, userId)))
    if (!category) {
      throw new CreateTransactionError(404, 'NOT_FOUND', 'Category not found')
    }
  }

  // Every referenced person (for splits) must belong to the acting user — checked before
  // any writes so a foreign personId leaves nothing behind.
  if (input.splits && input.splits.length > 0) {
    throw new CreateTransactionError(422, 'SPLITS_MOVED', 'Splitting now lives in shared expenses: POST /api/split/expenses')
  }
}

/**
 * Validates ownership (wallets, category), inserts tx+entries atomically, audits.
 * Throws CreateTransactionError with {status, code, message} on validation failure.
 * Pass opts.skipAudit when the caller emits its own audit row (e.g. bulk's single summary row).
 */
export async function createTransactionForUser(
  input: NewTransactionInput,
  actor: CreateTxActor,
  opts?: { skipAudit?: boolean },
): Promise<{ id: string }> {
  await validateNewTransaction(input, actor.userId)

  const { txRow } = await db.transaction(async (tx) => {
    const [txRow] = await tx.insert(transactions).values({
      userId: actor.userId,
      transactionDate: new Date(input.transactionDate),
      type: input.type,
      description: input.description,
      notes: input.notes ?? null,
      externalRef: input.externalRef ?? null,
      categoryId: input.categoryId ?? null,
    }).returning()

    await tx.insert(transactionEntries).values(
      input.entries.map((entry) => ({
        transactionId: txRow.id,
        walletId: entry.walletId,
        assetId: entry.assetId,
        amount: entry.amount,
        notes: entry.notes ?? null,
      })),
    )

    return { txRow }
  })

  if (!opts?.skipAudit) {
    await recordAudit({
      actorType: actor.actorType,
      actorId: actor.userId,
      action: 'transaction.create',
      resourceType: 'transaction',
      resourceId: txRow.id,
    })
  }

  return { id: txRow.id }
}
