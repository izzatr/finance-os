import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { financeTools, getTool, ToolError, type FinanceToolContext } from './registry'

type Call = { url: string; method: string; body: unknown }
let calls: Call[]

/** Stub the API: wallets/categories/people lists + a generic ok for writes. */
function stubFetch(overrides: Record<string, unknown> = {}) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, method, body })
    const path = new URL(url).pathname
    const fixtures: Record<string, unknown> = {
      '/api/wallets': { data: [
        { id: 'w-eur', name: 'Main Bank', walletType: 'bank', institution: null, assetId: 'a-eur', isActive: true, balance: 100, currency: 'EUR' },
        { id: 'w-idr', name: 'Cash', walletType: 'cash', institution: null, assetId: 'a-idr', isActive: true, balance: 5000, currency: 'IDR' },
      ] },
      '/api/categories': { data: [{ id: 'c-1', name: 'Groceries', slug: 'groceries', type: 'expense', parentId: null }] },
      '/api/people': { data: [{ id: 'p-1', name: 'Sam' }] },
      '/api/proposals': { data: { id: 'prop-1' } },
      '/api/transactions': { data: { id: 'tx-1' } },
      '/api/recurring-rules': { data: { id: 'rule-1', nextRunAt: '2026-08-01T09:00:00.000Z' } },
      ...overrides,
    }
    const payload = fixtures[path] ?? { data: {} }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

function ctx(scope: FinanceToolContext['scope']): FinanceToolContext {
  return { baseUrl: 'http://api.test', apiKey: 'k', scope, actorLabel: 'test-agent' }
}

beforeEach(() => stubFetch())
afterEach(() => vi.unstubAllGlobals())

