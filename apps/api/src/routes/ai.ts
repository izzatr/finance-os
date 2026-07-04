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

function aiEnabled(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY)
}

/** The one model this instance uses — the owner picks it via OPENROUTER_MODEL. */
function defaultModel(): string {
  return process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'
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

    const body = (await c.req.json().catch(() => null)) as { messages?: Array<{ role: string; content: string }> } | null
    const history = (body?.messages ?? []).filter(
      (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.length > 0,
    ).slice(-30)
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return c.json({ error: { code: 'INVALID_MESSAGES', message: 'Send a messages array ending with a user message' } }, 400)
    }
    // The instance owner picks the model via OPENROUTER_MODEL — clients get no say
    // (the server's OpenRouter key funds every call).
    const model = defaultModel()

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

  // Natural-language quick-add: one non-streaming completion, strict JSON out.
  app.post('/api/ai/parse-transaction', async (c) => {
    if (!aiEnabled()) {
      return c.json({ error: { code: 'AI_DISABLED', message: 'Set OPENROUTER_API_KEY to enable the assistant' } }, 404)
    }
    if (c.get('authMethod') !== 'user') {
      return c.json({ error: { code: 'SESSION_REQUIRED', message: 'Sessions only' } }, 403)
    }
    const body = (await c.req.json().catch(() => null)) as { text?: string } | null
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 300) : ''
    if (!text) {
      return c.json({ error: { code: 'INVALID_TEXT', message: 'Send { text } describing the transaction' } }, 400)
    }

    // Ground the model in the user's real wallets/categories so names resolve.
    const ctx: FinanceToolContext = { baseUrl: loopbackBase(), cookie: c.req.header('cookie'), scope: 'read' }
    const [wallets, categories] = await Promise.all([
      financeTools.find((t) => t.name === 'finance_wallets')!.execute(ctx, {}) as Promise<Array<{ name: string; currency: string }>>,
      financeTools.find((t) => t.name === 'finance_categories')!.execute(ctx, {}) as Promise<Array<{ name: string; type: string }>>,
    ])

    const prompt = [
      'Parse this natural-language transaction into strict JSON. Respond with ONLY the JSON object, no prose, no code fences.',
      'Schema: {"type":"expense"|"income","amount":"<positive decimal string>","description":"<short>","walletName":<one of the wallets or null>,"categoryName":<one of the categories or null>}',
      'Shorthand: "35k" means 35000; "1.2m" means 1200000. Currency hints may select the wallet.',
      `Wallets: ${wallets.map((w) => `${w.name} (${w.currency})`).join(', ') || 'none'}`,
      `Categories: ${categories.filter((cat) => cat.type !== 'transfer').map((cat) => `${cat.name} [${cat.type}]`).join(', ') || 'none'}`,
      `Text: ${text}`,
    ].join('\n')

    const res = await fetch(`${(process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'x-title': 'Finance OS',
      },
      body: JSON.stringify({ model: defaultModel(), messages: [{ role: 'user', content: prompt }], stream: false }),
    })
    if (!res.ok) {
      return c.json({ error: { code: 'MODEL_FAILED', message: `Model request failed (${res.status})` } }, 502)
    }
    const completion = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = completion.choices?.[0]?.message?.content ?? ''
    const jsonText = raw.replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim()

    const parsedSchema = z.object({
      type: z.enum(['expense', 'income']),
      amount: z.string().regex(/^\d+(\.\d+)?$/),
      description: z.string().min(1).max(255),
      walletName: z.string().nullable().optional(),
      categoryName: z.string().nullable().optional(),
    })
    let parsed: z.infer<typeof parsedSchema>
    try {
      parsed = parsedSchema.parse(JSON.parse(jsonText))
    } catch {
      return c.json({ error: { code: 'UNPARSEABLE', message: 'Could not understand that — try the manual fields' } }, 422)
    }
    return c.json({ data: parsed }, 200)
  })
}
