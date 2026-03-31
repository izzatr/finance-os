# API Overview

The Finance OS API is a REST API built with [Hono](https://hono.dev/) and [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi). Every route is defined with Zod schemas and generates an OpenAPI spec automatically.

## Base URL

```
http://localhost:27032
```

In production, this is wherever you host the API container (e.g., `https://api.finance.example.com`).

## Authentication

The API supports multiple auth methods. See [Authentication](/api/authentication) for full details.

| Method          | Header                        | Use Case          |
|-----------------|-------------------------------|-------------------|
| Session cookie  | `Cookie: ...`                 | Browser-based clients |
| Bearer token    | `Authorization: Bearer <key>` | External clients  |
| API key header  | `x-api-key: <key>`            | CLI / scripts     |
| Skip auth       | _(none, env var)_             | Local development |

For local development, set `SKIP_AUTH=1` in your environment to bypass auth entirely. The default Docker Compose config includes this.

## Response Format

All successful responses wrap data in a `data` field:

```json
{
  "data": { ... }
}
```

For list endpoints:

```json
{
  "data": [
    { ... },
    { ... }
  ]
}
```

## Error Format

Errors return an `error` object with a `code` and `message`:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Transaction not found"
  }
}
```

Common error codes:

| Code              | HTTP Status | Description                            |
|-------------------|-------------|----------------------------------------|
| `UNAUTHORIZED`    | 401         | Missing or invalid authentication      |
| `NOT_FOUND`       | 404         | Resource does not exist                |
| `INVALID_TRANSFER`| 400         | Transfer with fewer than 2 entries     |
| `NO_CHANGES`      | 404         | PATCH with no fields to update         |

## OpenAPI Spec

The auto-generated OpenAPI JSON is available at:

```
GET /openapi.json
```

A Swagger UI is available at:

```
GET /doc
```

## CORS

The API allows requests from:

- The `WEB_ORIGIN` environment variable (default: `http://localhost:27031`)
- `http://localhost:5173` (Vite dev server)

Credentials (cookies) are included in CORS responses.

## Health Check

```bash
curl http://localhost:27032/health
```

```json
{ "ok": true }
```

This endpoint does not require authentication and is useful for monitoring and load balancer health checks.

## Content Type

All request bodies must be `application/json`. All responses are `application/json`.

## IDs

All resource IDs are UUIDs (v4, randomly generated). IDs are returned as strings in the format `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`.

## Amounts

Transaction amounts are stored as `numeric(20,8)` in the database. In API responses, amounts are returned as numbers. In request bodies (creating/editing transactions), amounts should be strings (e.g., `"-32.50"`) to preserve precision.

## Dates

All dates are ISO 8601 with timezone:

- Request: `"2026-03-27T00:00:00.000Z"`
- Response: `"2026-03-27T00:00:00.000Z"`

Date filters in query parameters use `YYYY-MM-DD` format.

## Rate Limiting

There is no built-in rate limiting. If you expose the API to the internet, add rate limiting at the reverse proxy level.
