# Finance OS

Open-source, AI-agent-native personal finance engine.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://github.com/izzatr/finance-os/actions/workflows/ci.yml/badge.svg)](https://github.com/izzatr/finance-os/actions)

![Finance OS Dashboard](docs/assets/dashboard.png)

Finance OS is a self-hostable, wallet-based finance tracker built for humans and AI agents. Track wallets across currencies, import bank statements, analyze spending, and manage your money through a dashboard, CLI, REST API, or MCP server.

## Features

- **Wallet-based accounting** with double-entry transaction model
- **Multi-currency** support (IDR, EUR, USD) with live exchange rates
- **Analytics dashboard** with charts, category breakdowns, and asset growth tracking
- **Custom imports** via scripts or the bulk API
- **MCP server** for native AI agent integration (Claude Code, etc.)
- **CLI** for terminal-based finance management
- **REST API** with OpenAPI documentation
- **Soft-delete** for safe transaction and wallet management
- **Better Auth** integration with email/password, OAuth, and API keys

## Quick Start

```bash
git clone https://github.com/izzatr/finance-os.git
cd finance-os
docker compose up -d
```

API: [http://localhost:27032](http://localhost:27032)
OpenAPI: [http://localhost:27032/openapi.json](http://localhost:27032/openapi.json)

## Architecture

```
finance-os/
├── apps/
│   ├── api/          Hono REST API (Node.js)
│   └── docs/         Astro Starlight documentation
├── packages/
│   ├── db/           Drizzle ORM schema + migrations
│   ├── domain/       Shared Zod schemas + types
│   └── cli/          MCP server + CLI
├── docker-compose.yml
```

**Stack:** Hono, Better Auth, Drizzle ORM, PostgreSQL 16, Zod, MCP SDK

## Development

```bash
# Prerequisites: Node 20+, Docker

npm install
docker compose up -d                      # Start Postgres
npm run db:generate && npm run db:migrate # Run migrations
npm run db:seed                           # Seed sample data
npm run dev:api                           # API on :27032
npm run dev:docs                          # Docs on :5173
```

## CLI

```bash
npm run finance balance          # Wallet balances
npm run finance recent           # Last 50 transactions
npm run finance search groceries # Search transactions
npm run finance month 2026-03    # Monthly report
npm run finance spend            # Category breakdown
npm run finance reconcile "Main Checking EUR" 2212.90
npm run finance export --from=2026-03-01 --to=2026-03-31
```

## MCP Server

Add to your Claude Code project's `.mcp.json`:

```json
{
  "mcpServers": {
    "finance-os": {
      "command": "npx",
      "args": ["tsx", "packages/cli/src/mcp.ts"],
      "env": { "FINANCE_API_URL": "http://localhost:27032" }
    }
  }
}
```

16 tools available: `finance_balance`, `finance_search`, `finance_add_transaction`, `finance_edit_transaction`, `finance_delete_transaction`, `finance_transfer`, `finance_monthly_report`, `finance_reconcile`, and more.

## API

All endpoints return `{ data: ... }` and are documented via OpenAPI at `/openapi.json`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/wallets | List wallets with balances |
| POST | /api/wallets | Create wallet |
| GET | /api/wallets/:id/transactions | Wallet transactions |
| GET | /api/transactions/search | Search transactions |
| POST | /api/transactions | Create transaction |
| POST | /api/transactions/bulk | Batch create |
| DELETE | /api/transactions/:id | Soft-delete |
| GET | /api/analytics/summary | Financial summary |
| GET | /api/analytics/monthly-trend | Monthly trends |
| GET | /api/analytics/asset-growth | Net worth over time |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

[AGPL-3.0](LICENSE) - Izzat Raihan
