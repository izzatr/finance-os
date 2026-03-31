# Transactions

Transactions are the core financial events in Finance OS. Every transaction has a parent record and one or more child entries that affect wallet balances.

## Transaction Model

Finance OS uses a **double-entry** model:

- A **transaction** holds the date, type, description, notes, and category.
- **Transaction entries** hold the actual amounts, each tied to a specific wallet and asset (currency).

This means a single transaction can affect multiple wallets. A transfer from a checking account to a savings wallet creates one transaction with two entries: a debit and a credit.

```
Transaction (parent)
├── Entry: Main Checking   -€200.00
└── Entry: Savings Wallet  +€200.00
```

## Transaction Types

| Type         | Description                              | Entry Pattern                 |
|-------------|------------------------------------------|-------------------------------|
| `expense`   | Money going out                          | Single entry, negative amount |
| `income`    | Money coming in                          | Single entry, positive amount |
| `transfer`  | Moving money between wallets             | 2+ entries, sum to zero       |
| `exchange`  | Currency conversion between wallets      | 2+ entries, different assets  |
| `adjustment`| Balance correction or investment changes | Single entry, any sign        |
| `fee`       | Service fees, bank charges               | Single entry, negative amount |

::: info
Transfer transactions require at least two entries. The API returns a `400 INVALID_TRANSFER` error if you try to create a transfer with fewer than two entries.
:::

## Schema

```typescript
transactions = pgTable('transactions', {
  id:              uuid('id').defaultRandom().primaryKey(),
  transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
  type:            transactionTypeEnum('type').notNull(),
  description:     varchar('description', { length: 255 }).notNull(),
  notes:           text('notes'),
  externalRef:     varchar('external_ref', { length: 255 }),
  categoryId:      uuid('category_id').references(() => categories.id),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
})

transactionEntries = pgTable('transaction_entries', {
  id:            uuid('id').defaultRandom().primaryKey(),
  transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  walletId:      uuid('wallet_id').notNull().references(() => wallets.id),
  assetId:       uuid('asset_id').notNull().references(() => assets.id),
  amount:        numeric('amount', { precision: 20, scale: 8 }).notNull(),
  notes:         text('notes'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

## Creating a Transaction

### Expense

```bash
curl -X POST http://localhost:27032/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "transactionDate": "2026-03-27T00:00:00.000Z",
    "type": "expense",
    "description": "Groceries",
    "entries": [{
      "walletId": "fd016681-988e-4d34-8c5e-a6a9a6e3d9d2",
      "assetId": "f0cd0abb-ceb3-4538-88e5-6f4bc5f3a0ad",
      "amount": "-37.57"
    }]
  }'
```

### Transfer Between Wallets

```bash
curl -X POST http://localhost:27032/api/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "transactionDate": "2026-03-11T00:00:00.000Z",
    "type": "transfer",
    "description": "Move to savings",
    "entries": [
      {
        "walletId": "fd016681-...",
        "assetId": "f0cd0abb-...",
        "amount": "-200.00"
      },
      {
        "walletId": "a1b2c3d4-...",
        "assetId": "f0cd0abb-...",
        "amount": "200.00"
      }
    ]
  }'
```

::: tip
Amounts are strings with up to 8 decimal places. Use negative values for debits and positive values for credits. The `amount` field is `numeric(20,8)` in Postgres.
:::

## Editing a Transaction

```bash
curl -X PATCH http://localhost:27032/api/transactions/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Weekly groceries",
    "notes": "Including household supplies",
    "amount": "-42.50"
  }'
```

Editable fields: `description`, `type`, `transactionDate`, `notes`, `categoryId`, `amount` (updates the first entry).

## Soft-Delete and Restore

Transactions are soft-deleted. They are excluded from balance calculations and search results by default.

```bash
# Soft-delete
curl -X DELETE http://localhost:27032/api/transactions/{id}

# Response
{ "data": { "id": "...", "deletedAt": "2026-03-27T10:00:00.000Z" } }
```

```bash
# Restore
curl -X POST http://localhost:27032/api/transactions/{id}/restore

# Response
{ "data": { "id": "..." } }
```

## Searching Transactions

The search endpoint supports filtering by text, wallet, category, and date range:

```bash
# Text search
curl "http://localhost:27032/api/transactions/search?q=grocery"

# Filter by wallet
curl "http://localhost:27032/api/transactions/search?wallet={wallet-id}"

# Date range
curl "http://localhost:27032/api/transactions/search?from=2026-03-01&to=2026-03-31"

# Include soft-deleted
curl "http://localhost:27032/api/transactions/search?q=duplicate&includeDeleted=true"

# Combine filters
curl "http://localhost:27032/api/transactions/search?q=coffee&wallet={id}&from=2026-03-01"
```

Search returns up to 200 results, ordered by date (newest first):

```json
{
  "data": [
    {
      "id": "...",
      "transactionDate": "2026-03-17T00:00:00.000Z",
      "type": "expense",
      "description": "Groceries",
      "notes": null,
      "categoryName": "Groceries",
      "amount": -16.88,
      "currency": "EUR",
      "walletName": "Brokerage Account"
    }
  ]
}
```

## Bulk Create

Create up to 100 transactions in a single request:

```bash
curl -X POST http://localhost:27032/api/transactions/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "transactionDate": "2026-03-01T00:00:00.000Z",
        "type": "expense",
        "description": "Groceries",
        "entries": [{ "walletId": "...", "assetId": "...", "amount": "-37.57" }]
      },
      {
        "transactionDate": "2026-03-02T00:00:00.000Z",
        "type": "expense",
        "description": "Pharmacy",
        "entries": [{ "walletId": "...", "assetId": "...", "amount": "-16.50" }]
      }
    ]
  }'
```

Response:

```json
{ "data": { "created": 2, "ids": ["uuid-1", "uuid-2"] } }
```
