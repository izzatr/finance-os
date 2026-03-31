# Architecture

Finance OS is a TypeScript monorepo that follows a layered architecture with clear boundaries between packages.

## Monorepo Structure

```
finance-os/
├── apps/
│   ├── api/          Hono REST API (port 27032)
│   ├── web/          React dashboard (port 27031)
│   └── docs/         VitePress documentation
├── packages/
│   ├── db/           Drizzle ORM schema, migrations, seeds, imports
│   ├── cli/          CLI tool + MCP server
│   └── domain/       Shared Zod schemas and types
├── docker-compose.yml
└── package.json      Root workspace config
```

## Data Flow

```
Web Dashboard ──┐
CLI ────────────┤
MCP Server ─────┼──► REST API (Hono) ──► PostgreSQL
External tools ─┘
```

The **API** is the single gateway to the database. No client accesses Postgres directly. The web dashboard, CLI, and MCP server all communicate with the API over HTTP.

The **CLI** and **MCP server** share the same API client (`packages/cli/src/api.ts`). The CLI runs interactively in the terminal; the MCP server runs over stdio for AI agent integration.

## Database Schema

Six tables form the core data model:

### `assets`

Currencies and other asset types.

| Column      | Type                                        | Description                 |
|------------|---------------------------------------------|-----------------------------|
| `id`       | uuid (PK)                                   | Random UUID                 |
| `code`     | varchar(16), unique                          | Currency code (EUR, IDR)    |
| `name`     | varchar(120)                                 | Display name                |
| `type`     | enum: currency, crypto, stock, commodity, custom | Asset classification    |
| `precision`| integer                                      | Decimal places              |

### `wallets`

Individual accounts tied to one asset.

| Column       | Type                                            | Description           |
|-------------|--------------------------------------------------|-----------------------|
| `id`        | uuid (PK)                                        | Random UUID           |
| `name`      | varchar(120)                                      | Display name          |
| `walletType`| enum: bank, cash, ewallet, crypto, investment, credit, custom | Account type |
| `institution`| varchar(120), nullable                           | Bank/provider name    |
| `assetId`   | uuid (FK -> assets)                               | Wallet currency       |
| `isActive`  | boolean                                           | Active flag           |
| `deletedAt` | timestamp, nullable                               | Soft-delete marker    |

### `categories`

Transaction categories with auto-generated slugs.

| Column    | Type                    | Description              |
|----------|-------------------------|--------------------------|
| `id`     | uuid (PK)               | Random UUID              |
| `name`   | varchar(120), unique     | Category name            |
| `slug`   | varchar(120), unique     | URL-safe slug            |

### `transactions`

Parent record for financial events.

| Column           | Type                                                   | Description              |
|-----------------|--------------------------------------------------------|--------------------------|
| `id`            | uuid (PK)                                              | Random UUID              |
| `transactionDate`| timestamp with timezone                                | When it happened         |
| `type`          | enum: expense, income, transfer, exchange, adjustment, fee | Transaction type      |
| `description`   | varchar(255)                                            | What it was for          |
| `notes`         | text, nullable                                          | Additional notes         |
| `externalRef`   | varchar(255), nullable                                  | External ID for dedup    |
| `categoryId`    | uuid (FK -> categories), nullable                       | Category assignment      |
| `deletedAt`     | timestamp, nullable                                     | Soft-delete marker       |

### `transactionEntries`

Individual debit/credit entries within a transaction. This is where amounts live.

| Column         | Type                                | Description           |
|---------------|-------------------------------------|-----------------------|
| `id`          | uuid (PK)                           | Random UUID           |
| `transactionId`| uuid (FK -> transactions, cascade) | Parent transaction    |
| `walletId`    | uuid (FK -> wallets)                | Target wallet         |
| `assetId`     | uuid (FK -> assets)                 | Entry currency        |
| `amount`      | numeric(20,8)                       | Signed amount         |
| `notes`       | text, nullable                      | Entry-level notes     |

### `statementImports`

Records of imported data with checksums for deduplication.

| Column       | Type                                               | Description          |
|-------------|-----------------------------------------------------|----------------------|
| `id`        | uuid (PK)                                           | Random UUID          |
| `sourceName`| varchar(120)                                         | Import source name   |
| `sourceType`| varchar(60)                                          | csv, pdf, etc.       |
| `fileName`  | varchar(255)                                         | Original file name   |
| `checksum`  | varchar(128)                                         | SHA-256 hash         |
| `status`    | enum: pending, parsed, reviewed, imported, failed    | Import status        |
| `rawMetadata`| jsonb                                               | Arbitrary metadata   |
| `importedAt`| timestamp, nullable                                  | When import completed|

## Double-Entry Accounting

The core accounting model is double-entry:

- Every transaction has **one or more entries**
- Each entry affects **one wallet** by a **signed amount**
- **Expenses** have one entry with a negative amount
- **Income** has one entry with a positive amount
- **Transfers** have two entries that sum to zero (debit source, credit destination)
- Wallet **balances are computed** by summing all entries for that wallet (never stored)

This design ensures that:

1. Balances are always consistent with the transaction log
2. Transfers are atomic (both sides in one transaction)
3. Multi-currency transactions are naturally supported (different entries can have different assets)

## Tech Stack Choices

| Choice              | Rationale                                                |
|--------------------|----------------------------------------------------------|
| **Hono**           | Lightweight, fast, works with `@hono/zod-openapi` for typed routes |
| **Drizzle ORM**    | Type-safe SQL, excellent migration tooling, no query builder magic |
| **PostgreSQL**     | Robust, good numeric precision, JSONB for flexible metadata |
| **Better Auth**    | Flexible auth with sessions, API keys, and OAuth out of the box |
| **React + shadcn/ui** | Composable component library, Tailwind-based styling  |
| **TanStack Query** | Cache management, automatic refetching, optimistic updates |
| **Recharts**       | Declarative charting that works well with React           |
| **Zod**            | Schema validation shared between API, domain, and client |
| **MCP SDK**        | Standard protocol for AI agent tool integration           |

## Package Dependencies

```
apps/api      depends on  packages/db, packages/domain
apps/docs     standalone  documentation site
packages/cli  depends on nothing (talks to API over HTTP)
packages/db  depends on drizzle-orm, better-auth
packages/domain depends on zod
```

The API imports `db` for database access and `domain` for shared Zod schemas. The web app and CLI are fully decoupled -- they only know about the HTTP API.
