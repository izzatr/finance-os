# Quickstart

Get Finance OS running locally in under a minute with Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- Ports 27031, 27032, and 27033 available

## Start the Stack

```bash
git clone https://github.com/izzatr/finance-os.git
cd finance-os
docker compose up -d
```

This starts three services:

| Service      | URL / Port              | Description                          |
|--------------|-------------------------|--------------------------------------|
| **Web**      | `http://localhost:27031`  | Landing page + dashboard             |
| **API**      | `http://localhost:27032`  | REST API + OpenAPI spec              |
| **Postgres** | localhost:27033         | Database (port 5432 internal)        |

::: tip
The default Docker Compose config sets `SKIP_AUTH=1` so no login is required for local development. See [Self-Hosting](/getting-started/self-hosting) for production auth setup.
:::

## Verify It Works

Check the API health endpoint:

```bash
curl http://localhost:27032/health
```

Expected response:

```json
{ "ok": true }
```

## Optional Baseline Seed

If you want the product to start with safe reference data, seed the base setup:

```bash
npm run db:seed
```

This creates baseline currencies/assets and default categories. It does **not** create fake personal finance data.

If you want demo wallets and a sample transaction for screenshots or sandbox testing, use the explicit demo seed:

```bash
npm run db:seed:demo
```

## Access the MCP Server

To connect Finance OS to Claude Code or another MCP-compatible AI agent, add a `.mcp.json` file to your project root:

```json
{
  "mcpServers": {
    "finance-os": {
      "command": "npx",
      "args": ["tsx", "packages/cli/src/mcp.ts"],
      "cwd": "/path/to/finance-os",
      "env": {
        "FINANCE_API_URL": "http://localhost:27032"
      }
    }
  }
}
```

The MCP server exposes 16 tools that let AI agents check balances, add transactions, search history, generate reports, and more. See [MCP Server](/ai-integration/mcp-server) for the full tool reference.

## Use the CLI

```bash
# Set the API URL (defaults to http://localhost:27032)
export FINANCE_API_URL=http://localhost:27032

# Run CLI commands from the monorepo
npm run finance -- balance
npm run finance -- recent
npm run finance -- help
```

See [CLI Reference](/ai-integration/cli) for all available commands.

## Explore the API

The raw OpenAPI spec is available at:

```
http://localhost:27032/openapi.json
```

Fetch it directly with:

```bash
curl http://localhost:27032/openapi.json
```

Try a few endpoints:

```bash
# List wallets
curl http://localhost:27032/api/wallets

# Get financial summary
curl http://localhost:27032/api/analytics/summary

# Get recent transactions
curl http://localhost:27032/api/analytics/recent
```

## Next Steps

- [Wallets Guide](/guides/wallets) -- understand the wallet model
- [Transactions Guide](/guides/transactions) -- learn double-entry transactions
- [API Endpoints](/api/endpoints) -- full endpoint reference
- [Importing Data](/guides/importing-data) -- bring your own import workflow
- [Self-Hosting](/getting-started/self-hosting) -- deploy to production
