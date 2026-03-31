# Authentication

Finance OS uses [Better Auth](https://www.better-auth.com/) for authentication. All `/api/*` routes require authentication unless `SKIP_AUTH=1` is set.

## Auth Methods

### Session Cookies (Web UI)

The web dashboard authenticates via session cookies. Better Auth manages sessions at the `/auth/*` routes:

- `POST /auth/sign-up/email` -- create a new account
- `POST /auth/sign-in/email` -- sign in with email/password
- `GET /auth/session` -- get current session
- `POST /auth/sign-out` -- sign out

Session cookies are set automatically and sent with subsequent requests.

### Bearer Tokens

For programmatic access, use a Bearer token in the `Authorization` header:

```bash
curl http://localhost:27032/api/wallets \
  -H "Authorization: Bearer your-api-key"
```

### API Key Header

Alternatively, pass the API key via the `x-api-key` header:

```bash
curl http://localhost:27032/api/wallets \
  -H "x-api-key: your-api-key"
```

Both `Authorization: Bearer <key>` and `x-api-key: <key>` are checked by the auth middleware. They are equivalent.

### Development Mode (SKIP_AUTH)

For local development, set the `SKIP_AUTH` environment variable to bypass authentication entirely:

```bash
SKIP_AUTH=1
```

The default `docker-compose.yml` includes this setting. All API requests will succeed without any auth headers.

::: warning
Never set `SKIP_AUTH=1` in production. It disables all authentication checks.
:::

## Auth Middleware

The auth middleware (`/apps/api/src/middleware/auth.ts`) runs on all `/api/*` routes:

1. If `SKIP_AUTH=1` is set, skip all checks.
2. Check for `x-api-key` header or `Authorization: Bearer` token. If present, validate it and set `user` on the context. If invalid, return `401`.
3. If no API key, check for a session cookie via Better Auth. If valid, set `user` and `session` on the context.
4. If no valid auth found, return `401`.

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

## Creating an Account

Sign up with email and password:

```bash
curl -X POST http://localhost:27032/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "password": "your-password",
    "name": "Your Name"
  }'
```

## Signing In

```bash
curl -X POST http://localhost:27032/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "you@example.com",
    "password": "your-password"
  }'
```

Use the stored cookies for subsequent requests:

```bash
curl http://localhost:27032/api/wallets -b cookies.txt
```

## Unauthenticated Endpoints

The following endpoints do not require authentication:

- `GET /health` -- health check
- `POST /auth/sign-up/email` -- account creation
- `POST /auth/sign-in/email` -- sign in
- All `/auth/*` routes -- managed by Better Auth

## CORS and Credentials

The API accepts credentialed requests (cookies) from:

- `WEB_ORIGIN` (default: `http://localhost:27031`)
- `http://localhost:5173` (Vite dev server)

If your dashboard runs on a different origin, update `WEB_ORIGIN` accordingly.
