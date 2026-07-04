/**
 * Minimal in-memory sliding-window rate limiter.
 * Suitable for a single-process deployment; swap for Redis if scaled out.
 */

import type { MiddlewareHandler } from 'hono'

type Bucket = { timestamps: number[] }
const store = new Map<string, Bucket>()

// Periodic cleanup so the map doesn't grow unbounded
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000
  for (const [key, bucket] of store) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff)
    if (bucket.timestamps.length === 0) store.delete(key)
  }
}, 60_000).unref()

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix: string }): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown'
    const key = `${opts.keyPrefix}:${ip}`
    const now = Date.now()
    const bucket = store.get(key) ?? { timestamps: [] }
    bucket.timestamps = bucket.timestamps.filter((t) => t > now - opts.windowMs)
    if (bucket.timestamps.length >= opts.max) {
      store.set(key, bucket)
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, 429)
    }
    bucket.timestamps.push(now)
    store.set(key, bucket)
    await next()
  }
}
