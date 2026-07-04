import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import app from '../app'
import { createTestUser, truncateAll } from './helpers'

/**
 * The MCP transport writes to raw node sockets, so these tests run against a
 * real listening server on an ephemeral port (app.request() has no node env).
 */
let server: ServerType
let base: string

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      base = `http://127.0.0.1:${info.port}`
      // MCP tools loop back into this same server
      process.env.MCP_LOOPBACK_URL = base
      resolve()
    })
  })
})

afterAll(() => {
  server.close()
})

async function rpc(key: string | null, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(payload),
  })
  const text = await res.text()
  let body: unknown = null
  try {
    body = JSON.parse(text)
  } catch {
    // SSE-framed single response: extract the data line
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'))
    if (dataLine) body = JSON.parse(dataLine.slice(5))
  }
  return { status: res.status, body }
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '0.0.0' },
  },
}

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

async function createKey(cookie: string, scope: 'read' | 'propose' | 'write') {
  const res = await app.request('/auth/api-key/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: `${scope} agent`, metadata: { scope } }),
  })
  const { key } = (await res.json()) as { key: string }
  return key
}

describe('remote mcp endpoint', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('rejects unauthenticated requests', async () => {
    const { status } = await rpc(null, INITIALIZE)
    expect(status).toBe(401)
  })

  it('initializes and lists the full tool inventory', async () => {
    const { cookie } = await setup()
    const key = await createKey(cookie, 'read')

    const init = await rpc(key, INITIALIZE)
    expect(init.status).toBe(200)
    expect(init.body.result.serverInfo.name).toBe('finance-os')

    const list = await rpc(key, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    const names = list.body.result.tools.map((t: { name: string }) => t.name)
    expect(names).toContain('finance_balance')
    expect(names).toContain('finance_add_transaction')
    expect(names).toContain('finance_net_worth')
    expect(names.length).toBeGreaterThanOrEqual(25)
  })

  it('executes a read tool end-to-end through loopback', async () => {
    const { cookie } = await setup()
    const key = await createKey(cookie, 'read')

    const call = await rpc(key, {
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'finance_wallets', arguments: {} },
    })
    expect(call.status).toBe(200)
    const wallets = JSON.parse(call.body.result.content[0].text) as Array<{ name: string }>
    expect(wallets.map((w) => w.name)).toContain('Main Bank')
  })

  it('propose-scoped agent writes land in the approval inbox, not the ledger', async () => {
    const { cookie } = await setup()
    const key = await createKey(cookie, 'propose')

    const call = await rpc(key, {
      jsonrpc: '2.0', id: 4, method: 'tools/call',
      params: {
        name: 'finance_add_transaction',
        arguments: { date: '2026-07-05', type: 'expense', description: 'Agent coffee', amount: '4.50', walletName: 'Main Bank' },
      },
    })
    expect(call.status).toBe(200)
    const result = JSON.parse(call.body.result.content[0].text) as { status: string }
    expect(result.status).toBe('proposed')

    const inbox = await app.request('/api/inbox', { headers: { cookie: (await (async () => cookie)()) } })
    const { data: items } = (await inbox.json()) as { data: Array<{ source: string; actorLabel: string }> }
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ source: 'mcp', actorLabel: 'propose agent' })

    const txs = await app.request('/api/transactions', { headers: { cookie } })
    expect(((await txs.json()) as { data: unknown[] }).data).toEqual([])
  })

  it('read-scoped agent cannot write at all', async () => {
    const { cookie } = await setup()
    const key = await createKey(cookie, 'read')

    const call = await rpc(key, {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: {
        name: 'finance_add_transaction',
        arguments: { date: '2026-07-05', type: 'expense', description: 'x', amount: '1', walletName: 'Main Bank' },
      },
    })
    expect(call.body.result.isError).toBe(true)
    expect(call.body.result.content[0].text).toMatch(/read-only/)
  })

  it('write-scoped agent books directly', async () => {
    const { cookie } = await setup()
    const key = await createKey(cookie, 'write')

    const call = await rpc(key, {
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: {
        name: 'finance_add_transaction',
        arguments: { date: '2026-07-05', type: 'income', description: 'Refund', amount: '20', walletName: 'Main Bank' },
      },
    })
    const result = JSON.parse(call.body.result.content[0].text) as { status: string }
    expect(result.status).toBe('booked')

    const txs = await app.request('/api/transactions', { headers: { cookie } })
    expect(((await txs.json()) as { data: unknown[] }).data).toHaveLength(1)
  })
})
