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
    // x-forwarded-for entries are APPENDED by each proxy hop, so only the last
    // TRUST_PROXY_HOPS entries are trustworthy (anything earlier is client-
    // controlled). The client IP is the entry the OUTERMOST trusted proxy
    // appended: parts[parts.length - hops]. Without TRUST_PROXY, use the
    // socket address so limits can't be rotated away with spoofed headers.
    const trustProxy = process.env.TRUST_PROXY === 'true'
    const socketIp = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
      ?.incoming?.socket?.remoteAddress
    let ip = socketIp ?? 'unknown'
    if (trustProxy) {
      const hops = Math.max(1, Number(process.env.TRUST_PROXY_HOPS ?? '1') || 1)
      const parts = (c.req.header('x-forwarded-for') ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      if (parts.length > 0) {
        ip = parts[Math.max(0, parts.length - hops)]
      } else {
        ip = c.req.header('x-real-ip') ?? ip
      }
    }
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
