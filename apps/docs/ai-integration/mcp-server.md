# MCP Server

Finance OS includes a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that exposes 16 tools for AI agents. This lets Claude Code, Cursor, and other MCP-compatible tools interact with your finances through natural language.

## What Is MCP?

MCP is an open protocol that lets AI assistants connect to external tools and data sources. Instead of the AI making raw HTTP calls, it uses structured tool definitions with typed parameters. The AI decides which tools to call based on what you ask.

## Setup

Add a `.mcp.json` file to your project root (or the directory where you run Claude Code):

```json
{
  "mcpServers": {
    "finance-os": {
      "command": "npm",
      "args": ["run", "mcp:finance"],
      "cwd": "/path/to/finance-os",
      "env": {
        "FINANCE_API_URL": "http://localhost:27032"
      }
    }
  }
}
```

The MCP server communicates over stdio and connects to the Finance OS API over HTTP. Make sure the API is running before starting the MCP server.

::: tip
You can also point `FINANCE_API_URL` to a remote Finance OS instance. The MCP server itself runs locally but talks to whatever API URL you configure.
:::

## Tool Reference

### Read Tools

#### `finance_balance`

Get wallet balances, optionally filtered by wallet name or currency.

| Parameter | Type   | Required | Description                                      |
|-----------|--------|----------|--------------------------------------------------|
| `filter`  | string | no       | Wallet name or currency code (e.g., "checking", "EUR") |

Returns total balance by currency and individual wallet balances.

#### `finance_summary`

Get complete financial summary: totals by currency, income/expense/transfers/adjustments/fees breakdown, date range, counts.

No parameters.

#### `finance_recent`

Get recent transactions (last 50), optionally filtered.

| Parameter | Type   | Required | Description                                         |
|-----------|--------|----------|-----------------------------------------------------|
| `filter`  | string | no       | Filter by wallet name, category name, or currency   |
| `limit`   | number | no       | Number of transactions to return (default: 50)      |

#### `finance_spending`

Get spending breakdown by category, grouped by currency.

| Parameter  | Type   | Required | Description                                |
|------------|--------|----------|--------------------------------------------|
| `currency` | string | no       | Filter by currency code (IDR, EUR, USD)    |
| `limit`    | number | no       | Max categories per currency (default: 10)  |

#### `finance_wallets`

List all wallets with their type, institution, currency, and current balance.

No parameters.

#### `finance_categories`

List all transaction categories with their IDs, names, and slugs.

No parameters.

#### `finance_search`

Search transactions by text, wallet, category, or date range.

| Parameter        | Type    | Required | Description                                    |
|-----------------|---------|----------|------------------------------------------------|
| `q`             | string  | no       | Text search on description                     |
| `wallet`        | string  | no       | Wallet ID to filter by                         |
| `walletName`    | string  | no       | Wallet name (resolved to ID automatically)     |
| `category`      | string  | no       | Category ID to filter by                       |
| `from`          | string  | no       | Start date (YYYY-MM-DD)                        |
| `to`            | string  | no       | End date (YYYY-MM-DD)                          |
| `includeDeleted`| boolean | no       | Include soft-deleted transactions               |

#### `finance_monthly_report`

Get a monthly financial report: income, expenses by category, top spending, net savings.

| Parameter    | Type   | Required | Description                                |
|-------------|--------|----------|--------------------------------------------|
| `month`     | string | no       | Month in YYYY-MM format (default: current) |
| `walletName`| string | no       | Filter to a specific wallet                |

### Write Tools

#### `finance_add_transaction`

Add a new transaction (expense, income, transfer, adjustment, fee).

| Parameter     | Type   | Required | Description                                              |
|--------------|--------|----------|----------------------------------------------------------|
| `date`       | string | yes      | Transaction date (YYYY-MM-DD)                            |
| `type`       | string | yes      | `expense`, `income`, `transfer`, `exchange`, `adjustment`, `fee` |
| `description`| string | yes      | What the transaction is for                              |
| `amount`     | string | yes      | Amount (negative for expenses, e.g., `"-32.50"`)         |
| `walletName` | string | yes      | Wallet name (e.g., "Brokerage Account", "Local Bank")           |
| `notes`      | string | no       | Additional notes                                         |

#### `finance_edit_transaction`

Edit an existing transaction.

