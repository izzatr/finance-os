import './types'
import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { auth } from '@finance-os/db'
import { checkAuth } from './middleware/auth'
import { rateLimit } from './middleware/rate-limit'
import { registerWebhookRoutes } from './routes/webhooks'
import { registerSystemRoutes } from './routes/system'
import { registerWalletRoutes } from './routes/wallets'
import { registerTransactionRoutes } from './routes/transactions'
import { registerCategoryRoutes } from './routes/categories'
import { registerPeopleRoutes } from './routes/people'
import { registerAnalyticsRoutes } from './routes/analytics'
import { registerDashboardRoutes } from './routes/dashboard'
import { registerImportRoutes } from './routes/imports'
import { registerRecurringRoutes } from './routes/recurring'
import { registerInboxRoutes } from './routes/inbox'
import { registerProposalRoutes } from './routes/proposals'
import { registerMcpRoutes } from './routes/mcp'
import { registerExchangeRateRoutes } from './routes/exchange-rates'
import { registerAssetPriceRoutes } from './routes/asset-prices'

const app = new OpenAPIHono()

// CORS — allow web UI and localhost dev
app.use('*', cors({
  origin: [process.env.WEB_ORIGIN ?? 'http://localhost:27031', 'http://localhost:5173'],
  credentials: true,
}))

// Webhooks: raw-body verification, mounted before auth
registerWebhookRoutes(app)

// Remote MCP: does its own Bearer API-key auth + rate limiting
registerMcpRoutes(app)

// ── Auth API routes (OAuth, sessions, API keys) ──────────────────────────
// Better Auth handles sign-in, sign-up, OAuth, session management, API keys at /auth/*
// Strict limit on credential endpoints, loose on the rest of /auth
app.use('/auth/sign-in/*', rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'auth-cred' }))
app.use('/auth/sign-up/*', rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'auth-cred' }))
app.use('/auth/*', rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'auth' }))
app.all('/auth/*', async (c) => auth.handler(c.req.raw))

// ── Protected API routes (session or API key auth) ─────────────────────
// Apply auth middleware to all /api/* routes
app.use('/api/*', checkAuth)

registerSystemRoutes(app)
registerWalletRoutes(app)
registerTransactionRoutes(app)
registerCategoryRoutes(app)
registerPeopleRoutes(app)
registerAnalyticsRoutes(app)
registerDashboardRoutes(app)
registerImportRoutes(app)
registerRecurringRoutes(app)
registerInboxRoutes(app)
registerProposalRoutes(app)
registerExchangeRateRoutes(app)
registerAssetPriceRoutes(app)

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Finance OS API',
    version: '0.1.0',
    description: 'AI-ready API for wallets, assets, transactions, and imports.',
  },
})

export default app
