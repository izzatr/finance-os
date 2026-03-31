# Wallets

Wallets are the core organizational unit in Finance OS. Each wallet represents a real-world account -- a bank account, cash stash, e-wallet, investment portfolio, or credit card.

## Wallet Types

| Type         | Description                                  | Examples                         |
|-------------|----------------------------------------------|----------------------------------|
| `bank`      | Traditional bank accounts                    | Main Checking, Savings Account   |
| `cash`      | Physical cash                                | Cash Wallet, Travel Cash         |
| `ewallet`   | Digital wallets and payment apps             | Mobile Wallet, Online Wallet     |
| `crypto`    | Cryptocurrency wallets                       | Bitcoin Wallet                   |
| `investment`| Brokerage, mutual funds, stocks              | Brokerage Account, Index Fund    |
| `credit`    | Credit cards (balance is typically negative) | Visa Card                        |
| `custom`    | Anything else                                | Shared Expenses                  |

## One Wallet, One Currency

Each wallet is tied to a single asset (currency). A checking account in EUR and a travel wallet in USD are separate wallets. This keeps balance calculations straightforward and avoids currency mixing.

## Balance Is Computed

Wallet balances are never stored as a column. Instead, the balance is computed by summing all transaction entries for that wallet:

```sql
SELECT coalesce(sum(te.amount), 0) AS balance
FROM wallets w
LEFT JOIN transaction_entries te ON te.wallet_id = w.id
LEFT JOIN transactions t ON t.id = te.transaction_id
WHERE t.deleted_at IS NULL
```

This means the balance is always consistent with the transaction history. There is no drift.

## Schema

```typescript
wallets = pgTable('wallets', {
  id:         uuid('id').defaultRandom().primaryKey(),
  name:       varchar('name', { length: 120 }).notNull(),
  walletType: walletTypeEnum('wallet_type').notNull(),
  institution: varchar('institution', { length: 120 }),
  assetId:    uuid('asset_id').notNull().references(() => assets.id),
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:  timestamp('deleted_at', { withTimezone: true }),
})
```

## Creating a Wallet

First, look up the asset ID for the currency:

```bash
curl http://localhost:27032/api/assets
```

Then create the wallet:

```bash
curl -X POST http://localhost:27032/api/wallets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Checking EUR",
    "walletType": "bank",
    "assetId": "f0cd0abb-ceb3-4538-88e5-6f4bc5f3a0ad",
    "institution": "Example Bank",
    "isActive": true
  }'
```

Response:

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Main Checking EUR",
    "walletType": "bank",
    "institution": "Example Bank",
    "assetId": "f0cd0abb-...",
    "isActive": true
  }
}
```

## Listing Wallets

```bash
curl http://localhost:27032/api/wallets
```

The response includes the computed balance and currency code for each wallet:

```json
{
  "data": [
    {
      "id": "fd016681-...",
      "name": "Brokerage Account",
      "walletType": "investment",
      "institution": "Example Broker",
      "assetId": "f0cd0abb-...",
      "isActive": true,
      "balance": 2232.94,
      "currency": "EUR"
    }
  ]
}
```

## Editing a Wallet

```bash
curl -X PATCH http://localhost:27032/api/wallets/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Primary Checking",
    "institution": "Example Bank"
  }'
```

Editable fields: `name`, `walletType`, `institution`, `isActive`.

## Soft-Deleting a Wallet

Wallets are soft-deleted by setting `deletedAt`. Soft-deleted wallets are excluded from balance calculations and listing.

```bash
# Delete
curl -X DELETE http://localhost:27032/api/wallets/{id}

# Restore
curl -X POST http://localhost:27032/api/wallets/{id}/restore
```

## Wallet Transactions

View all transactions for a specific wallet:

```bash
curl http://localhost:27032/api/wallets/{id}/transactions
```

This returns the wallet details with balance and a list of all its transactions.

## Monthly Summary

Get a monthly income/expense breakdown for a wallet:

```bash
curl http://localhost:27032/api/wallets/{id}/monthly-summary
```

Response:

```json
{
  "data": {
    "wallet": { "id": "...", "name": "Brokerage Account", "currency": "EUR" },
    "months": [
      { "month": "2026-01", "income": 2742.18, "expense": 1520.30, "net": 1221.88 },
      { "month": "2026-02", "income": 2742.18, "expense": 890.45, "net": 1851.73 }
    ]
  }
}
```
