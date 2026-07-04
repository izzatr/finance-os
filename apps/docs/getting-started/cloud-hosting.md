# Cloud Hosting Guide

**For Finance OS Cloud edition (personal, hosted)**

---

## Overview

Finance OS Cloud is a single-tenant personal finance SaaS. Each deployment serves one user (or one household with shared credentials). There are no workspaces, no multi-tenancy, and no team features.

---

## Prerequisites

- Node.js ≥ 20.11.0
- PostgreSQL 16+ (or use the included Docker Compose)
- A domain name for the web UI
- A domain name or subdomain for the API (e.g. `api.yourdomain.com`)
- Google OAuth app credentials (for sign-in with Google)
- Stripe account (for subscriptions)

---

## Environment Variables

Copy `.env.cloud.example` to `.env` in the project root and fill in:

```bash
# Required: cryptographically random secret (≥ 32 chars)
BETTER_AUTH_SECRET=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Required: public URL of this deployment (no trailing slash)
BETTER_AUTH_URL=https://api.yourdomain.com
WEB_ORIGIN=https://yourdomain.com

# Required: Google OAuth (create at console.cloud.google.com)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<your-secret>

# Optional: GitHub OAuth (create at github.com/settings/applications)
GITHUB_CLIENT_ID=Iv1.<...>
GITHUB_CLIENT_SECRET=<...>

# Required for billing: Stripe keys from dashboard.stripe.com
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
DATABASE_URL=postgres://user:password@host:5432/finance_os
```

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. **Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URIs: `https://api.yourdomain.com/auth/callback/google`
4. Copy **Client ID** and **Client Secret** to env

---

## Stripe Setup

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Create 4 prices (Products → Add product):
   - **Weekly:** recurring, weekly, e.g. €4.99/week
   - **Monthly:** recurring, monthly, e.g. €14.99/month
   - **Yearly:** recurring, yearly, e.g. €99.99/year
   - **Lifetime:** one-time payment (use the Lifetime plan product)
3. Copy the **Price IDs** into env vars:
   ```
   STRIPE_WEEKLY_PRICE_ID=price_...
   STRIPE_MONTHLY_PRICE_ID=price_...
   STRIPE_YEARLY_PRICE_ID=price_...
   ```
4. Set up webhook endpoint:
   - URL: `https://api.yourdomain.com/webhooks/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
5. Copy the **Webhook signing secret** to `STRIPE_WEBHOOK_SECRET`

---

## Deployment Options

### Option A: Docker Compose (recommended for single-server)

```bash
# Build and start all services
docker compose -f docker-compose.yml up -d

# The API will be available at http://localhost:27032
# The web UI will be available at http://localhost:27031
```

Update the docker-compose environment section with your production env vars before running.

### Option B: Direct Node process

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start the API
npm run dev:api

# In another terminal, start the web UI
npm run dev:web
```

### Option C: Cloud platforms

- **Railway** — add a PostgreSQL addon, set env vars, deploy from GitHub
- **Render** — use a `render.yaml` with a web service + Postgres
- **Fly.io** — use `fly launch` with a `Dockerfile` (see `apps/api/Dockerfile`)

---

## Database Migrations

After env vars are set, run:

```bash
npm run db:generate   # Generate migration from schema changes
npm run db:migrate    # Apply migrations to production DB
```

New tables added for cloud edition:
- `billing_customers` — Stripe customer per user
- `subscription_plans` — plan catalog (weekly/monthly/yearly/lifetime)
- `subscriptions` — active subscription per user
- `audit_logs` — immutable mutation audit trail

---

## Production Checklist

- [ ] `BETTER_AUTH_SECRET` is a real 32+ char random string (not the dev default)
- [ ] `NODE_ENV=production`
- [ ] `WEB_ORIGIN` set to the real web UI origin (no localhost)
- [ ] `BETTER_AUTH_URL` set to the real API URL (no localhost)
- [ ] CORS origins restricted to `WEB_ORIGIN` only
- [ ] Google OAuth redirect URI points to the real API domain
- [ ] Stripe webhook is live (not test mode)
- [ ] Database has SSL connections enabled in production
