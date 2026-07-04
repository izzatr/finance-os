import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

/**
 * Chat runs against a scripted mock OpenRouter (no key, no network) while the
 * finance tools loop back into a real listening instance of the app.
 */
let appServer: ServerType
let appBase: string
let mock: Server
let mockScript: string[][] = [] // each element: SSE data payloads for one completions call
let mockCalls: Array<{ model: string; toolCount: number }> = []

function sse(events: unknown[]): string[] {
  return [...events.map((e) => JSON.stringify(e)), '[DONE]']
}

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    appServer = serve({ fetch: app.fetch, port: 0 }, (info) => {
      appBase = `http://127.0.0.1:${info.port}`
      process.env.MCP_LOOPBACK_URL = appBase
      resolve()
    })
  })

  mock = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const parsed = JSON.parse(body) as { model: string; tools: unknown[] }
      mockCalls.push({ model: parsed.model, toolCount: parsed.tools.length })
      const frames = mockScript.shift() ?? sse([{ choices: [{ delta: { content: 'No script.' }, finish_reason: 'stop' }] }])
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const frame of frames) res.write(`data: ${frame}\n\n`)
      res.end()
    })
  })
  await new Promise<void>((resolve) => mock.listen(0, () => resolve()))
  const address = mock.address() as { port: number }
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${address.port}`
  process.env.OPENROUTER_API_KEY = 'test-key-not-real'
})

afterAll(() => {
  appServer.close()
  mock.close()
  delete process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_BASE_URL
})

async function setup() {
  const { cookie } = await createTestUser(app)
  const assetsRes = await app.request('/api/assets', { headers: { cookie } })
  const { data: assets } = (await assetsRes.json()) as { data: { id: string; code: string }[] }
  const eur = assets.find((a) => a.code === 'EUR')!.id
  await app.request('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'Main Bank', walletType: 'bank', assetId: eur }),
  })
  return { cookie }
}

async function chat(cookie: string, content: string): Promise<Array<{ type: string; [k: string]: unknown }>> {
  const res = await fetch(`${appBase}/api/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  })
  expect(res.status).toBe(200)
  const text = await res.text()
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5)) as { type: string })
}

describe('ai chat', () => {
  beforeEach(async () => {
    await truncateAll()
    mockScript = []
    mockCalls = []
  })

  it('status reports enabled with models', async () => {
    const { cookie } = await createTestUser(app)
    const res = await app.request('/api/ai/status', { headers: { cookie } })
    const { data } = (await res.json()) as { data: { enabled: boolean; models: string[] } }
    expect(data.enabled).toBe(true)
    expect(data.models.length).toBeGreaterThan(0)
  })

  it('streams plain text answers', async () => {
    const { cookie } = await setup()
    mockScript = [sse([
      { choices: [{ delta: { content: 'You have ' }, finish_reason: null }] },
      { choices: [{ delta: { content: 'one wallet.' }, finish_reason: 'stop' }] },
    ])]

    const events = await chat(cookie, 'How many wallets do I have?')
    const textDeltas = events.filter((e) => e.type === 'text').map((e) => e.delta).join('')
    expect(textDeltas).toBe('You have one wallet.')
    expect(events.at(-1)?.type).toBe('done')
    expect(mockCalls[0].toolCount).toBeGreaterThanOrEqual(25)
  })

  it('executes a tool round and the write lands as a proposal, never a booking', async () => {
    const { cookie } = await setup()
    mockScript = [
      // round 1: the model asks to record an expense
      sse([{
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              function: {
                name: 'finance_add_transaction',
                arguments: JSON.stringify({
                  date: '2026-07-05', type: 'expense', description: 'Groceries run', amount: '23.40', walletName: 'Main Bank',
                }),
              },
            }],
          },
          finish_reason: null,
        }],
      }, {
        choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      }]),
      // round 2: the model confirms
      sse([{ choices: [{ delta: { content: 'Proposed — check your inbox.' }, finish_reason: 'stop' }] }]),
    ]

    const events = await chat(cookie, 'Log 23.40 groceries from Main Bank')
    const toolResult = events.find((e) => e.type === 'tool_result') as unknown as { ok: boolean; proposed: boolean }
    expect(toolResult.ok).toBe(true)
    expect(toolResult.proposed).toBe(true)

    // proposal exists, ledger untouched
    const inbox = await app.request('/api/inbox', { headers: { cookie } })
    const { data: items } = (await inbox.json()) as { data: Array<{ source: string; status: string }> }
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('ai_chat')
    expect(items[0].status).toBe('pending')

    const txs = await app.request('/api/transactions', { headers: { cookie } })
    expect(((await txs.json()) as { data: unknown[] }).data).toEqual([])
  })

  it('rejects api-key callers', async () => {
    const { cookie } = await setup()
    const keyRes = await app.request('/auth/api-key/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ name: 'agent', metadata: { scope: 'write' } }),
    })
    const { key } = (await keyRes.json()) as { key: string }
    const res = await fetch(`${appBase}/api/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })
    expect(res.status).toBe(403)
  })
})
