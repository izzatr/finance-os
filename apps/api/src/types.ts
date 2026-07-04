import type {} from 'hono'

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email?: string; name?: string }
    session: unknown
  }
}
