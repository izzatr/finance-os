# API Endpoints

Full reference for all Finance OS REST API endpoints. Base URL: `http://localhost:27032`.

## Wallets

### List Wallets

```
GET /api/wallets
```

Returns all active wallets with computed balances.

**Response:**

```json
{
  "data": [
    {
      "id": "fd016681-988e-4d34-8c5e-a6a9a6e3d9d2",
      "name": "Brokerage Account",
      "walletType": "investment",
      "institution": "Example Broker",
      "assetId": "f0cd0abb-ceb3-4538-88e5-6f4bc5f3a0ad",
      "isActive": true,
      "balance": 2232.94,
      "currency": "EUR"
    }
  ]
}
```

### Create Wallet

```
POST /api/wallets
```

**Request body:**

```json
{
  "name": "Main Checking EUR",
  "walletType": "bank",
  "assetId": "f0cd0abb-...",
  "institution": "Example Bank",
  "isActive": true
}
```

| Field        | Type    | Required | Description                                                        |
|-------------|---------|----------|--------------------------------------------------------------------|
| `name`      | string  | yes      | Display name (max 120 chars)                                       |
| `walletType`| string  | yes      | One of: `bank`, `cash`, `ewallet`, `crypto`, `investment`, `credit`, `custom` |
| `assetId`   | uuid    | yes      | Currency asset ID (get from `GET /api/assets`)                     |
| `institution`| string | no       | Bank or provider name                                              |
| `isActive`  | boolean | no       | Default: `true`                                                    |

**Response:** `201` with `{ data: { id, name, walletType, ... } }`

### Get Wallet Transactions

```
GET /api/wallets/:id/transactions
```

Returns wallet details with balance and all transactions for that wallet.

**Response:**

```json
{
  "data": {
    "wallet": {
      "id": "...",
      "name": "Brokerage Account",
      "walletType": "investment",
      "institution": "Example Broker",
      "currency": "EUR",
      "balance": 2232.94
    },
    "transactions": [
      {
        "id": "...",
        "transactionDate": "2026-03-25T00:00:00.000Z",
        "type": "expense",
        "description": "Grocery Store",
        "notes": null,
        "categoryName": "Groceries",
        "amount": -17.68,
        "currency": "EUR"
      }
    ]
  }
}
```

### Get Wallet Monthly Summary

```
GET /api/wallets/:id/monthly-summary
```

Returns monthly income/expense/net breakdown for a wallet.

**Response:**

```json
{
  "data": {
    "wallet": { "id": "...", "name": "Brokerage Account", "currency": "EUR" },
    "months": [
      { "month": "2026-03", "income": 12.67, "expense": 1520.30, "net": -1507.63 }
    ]
  }
}
```

### Update Wallet

```
PATCH /api/wallets/:id
```

**Request body (all fields optional):**

```json
{
  "name": "Brokerage Main",
  "walletType": "bank",
  "institution": "Example Broker",
  "isActive": true
}
```

**Response:** `200` with `{ data: { id, name, walletType, ... } }`

### Delete Wallet

```
DELETE /api/wallets/:id
```

Soft-deletes the wallet (sets `deletedAt`).

**Response:** `200` with `{ data: { id, deletedAt } }`

### Restore Wallet

```
POST /api/wallets/:id/restore
```

Restores a soft-deleted wallet.

**Response:** `200` with `{ data: { id } }`

---

## Transactions

### Search Transactions

```
GET /api/transactions/search
```

**Query parameters:**

| Parameter        | Type    | Description                          |
|-----------------|---------|--------------------------------------|
| `q`             | string  | Text search on description (ILIKE)   |
| `wallet`        | uuid    | Filter by wallet ID                  |
| `category`      | uuid    | Filter by category ID                |
| `from`          | string  | Start date (`YYYY-MM-DD`)            |
| `to`            | string  | End date (`YYYY-MM-DD`)              |
| `includeDeleted`| string  | Set to `"true"` to include deleted   |

Returns up to 200 results, newest first.

**Response:**

```json
{
  "data": [
    {
      "id": "...",
      "transactionDate": "2026-03-17T00:00:00.000Z",
      "type": "expense",
      "description": "Corner Market",
      "notes": null,
      "categoryName": "Groceries",
      "amount": -16.88,
      "currency": "EUR",
      "walletName": "Brokerage Account"
    }
  ]
}
```

### Create Transaction

```
POST /api/transactions
```

**Request body:**

```json
{
  "transactionDate": "2026-03-27T00:00:00.000Z",
  "type": "expense",
  "description": "Groceries purchase",
  "notes": "Weekly shop",
  "entries": [
    {
      "walletId": "fd016681-...",
      "assetId": "f0cd0abb-...",
      "amount": "-37.57"
    }
  ]
}
```

