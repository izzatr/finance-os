# Introduction

Finance OS is an open-source, self-hostable personal finance engine designed to be controlled by AI agents, CLIs, and dashboards alike. It uses wallet-based double-entry accounting to track your money across currencies and account types.

## Key Features

- **Wallet-based accounting** -- track bank accounts, cash, e-wallets, crypto, investments, and credit cards as individual wallets, each tied to a single currency.
- **Multi-currency support** -- IDR, EUR, and USD out of the box. Add more currencies as assets.
- **Double-entry transactions** -- every transaction has one or more entries. Transfers debit one wallet and credit another. Balances are always computed from entries, never stored.
- **Analytics dashboard** -- monthly trends, category breakdowns, asset growth charts, and spending reports built with shadcn/ui and Recharts.
- **Custom imports** -- bring your own import scripts or bulk API payloads. Extensible to other formats.
- **MCP server** -- 16 tools for Claude Code and other MCP-compatible AI agents. Natural language finance management.
- **CLI** -- a terminal-first interface for checking balances, searching transactions, generating reports, and exporting data.
- **REST API with OpenAPI** -- every feature is accessible via HTTP. OpenAPI spec at `/openapi.json`. Build your own integrations.
- **Self-hostable** -- run with Docker Compose. Your data stays on your machine. AGPL-3.0 licensed.

## Who Is This For?

**Self-hosters** who want full control of their financial data without relying on cloud services.

**AI agent builders** who want a structured finance backend their agents can read from and write to via MCP or REST.

**Developers** who want a clean, extensible finance engine to build on top of -- with a real API, typed schemas, and no vendor lock-in.

## Architecture at a Glance

Finance OS is a TypeScript monorepo with three apps and three packages:

```
apps/
  api/     Hono REST API with OpenAPI (port 27032)
  web/     React dashboard with shadcn/ui (port 27031)
  docs/    VitePress documentation

packages/
  db/      Drizzle ORM schema, migrations, seed, import scripts
  cli/     CLI tool and MCP server
  domain/  Shared Zod schemas and types
```

The API is the single source of truth. The web dashboard, CLI, and MCP server all talk to it over HTTP.

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| API         | Hono + @hono/zod-openapi            |
| Database    | PostgreSQL 16 + Drizzle ORM         |
| Auth        | Better Auth (sessions, OAuth, keys) |
| Web UI      | React 18 + shadcn/ui + Tailwind 4   |
| Charts      | Recharts                            |
| Data fetch  | TanStack Query                      |
| Validation  | Zod                                 |
| MCP         | @modelcontextprotocol/sdk           |
| CLI         | Custom (zero-dep, Node built-in)    |

## Next Steps

- [Quickstart](/getting-started/quickstart) -- get running in 3 commands
- [Self-Hosting Guide](/getting-started/self-hosting) -- production deployment
- [API Overview](/api/overview) -- explore the REST API
- [MCP Server](/ai-integration/mcp-server) -- connect AI agents
