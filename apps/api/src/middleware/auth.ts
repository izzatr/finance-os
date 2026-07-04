/**
 * Auth middleware for Finance OS API
 *
 * checkAuth → validates an API key (x-api-key / Bearer) or a session cookie.
 * Sets c.set('user') for route handlers. Returns 401 otherwise.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { auth } from '@finance-os/db'

export const checkAuth: MiddlewareHandler = async (c: Context, next) => {
  // ── API Key / Bearer token ────────────────────────────────────────
  const bearerKey =
    c.req.header('x-api-key') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

  if (bearerKey) {
    const result = await auth.api.verifyApiKey({ body: { key: bearerKey } })
    if (result.valid && result.key) {
      // The api-key plugin's model is reference-generic (user or org); for
      // our default `references: "user"` config, referenceId is the userId.
      c.set('user', { id: result.key.referenceId })
      c.set('session', null)
      return next()
    }
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)
  }

  // ── Session cookie (web UI) ───────────────────────────────────────
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session) {
    c.set('user', session.user)
    c.set('session', session.session)
    return next()
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
