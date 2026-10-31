# Claude Code Skills

Finance OS documents six example [Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) you can add to your own setup for common finance tasks. These are reference patterns for agent workflows — the repo does **not** ship a tracked `.claude/skills/` directory by default.

## How Skills Work

Skills are markdown files in `.claude/skills/<name>/SKILL.md`. Each skill has:

- A **name** and **description** that Claude Code uses to match user intent
- An **argument hint** showing what parameters the skill accepts
- **Step-by-step instructions** for how to fulfill the request
- **Formatting rules** for consistent output

Skills are user-invocable, meaning you can trigger them explicitly with `/balance`, `/spend`, etc., or Claude Code will activate them automatically when your message matches the description.

## Available Skills

### `/balance`

Check wallet balances and total net worth.

**Triggers on:** "how much do I have", "my balance", "net worth", "total balance", "wallet balances"

**Arguments:** Optional wallet name or currency filter (e.g., `/balance eur`, `/balance checking`)

**What it does:**
1. Fetches wallet balances from `GET /api/wallets`
2. Fetches currency totals from `GET /api/analytics/summary`
3. Fetches live exchange rates for EUR total conversion
4. Presents total net worth, per-currency balances, and wallet breakdown

### `/spend`

View spending breakdown by category.

**Triggers on:** "what did I spend on", "spending breakdown", "where does my money go", "top expenses", "category breakdown"

**Arguments:** Optional category, currency, or "top N" filter (e.g., `/spend groceries`, `/spend eur`, `/spend top 5`)

**What it does:**
1. Fetches category breakdown from `GET /api/analytics/category-breakdown`
2. Filters to expense-type categories only
3. Groups by currency and shows top categories with amounts, counts, and percentages

### `/add-transaction`

Add a new transaction (expense, income, transfer).

**Triggers on:** "I spent", "I bought", "I received", "I paid", "log expense", "add income", "record transaction", "I transferred"

**Arguments:** `<amount> <description> [category] [wallet]`

**What it does:**
1. Parses the user's natural language input for amount, description, category, and wallet
2. Looks up wallets and categories via the API
3. Confirms the transaction details with the user before creating
4. Creates via `POST /api/transactions`

::: info
The skill always asks for confirmation before creating a transaction. It will ask clarifying questions if the wallet or category is ambiguous.
:::

### `/recent`

View recent transactions.

**Triggers on:** "recent transactions", "last transactions", "what happened", "transaction history", "recent activity"

**Arguments:** Optional number, wallet name, category, or currency filter (e.g., `/recent 10`, `/recent checking`, `/recent eur`)

**What it does:**
1. Fetches recent transactions from `GET /api/analytics/recent`
2. Groups by date and formats in a scannable layout
3. Filters by the specified criteria if arguments are provided

### `/summary`

Financial overview and health check.

**Triggers on:** "financial summary", "how am I doing", "overview", "financial health", "money summary", "finance report"

**What it does:**
1. Fetches summary, wallets, recent transactions, and live exchange rates in parallel
2. Presents: net worth in EUR, asset allocation by wallet type, cash flow per currency, recent activity snapshot
3. Adds 2-3 factual observations about spending patterns

### `/wallets`

List and manage wallets.

**Triggers on:** "my wallets", "list wallets", "which accounts", "show wallets", "add wallet"

**Arguments:** Optional wallet name for detail view, or "add" to create a new wallet

**What it does:**
- **Listing:** Groups wallets by currency, shows name, type, institution, and balance
- **Detail:** Shows specific wallet info and recent transactions for that wallet
- **Creating:** Guides through wallet creation with name, type, currency, and institution

## Formatting Conventions

All skills follow consistent currency formatting:

| Currency | Format          | Example         |
|----------|----------------|-----------------|
| IDR      | `Rp` prefix, dot thousands, no decimals | `Rp28.422.313` |
| EUR      | `€` prefix, comma thousands, 2 decimals | `€4,281.74`    |
| USD      | `$` prefix, comma thousands, 2 decimals | `$666.65`      |

## Adding Custom Skills

To add a new skill, create a directory in `.claude/skills/` with a `SKILL.md` file:

```
.claude/skills/my-skill/SKILL.md
```

The frontmatter format:

```yaml
---
name: my-skill
description: "Short description. Use when user asks: 'trigger phrase 1', 'trigger phrase 2'"
user-invocable: true
allowed-tools: Bash
argument-hint: "[optional args description]"
---
```

Follow the existing skills as a template for consistent structure and formatting.
