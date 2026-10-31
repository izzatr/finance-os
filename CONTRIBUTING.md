# Contributing to Finance OS

Thanks for your interest in contributing. This guide covers development setup, project conventions, and how to submit changes.

## Development setup

### Prerequisites

- **Node.js** >= 20.11 (we recommend [fnm](https://github.com/Schniz/fnm) or [nvm](https://github.com/nvm-sh/nvm))
- **Docker** and **Docker Compose** (for PostgreSQL)
- **Git**

### Getting started

```bash
# 1. Fork and clone the repository
git clone https://github.com/<your-username>/finance-os.git
cd finance-os

# 2. Install dependencies
npm install

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Run database migrations and seed data
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Start the dev servers
npm run dev
```

This starts the API on `http://localhost:27032`. Run `npm run dev:docs` separately if you want the docs site locally.

### Useful commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the API dev server |
| `npm run dev:api` | API server only |
| `npm run db:generate` | Generate Drizzle migrations from schema changes |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed the database with sample data |
| `npm run db:studio` | Open Drizzle Studio (database GUI) |
| `npm run typecheck` | Run TypeScript checks across all workspaces |
| `npm run test` | Run domain package tests (Vitest) |

## Project structure

```
finance-os/
├── apps/
│   ├── api/              # Hono API server with OpenAPI routes
│   │   └── src/
│   │       ├── app.ts    # Route definitions (Hono + Zod OpenAPI)
│   │       └── index.ts  # Server entrypoint
│   └── web/              # React + Vite + Tailwind + shadcn/ui
│       └── src/
├── packages/
│   ├── cli/              # CLI and MCP server
│   │   └── src/
│   │       ├── api.ts    # API client used by CLI and MCP
│   │       ├── cli.ts    # CLI entrypoint
│   │       └── mcp.ts    # MCP server (Model Context Protocol)
│   ├── db/               # Database layer
│   │   └── src/
│   │       ├── schema.ts # Drizzle ORM table definitions
│   │       ├── seed.ts   # Seed script
│   │       └── index.ts  # DB connection + exports
│   └── domain/           # Shared types and validation
│       └── src/          # Zod schemas, domain primitives
├── docker-compose.yml
├── tsconfig.base.json    # Shared TypeScript config
└── package.json          # Workspace root
```

**Key conventions:**

- `apps/` contains deployable applications
- `packages/` contains shared libraries consumed by apps
- All packages use TypeScript with ES modules (`"type": "module"`)
- Cross-package imports use npm workspace references (e.g., `@finance-os/db`)

## Submitting a pull request

### 1. Branch naming

Create a branch from `main` using the format:

```
feat/short-description     # New feature
fix/short-description      # Bug fix
docs/short-description     # Documentation
refactor/short-description # Refactoring
```

### 2. Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add transaction filtering by date range
fix(web): correct currency formatting for IDR
docs: update MCP server configuration example
refactor(db): normalize wallet type enum
```

Scope should match the workspace: `api`, `web`, `cli`, `db`, `domain`, or omitted for cross-cutting changes.

### 3. Before opening a PR

- Run `npm run typecheck` and fix any errors
- Run `npm run test` and ensure all tests pass
- Keep your PR focused on a single change
- Update documentation if your change affects user-facing behavior

### 4. PR description

Describe what your PR does and why. Include:

- A summary of the change
- How to test it
- Screenshots for UI changes

## Coding standards

### TypeScript

- **Strict mode** is enabled (`"strict": true` in tsconfig)
- Do not use `any` -- use proper types, `unknown`, or Zod inference
- Prefer `const` over `let`; avoid `var`
- Use explicit return types for exported functions

### Database

- Use **Drizzle ORM** for all database operations -- no raw SQL strings
- Schema changes go in `packages/db/src/schema.ts`
- Generate migrations with `npm run db:generate` after schema changes
- Use UUIDs for primary keys
- Soft-delete with `deletedAt` timestamps where applicable

### API

- Use `@hono/zod-openapi` for route definitions so endpoints are automatically documented
- Validate all inputs with Zod schemas from `@finance-os/domain`
- Return consistent response shapes: `{ data: ... }` for success
- Use appropriate HTTP status codes

### Web

- Use [shadcn/ui](https://ui.shadcn.com) components from the project's component library
- Style with Tailwind CSS utility classes
- Use TanStack Query for server state management
- Keep components focused and composable

### MCP / CLI

- MCP tools should have clear descriptions and typed parameters (Zod schemas)
- CLI commands should provide helpful output and error messages
- Both the CLI and MCP server use a shared API client (`packages/cli/src/api.ts`)

## Questions and discussions

- **Bug reports:** Open a [GitHub Issue](https://github.com/izzatr/finance-os/issues) with reproduction steps
- **Feature requests:** Open a [GitHub Issue](https://github.com/izzatr/finance-os/issues) describing the use case
- **Questions:** Start a [GitHub Discussion](https://github.com/izzatr/finance-os/discussions)

We appreciate all contributions, from typo fixes to new features. Thank you for helping improve Finance OS.
