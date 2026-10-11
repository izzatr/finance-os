/**
 * Shared expenses (Splitwise-style). People, groups and expenses here are shared between users,
 * so tenancy is enforced by membership/participation rather than a single user_id column.
 * See docs/superpowers/specs/2026-10-11-shared-expenses.md.
 */
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './auth-schema'
import { assets, categories, transactions, wallets } from './schema'

export const splitGroupTypeEnum = pgEnum('split_group_type', ['home', 'trip', 'couple', 'other'])
export const splitExpenseKindEnum = pgEnum('split_expense_kind', ['expense', 'payment'])

export const splitPersons = pgTable('split_persons', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Set for registered users; null for guests (friends without an account).
  userId: varchar('user_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  displayName: varchar('display_name', { length: 120 }).notNull(),
  // Guests only; shown to the guest's creator. Never used to link accounts automatically.
  email: varchar('email', { length: 255 }),
  createdByUserId: varchar('created_by_user_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  mergedIntoId: uuid('merged_into_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  splitPersonUserUnique: uniqueIndex('split_person_user_unique').on(table.userId).where(sql`user_id IS NOT NULL`),
  splitPersonCreatorIdx: index('split_person_creator_idx').on(table.createdByUserId),
}))

export const splitUserSettings = pgTable('split_user_settings', {
  userId: varchar('user_id', { length: 255 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => splitPersons.id),
  // Expenses before this moment are summarised in one opening adjustment per currency.
  booksStart: timestamp('books_start', { withTimezone: true }).notNull(),
  defaultCurrency: varchar('default_currency', { length: 16 }).notNull().default('EUR'),
  activitySeenAt: timestamp('activity_seen_at', { withTimezone: true }),
  legacyMigratedAt: timestamp('legacy_migrated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Private presentation preferences; shared slugs and everyone else's defaults remain unchanged.
export const splitCategoryIcons = pgTable('split_category_icons', {
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  slug: varchar('slug', { length: 40 }).notNull(),
  icon: varchar('icon', { length: 40 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.slug] }),
}))

export const splitFriendships = pgTable('split_friendships', {
  id: uuid('id').defaultRandom().primaryKey(),
  // Canonical order (low < high) so a pair exists once.
  personLowId: uuid('person_low_id').notNull().references(() => splitPersons.id),
  personHighId: uuid('person_high_id').notNull().references(() => splitPersons.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (table) => ({
  splitFriendPairUnique: unique('split_friend_pair_unique').on(table.personLowId, table.personHighId),
  splitFriendHighIdx: index('split_friend_high_idx').on(table.personHighId),
  splitFriendOrder: check('split_friend_order', sql`person_low_id < person_high_id`),
}))

export const splitGroups = pgTable('split_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 120 }).notNull(),
  groupType: splitGroupTypeEnum('group_type').notNull().default('other'),
  icon: varchar('icon', { length: 40 }),
  simplifyDebts: boolean('simplify_debts').notNull().default(true),
  createdByPersonId: uuid('created_by_person_id').notNull().references(() => splitPersons.id),
  externalRef: varchar('external_ref', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedByPersonId: uuid('deleted_by_person_id').references(() => splitPersons.id),
}, (table) => ({
  splitGroupExternalUnique: uniqueIndex('split_group_external_unique')
    .on(table.createdByPersonId, table.externalRef)
    .where(sql`external_ref IS NOT NULL`),
}))

export const splitGroupMembers = pgTable('split_group_members', {
  groupId: uuid('group_id').notNull().references(() => splitGroups.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => splitPersons.id),
  addedByPersonId: uuid('added_by_person_id').references(() => splitPersons.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.personId] }),
  splitMemberPersonIdx: index('split_member_person_idx').on(table.personId),
}))

export const splitExpenses = pgTable('split_expenses', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').references(() => splitGroups.id),
  kind: splitExpenseKindEnum('kind').notNull().default('expense'),
  description: varchar('description', { length: 255 }).notNull(),
  cost: numeric('cost', { precision: 20, scale: 8 }).notNull(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  expenseDate: timestamp('expense_date', { withTimezone: true }).notNull(),
  category: varchar('category', { length: 40 }).notNull().default('general'),
  notes: text('notes'),
  // How the split was entered, so the edit form can show it again. Shares are the truth.
  splitMethod: varchar('split_method', { length: 20 }).notNull(),
  splitInput: jsonb('split_input').$type<Record<string, unknown>>(),
  paidInput: jsonb('paid_input').$type<Record<string, unknown>>(),
  repeatInterval: varchar('repeat_interval', { length: 12 }).notNull().default('never'),
  nextRepeatAt: timestamp('next_repeat_at', { withTimezone: true }),
  createdByPersonId: uuid('created_by_person_id').notNull().references(() => splitPersons.id),
  updatedByPersonId: uuid('updated_by_person_id').references(() => splitPersons.id),
  externalRef: varchar('external_ref', { length: 255 }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedByPersonId: uuid('deleted_by_person_id').references(() => splitPersons.id),
}, (table) => ({
  splitExpenseGroupDateIdx: index('split_expense_group_date_idx').on(table.groupId, table.expenseDate),
  splitExpenseRepeatIdx: index('split_expense_repeat_idx').on(table.nextRepeatAt).where(sql`next_repeat_at IS NOT NULL AND deleted_at IS NULL`),
  splitExpenseExternalUnique: uniqueIndex('split_expense_external_unique')
    .on(table.createdByPersonId, table.externalRef)
    .where(sql`external_ref IS NOT NULL`),
  splitExpenseCostPositive: check('split_expense_cost_positive', sql`cost > 0`),
  splitExpenseRepeatValid: check('split_expense_repeat_valid', sql`repeat_interval IN ('never','weekly','fortnightly','monthly','yearly')`),
}))

export const splitExpenseShares = pgTable('split_expense_shares', {
  expenseId: uuid('expense_id').notNull().references(() => splitExpenses.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => splitPersons.id),
  paidShare: numeric('paid_share', { precision: 20, scale: 8 }).notNull(),
  owedShare: numeric('owed_share', { precision: 20, scale: 8 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.expenseId, table.personId] }),
  splitSharePersonIdx: index('split_share_person_idx').on(table.personId),
  splitShareNonNegative: check('split_share_non_negative', sql`paid_share >= 0 AND owed_share >= 0`),
}))

