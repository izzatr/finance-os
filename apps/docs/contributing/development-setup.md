# Development Setup

Get Finance OS running locally for development.

## Prerequisites

- **Node.js 20+** (check with `node --version`)
- **Docker** and Docker Compose (for PostgreSQL)
- **npm** (included with Node.js)

## Clone and Install

```bash
git clone https://github.com/izzatr/finance-os.git
cd finance-os
npm install
```

This is a monorepo with npm workspaces. `npm install` at the root installs dependencies for all packages.

## Start the Database

```bash
docker compose up postgres -d
```

This starts PostgreSQL 16 on port 27033 with:

- Database: `finance_os`
- User: `finance`
- Password: `finance`

Wait for the health check to pass before running migrations.

## Run Migrations

```bash
npm run db:migrate
```

This applies all Drizzle migrations from `packages/db/drizzle/`.

## Seed Data

```bash
npm run db:seed
```

This creates the three base assets (IDR, EUR, USD) plus default categories. It does **not** create fake wallets or transactions.

## Start Dev Servers

```bash
# Start the API dev server
npm run dev

# Or start them individually
npm run dev:api   # API on `http://localhost:27032`
npm run dev:docs  # Docs on `http://localhost:5173`
```

The API runs with `tsx watch` for auto-reload on file changes.

::: tip
Auth is always enforced, including locally. Sign up via `POST /auth/sign-up/email` (or the web UI) and use the returned session cookie or an API key — see [Authentication](/api/authentication).
:::

## Available Scripts

| Script                | Description                            |
|----------------------|----------------------------------------|
| `npm run dev`        | Start API dev server                   |
| `npm run dev:api`    | Start API dev server only              |
| `npm run dev:docs`   | Start docs dev server                  |
| `npm run db:generate`| Generate Drizzle migrations from schema|
| `npm run db:migrate` | Apply pending migrations               |
| `npm run db:studio`  | Open Drizzle Studio (database browser) |
| `npm run db:seed`    | Seed database with base data           |
| `npm run lint`       | Lint all workspaces                    |
| `npm run typecheck`  | Type-check all workspaces              |
| `npm run test`       | Run tests (domain package)             |

## Environment Variables

For local development, the Docker Compose file sets these on the API container:

```bash
DATABASE_URL=postgres://finance:***@localhost:27033/finance_os
PORT=27032
BETTER_AUTH_SECRET=dev-secret-with-at-least-32-chars
BETTER_AUTH_URL=http://localhost:27032
WEB_ORIGIN=http://localhost:27031
```

If running the API outside Docker (with `npm run dev:api`), create an `.env` file in `apps/api/`:

```bash
DATABASE_URL=postgres://finance:***@localhost:27033/finance_os
PORT=27032
BETTER_AUTH_SECRET=dev-secret-with-at-least-32-chars
BETTER_AUTH_URL=http://localhost:27032
WEB_ORIGIN=http://localhost:5173
```

Note: the web dev server runs on port 5173 (Vite default), so set `WEB_ORIGIN` accordingly for CORS.

## Database Studio

Drizzle Studio provides a web-based database browser:

```bash
npm run db:studio
```

This opens a UI where you can browse and edit tables directly.

## Docker Compose (Full Stack)

To run the entire stack with Docker (API + web + Postgres):

```bash
docker compose up -d
```

This builds the API container, starts PostgreSQL, and brings the local stack up. Access:

- API: `http://localhost:27032`
- Postgres: localhost:27033

## Generating Migrations

After modifying `packages/db/src/schema.ts`, generate a new migration:

```bash
npm run db:generate
```

This creates a new SQL migration file in `packages/db/drizzle/`. Then apply it:

```bash
npm run db:migrate
```