| Parameter      | Type   | Required | Description                                 |
|---------------|--------|----------|---------------------------------------------|
| `id`          | string | yes      | Transaction ID                              |
| `description` | string | no       | New description                             |
| `type`        | string | no       | New type                                    |
| `date`        | string | no       | New date (YYYY-MM-DD)                       |
| `amount`      | string | no       | New amount                                  |
| `notes`       | string | no       | New notes (empty string to clear)           |
| `categoryName`| string | no       | Category name (resolved to ID automatically)|

#### `finance_delete_transaction`

Soft-delete a transaction (recoverable).

| Parameter | Type   | Required | Description              |
|-----------|--------|----------|--------------------------|
| `id`      | string | yes      | Transaction ID to delete |

#### `finance_restore_transaction`

Restore a previously soft-deleted transaction.

| Parameter | Type   | Required | Description               |
|-----------|--------|----------|---------------------------|
| `id`      | string | yes      | Transaction ID to restore |

#### `finance_transfer`

Transfer money between wallets. Both wallets must use the same currency.

| Parameter     | Type   | Required | Description                             |
|--------------|--------|----------|-----------------------------------------|
| `date`       | string | yes      | Transfer date (YYYY-MM-DD)              |
| `amount`     | string | yes      | Amount (positive, e.g., `"50.00"`)      |
| `fromWallet` | string | yes      | Source wallet name                      |
| `toWallet`   | string | yes      | Target wallet name                      |
| `description`| string | no       | Transfer description                    |
| `notes`      | string | no       | Additional notes                        |

#### `finance_create_wallet`

Create a new wallet.

| Parameter    | Type   | Required | Description                                                        |
|-------------|--------|----------|--------------------------------------------------------------------|
| `name`      | string | yes      | Wallet display name                                                |
| `walletType`| string | yes      | `bank`, `cash`, `ewallet`, `crypto`, `investment`, `credit`, `custom` |
| `currency`  | string | yes      | Currency code: `IDR`, `EUR`, or `USD`                              |
| `institution`| string | no      | Bank/provider name                                                 |

#### `finance_edit_wallet`

Edit an existing wallet.

| Parameter    | Type    | Required | Description                      |
|-------------|---------|----------|----------------------------------|
| `walletName`| string  | yes      | Current wallet name to find      |
| `newName`   | string  | no       | New wallet name                  |
| `walletType`| string  | no       | New wallet type                  |
| `institution`| string | no       | New institution                  |
| `isActive`  | boolean | no       | Active status                    |

#### `finance_reconcile`

Compare a wallet's computed balance with an expected balance. Optionally auto-adjust.

| Parameter        | Type    | Required | Description                                   |
|-----------------|---------|----------|-----------------------------------------------|
| `walletName`    | string  | yes      | Wallet name to reconcile                      |
| `expectedBalance`| string | yes      | Expected balance (e.g., `"2212.90"`)          |
| `autoAdjust`    | boolean | no       | Create adjustment transaction if needed       |

## Example Conversation

Here is how a natural language conversation maps to MCP tool calls:

**User:** "How much do I have in my EUR accounts?"

**AI calls:** `finance_balance` with `filter: "EUR"`

**AI responds:** "Your EUR accounts total EUR4,218.59 across Brokerage Account (EUR2,232.94), Example Bank (EUR1,485.65), and Cash EUR (EUR500.00)."

---

**User:** "I spent EUR32.50 at Grocery Store today for groceries"

**AI calls:** `finance_add_transaction` with:
```json
{
  "date": "2026-03-28",
  "type": "expense",
  "description": "Groceries purchase",
  "amount": "-32.50",
  "walletName": "Brokerage Account"
}
```

**AI responds:** "Recorded: -EUR32.50 at Groceries purchase from Brokerage Account."

---

**User:** "What did I spend on transportation this month?"

**AI calls:** `finance_search` with:
```json
{
  "walletName": "Brokerage Account",
  "from": "2026-03-01",
  "to": "2026-03-31"
}
```

Then filters results for transportation category.

---

**User:** "Transfer EUR200 from Brokerage Account to Example Bank"

**AI calls:** `finance_transfer` with:
```json
{
  "date": "2026-03-28",
  "amount": "200.00",
  "fromWallet": "Brokerage Account",
  "toWallet": "Example Bank"
}
```
