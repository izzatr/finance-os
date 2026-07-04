/**
 * OpenRouter chat engine with a tool-calling loop over the finance tool registry.
 *
 * Yields UI-ready events while streaming. Reads run directly against the API
 * (with the caller's session); writes are governed by ctx.scope — the chat
 * route always passes 'propose', so ledger changes wait in the approval inbox.
 *
 * fetchImpl is injectable so tests can script the model's behavior; no real
 * key or network is ever needed in CI.
 */

import { zodToJsonSchema } from 'zod-to-json-schema'
import { getTool, ToolError, type FinanceTool, type FinanceToolContext } from '@finance-os/finance-capabilities'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; proposed: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' }

type Delta = {
  content?: string | null
  tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
}

const MAX_ITERATIONS = 6

function toOpenAiTools(tools: FinanceTool[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema, { $refStrategy: 'none' }),
    },
  }))
}

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        yield JSON.parse(payload) as Record<string, unknown>
      } catch {
        // partial/keepalive frames are ignorable
      }
    }
  }
}

export async function* runChat(opts: {
  messages: ChatMessage[]
  model: string
  tools: FinanceTool[]
  ctx: FinanceToolContext
  apiKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}): AsyncGenerator<StreamEvent> {
  const doFetch = opts.fetchImpl ?? fetch
  const baseUrl = (opts.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  const openAiTools = toOpenAiTools(opts.tools)
  const messages: ChatMessage[] = [...opts.messages]

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const res = await doFetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
        'x-title': 'Finance OS',
      },
      body: JSON.stringify({ model: opts.model, messages, tools: openAiTools, stream: true }),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      yield { type: 'error', message: `Model request failed (${res.status}): ${text.slice(0, 200)}` }
      return
    }

    let assistantText = ''
    const toolCalls = new Map<number, { id: string; name: string; args: string }>()
    let finish: string | null = null

    for await (const chunk of parseSse(res.body)) {
      const choice = (chunk.choices as Array<{ delta?: Delta; finish_reason?: string | null }> | undefined)?.[0]
      if (!choice) continue
      if (choice.delta?.content) {
        assistantText += choice.delta.content
        yield { type: 'text', delta: choice.delta.content }
      }
      for (const tc of choice.delta?.tool_calls ?? []) {
        const slot = toolCalls.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) slot.id = tc.id
        if (tc.function?.name) slot.name += tc.function.name
        if (tc.function?.arguments) slot.args += tc.function.arguments
        toolCalls.set(tc.index, slot)
      }
      if (choice.finish_reason) finish = choice.finish_reason
    }

    if (finish !== 'tool_calls' || toolCalls.size === 0) {
      yield { type: 'done' }
      return
    }

    // Execute the requested tools, then loop with their results appended.
    const calls = [...toolCalls.values()]
    messages.push({
      role: 'assistant',
      content: assistantText || null,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.args },
      })),
    })

    for (const call of calls) {
      yield { type: 'tool_start', id: call.id, name: call.name }
      const tool = getTool(call.name)
      let resultText: string
      let ok = true
      let proposed = false
      if (!tool) {
        ok = false
        resultText = `Unknown tool: ${call.name}`
      } else {
        try {
          const args = tool.schema.parse(JSON.parse(call.args || '{}'))
          const result = await tool.execute(opts.ctx, args as Record<string, unknown>)
          proposed = (result as { status?: string } | null)?.status === 'proposed'
          resultText = JSON.stringify(result)
        } catch (err) {
          ok = false
          resultText = err instanceof ToolError || err instanceof Error ? err.message : 'Tool execution failed'
        }
      }
      yield { type: 'tool_result', id: call.id, name: call.name, ok, proposed }
      messages.push({ role: 'tool', content: resultText, tool_call_id: call.id })
    }
  }

  yield { type: 'error', message: 'Stopped after too many tool rounds — ask a more specific question.' }
}