describe('tool registry', () => {
  it('defines unique names and valid schemas', () => {
    const names = financeTools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    for (const tool of financeTools) {
      expect(tool.name).toMatch(/^finance_[a-z_]+$/)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(['read', 'write']).toContain(tool.kind)
    }
  })

  it('read-only scope refuses ledger writes without any POST', async () => {
    const tool = getTool('finance_add_transaction')!
    await expect(tool.execute(ctx('read'), {
      date: '2026-07-05', type: 'expense', description: 'x', amount: '10', walletName: 'Main Bank',
    })).rejects.toThrow(ToolError)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('propose scope routes the transaction into the approval inbox', async () => {
    const tool = getTool('finance_add_transaction')!
    const result = (await tool.execute(ctx('propose'), {
      date: '2026-07-05', type: 'expense', description: 'Coffee', amount: '4.50', walletName: 'Main Bank', categoryName: 'Groceries',
    })) as { status: string; proposalId: string }
    expect(result.status).toBe('proposed')
    expect(result.proposalId).toBe('prop-1')
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toContain('/api/proposals')
    const body = post.body as { transaction: { entries: Array<{ amount: string }>; categoryId: string }; actorLabel: string }
    expect(body.transaction.entries[0].amount).toBe('-4.50')
    expect(body.transaction.categoryId).toBe('c-1')
    expect(body.actorLabel).toBe('test-agent')
    // never touched the direct transactions endpoint
    expect(calls.some((c) => c.url.includes('/api/transactions') && c.method === 'POST')).toBe(false)
  })

  it('write scope books directly', async () => {
    const tool = getTool('finance_add_transaction')!
    const result = (await tool.execute(ctx('write'), {
      date: '2026-07-05', type: 'income', description: 'Salary', amount: '100', walletName: 'Main Bank',
    })) as { status: string }
    expect(result.status).toBe('booked')
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toContain('/api/transactions')
    expect((post.body as { entries: Array<{ amount: string }> }).entries[0].amount).toBe('100')
  })

  it('splits resolve people by name', async () => {
    const tool = getTool('finance_add_transaction')!
    await tool.execute(ctx('write'), {
      date: '2026-07-05', type: 'expense', description: 'Dinner', amount: '60', walletName: 'Main Bank',
      splitWith: [{ personName: 'Sam', amount: '30' }],
    })
    const post = calls.find((c) => c.method === 'POST')!
    expect((post.body as { splits: Array<{ personId: string }> }).splits[0].personId).toBe('p-1')
  })

  it('unknown wallet lists the available names', async () => {
    const tool = getTool('finance_add_transaction')!
    await expect(tool.execute(ctx('write'), {
      date: '2026-07-05', type: 'expense', description: 'x', amount: '1', walletName: 'Nope',
    })).rejects.toThrow(/Available: Main Bank, Cash/)
  })

  it('transfer refuses mismatched currencies before any write', async () => {
    const tool = getTool('finance_transfer')!
    await expect(tool.execute(ctx('write'), {
      date: '2026-07-05', amount: '10', fromWallet: 'Main Bank', toWallet: 'Cash',
    })).rejects.toThrow(/different currencies/)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
  })

  it('rule creation demands write scope (rules are direct writes, not proposals)', async () => {
    const tool = getTool('finance_add_recurring_rule')!
    await expect(tool.execute(ctx('propose'), {
      name: 'Rent', type: 'expense', amount: '800', walletName: 'Main Bank', freq: 'monthly', startDate: '2026-08-01',
    })).rejects.toThrow(/write-scoped/)
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)

    const result = (await tool.execute(ctx('write'), {
      name: 'Rent', type: 'expense', amount: '800', walletName: 'Main Bank', freq: 'monthly', startDate: '2026-08-01',
    })) as { mode: string }
    expect(result.mode).toBe('draft')
  })

  // Structural invariant: with a propose-scoped context, NO write tool may touch any
  // mutating endpoint other than the proposals intake. This is the guard that keeps
  // future tools honest — the chat path has no server-side backstop.
  it('propose scope can never reach a mutating endpoint other than /api/proposals', async () => {
    const writeTools = financeTools.filter((t) => t.kind === 'write')
    const samples: Record<string, Record<string, unknown>> = {
      finance_add_transaction: { date: '2026-07-05', type: 'expense', description: 'x', amount: '1', walletName: 'Main Bank' },
      finance_transfer: { date: '2026-07-05', amount: '1', fromWallet: 'Main Bank', toWallet: 'Main Bank' },
      finance_add_recurring_rule: { name: 'R', type: 'expense', amount: '1', walletName: 'Main Bank', freq: 'monthly', startDate: '2026-08-01' },
      finance_settle_person: { personName: 'Sam', walletName: 'Main Bank' },
      finance_edit_transaction: { id: '00000000-0000-0000-0000-000000000001', description: 'x' },
      finance_delete_transaction: { id: '00000000-0000-0000-0000-000000000001' },
      finance_restore_transaction: { id: '00000000-0000-0000-0000-000000000001' },
      finance_create_wallet: { name: 'W', walletType: 'bank', currency: 'EUR' },
      finance_edit_wallet: { walletName: 'Main Bank', newName: 'X' },
      finance_reconcile: { walletName: 'Main Bank', expectedBalance: '0', autoAdjust: true },
      finance_add_asset_price: { assetCode: 'XAU_G', price: '1', currency: 'EUR' },
      finance_approve_proposal: { id: '00000000-0000-0000-0000-000000000001' },
      finance_reject_proposal: { id: '00000000-0000-0000-0000-000000000001' },
    }
    for (const tool of writeTools) {
      expect(samples, `add a sample invocation for new write tool ${tool.name}`).toHaveProperty(tool.name)
      stubFetch()
      await tool.execute(ctx('propose'), samples[tool.name]).catch(() => undefined)
      const mutating = calls.filter((c) => c.method !== 'GET' && !c.url.includes('/api/proposals'))
      expect(mutating, `${tool.name} leaked a mutating call: ${JSON.stringify(mutating)}`).toHaveLength(0)
    }
  })

  it('settle and approve demand write scope', async () => {
    await expect(getTool('finance_settle_person')!.execute(ctx('propose'), {
      personName: 'Sam', walletName: 'Main Bank',
    })).rejects.toThrow(/write-scoped/)
    await expect(getTool('finance_approve_proposal')!.execute(ctx('propose'), {
      id: '00000000-0000-0000-0000-000000000001',
    })).rejects.toThrow(/write-scoped/)
  })

  it('read tools work with read scope', async () => {
    const wallets = (await getTool('finance_wallets')!.execute(ctx('read'), {})) as unknown[]
    expect(wallets).toHaveLength(2)
  })
})
