/**
 * Auth middleware for Finance OS API
 *
 * - checkAuth → reads API key or session cookie.
 *                Sets c.get('user') on the context for use in route handlers.
 *                Returns 401 if no valid auth found.
 *
 * Usage: app.use('/api/*', checkAuth)   OR   app.openapi(route, checkAuth, handler)
 */

import type { Context, MiddlewareHandler } from 'hono'
import { auth } from '@finance-os/db'

// ── Auth check (session OR API key) ─────────────────────────────────

export const checkAuth: MiddlewareHandler = async (c: Context, next) => {
  // Skip auth in development when SKIP_AUTH is set
  if (process.env.SKIP_AUTH === '1') {
    return next()
  }

  // ── API Key / Bearer token ─────────────────────────────────────────
  const bearerKey =
    c.req.header('x-api-key') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

  if (bearerKey) {
    try {
      // Better Auth v1.5 exposes key auth via api.getKey() or api.key.get()
      const validKey =
        await (auth.api as any).key?.get?.({ key: bearerKey })
        ?? await (auth.api as any).getKey?.(bearerKey)
      if (validKey) {
        c.set('user', validKey.user)
        c.set('session', null)
        return next()
      }
    } catch {
      // key method not available or failed
    }
    // Invalid or missing key — do NOT fall through to session check
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)
  }

  // ── Session cookie (web UI) ────────────────────────────────────
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (session) {
      c.set('user', session.user)
      c.set('session', session.session)
      return next()
    }
  } catch {
    // session check failed
  }

  return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401)
}

// ── Admin-only check (stub — extend when roles plugin is added) ──────────────

export const checkAdmin: MiddlewareHandler = async (c: Context, next) => {
  const user = c.get('user')
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Admin access required' } }, 401)
  }
  return next()
}
