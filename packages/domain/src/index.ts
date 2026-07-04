import { z } from 'zod'

export { EDITION, isCloud, isCommunity, features } from './edition'
export type { Edition, FeatureFlags } from './edition'

export { nextOccurrences } from './recurrence'
export type { RecurringSchedule } from './recurrence'

export const assetTypeSchema = z.enum(['currency', 'crypto', 'stock', 'commodity', 'custom'])
export const walletTypeSchema = z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom'])
export const transactionTypeSchema = z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee'])
export const importStatusSchema = z.enum(['pending', 'parsed', 'reviewed', 'imported', 'failed'])

export const assetSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(16),
  name: z.string().min(1).max(120),
  type: assetTypeSchema,
  precision: z.number().int().min(0).max(12).default(2),
})

export const walletSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  walletType: walletTypeSchema,
  institution: z.string().max(120).optional().nullable(),
  assetId: z.string().uuid(),
  isActive: z.boolean().default(true),
})

export const transactionEntrySchema = z.object({
  walletId: z.string().uuid(),
  assetId: z.string().uuid(),
  amount: z.string().regex(/^-?\d+(\.\d+)?$/),
  notes: z.string().max(500).optional().nullable(),
})

export const transactionSchema = z.object({
  id: z.string().uuid().optional(),
  transactionDate: z.string().datetime({ offset: true }),
  type: transactionTypeSchema,
  description: z.string().min(1).max(255),
  notes: z.string().max(1000).optional().nullable(),
  externalRef: z.string().max(255).optional().nullable(),
  entries: z.array(transactionEntrySchema).min(1),
})

export const statementImportSchema = z.object({
  id: z.string().uuid().optional(),
  sourceName: z.string().min(1).max(120),
  sourceType: z.string().min(1).max(60),
  fileName: z.string().min(1).max(255),
  checksum: z.string().min(1).max(128),
  status: importStatusSchema.default('pending'),
  rawMetadata: z.record(z.unknown()).nullable().optional(),
  importedAt: z.string().datetime({ offset: true }).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
})

export type Asset = z.infer<typeof assetSchema>
export type Wallet = z.infer<typeof walletSchema>
export type Transaction = z.infer<typeof transactionSchema>
export type TransactionEntry = z.infer<typeof transactionEntrySchema>
export type StatementImport = z.infer<typeof statementImportSchema>