| Field             | Type   | Required | Description                                                     |
|------------------|--------|----------|-----------------------------------------------------------------|
| `transactionDate`| string | yes      | ISO 8601 datetime with timezone                                 |
| `type`           | string | yes      | `expense`, `income`, `transfer`, `exchange`, `adjustment`, `fee`|
| `description`    | string | yes      | What the transaction is for (max 255 chars)                     |
| `notes`          | string | no       | Additional notes                                                |
| `externalRef`    | string | no       | External reference ID (for deduplication)                       |
| `entries`        | array  | yes      | One or more entries (transfers require 2+)                      |
| `entries[].walletId` | uuid | yes  | Target wallet                                                   |
| `entries[].assetId`  | uuid | yes  | Currency asset                                                  |
| `entries[].amount`   | string | yes | Amount (negative for debits, positive for credits)              |
| `entries[].notes`    | string | no  | Entry-level notes                                               |

**Response:** `201` with `{ data: { id, ... } }`

### Bulk Create Transactions

```
POST /api/transactions/bulk
```

**Request body:**

```json
{
  "transactions": [
    {
      "transactionDate": "2026-03-01T00:00:00.000Z",
      "type": "expense",
      "description": "Grocery Store",
      "entries": [{ "walletId": "...", "assetId": "...", "amount": "-37.57" }]
    }
  ]
}
```

Accepts 1-100 transactions. Each follows the same schema as `POST /api/transactions`.

**Response:** `201` with `{ data: { created: 2, ids: ["uuid-1", "uuid-2"] } }`

### Update Transaction

```
PATCH /api/transactions/:id
```

**Request body (all fields optional):**

```json
{
  "description": "Weekly groceries",
  "type": "expense",
  "transactionDate": "2026-03-27T00:00:00.000Z",
  "notes": "Including cleaning supplies",
  "categoryId": "f3911035-...",
  "amount": "-42.50"
}
```

The `amount` field updates the first entry's amount.

**Response:** `200` with `{ data: { id, description, type, transactionDate, notes } }`

### Delete Transaction

```
DELETE /api/transactions/:id
```

Soft-deletes the transaction.

**Response:** `200` with `{ data: { id, deletedAt } }`

### Restore Transaction

```
POST /api/transactions/:id/restore
```

**Response:** `200` with `{ data: { id } }`

---

## Analytics

### Financial Summary

```
GET /api/analytics/summary
```

**Query parameters:** `from` (YYYY-MM-DD), `to` (YYYY-MM-DD) -- both optional.

**Response:**

```json
{
  "data": {
    "totalIncome": 15420.50,
    "totalExpense": 8930.25,
    "totalTransfers": 2500.00,
    "net": 6490.25,
    "transactionCount": 1847,
    "walletCount": 18,
    "categoryCount": 60,
    "dateRange": {
      "from": "2022-01-15T00:00:00.000Z",
      "to": "2026-03-25T00:00:00.000Z"
    },
    "byCurrency": [
      {
        "currency": "EUR",
        "income": 10420.50,
        "expense": -5930.25,
        "transfer": -200.00,
        "adjustment": -59.16,
        "fee": -12.50,
        "net": 4218.59
      }
    ]
  }
}
```

### Monthly Trend

```
GET /api/analytics/monthly-trend
```

**Query parameters:** `from`, `to` (optional).

Returns income vs. expense per month per currency.

**Response:**

```json
{
  "data": [
    { "month": "2026-01", "income": 2742.18, "expense": 1520.30, "net": 1221.88, "currency": "EUR" },
    { "month": "2026-02", "income": 2742.18, "expense": 890.45, "net": 1851.73, "currency": "EUR" }
  ]
}
```

### Category Breakdown

```
GET /api/analytics/category-breakdown
```

**Query parameters:** `from`, `to` (optional).

Returns spending totals per category, grouped by type and currency. Sorted by total descending.

**Response:**

```json
{
  "data": [
    {
      "categoryId": "f3911035-...",
      "categoryName": "Groceries",
      "categorySlug": "groceries",
      "total": 243.65,
      "count": 12,
      "type": "expense",
      "currency": "EUR"
    }
  ]
}
```

### Asset Growth

```
GET /api/analytics/asset-growth
```

**Query parameters:** `from`, `to` (optional, filter output range).

Returns cumulative balance per month per currency. Gaps are filled by carrying forward the last known balance.

**Response:**

```json
{
  "data": [
    { "month": "2022-01", "currency": "IDR", "balance": 5000000 },
    { "month": "2022-01", "currency": "EUR", "balance": 2500.00 },
    { "month": "2022-02", "currency": "IDR", "balance": 7500000 }
  ]
}
```

### Recent Transactions

```
GET /api/analytics/recent
```

Returns the 50 most recent transactions with wallet and category info.

