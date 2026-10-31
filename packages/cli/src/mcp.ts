#!/usr/bin/env node
/**
 * Local stdio MCP server for finance-os.
 *
 * All tools come from the shared registry in @finance-os/finance-capabilities —
 * the same set the hosted /mcp endpoint serves. Configure with:
 *   FINANCE_API_URL  (default http://localhost:27032)
 *   FINANCE_API_KEY  (create one in Settings → API keys; its scope governs writes)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { financeTools, ToolError } from '@finance-os/finance-capabilities'
import type { FinanceToolContext } from '@finance-os/finance-capabilities'

const ctx: FinanceToolContext = {
  baseUrl: process.env.FINANCE_API_URL ?? 'http://localhost:27032',
  apiKey: process.env.FINANCE_API_KEY,
  // Filled in from /api/me at startup — the key's real scope decides whether
  // writes book directly or become approval-inbox proposals.
  scope: 'propose',
  actorLabel: 'Local MCP',
}

async function detectScope(): Promise<void> {
  try {
    const res = await fetch(`${ctx.baseUrl}/api/me`, {
      headers: ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {},
    })
    if (!res.ok) return
    const { data } = (await res.json()) as { data: { keyScope?: string; keyName?: string | null } }
    if (data.keyScope === 'read' || data.keyScope === 'propose' || data.keyScope === 'write') {
      ctx.scope = data.keyScope
    }
    if (data.keyName) ctx.actorLabel = data.keyName
  } catch {
    // API unreachable at startup — keep the safe 'propose' default
  }
}

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

async function main() {
  await detectScope()
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
