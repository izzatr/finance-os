# Coding Standards

Guidelines for contributing to Finance OS.

## TypeScript

- **Strict mode** is enabled across all packages.
- **No `any`** -- use proper types, `unknown`, or generics. If you find an `any`, fix it.
- Use **type inference** where possible. Don't annotate what TypeScript can infer.
- Prefer **interfaces** for object shapes and **type** for unions/intersections.

## Database (Drizzle ORM)

Use Drizzle ORM for all database operations. No raw SQL strings in application code.

```typescript
// Good
const rows = await db.select().from(wallets).where(eq(wallets.id, id))

// Bad
const rows = await db.execute(sql`SELECT * FROM wallets WHERE id = ${id}`)
```

::: info
The one exception is complex analytics queries (like cumulative balance in `asset-growth`) where Drizzle's query builder doesn't support the required SQL features (window functions, CTEs). Use `db.execute(sql\`...\`)` for those cases.
:::

### Schema Changes

1. Modify `packages/db/src/schema.ts`
2. Generate a migration: `npm run db:generate`
3. Review the generated SQL in `packages/db/drizzle/`
4. Apply: `npm run db:migrate`

Never hand-edit migration files. If a migration is wrong, generate a new one.

## API Routes (Hono + OpenAPI)

Every API route must be defined with `createRoute` and registered with `app.openapi`. This ensures the route appears in the OpenAPI spec with typed request/response schemas.

```typescript
const myRoute = createRoute({
  method: 'get',
  path: '/api/my-resource',
  tags: ['my-resource'],
  request: {
    query: z.object({
      from: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Description of what this returns',
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(mySchema),
          }),
        },
      },
    },
  },
})

app.openapi(myRoute, async (c) => {
  const { from } = c.req.valid('query')
  // ... handler logic
  return c.json({ data: results }, 200)
})
```

### Response Conventions

- Wrap all data in `{ data: ... }`
- Errors use `{ error: { code: "SNAKE_CASE", message: "Human-readable" } }`
- Use appropriate HTTP status codes (200, 201, 400, 401, 404)
- Soft-delete responses include the `deletedAt` timestamp

## Validation (Zod)

All request validation uses Zod schemas. Shared schemas live in `packages/domain/`. Route-specific schemas are defined inline in the route definition.

```typescript
// Shared schema (packages/domain/)
export const walletSchema = z.object({
  name: z.string().min(1).max(120),
  walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']),
  assetId: z.string().uuid(),
  institution: z.string().max(120).optional(),
  isActive: z.boolean().optional(),
})

// Inline schema (route-specific)
request: {
  query: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }),
},
```

## UI (React + shadcn/ui + Tailwind)

- Use **shadcn/ui** components as the building blocks. Don't build custom UI primitives when a shadcn component exists.
- Style with **Tailwind CSS** utility classes. No custom CSS files.
- Use **TanStack Query** for all data fetching. No `useEffect` + `fetch` patterns.
- Keep components focused. One component per file.

```typescript
// Good -- TanStack Query
const { data: wallets } = useQuery({
  queryKey: ['wallets'],
  queryFn: () => fetch('/api/wallets').then(r => r.json()),
})

// Bad -- manual fetching
const [wallets, setWallets] = useState([])
useEffect(() => {
  fetch('/api/wallets').then(r => r.json()).then(d => setWallets(d.data))
}, [])
```

## Naming Conventions

| Thing           | Convention              | Example                    |
|----------------|-------------------------|----------------------------|
| Files           | kebab-case              | `import-transactions.ts`   |
| Variables       | camelCase               | `walletType`               |
| Types/Interfaces| PascalCase              | `WalletMonthlySummary`     |
| Database columns| snake_case              | `wallet_type`              |
| API paths       | kebab-case              | `/api/monthly-trend`       |
| Enums (PG)      | snake_case              | `wallet_type`              |
| Zod schemas     | camelCase + "Schema"    | `walletSchema`             |

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(auth): add Better Auth integration
fix(api): handle null category in search
docs: update quickstart guide
refactor(db): extract wallet balance query
```

Common prefixes:

| Prefix      | Use For                          |
|------------|----------------------------------|
| `feat`     | New features                     |
| `fix`      | Bug fixes                        |
| `docs`     | Documentation changes            |
| `refactor` | Code restructuring (no behavior change) |
| `test`     | Adding or updating tests         |
| `chore`    | Build config, dependencies, etc. |

## Error Handling

- API handlers should return structured error responses, not throw.
- Use early returns for guard clauses (not found, invalid input).
- Log errors with `console.error` for unexpected failures.

```typescript
// Good
const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id))
if (!wallet) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Wallet not found' } }, 404)
}

// Bad
try {
  const wallet = await getWalletOrThrow(id)
} catch (e) {
  return c.json({ error: { code: 'ERROR', message: e.message } }, 500)
}
```

## Soft Deletes

Resources that support deletion use soft deletes (`deletedAt` timestamp). When querying:

- Default: filter `WHERE deleted_at IS NULL`
- Include deleted: add `includeDeleted` flag
- Restore: set `deletedAt` back to `null`

Never hard-delete financial data.