// Who owes whom for each live expense; rebuilt on every write. Removed while an expense is deleted.
export const splitExpenseDebts = pgTable('split_expense_debts', {
  expenseId: uuid('expense_id').notNull().references(() => splitExpenses.id, { onDelete: 'cascade' }),
  fromPersonId: uuid('from_person_id').notNull().references(() => splitPersons.id),
  toPersonId: uuid('to_person_id').notNull().references(() => splitPersons.id),
  groupId: uuid('group_id').references(() => splitGroups.id),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.expenseId, table.fromPersonId, table.toPersonId] }),
  splitDebtFromIdx: index('split_debt_from_idx').on(table.fromPersonId),
  splitDebtToIdx: index('split_debt_to_idx').on(table.toPersonId),
  splitDebtGroupIdx: index('split_debt_group_idx').on(table.groupId),
  splitDebtPositive: check('split_debt_positive', sql`amount > 0 AND from_person_id <> to_person_id`),
}))

// Each registered participant's private bookkeeping choices for an expense.
export const splitExpenseBooks = pgTable('split_expense_books', {
  expenseId: uuid('expense_id').notNull().references(() => splitExpenses.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  fundingWalletId: uuid('funding_wallet_id').references(() => wallets.id),
  // Only when the funding wallet's currency differs from the expense currency.
  fundingAmount: numeric('funding_amount', { precision: 20, scale: 8 }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  linkedTransactionId: uuid('linked_transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.expenseId, table.userId] }),
  splitBooksLinkedUnique: uniqueIndex('split_books_linked_unique').on(table.userId, table.linkedTransactionId).where(sql`linked_transaction_id IS NOT NULL`),
}))

export const splitComments = pgTable('split_comments', {
  id: uuid('id').defaultRandom().primaryKey(),
  expenseId: uuid('expense_id').notNull().references(() => splitExpenses.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => splitPersons.id),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Set only for comments brought in from another app (e.g. `splitwise:comment:123`); makes re-runs idempotent.
  externalRef: varchar('external_ref', { length: 255 }),
}, (table) => ({
  splitCommentExpenseIdx: index('split_comment_expense_idx').on(table.expenseId, table.createdAt),
  splitCommentExternalUnique: uniqueIndex('split_comment_external_unique').on(table.expenseId, table.externalRef).where(sql`external_ref IS NOT NULL`),
}))

export const splitActivity = pgTable('split_activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  actorPersonId: uuid('actor_person_id').references(() => splitPersons.id),
  kind: varchar('kind', { length: 40 }).notNull(),
  groupId: uuid('group_id').references(() => splitGroups.id),
  expenseId: uuid('expense_id').references(() => splitExpenses.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  // Person ids allowed to see this entry, fixed when it is written.
  audience: uuid('audience').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  splitActivityAudienceIdx: index('split_activity_audience_idx').using('gin', table.audience),
  splitActivityCreatedIdx: index('split_activity_created_idx').on(table.createdAt),
}))

export const splitInvites = pgTable('split_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  personId: uuid('person_id').notNull().references(() => splitPersons.id),
  createdByUserId: varchar('created_by_user_id', { length: 255 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  // Set when the link was used to create an account; a link opens closed registration only once.
  signupUsedAt: timestamp('signup_used_at', { withTimezone: true }),
  claimedByUserId: varchar('claimed_by_user_id', { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => ({
  splitInvitePersonIdx: index('split_invite_person_idx').on(table.personId),
}))
