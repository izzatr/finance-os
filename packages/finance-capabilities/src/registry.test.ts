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
      '/api/split/friends': { data: [{ personId: 'p-1', name: 'Sam', isGuest: true, balances: [{ currency: 'EUR', amount: '-12.50' }] }] },
      '/api/split/groups': { data: [{ id: 'g-1', name: 'Flat', myBalances: [] }] },
      '/api/split/me': { data: { personId: 'p-me', balances: { owedToMe: [], iOwe: [], net: [] } } },
      '/api/split/expenses': { data: { id: 'se-1' } },
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

  it('a split bill becomes a shared expense paid from the wallet', async () => {
    const tool = getTool('finance_add_transaction')!
    const result = (await tool.execute(ctx('write'), {
      date: '2026-07-05', type: 'expense', description: 'Dinner', amount: '60', walletName: 'Main Bank',
      splitWith: [{ personName: 'Sam', amount: '20' }],
    })) as { status: string; sharedExpenseId: string }
    expect(result.status).toBe('booked')
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toContain('/api/split/expenses')
    expect(post.body).toMatchObject({
      cost: '60', currency: 'EUR', paid: { kind: 'single', personId: 'p-me' },
      split: { method: 'exact', amounts: { 'p-1': '20', 'p-me': '40' } },
      myBooks: { fundingWalletId: 'w-eur' },
    })
    await expect(tool.execute(ctx('propose'), {
      date: '2026-07-05', type: 'expense', description: 'Dinner', amount: '60', walletName: 'Main Bank',
      splitWith: [{ personName: 'Sam', amount: '20' }],
    })).rejects.toThrow(/write-scoped/)
  })

  it('settle up defaults to the open balance and the right direction', async () => {
    const result = (await getTool('finance_settle_up')!.execute(ctx('write'), {
      friendName: 'Sam', direction: 'i_paid', currency: 'EUR', walletName: 'Main Bank',
    })) as { amount: string }
    expect(result.amount).toBe('12.50')
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toMatchObject({ kind: 'payment', cost: '12.50', payment: { fromPersonId: 'p-me', toPersonId: 'p-1' }, myBooks: { fundingWalletId: 'w-eur' } })
  })

  it('a shared expense defaults to an equal split with me paying', async () => {
    await getTool('finance_add_shared_expense')!.execute(ctx('write'), {
      date: '2026-07-05', description: 'Pizza', amount: '30', currency: 'eur', withFriends: ['Sam'],
    })
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.body).toMatchObject({ currency: 'EUR', paid: { personId: 'p-me' }, split: { method: 'equal', personIds: ['p-me', 'p-1'] } })
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
      finance_add_friend: { name: 'Sam' },
      finance_add_shared_expense: { date: '2026-07-05', description: 'x', amount: '1', currency: 'EUR', withFriends: ['Sam'] },
      finance_settle_up: { friendName: 'Sam', direction: 'i_paid', currency: 'EUR' },
      finance_edit_transaction: { id: '00000000-0000-0000-0000-000000000001', description: 'x' },
      finance_delete_transaction: { id: '00000000-0000-0000-0000-000000000001' },
      finance_restore_transaction: { id: '00000000-0000-0000-0000-000000000001' },
      finance_create_wallet: { name: 'W', walletType: 'bank', currency: 'EUR' },
      finance_edit_wallet: { walletName: 'Main Bank', newName: 'X' },
      finance_reconcile: { walletName: 'Main Bank', expectedBalance: '0', autoAdjust: true },
      finance_add_asset_price: { assetCode: 'XAU_G', price: '1', currency: 'EUR' },
      finance_approve_proposal: { id: '00000000-0000-0000-0000-000000000001' },
      finance_reject_proposal: { id: '00000000-0000-0000-0000-000000000001' },
      finance_create_group: { name: 'Trip', members: ['Sam'] },
      finance_add_group_member: { groupName: 'Flat', friendName: 'Sam' },
      finance_edit_shared_expense: { id: '00000000-0000-0000-0000-000000000001', amount: '30' },
      finance_delete_shared_expense: { id: '00000000-0000-0000-0000-000000000001' },
      finance_restore_shared_expense: { id: '00000000-0000-0000-0000-000000000001' },
      finance_comment_shared_expense: { id: '00000000-0000-0000-0000-000000000001', text: 'hi' },
      finance_invite_friend: { friendName: 'Sam' },
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
    await expect(getTool('finance_settle_up')!.execute(ctx('propose'), {
      friendName: 'Sam', direction: 'i_paid', currency: 'EUR',
    })).rejects.toThrow(/write-scoped/)
    await expect(getTool('finance_approve_proposal')!.execute(ctx('propose'), {
      id: '00000000-0000-0000-0000-000000000001',
    })).rejects.toThrow(/write-scoped/)
  })

  it('read tools work with read scope', async () => {
    const wallets = (await getTool('finance_wallets')!.execute(ctx('read'), {})) as unknown[]
    expect(wallets).toHaveLength(2)
  })

  describe('shared expense tools', () => {
    const view = {
      id: 'se-9', kind: 'expense', groupId: null, description: 'Dinner', cost: '20.00', currency: 'EUR', date: '2026-07-05T12:00:00.000Z',
      category: 'dining', notes: null, repeatInterval: 'never', version: 3, deletedAt: null,
      paidInput: { kind: 'single', personId: 'p-me' }, splitInput: { method: 'equal', personIds: ['p-me', 'p-1'] },
      shares: [{ personId: 'p-me', name: 'Me', paid: '20.00', owed: '10.00' }, { personId: 'p-1', name: 'Sam', paid: '0.00', owed: '10.00' }], me: null,
    }
    const U = '00000000-0000-0000-0000-000000000009'

    it('edit keeps the split and sends the version it read', async () => {
      stubFetch({ [`/api/split/expenses/${U}`]: { data: view } })
      await getTool('finance_edit_shared_expense')!.execute(ctx('write'), { id: U, amount: '30', notes: 'tip incl.' })
      const patch = calls.find((c) => c.method === 'PATCH')!
      expect(patch.url).toContain(`/api/split/expenses/${U}`)
      expect(patch.body).toMatchObject({ cost: '30', version: 3, notes: 'tip incl.', description: 'Dinner', split: view.splitInput, paid: view.paidInput })
    })

    it('edit refuses a new amount on an exact split without new shares', async () => {
      stubFetch({ [`/api/split/expenses/${U}`]: { data: { ...view, splitInput: { method: 'exact', amounts: { 'p-me': '5', 'p-1': '15' } } } } })
      await expect(getTool('finance_edit_shared_expense')!.execute(ctx('write'), { id: U, amount: '30' })).rejects.toThrow(/pass shares/)
      expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    })

    it('edit of a payment keeps who paid whom', async () => {
      stubFetch({ [`/api/split/expenses/${U}`]: { data: { ...view, kind: 'payment', shares: [{ personId: 'p-1', name: 'Sam', paid: '20.00', owed: '0.00' }, { personId: 'p-me', name: 'Me', paid: '0.00', owed: '20.00' }] } } })
      await getTool('finance_edit_shared_expense')!.execute(ctx('write'), { id: U, amount: '25' })
      expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ kind: 'payment', cost: '25', payment: { fromPersonId: 'p-1', toPersonId: 'p-me' } })
    })

    it('group creation resolves friend names', async () => {
      await getTool('finance_create_group')!.execute(ctx('write'), { name: 'Trip', type: 'trip', members: ['sam'] })
      expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ name: 'Trip', groupType: 'trip', memberIds: ['p-1'] })
    })

    it('invite returns the link and comments post to the expense', async () => {
      stubFetch({ '/api/split/persons/p-1/invite': { data: { url: 'https://app.test/invite/abc', expiresAt: '2026-08-01T00:00:00.000Z' } } })
      const r = (await getTool('finance_invite_friend')!.execute(ctx('write'), { friendName: 'Sam' })) as { url: string }
      expect(r.url).toBe('https://app.test/invite/abc')
      await getTool('finance_comment_shared_expense')!.execute(ctx('write'), { id: U, text: 'paid!' })
      expect(calls.at(-1)).toMatchObject({ method: 'POST', body: { body: 'paid!' } })
      expect(calls.at(-1)!.url).toContain(`/api/split/expenses/${U}/comments`)
    })
  })
})
