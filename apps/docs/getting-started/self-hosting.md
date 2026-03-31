# Self-Hosting

This guide covers deploying Finance OS to a production environment.

## Environment Variables

### Required

| Variable             | Description                                     | Example                                           |
|----------------------|-------------------------------------------------|---------------------------------------------------|
| `DATABASE_URL`       | PostgreSQL connection string                    | `postgres://finance:secret@db:5432/finance_os`    |
| `PORT`               | API server port                                 | `27032`                                           |
| `BETTER_AUTH_SECRET` | Secret for signing sessions (min 32 chars)      | `a-long-random-string-at-least-32-characters`     |
| `BETTER_AUTH_URL`    | Public URL of the API (used by Better Auth)     | `https://api.finance.example.com`                 |
| `WEB_ORIGIN`         | Origin of the web dashboard (for CORS)          | `https://finance.example.com`                     |

### Optional

| Variable             | Description                                     | Default                   |
|----------------------|-------------------------------------------------|---------------------------|
| `SKIP_AUTH`          | Set to `1` to disable auth (dev only)           | _(unset, auth enabled)_   |
| `VITE_API_BASE_URL`  | API URL for the web build (build-time arg)      | `http://localhost:27032`  |

### OAuth Providers (Optional)

Configure OAuth by setting the appropriate environment variables for Better Auth. Refer to the [Better Auth documentation](https://www.better-auth.com/docs) for provider-specific setup (Google, GitHub, etc.).

## Database Setup

Finance OS requires PostgreSQL 16+. The Docker Compose file includes a Postgres container, but for production you may want a managed database.

### Using Docker Compose (default)

The included `docker-compose.yml` handles everything:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: finance_os
      POSTGRES_USER: finance
      POSTGRES_PASSWORD: finance  # Change in production!
    volumes:
      - finance_os_postgres_data:/var/lib/postgresql/data
```

::: warning
Change the default database credentials for production. Update `POSTGRES_PASSWORD` and the corresponding `DATABASE_URL`.
:::

### Using an External Database

Point `DATABASE_URL` to your managed Postgres instance:

```bash
DATABASE_URL=postgres://user:password@your-db-host:5432/finance_os
```

### Running Migrations

Migrations are managed by Drizzle ORM. Run them after first deployment or after updating:

```bash
npm run db:migrate
```

Migration files are in `packages/db/drizzle/`.

## Authentication

Finance OS uses [Better Auth](https://www.better-auth.com/) for authentication. It supports:

- **Session cookies** -- used by the web dashboard
- **Bearer tokens / API keys** -- used by the CLI, MCP server, and external integrations
- **OAuth providers** -- Google, GitHub, and others via Better Auth plugins

### Production Auth Setup

1. Generate a strong `BETTER_AUTH_SECRET`:

```bash
openssl rand -base64 48
```

2. Set `BETTER_AUTH_URL` to your public API URL.

3. Set `WEB_ORIGIN` to your dashboard URL (for CORS and cookie domain).

4. Remove `SKIP_AUTH` or set it to `0`.

### Creating the First User

With auth enabled, sign up via the API:

```bash
curl -X POST https://api.finance.example.com/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "your-password", "name": "Your Name"}'
```

## Reverse Proxy

In production, place a reverse proxy in front of the API and web containers.

### Caddy

```
finance.example.com {
    reverse_proxy localhost:27031
}

api.finance.example.com {
    reverse_proxy localhost:27032
}
```

### Nginx

```nginx
server {
    listen 443 ssl;
    server_name finance.example.com;

    location / {
        proxy_pass http://localhost:27031;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl;
    server_name api.finance.example.com;

    location / {
        proxy_pass http://localhost:27032;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Backups

### Database Backups

Use `pg_dump` for regular backups:

```bash
# Backup
docker exec finance-os-postgres pg_dump -U finance finance_os > backup.sql

# Restore
cat backup.sql | docker exec -i finance-os-postgres psql -U finance finance_os
```

### Automated Backups

Set up a cron job for daily backups:

```bash
0 2 * * * docker exec finance-os-postgres pg_dump -U finance finance_os | gzip > /backups/finance_os_$(date +\%Y\%m\%d).sql.gz
```

::: tip
The database volume (`finance_os_postgres_data`) persists data across container restarts. Back up this volume as well if using Docker's volume driver.
:::

## Updating

To update Finance OS:

```bash
git pull
docker compose build
docker compose up -d
npm run db:migrate  # Run if there are new migrations
```

## Security Checklist

- [ ] Change default database credentials
- [ ] Set a strong `BETTER_AUTH_SECRET` (32+ characters)
- [ ] Remove `SKIP_AUTH=1` from production
- [ ] Enable HTTPS via reverse proxy
- [ ] Restrict database port (27033) to localhost
- [ ] Set up automated backups
- [ ] Configure `WEB_ORIGIN` to your exact dashboard domain
