/**
 * Remote MCP endpoint — any MCP client (Claude, agents, IDEs) can connect to
 * https://<host>/mcp with a finance-os API key as a Bearer token.
 *
 * Stateless Streamable HTTP: a fresh server+transport pair per request, JSON
 * responses (no session state to manage, safe behind load balancers).
 * The key's scope governs writes: read keys can only look, propose keys park
 * changes in the approval inbox, write keys act directly.
 */

import type { OpenAPIHono } from '@hono/zod-openapi'
import type { HttpBindings } from '@hono/node-server'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { auth } from '@finance-os/db'
import type { FinanceToolContext } from '@finance-os/finance-capabilities'
import { buildMcpServer } from '../mcp/server'
import { parseKeyScope } from '../middleware/auth'
import { rateLimit } from '../middleware/rate-limit'

/** Where MCP tools reach the REST API. Defaults to this same process. */
function loopbackBase(): string {
  return process.env.MCP_LOOPBACK_URL ?? `http://127.0.0.1:${process.env.PORT ?? 27032}`
}

export function registerMcpRoutes(app: OpenAPIHono) {
  app.use('/mcp', rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'mcp' }))

  app.post('/mcp', async (c) => {
    const bearerKey =
      c.req.header('x-api-key') ??
      c.req.header('authorization')?.replace(/^Bearer\s+/i, '')

    if (!bearerKey) {
      return c.json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Authentication required: pass a finance-os API key as a Bearer token' },
        id: null,
      }, 401)
    }

    const result = await auth.api.verifyApiKey({ body: { key: bearerKey } })
    if (!result.valid || !result.key) {
      return c.json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Invalid API key' },
        id: null,
      }, 401)
    }

    const ctx: FinanceToolContext = {
      baseUrl: loopbackBase(),
      apiKey: bearerKey,
      scope: parseKeyScope(result.key.metadata),
      actorLabel: result.key.name ?? 'MCP agent',
    }

    const server = buildMcpServer(ctx)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
      enableJsonResponse: true,
    })
    await server.connect(transport)

    const body = await c.req.json().catch(() => undefined)
    // Raw node req/res — the transport writes the response to the socket itself.
    const { incoming, outgoing } = c.env as unknown as HttpBindings
    outgoing.on('close', () => {
      void transport.close()
      void server.close()
    })
    await transport.handleRequest(incoming, outgoing, body)
    return RESPONSE_ALREADY_SENT
  })

  // Stateless mode has no sessions to resume or delete.
  app.on(['GET', 'DELETE'], '/mcp', (c) =>
    c.json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'This MCP endpoint is stateless — use POST' },
      id: null,
    }, 405),
  )
}
