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

/** Tools the chat can actually use: reads, plus writes that park in the inbox. Offering
 *  edit/delete/approve tools that always refuse in propose scope only made the model
 *  try them and then tell the owner to go create a write-scoped API key. */
const chatTools = financeTools.filter((tool) => tool.kind === 'read' || tool.proposable)

type Grounding = { wallets: Array<{ name: string; currency: string; isActive?: boolean; systemRole?: string | null }>; categories: Array<{ name: string; type: string }> }

function systemPrompt(today: string, currency: string, grounding: Grounding | null): string {
  const lines = [
    'You are the finance assistant inside Finance OS, a personal finance tracker.',
    `Today is ${today} (the owner's local date). Their display currency is ${currency}.`,
    'Use the finance_* tools to answer with real data. Never guess numbers.',
    'For "how much did I spend / save / earn" questions about a month, call finance_monthly_report: it matches the Reports page (spending is the owner\'s share of split bills, compared with their usual month). Use finance_spending for a category breakdown and finance_search to find specific transactions.',
    'Anything you record (expenses, income, transfers) becomes a proposal in the approval Inbox and books nothing until the owner approves. Say so in one short line. You cannot edit, delete or approve existing transactions; tell the owner to do that in the app (tap the transaction, or approve in Inbox).',
    'When recording: use today unless a date is given, pick the wallet and category from the lists below by meaning (e.g. "starbucks" is Coffee), and ask one short question only when the wallet is genuinely ambiguous.',
    'For money shared with friends (who owes whom, groups, settling up) use finance_shared_balances and finance_shared_expenses. Shared expenses and payments cannot be recorded from this chat; tell the owner to add them under Shared. Never record anything into a "Friends" wallet: those follow shared expenses automatically.',
    'Answer in a sentence or two, then at most a short bullet list. Name the currency. No tables, no headings.',
  ]
  if (grounding) {
    const wallets = grounding.wallets.filter((w) => w.isActive !== false && !w.systemRole).map((w) => `${w.name} (${w.currency})`).join(', ')
    const expense = grounding.categories.filter((c) => c.type === 'expense').map((c) => c.name).join(', ')
    const income = grounding.categories.filter((c) => c.type === 'income').map((c) => c.name).join(', ')
    lines.push(`Wallets: ${wallets || 'none yet'}.`, `Expense categories: ${expense || 'none'}.`, `Income categories: ${income || 'none'}.`)
  }
  return lines.join('\n')
}

const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
const currencyCode = (v: unknown) => (typeof v === 'string' && /^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : null)

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

    const body = (await c.req.json().catch(() => null)) as { messages?: Array<{ role: string; content: string }>; today?: string; currency?: string } | null
    const today = isoDate(body?.today) ?? new Date().toISOString().slice(0, 10)
    const currency = currencyCode(body?.currency) ?? 'EUR'
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
      actorLabel: 'Assistant',
      proposalSource: 'ai_chat',
      defaultCurrency: currency,
      today,
    }

    // Ground names up front so "log coffee on chase" needs no lookup round.
    const readCtx: FinanceToolContext = { ...ctx, scope: 'read' }
    const grounding = await Promise.all([
      financeTools.find((t) => t.name === 'finance_wallets')!.execute(readCtx, {}),
      financeTools.find((t) => t.name === 'finance_categories')!.execute(readCtx, {}),
    ]).then(([wallets, categories]) => ({ wallets, categories }) as Grounding).catch(() => null)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt(today, currency, grounding) },
      ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of runChat({
          messages,
          model,
          tools: chatTools,
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
