# CLI Reference

Finance OS includes a command-line interface for terminal-based finance management. The CLI talks directly to the REST API.

## Setup

The CLI requires the API to be running. Set the API URL:

```bash
export FINANCE_API_URL=http://localhost:27032
```

If not set, it defaults to `http://localhost:27032`.

Run commands from the monorepo root with:

```bash
npm run finance -- <command> [options]
```

You can also run the source entry directly if you prefer:

```bash
npx tsx packages/cli/src/cli.ts <command> [options]
```

## Commands

### `balance`

Show wallet balances grouped by currency.

```bash
finance balance
```

```
  BALANCE BY CURRENCY

  IDR    Rp28,422,313
  EUR    €4,281.74
  USD    $666.65

  WALLETS

  Cash                      cash         Rp15,230,000
  Local Bank                    bank         Rp8,192,313
  Mobile Wallet                     ewallet      Rp5,000,000
  Brokerage Account            investment   €2,232.94
  Example Bank                   bank         €1,548.80
  Cash EUR                 cash         €500.00
  Example Bank $ Funds           bank         $666.65
```

### `recent`

Show the 50 most recent transactions, grouped by date.

```bash
finance recent
```

```
  Mar 25
           -€17.68 Grocery Store                          Groceries            Brokerage Account

  Mar 24
            -€7.25 Online order                 Shopping             Brokerage Account

  Mar 23
           -€12.12 Train ticket           Transportation       Brokerage Account
           -€46.76 Supermarket                Groceries            Brokerage Account
```

### `spend`

Show top spending categories grouped by currency.

```bash
finance spend
```

```
  TOP SPENDING — EUR

  Groceries                 €243.65             12 txns
  Transportation            €87.23              15 txns
  Restaurants               €93.62               3 txns
  Electronics               €1,304.00            1 txns
  Food & Beverage           €47.75               6 txns
```

### `summary`

Full financial overview with totals by currency.

```bash
finance summary
```

```
  FINANCE OS SUMMARY

  Tracking since: 1/15/2022
  Transactions:   1847
  Wallets:        18
  Categories:     60

  BY CURRENCY

  EUR
    Balance:     €4,281.74
    Income:      €10,420.50
    Expense:     -€5,930.25
    Transfers:   -€200.00
    Adjustments: -€59.16
    Fees:        -€12.50

  IDR
    Balance:     Rp28,422,313
    Income:      Rp45,000,000
    Expense:     -Rp16,577,687
```

### `wallets`

List all wallets as JSON.

```bash
finance wallets
```

Outputs the raw JSON response from `GET /api/wallets`.

### `categories`

List all categories with their IDs.

```bash
finance categories
```

```
  Cafe                           523d3efc-6052-4b7e-9dd5-2ee12fbf2c2f
  Education                      8a1b2c3d-...
  Electronics                    53aa7cd8-b3cc-48dd-848e-de681121554c
  Food & Beverage                d575d5d3-3679-4e95-b579-0a8cbc90ec17
  Groceries                      f3911035-a4a7-4513-81ab-41062c977b61
```

### `search`

Search transactions by text, with optional filters.

```bash
# Text search
finance search groceries

# With filters
finance search --wallet=fd016681-988e-4d34-8c5e-a6a9a6e3d9d2
finance search --category=f3911035-a4a7-4513-81ab-41062c977b61
finance search --from=2026-03-01 --to=2026-03-31
finance search --include-deleted

# Combine text and filters
finance search groceries --from=2026-03-01
```

```
  Found 6 transactions

  Mar 25
           -€17.68 Grocery Store                          Groceries            Brokerage Account

  Mar 18
            -€7.48 Grocery Store                          Groceries            Brokerage Account

  Mar 08
            -€9.02 Grocery Store                          Groceries            Brokerage Account
```

**Flags:**

| Flag                | Description                 |
|--------------------|-----------------------------|
| `--wallet=<id>`    | Filter by wallet ID         |
| `--category=<id>`  | Filter by category ID       |
| `--from=YYYY-MM-DD`| Start date                  |
| `--to=YYYY-MM-DD`  | End date                    |
| `--include-deleted` | Include soft-deleted        |

### `delete`

Soft-delete a transaction.

```bash
finance delete a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

```
  Soft-deleted transaction a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Deleted at: 2026-03-28T10:00:00.000Z
  (Use "finance restore a1b2c3d4-..." to undo)
```

### `restore`

Restore a soft-deleted transaction.

```bash
finance restore a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

```
  Restored transaction a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### `month`

Monthly report with income, expenses, and top categories.

```bash
# Current month
finance month

# Specific month
finance month 2026-03

# Filter by wallet
finance month 2026-03 --wallet=fd016681-988e-4d34-8c5e-a6a9a6e3d9d2
```

```
  MONTHLY REPORT — 2026-03

  Transactions:  52
  Income:        12.67
  Expense:       -2139.34
  Net:           -2126.67

  TOP CATEGORIES

  Electronics               €1,304.00            1 txns
  Groceries                 €243.65             12 txns
  Transportation            €87.23              15 txns
```

### `reconcile`

Compare a wallet's computed balance with an expected balance.

```bash
finance reconcile "Brokerage Account" 2212.90
```

```
  RECONCILE — Brokerage Account (EUR)

  Current:   €2,232.94
  Expected:  €2,212.90
  Difference: -€20.04

  To auto-adjust, use the MCP tool: finance_reconcile with autoAdjust=true
```

### `export`

Export transactions as CSV.

```bash
# All transactions
finance export

# With filters
finance export --wallet=fd016681-...
finance export --from=2026-03-01 --to=2026-03-31
```

```csv
date,type,description,amount,currency,wallet,category,notes
2026-03-25,expense,"Grocery Store",-17.68,EUR,"Brokerage Account","Groceries",""
2026-03-24,expense,"Online order",-7.25,EUR,"Brokerage Account","Shopping",""
```

**Flags:**

| Flag                | Description           |
|--------------------|-----------------------|
| `--wallet=<id>`    | Filter by wallet ID   |
| `--from=YYYY-MM-DD`| Start date            |
| `--to=YYYY-MM-DD`  | End date              |

Pipe to a file:

```bash
finance export --from=2026-03-01 > march-2026.csv
```

### `help`

Show usage information.

```bash
finance help
```

## Environment Variables

| Variable           | Description                            | Default                    |
|-------------------|----------------------------------------|----------------------------|
| `FINANCE_API_URL` | Base URL of the Finance OS API         | `http://localhost:27032`   |
