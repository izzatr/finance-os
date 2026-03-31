import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const assetTypeEnum = pgEnum('asset_type', ['currency', 'crypto', 'stock', 'commodity', 'custom'])
export const walletTypeEnum = pgEnum('wallet_type', ['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom'])
export const transactionTypeEnum = pgEnum('transaction_type', ['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee'])
export const importStatusEnum = pgEnum('import_status', ['pending', 'parsed', 'reviewed', 'imported', 'failed'])

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  type: assetTypeEnum('type').notNull(),
  precision: integer('precision').notNull().default(2),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const wallets = pgTable('wallets', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  walletType: walletTypeEnum('wallet_type').notNull(),
  institution: varchar('institution', { length: 120 }),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  walletAssetIdx: index('wallet_asset_idx').on(table.assetId),
}))

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull().unique(),
  slug: varchar('slug', { length: 120 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
  type: transactionTypeEnum('type').notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  notes: text('notes'),
  externalRef: varchar('external_ref', { length: 255 }),
  categoryId: uuid('category_id').references(() => categories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  transactionDateIdx: index('transaction_date_idx').on(table.transactionDate),
}))

export const transactionEntries = pgTable('transaction_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  walletId: uuid('wallet_id').notNull().references(() => wallets.id),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  transactionEntryTxIdx: index('transaction_entry_tx_idx').on(table.transactionId),
  transactionEntryWalletIdx: index('transaction_entry_wallet_idx').on(table.walletId),
}))

export const statementImports = pgTable('statement_imports', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceName: varchar('source_name', { length: 120 }).notNull(),
  sourceType: varchar('source_type', { length: 60 }).notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  checksum: varchar('checksum', { length: 128 }).notNull(),
  status: importStatusEnum('status').notNull().default('pending'),
  rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>(),
  importedAt: timestamp('imported_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  importChecksumIdx: index('import_checksum_idx').on(table.checksum),
}))
