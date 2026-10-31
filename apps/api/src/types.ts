import type {} from 'hono'
import type { KeyScope } from './middleware/auth'

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email?: string; name?: string }
    session: unknown
    authMethod: 'user' | 'api_key'
    /** Write capability of the caller: sessions are 'write'; API keys carry theirs in metadata. */
    keyScope: KeyScope
    /** Human-readable name of the acting API key (absent for sessions). */
    keyName: string
  }
}
