/**
 * Auth middleware for Finance OS API
 *
 * checkAuth → validates an API key (x-api-key / Bearer) or a session cookie.
 * Sets c.set('user') for route handlers. Returns 401 otherwise.
 *
 * API keys carry a scope in their metadata: 'read' | 'propose' | 'write'.
 *  - read:    GET only
 *  - propose: GET + POST /api/proposals (writes go to the approval inbox)
 *  - write:   everything (also the default for keys created before scopes existed)
 * Sessions (the human in the web UI) always act with full 'write' power.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { auth } from '@finance-os/db'

export type KeyScope = 'read' | 'propose' | 'write'

export function parseKeyScope(metadata: unknown): KeyScope {
  let meta = metadata
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta)
    } catch {
      meta = null
    }
  }
  const scope = (meta as { scope?: unknown } | null)?.scope
  return scope === 'read' || scope === 'propose' ? scope : 'write'
}

/** Paths a propose-scoped key may still POST to — the approval-inbox intake. */
const PROPOSE_ALLOWED_PATHS = new Set(['/api/proposals'])

export const checkAuth: MiddlewareHandler = async (c: Context, next) => {
  // ── API Key / Bearer token ────────────────────────────────────────
  const bearerKey =
    c.req.header('x-api-key') ??
    c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

  if (bearerKey) {
    const result = await auth.api.verifyApiKey({ body: { key: bearerKey } })
    if (result.valid && result.key) {
      const scope = parseKeyScope(result.key.metadata)
      const method = c.req.method
      if (method !== 'GET' && method !== 'HEAD' && scope !== 'write') {
        const allowed = scope === 'propose' && PROPOSE_ALLOWED_PATHS.has(c.req.path)
        if (!allowed) {
          return c.json({
            error: {
              code: 'WRITE_SCOPE_REQUIRED',
              message: scope === 'read'
                ? 'This API key is read-only.'
                : 'This API key can only propose changes via POST /api/proposals — proposals wait in the approval inbox.',
            },
          }, 403)
        }
      }
      // The api-key plugin's model is reference-generic (user or org); for
      // our default `references: "user"` config, referenceId is the userId.
      c.set('user', { id: result.key.referenceId })
      c.set('session', null)
      c.set('authMethod', 'api_key')
      c.set('keyScope', scope)
      c.set('keyName', result.key.name ?? 'API key')
      return next()
    }
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } }, 401)
  }

  // ── Session cookie (web UI) ───────────────────────────────────────
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session) {
    c.set('user', session.user)
    c.set('session', session.session)
    c.set('authMethod', 'user')
    c.set('keyScope', 'write')
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
