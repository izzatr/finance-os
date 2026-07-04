/**
 * In-app AI assistant — OpenRouter proxy with the finance tool loop.
 *
 * Session-only (agents use /mcp with their own keys). The server holds the
 * OpenRouter key; the browser never sees it. Feature-flagged on
 * OPENROUTER_API_KEY — without it, /api/ai/status reports disabled.
 *
 * Trust boundary: the tool context is ALWAYS 'propose' scope — the assistant
 * reads freely, but every ledger write becomes an approval-inbox proposal.
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { streamSSE } from 'hono/streaming'
import { financeTools } from '@finance-os/finance-capabilities'
import type { FinanceToolContext } from '@finance-os/finance-capabilities'
import { runChat, type ChatMessage } from '../ai/openrouter'
import { rateLimit } from '../middleware/rate-limit'

const CURATED_MODELS = [
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-5.2',
  'google/gemini-3-flash',
  'deepseek/deepseek-v4',
]

function aiEnabled(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

function defaultModel(): string {
  return process.env.OPENROUTER_MODEL ?? CURATED_MODELS[0]
}

function loopbackBase(): string {
  return process.env.MCP_LOOPBACK_URL ?? `http://127.0.0.1:${process.env.PORT ?? 27032}`
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10)
  return [
    'You are the finance assistant inside Finance OS, a personal finance tracker.',
    `Today is ${today}.`,
    'Use the finance_* tools to answer with real data — never guess numbers.',
    'Any transaction you record becomes a PROPOSAL in the owner\'s approval inbox; it books nothing until they approve. Say so when you propose one.',
    'Amounts: be precise, name the currency. Prefer concise answers.',
  ].join(' ')
}

export function registerAiRoutes(app: OpenAPIHono) {
  app.use('/api/ai/*', rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'ai' }))

  const statusRoute = createRoute({
    method: 'get',
    path: '/api/ai/status',
    tags: ['ai'],
    responses: {
      200: {
        description: 'Whether the AI assistant is configured, and with which models',
        content: {
          'application/json': {
            schema: z.object({
              data: z.object({
                enabled: z.boolean(),
                defaultModel: z.string().nullable(),
                models: z.array(z.string()),
              }),
            }),
          },
        },
      },
    },
  })

  app.openapi(statusRoute, async (c) => {
    const enabled = aiEnabled()
    return c.json({
      data: {
        enabled,
        defaultModel: enabled ? defaultModel() : null,
        models: enabled ? [...new Set([defaultModel(), ...CURATED_MODELS])] : [],
      },
    }, 200)
  })

  // Chat is plain Hono (SSE stream, not an OpenAPI-documented JSON envelope).
  app.post('/api/ai/chat', async (c) => {
    if (!aiEnabled()) {
      return c.json({ error: { code: 'AI_DISABLED', message: 'Set OPENROUTER_API_KEY to enable the assistant' } }, 404)
    }
    if (c.get('authMethod') !== 'user') {
      return c.json({ error: { code: 'SESSION_REQUIRED', message: 'The assistant is for the web app — agents should use /mcp' } }, 403)
    }

    const body = (await c.req.json().catch(() => null)) as { messages?: Array<{ role: string; content: string }>; model?: string } | null
    const history = (body?.messages ?? []).filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0,
    ).slice(-30)
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return c.json({ error: { code: 'INVALID_MESSAGES', message: 'Send a messages array ending with a user message' } }, 400)
    }
    const model = typeof body?.model === 'string' && body.model.length > 0 ? body.model : defaultModel()

    const ctx: FinanceToolContext = {
      baseUrl: loopbackBase(),
      cookie: c.req.header('cookie'),
      scope: 'propose',
      actorLabel: model,
      proposalSource: 'ai_chat',
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt() },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of runChat({
          messages,
          model,
          tools: financeTools,
          ctx,
          apiKey: process.env.OPENROUTER_API_KEY!,
          baseUrl: process.env.OPENROUTER_BASE_URL,
        })) {
          await stream.writeSSE({ data: JSON.stringify(event) })
          if (event.type === 'done' || event.type === 'error') break
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Assistant failed' }),
        })
      }
    })
  })
}
