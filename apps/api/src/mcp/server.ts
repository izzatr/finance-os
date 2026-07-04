/**
 * Hosted MCP server — builds a per-request McpServer wired to the shared tool
 * registry. Tools execute against this API over loopback HTTP with the caller's
 * own API key, so tenancy scoping, scope governance, and audit all apply exactly
 * as they do for any other client.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { financeTools, ToolError } from '@finance-os/finance-capabilities'
import type { FinanceToolContext } from '@finance-os/finance-capabilities'

export function buildMcpServer(ctx: FinanceToolContext): McpServer {
  const server = new McpServer({ name: 'finance-os', version: '0.2.0' })

  for (const tool of financeTools) {
    server.tool(tool.name, tool.description, tool.schema.shape, async (args: Record<string, unknown>) => {
      try {
        const result = await tool.execute(ctx, args)
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        if (err instanceof ToolError) {
          return { content: [{ type: 'text' as const, text: err.message }], isError: true }
        }
        throw err
      }
    })
  }

  return server
}
