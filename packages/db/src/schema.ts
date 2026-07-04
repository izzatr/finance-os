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
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './auth-schema'

export const assetTypeEnum = pgEnum('asset_type', ['currency', 'crypto', 'stock', 'commodity', 'custom'])
export const walletTypeEnum = pgEnum('wallet_type', ['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom'])
export const transactionTypeEnum = pgEnum('transaction_type', ['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee'])
export const importStatusEnum = pgEnum('import_status', ['pending', 'parsed', 'reviewed', 'imported', 'failed'])
export const categoryTypeEnum = pgEnum('category_type', ['income', 'expense', 'transfer'])
export const recurringModeEnum = pgEnum('recurring_mode', ['auto_post', 'draft'])
export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'approved', 'rejected'])

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 16 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  type: assetTypeEnum('type').notNull(),
  precision: integer('precision').notNull().default(2),
  unit: varchar('unit', { length: 16 }), // 'g','oz','share','BTC'; null for fiat
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const wallets = pgTable('wallets', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  name: varchar('name', { length: 120 }).notNull(),
  walletType: walletTypeEnum('wallet_type').notNull(),
  institution: varchar('institution', { length: 120 }),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  walletAssetIdx: index('wallet_asset_idx').on(table.assetId),
  walletUserIdx: index('wallet_user_idx').on(table.userId),
}))

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 120 }).notNull(),
  type: categoryTypeEnum('type').notNull().default('expense'),
  // parent_id FK added in 0006 migration (self-reference)
  parentId: uuid('parent_id'),
  needsReview: boolean('needs_review').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  categoriesUserNameUnique: unique('categories_user_name_unique').on(table.userId, table.name),
  categoriesUserSlugUnique: unique('categories_user_slug_unique').on(table.userId, table.slug),
}))

export const transactions = pgTable('transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
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
  transactionUserIdx: index('transaction_user_idx').on(table.userId),
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

export const people = pgTable('people', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  name: varchar('name', { length: 120 }).notNull(),
  email: varchar('email', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  peopleUserIdx: index('people_user_idx').on(table.userId),
  peopleUserNameUnique: unique('people_user_name_unique').on(table.userId, table.name),
}))

export const transactionSplits = pgTable('transaction_splits', {
  id: uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull(), // positive = person owes the user
  settledAt: timestamp('settled_at', { withTimezone: true }),
  settlementTransactionId: uuid('settlement_transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  splitTxIdx: index('split_tx_idx').on(table.transactionId),
  splitPersonIdx: index('split_person_idx').on(table.personId),
}))

export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  name: varchar('name', { length: 120 }).notNull(),
  template: jsonb('template').$type<Record<string, unknown>>().notNull(), // NewTransactionInput minus transactionDate
  freq: varchar('freq', { length: 10 }).notNull(), // daily|weekly|monthly|yearly
  interval: integer('interval').notNull().default(1),
  startAt: timestamp('start_at', { withTimezone: true }).notNull(),
  endAt: timestamp('end_at', { withTimezone: true }),
  mode: recurringModeEnum('mode').notNull().default('draft'),
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  recurringUserIdx: index('recurring_user_idx').on(table.userId),
}))

export const proposals = pgTable('proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  source: varchar('source', { length: 30 }).notNull(), // recurring_draft|ai_chat|mcp
  actorLabel: varchar('actor_label', { length: 120 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(), // { transaction: NewTransactionInput, dedupeRef?: string }
  status: proposalStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => ({
  proposalUserStatusIdx: index('proposal_user_status_idx').on(table.userId, table.status),
}))

export const statementImports = pgTable('statement_imports', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
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
  importUserIdx: index('import_user_idx').on(table.userId),
}))

export const exchangeRates = pgTable('exchange_rates', {
  id: uuid('id').defaultRandom().primaryKey(),
  base: varchar('base', { length: 16 }).notNull(), // always 'EUR' from the fetch job; manual rows may differ
  quote: varchar('quote', { length: 16 }).notNull(),
  rate: numeric('rate', { precision: 20, scale: 10 }).notNull(),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 30 }).notNull().default('manual'), // manual|frankfurter
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  rateQuoteAsOfIdx: index('rate_quote_asof_idx').on(table.quote, table.asOf),
  rateUniquePerDay: unique('rate_base_quote_asof_unique').on(table.base, table.quote, table.asOf),
}))

export const assetPrices = pgTable('asset_prices', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  price: numeric('price', { precision: 20, scale: 8 }).notNull(),
  currency: varchar('currency', { length: 16 }).notNull(),
  asOf: timestamp('as_of', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 30 }).notNull().default('manual'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ priceAssetAsOfIdx: index('price_asset_asof_idx').on(table.assetId, table.asOf) }))