**Response:**

```json
{
  "data": [
    {
      "id": "...",
      "transactionDate": "2026-03-25T00:00:00.000Z",
      "type": "expense",
      "description": "Grocery Store",
      "notes": null,
      "categoryName": "Groceries",
      "amount": -17.68,
      "currency": "EUR",
      "walletName": "Brokerage Account"
    }
  ]
}
```

---

## Categories

### List Categories

```
GET /api/categories
```

Returns all categories, sorted alphabetically.

**Response:**

```json
{
  "data": [
    { "id": "523d3efc-...", "name": "Cafe", "slug": "cafe" },
    { "id": "f3911035-...", "name": "Groceries", "slug": "groceries" }
  ]
}
```

### Create Category

```
POST /api/categories
```

**Request body:**

```json
{ "name": "Subscriptions" }
```

**Response:** `201` with `{ data: { id, name, slug } }`

If a category with the same slug exists, the existing one is returned.

### Update Category

```
PATCH /api/categories/:id
```

**Request body:**

```json
{ "name": "Monthly Subscriptions" }
```

Slug is regenerated from the new name.

**Response:** `200` with `{ data: { id, name, slug } }`

---

## Investment portfolios

Portfolio endpoints require authentication and operate only on the caller's active, non-deleted investment wallets. Finance OS stores instruments, exchange listings, provider symbols, holdings, position events, and daily prices separately so another market-data provider can be added without migrating holdings. Yahoo's provider symbol is a provisional identity key in V1; the instrument model supports later reconciliation of multiple listings to a shared ISIN-backed instrument when authoritative identifier data is available.

Yahoo Finance is the only V1 provider. Add-holding requests send only the exact Yahoo symbol and position fields; the API resolves all globally shared instrument, exchange, currency, and timezone metadata from Yahoo and never trusts tenant-supplied market metadata. Prices are end-of-day observations, not real-time quotes. The API preserves the last valid close when Yahoo fails and exposes refresh timestamps/errors rather than fabricating data.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/portfolio/search?q=BBCA&limit=10` | Search international Yahoo stock/ETF listings |
| `POST` | `/api/portfolio/holdings` | Add a listing, quantity, and optional average cost to an investment wallet |
| `GET` | `/api/portfolio/holdings?walletId=...` | List the caller's holdings |
| `PATCH` | `/api/portfolio/holdings/:id` | Change quantity or average cost |
| `DELETE` | `/api/portfolio/holdings/:id` | Remove a holding |
| `POST` | `/api/portfolio/listings/:id/refresh` | Refresh one owned listing |
| `POST` | `/api/portfolio/wallets/:id/refresh` | Force-refresh all listings in one wallet |
| `POST` | `/api/portfolio/refresh-due` | Reconcile the caller's due listings |
| `GET` | `/api/portfolio/summary?walletId=...&baseCurrency=EUR` | Current native/base values, daily movement, source, and freshness |
| `GET` | `/api/portfolio/history?walletId=...&baseCurrency=EUR&from=2026-01-01&to=2026-07-18` | Up to 366 days of EOD portfolio history |

Background reconciliation atomically leases due listings, drains bounded batches hourly at `:17`, and limits Yahoo concurrency. Repeated refreshes upsert `(listing, trading date, source)` and do not duplicate prices. User-triggered refreshes have a cross-replica database cooldown, while search has per-IP throttling plus short-lived request coalescing. Position events preserve quantity changes and deletions so historical values are based on the positions actually held on each date.

---

## Other

### List Assets

```
GET /api/assets
```

Returns all currency/asset definitions.

**Response:**

```json
{
  "data": [
    { "id": "...", "code": "EUR", "name": "Euro", "type": "currency", "precision": 2 },
    { "id": "...", "code": "IDR", "name": "Indonesian Rupiah", "type": "currency", "precision": 2 },
    { "id": "...", "code": "USD", "name": "US Dollar", "type": "currency", "precision": 2 }
  ]
}
```

### List Imports

```
GET /api/imports
```

Returns all statement import records, newest first.

**Response:**

```json
{
  "data": [
    {
      "id": "...",
      "sourceName": "custom import",
      "sourceType": "csv",
      "fileName": "my-export.csv",
      "checksum": "sha256-hash",
      "status": "imported",
      "rawMetadata": { ... },
      "importedAt": "2026-03-15T10:00:00.000Z"
    }
  ]
}
```

### Dashboard

```
GET /api/dashboard
```

Returns aggregate counts for the dashboard overview.

**Response:**

```json
{
  "data": {
    "walletCount": 18,
    "assetCount": 3,
    "transactionCount": 1847,
    "importCount": 2
  }
}
```

### Health Check

```
GET /health
```

No authentication required.

**Response:**

```json
{ "ok": true }
```
