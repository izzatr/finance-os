/**
 * The finance-os tool registry — every agent-facing tool, defined once.
 *
 * Consumed by:
 *  - the local stdio MCP server (packages/cli/src/mcp.ts)
 *  - the hosted HTTP MCP endpoint (apps/api /mcp)
 *  - the in-app AI chat's tool loop (apps/api /api/ai/chat)
 *
 * Tools call the REST API over HTTP so per-caller auth, tenancy scoping, and
 * audit logging all apply exactly as they would for any other client.
 *
 * Write governance: ctx.scope is the caller's capability.
 *  - 'read'    → write tools refuse
 *  - 'propose' → ledger writes become approval-inbox proposals
 *  - 'write'   → direct writes
 */

import { z } from 'zod'

export type ToolScope = 'read' | 'propose' | 'write'

export type FinanceToolContext = {
  baseUrl: string
  apiKey?: string
  cookie?: string
  scope: ToolScope
  /** Shown in the inbox as who proposed it (API key name, model name, …) */
  actorLabel?: string
  /** Inbox source attribution for session-backed proposers (the AI chat). */
  proposalSource?: 'ai_chat' | 'draft'
  /** Currency reports are converted into when the caller does not name one (the web app's default). */
  defaultCurrency?: string
  /** The caller's local date (YYYY-MM-DD); "this month" follows it instead of the server's UTC clock. */
  today?: string
}

export class ToolError extends Error {}

export type FinanceTool = {
  name: string
  description: string
  kind: 'read' | 'write'
  /** Write tools that still work with a propose-scoped caller (they park the change in the inbox). */
  proposable?: boolean
  schema: z.ZodObject<z.ZodRawShape>
  execute: (ctx: FinanceToolContext, args: Record<string, unknown>) => Promise<unknown>
}

// ── HTTP plumbing ────────────────────────────────────────────────────────────

async function request<T>(
  ctx: FinanceToolContext,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {}),
      ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      throw new ToolError(parsed.error?.message ?? `Finance API ${res.status}`)
    } catch (err) {
      if (err instanceof ToolError) throw err
      throw new ToolError(`Finance API ${res.status}: ${text.slice(0, 200)}`)
    }
  }
  return JSON.parse(text) as T
}

// ── Shared API shapes (only the fields tools rely on) ───────────────────────

type Wallet = {
  id: string; name: string; walletType: string; institution: string | null
  assetId: string; isActive: boolean; balance: number | string; currency: string
  unit?: string | null
  valuation?: { quantity: number; price: number; currency: string; value: number } | null
}
type RecentTx = {
  id: string; transactionDate: string; type: string; description: string
  notes: string | null; categoryName: string | null; amount: number
  currency: string; walletName: string
}
type Category = { id: string; name: string; slug: string; type: string; parentId: string | null }
type Friend = { personId: string; name: string; isGuest: boolean; balances: Array<{ currency: string; amount: string }> }
type SharedGroup = { id: string; name: string; myBalances: Array<{ currency: string; amount: string }> }
type SharedExpenseView = {
  id: string; kind: 'expense' | 'payment'; groupId: string | null; description: string; cost: string; currency: string
  date: string; category: string; notes: string | null; repeatInterval: string; version: number; deletedAt: string | null
  paidInput: Record<string, unknown> | null; splitInput: Record<string, unknown> | null
  shares: Array<{ personId: string; name: string; paid: string; owed: string }>; me: unknown
}
type NewTransactionInput = {
  transactionDate: string
  type: string
  description: string
  notes?: string
  categoryId?: string
  externalRef?: string
  entries: Array<{ walletId: string; assetId: string; amount: string }>
}

// ── Name resolvers (agents speak names, the API speaks ids) ─────────────────

async function resolveWallet(ctx: FinanceToolContext, name: string): Promise<Wallet> {
  const { data } = await request<{ data: Wallet[] }>(ctx, '/api/wallets')
  const wallet = data.find((w) => w.name.toLowerCase() === name.toLowerCase())
  if (!wallet) {
    throw new ToolError(`Wallet "${name}" not found. Available: ${data.map((w) => w.name).join(', ')}`)
  }
  return wallet
}

async function resolveCategory(ctx: FinanceToolContext, name: string): Promise<Category> {
  const { data } = await request<{ data: Category[] }>(ctx, '/api/categories')
  const category = data.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (!category) {
    throw new ToolError(`Category "${name}" not found. Available: ${data.map((c) => c.name).join(', ')}`)
  }
  return category
}

async function resolveFriend(ctx: FinanceToolContext, name: string): Promise<Friend> {
  const { data } = await request<{ data: Friend[] }>(ctx, '/api/split/friends')
  const friend = data.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!friend) {
    throw new ToolError(`Friend "${name}" not found. Friends: ${data.map((p) => p.name).join(', ') || 'none yet (add one with finance_add_friend)'}`)
  }
  return friend
}

async function resolveGroup(ctx: FinanceToolContext, name: string): Promise<SharedGroup> {
  const { data } = await request<{ data: SharedGroup[] }>(ctx, '/api/split/groups')
  const group = data.find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (!group) throw new ToolError(`Group "${name}" not found. Groups: ${data.map((g) => g.name).join(', ') || 'none'}`)
  return group
}

async function myPersonId(ctx: FinanceToolContext): Promise<string> {
  return (await request<{ data: { personId: string } }>(ctx, '/api/split/me')).data.personId
}

// ── Write governance ─────────────────────────────────────────────────────────

function requireWrite(ctx: FinanceToolContext, action: string): void {
  if (ctx.scope !== 'write') {
    throw new ToolError(
      `This credential cannot ${action} directly (scope: ${ctx.scope}). ` +
      `Ask the owner for a write-scoped API key, or use a proposable tool so the change waits in the approval inbox.`,
    )
  }
}

/** Book a ledger write directly (scope write) or park it in the inbox (scope propose). */
async function bookOrPropose(
  ctx: FinanceToolContext,
  transaction: NewTransactionInput,
  summary: Record<string, unknown>,
): Promise<unknown> {
  if (ctx.scope === 'read') {
    throw new ToolError('This credential is read-only — it cannot record transactions.')
  }
  if (ctx.scope === 'propose') {
    const { data } = await request<{ data: { id: string } }>(ctx, '/api/proposals', {
      method: 'POST',
      body: { transaction, actorLabel: ctx.actorLabel, source: ctx.proposalSource },
    })
    return {
      status: 'proposed',
      proposalId: data.id,
      note: 'Waiting in the approval inbox — nothing is booked until the owner approves.',
      ...summary,
    }
  }
  await request(ctx, '/api/transactions', { method: 'POST', body: transaction })
  return { status: 'booked', ...summary }
}

const todayOf = (ctx: FinanceToolContext) => ctx.today ?? new Date().toISOString().slice(0, 10)

function monthBounds(month: string): { from: string; to: string } {
  const next = new Date(`${month}-01T00:00:00.000Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  // `to` is inclusive end-of-month so the API's lte() keeps the last day.
  return { from: `${month}-01T00:00:00.000Z`, to: new Date(next.getTime() - 1).toISOString() }
}

const num = (v: number | string) => (typeof v === 'string' ? parseFloat(v) : v)

// ── The registry ─────────────────────────────────────────────────────────────

export const financeTools: FinanceTool[] = [
  // ════ READ ════
  {
    name: 'finance_balance',
    description: 'Get wallet balances, optionally filtered by wallet name or currency',
    kind: 'read',
    schema: z.object({
      filter: z.string().optional().describe('Wallet name or currency code to filter by (e.g. "checking", "EUR")'),
    }),
    execute: async (ctx, { filter }) => {
      const { data: wallets } = await request<{ data: Wallet[] }>(ctx, '/api/wallets')
      const { data: summary } = await request<{ data: { byCurrency: Array<{ currency: string; net: number }> } }>(
        ctx, '/api/analytics/summary',
      )
      let filtered = wallets
      if (typeof filter === 'string' && filter) {
        const f = filter.toLowerCase()
        filtered = wallets.filter((w) => w.name.toLowerCase().includes(f) || w.currency.toLowerCase() === f)
      }
      const byCurrency: Record<string, Wallet[]> = {}
      for (const w of filtered) (byCurrency[w.currency] ??= []).push(w)
      return {
        totalByCurrency: summary.byCurrency.map((c) => ({ currency: c.currency, balance: c.net })),
        wallets: byCurrency,
      }
    },
  },
  {
    name: 'finance_summary',
    description: 'Get complete financial summary: totals by currency, income/expense/transfer breakdown, date range, counts',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: unknown }>(ctx, '/api/analytics/summary')).data,
  },
  {
    name: 'finance_recent',
    description: 'Get recent transactions, optionally filtered by wallet, category, currency, or description text',
    kind: 'read',
    schema: z.object({
      filter: z.string().optional().describe('Filter by wallet name, category name, currency code, or description text'),
      limit: z.number().int().min(1).max(200).optional().describe('Number of transactions to return (default 50)'),
    }),
    execute: async (ctx, { filter, limit }) => {
      const qs = limit ? `?limit=${limit}` : ''
      const { data } = await request<{ data: RecentTx[] }>(ctx, `/api/analytics/recent${qs}`)
      if (typeof filter !== 'string' || !filter) return data
      const f = filter.toLowerCase()
      return data.filter((tx) =>
        tx.walletName.toLowerCase().includes(f) ||
        (tx.categoryName?.toLowerCase().includes(f) ?? false) ||
        tx.currency.toLowerCase() === f ||
        tx.description.toLowerCase().includes(f),
      )
    },
  },
  {
    name: 'finance_spending',
    description: 'Spending by category for one month (defaults to the current month), grouped by currency. Use this for "where did my money go" questions; use finance_monthly_report for totals and comparisons.',
    kind: 'read',
    schema: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month in YYYY-MM (defaults to the current month)'),
      currency: z.string().optional().describe('Filter by currency code (e.g. IDR, EUR, USD)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max categories per currency (default 10)'),
    }),
    execute: async (ctx, { month, currency, limit }) => {
      const m = (month as string | undefined) ?? todayOf(ctx).slice(0, 7)
      const { from, to } = monthBounds(m)
      const qs = new URLSearchParams({ type: 'expense', from, to })
      const { data } = await request<{ data: Array<{ type: string; categoryName: string | null; currency: string }> }>(
        ctx, `/api/analytics/category-breakdown?${qs}`,
      )
      const n = (limit as number | undefined) ?? 10
      let expenses = data.filter((c) => c.categoryName)
      if (typeof currency === 'string' && currency) {
        expenses = expenses.filter((c) => c.currency.toLowerCase() === currency.toLowerCase())
      }
      const byCurrency: Record<string, unknown[]> = {}
      for (const c of expenses) {
        const bucket = (byCurrency[c.currency] ??= [])
        if (bucket.length < n) bucket.push(c)
      }
      return { month: m, byCurrency }
    },
  },
  {
    name: 'finance_wallets',
    description: 'List all wallets with type, institution, currency, balance, and valuation for quantity assets (e.g. gold)',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: Wallet[] }>(ctx, '/api/wallets')).data,
  },
  {
    name: 'finance_categories',
    description: 'List all transaction categories with their type (income/expense/transfer) and hierarchy',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: Category[] }>(ctx, '/api/categories')).data,
  },
  {
    name: 'finance_search',
    description: 'Search transactions by text, wallet, category, or date range',
    kind: 'read',
    schema: z.object({
      q: z.string().optional().describe('Text search on description (e.g. "groceries", "rent")'),
      walletName: z.string().optional().describe('Wallet name to filter by'),
      category: z.string().optional().describe('Category ID to filter by'),
      from: z.string().optional().describe('Start date YYYY-MM-DD'),
      to: z.string().optional().describe('End date YYYY-MM-DD'),
      includeDeleted: z.boolean().optional().describe('Include soft-deleted transactions'),
    }),
    execute: async (ctx, args) => {
      const params: Record<string, string> = {}
      if (typeof args.q === 'string') params.q = args.q
      if (typeof args.category === 'string') params.category = args.category
      if (typeof args.from === 'string') params.from = args.from
      if (typeof args.to === 'string') params.to = args.to
      if (args.includeDeleted === true) params.includeDeleted = 'true'
      if (typeof args.walletName === 'string' && args.walletName) {
        params.wallet = (await resolveWallet(ctx, args.walletName)).id
      }
      const qs = new URLSearchParams(params).toString()
      return (await request<{ data: RecentTx[] }>(ctx, `/api/transactions/search${qs ? `?${qs}` : ''}`)).data
    },
  },
  {
    name: 'finance_monthly_report',
    description: 'One month in a single currency, the same numbers as the Reports page: income, spending (your share of split bills), net, savings rate, the usual month (average of up to 3 earlier months), spending so far vs the usual pace by the same day, categories with their usual amount, top merchants and 12 months of cash flow. Defaults to the current month.',
    kind: 'read',
    schema: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month in YYYY-MM format (defaults to current month)'),
      currency: z.string().length(3).optional().describe('Currency to report in (defaults to the owner\'s display currency)'),
      walletName: z.string().optional().describe('Limit to one wallet'),
    }),
    execute: async (ctx, { month, currency, walletName }) => {
      const today = todayOf(ctx)
      const params = new URLSearchParams({ month: (month as string | undefined) ?? today.slice(0, 7), today })
      const cur = (currency as string | undefined) ?? ctx.defaultCurrency
      if (cur) params.set('currency', cur.toUpperCase())
      if (typeof walletName === 'string' && walletName) params.append('walletId', (await resolveWallet(ctx, walletName)).id)
      const { data } = await request<{ data: Record<string, unknown> & { pace?: unknown; history?: unknown[] } }>(ctx, `/api/analytics/month-report?${params}`)
      // The per-day pace series is for charts; keep the answer small for the model.
      const { pace: _pace, ...rest } = data
      void _pace
      return rest
    },
  },
  {
    name: 'finance_net_worth',
    description: 'Total net worth converted into one display currency, with a monthly series',
    kind: 'read',
    schema: z.object({
      currency: z.string().optional().describe('Display currency code (default EUR)'),
      months: z.number().int().min(1).max(60).optional().describe('Series length in months (default 12)'),
    }),
    execute: async (ctx, { currency, months }) => {
      const params = new URLSearchParams()
      if (typeof currency === 'string' && currency) params.set('currency', currency)
      if (typeof months === 'number') params.set('months', String(months))
      const qs = params.toString()
      return (await request<{ data: unknown }>(ctx, `/api/analytics/net-worth${qs ? `?${qs}` : ''}`)).data
    },
  },
  {
    name: 'finance_shared_balances',
    description: 'Shared expenses overview (Splitwise-style): what friends owe you and what you owe, per friend, per group and in total. Positive amounts mean they owe you.',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => {
      const [{ data: me }, { data: friends }, { data: groups }] = await Promise.all([
        request<{ data: { balances: unknown } }>(ctx, '/api/split/me'),
        request<{ data: Friend[] }>(ctx, '/api/split/friends'),
        request<{ data: SharedGroup[] }>(ctx, '/api/split/groups'),
      ])
      return { totals: me.balances, friends, groups }
    },
  },
  {
    name: 'finance_shared_expenses',
    description: 'List shared expenses and payments, newest first, optionally for one group or friend or matching a search term',
    kind: 'read',
    schema: z.object({
      groupName: z.string().optional().describe('Only this group'),
      friendName: z.string().optional().describe('Only expenses shared with this friend'),
      search: z.string().optional().describe('Text to look for in description or notes'),
      limit: z.number().int().min(1).max(100).optional().describe('How many (default 30)'),
    }),
    execute: async (ctx, args) => {
      const params = new URLSearchParams()
      if (typeof args.groupName === 'string' && args.groupName) params.set('groupId', (await resolveGroup(ctx, args.groupName)).id)
      if (typeof args.friendName === 'string' && args.friendName) params.set('friendId', (await resolveFriend(ctx, args.friendName)).personId)
      if (typeof args.search === 'string' && args.search) params.set('q', args.search)
      params.set('limit', String(typeof args.limit === 'number' ? args.limit : 30))
      const { data } = await request<{ data: Array<Record<string, unknown>> }>(ctx, `/api/split/expenses?${params}`)
      return data.map((e) => ({
        id: e.id, date: String(e.date).slice(0, 10), kind: e.kind, description: e.description, cost: e.cost, currency: e.currency,
        group: e.groupName, category: e.category, shares: e.shares, mine: e.me,
      }))
    },
  },
  {
    name: 'finance_recurring_rules',
    description: 'List recurring transaction rules with cadence, next run, and mode (auto-book vs approval inbox)',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: unknown[] }>(ctx, '/api/recurring-rules')).data,
  },
  {
    name: 'finance_inbox',
    description: 'List the approval inbox: pending proposals from agents and recurring drafts awaiting the owner',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: unknown[] }>(ctx, '/api/inbox')).data,
  },
  {
    name: 'finance_exchange_rates',
    description: 'Latest exchange rates (EUR-based, fed daily from the ECB)',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => (await request<{ data: unknown[] }>(ctx, '/api/exchange-rates')).data,
  },
  {
    name: 'finance_asset_prices',
    description: 'Price history for a quantity asset such as gold (XAU_G), latest first',
    kind: 'read',
    schema: z.object({
      assetCode: z.string().describe('Asset code, e.g. XAU_G'),
    }),
    execute: async (ctx, { assetCode }) => {
      const { data: assets } = await request<{ data: Array<{ id: string; code: string }> }>(ctx, '/api/assets')
      const asset = assets.find((a) => a.code.toLowerCase() === String(assetCode).toLowerCase())
      if (!asset) throw new ToolError(`Asset "${assetCode}" not found. Available: ${assets.map((a) => a.code).join(', ')}`)
      return (await request<{ data: unknown[] }>(ctx, `/api/asset-prices?assetId=${asset.id}`)).data
    },
  },

  // ════ WRITE ════
  {
    name: 'finance_add_transaction',
    description: 'Record an expense or income. With a propose-scoped credential the transaction waits in the approval inbox instead of booking directly.',
    kind: 'write',
    proposable: true,
    schema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date YYYY-MM-DD'),
      type: z.enum(['expense', 'income', 'adjustment', 'fee']).describe('Transaction type'),
      description: z.string().min(1).describe('What the transaction is for'),
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Positive amount, e.g. "32.50" — the sign comes from the type'),
      walletName: z.string().describe('Wallet name'),
      categoryName: z.string().optional().describe('Category name (must already exist)'),
      notes: z.string().optional().describe('Additional notes'),
      splitWith: z.array(z.object({
        personName: z.string().describe('Friend who owes part of this'),
        amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Their share'),
      })).optional().describe('Friends who owe part of this (creates a shared expense paid from the wallet; needs write scope)'),
    }),
    execute: async (ctx, args) => {
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const type = args.type as string
      const amount = args.amount as string
      const signed = type === 'income' ? amount : `-${amount}`
      const transaction: NewTransactionInput = {
        transactionDate: `${args.date}T12:00:00.000Z`,
        type,
        description: args.description as string,
        notes: args.notes as string | undefined,
        entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: signed }],
      }
      if (typeof args.categoryName === 'string' && args.categoryName) {
        transaction.categoryId = (await resolveCategory(ctx, args.categoryName)).id
      }
      if (Array.isArray(args.splitWith) && args.splitWith.length > 0) {
        // A split bill is a shared expense paid from this wallet; it books your share automatically.
        requireWrite(ctx, 'record shared expenses')
        if (type !== 'expense') throw new ToolError('Only expenses can be split')
        const me = await myPersonId(ctx)
        const parts = args.splitWith as Array<{ personName: string; amount: string }>
        const amounts: Record<string, string> = {}
        let others = 0
        for (const part of parts) {
          const friend = await resolveFriend(ctx, part.personName)
          amounts[friend.personId] = part.amount
          others += parseFloat(part.amount)
        }
        const mine = Math.round((parseFloat(amount) - others) * 1e8) / 1e8
        if (mine < 0) throw new ToolError('The split parts add up to more than the amount')
        if (mine > 0) amounts[me] = String(mine)
        const { data } = await request<{ data: { id: string } }>(ctx, '/api/split/expenses', {
          method: 'POST',
          body: {
            kind: 'expense', description: args.description, cost: amount, currency: wallet.currency,
            date: `${args.date}T12:00:00.000Z`, category: 'general', notes: args.notes ?? null,
            paid: { kind: 'single', personId: me }, split: { method: 'exact', amounts },
            myBooks: { fundingWalletId: wallet.id, ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}) },
          },
        })
        return { status: 'booked', sharedExpenseId: data.id, transaction: { date: args.date, description: args.description, amount: signed, wallet: wallet.name, currency: wallet.currency, yourShare: String(mine) } }
      }
      return bookOrPropose(ctx, transaction, {
        transaction: { date: args.date, type, description: args.description, amount: signed, wallet: wallet.name, currency: wallet.currency },
      })
    },
  },
  {
    name: 'finance_transfer',
    description: 'Transfer money between two of the owner\'s wallets (same currency). Propose-scoped credentials send it to the approval inbox.',
    kind: 'write',
    proposable: true,
    schema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transfer date YYYY-MM-DD'),
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Amount to transfer, e.g. "50.00"'),
      fromWallet: z.string().describe('Source wallet name'),
      toWallet: z.string().describe('Target wallet name'),
      description: z.string().optional().describe('Transfer description'),
      notes: z.string().optional().describe('Additional notes'),
    }),
    execute: async (ctx, args) => {
      const src = await resolveWallet(ctx, args.fromWallet as string)
      const dst = await resolveWallet(ctx, args.toWallet as string)
      if (src.assetId !== dst.assetId) {
        throw new ToolError(`Wallets use different currencies (${src.currency} vs ${dst.currency})`)
      }
      const amount = args.amount as string
      const transaction: NewTransactionInput = {
        transactionDate: `${args.date}T12:00:00.000Z`,
        type: 'transfer',
        description: (args.description as string | undefined) ?? `Transfer from ${src.name} to ${dst.name}`,
        notes: args.notes as string | undefined,
        entries: [
          { walletId: src.id, assetId: src.assetId, amount: `-${amount}` },
          { walletId: dst.id, assetId: dst.assetId, amount },
        ],
      }
      return bookOrPropose(ctx, transaction, {
        transfer: { date: args.date, amount, from: src.name, to: dst.name, currency: src.currency },
      })
    },
  },
  {
    name: 'finance_add_recurring_rule',
    description: 'Create a recurring transaction rule. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      name: z.string().min(1).describe('Rule name, e.g. "Rent"'),
      type: z.enum(['expense', 'income']).describe('Transaction type'),
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Positive amount per occurrence'),
      walletName: z.string().describe('Wallet name'),
      categoryName: z.string().optional().describe('Category name'),
      freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']).describe('Cadence'),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First occurrence YYYY-MM-DD'),
      autoBook: z.boolean().optional().describe('Book occurrences automatically instead of via the approval inbox (requires a write-scoped credential)'),
    }),
    execute: async (ctx, args) => {
      // Rule creation is a direct write (rules are not proposals), so it demands
      // write scope outright — otherwise a propose-scoped chat model could plant
      // rules that bypass the approval inbox.
      requireWrite(ctx, 'create recurring rules')
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const wantsAuto = args.autoBook === true
      const amount = args.amount as string
      const template: Record<string, unknown> = {
        type: args.type,
        description: args.name,
        entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: args.type === 'income' ? amount : `-${amount}` }],
      }
      if (typeof args.categoryName === 'string' && args.categoryName) {
        template.categoryId = (await resolveCategory(ctx, args.categoryName)).id
      }
      const { data } = await request<{ data: { id: string; nextRunAt: string } }>(ctx, '/api/recurring-rules', {
        method: 'POST',
        body: {
          name: args.name,
          template,
          freq: args.freq,
          interval: 1,
          startAt: `${args.startDate}T09:00:00.000Z`,
          endAt: null,
          mode: wantsAuto ? 'auto_post' : 'draft',
        },
      })
      return { status: 'created', ruleId: data.id, nextRunAt: data.nextRunAt, mode: wantsAuto ? 'auto_post' : 'draft' }
    },
  },
  {
    name: 'finance_add_friend',
    description: 'Add a friend to share expenses with (a guest without an account; they can join later through an invite link). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      name: z.string().min(1).describe('Friend\'s name'),
      email: z.string().optional().describe('Optional email, only visible to you'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'add friends')
      const { data } = await request<{ data: { id: string } }>(ctx, '/api/split/friends', { method: 'POST', body: { name: args.name, email: args.email ?? null } })
      return { status: 'added', personId: data.id, name: args.name }
    },
  },
  {
    name: 'finance_add_shared_expense',
    description: 'Record a shared expense (Splitwise-style) with friends or in a group. Defaults: you paid, split equally among you and the named people. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date YYYY-MM-DD'),
      description: z.string().min(1),
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Total cost, e.g. "80.00"'),
      currency: z.string().regex(/^[A-Za-z]{3}$/).describe('Currency code, e.g. EUR'),
      groupName: z.string().optional().describe('Group to put it in (everyone named must be a member)'),
      withFriends: z.array(z.string()).optional().describe('Friend names sharing it (default: all group members when a group is given)'),
      paidBy: z.string().optional().describe('Friend name who paid, or "me" (default me)'),
      shares: z.record(z.string(), z.string()).optional().describe('Exact amount owed per name ("me" for yourself); omit for an equal split'),
      category: z.string().optional().describe('Shared category slug, e.g. groceries, dining, rent, hotel, transport (default general)'),
      notes: z.string().optional(),
      paidFromWallet: z.string().optional().describe('When you paid: the wallet name it came from, so your books show the payment'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'record shared expenses')
      const me = await myPersonId(ctx)
      const group = typeof args.groupName === 'string' && args.groupName ? await resolveGroup(ctx, args.groupName) : null
      const idFor = async (name: string) => (name.toLowerCase() === 'me' ? me : (await resolveFriend(ctx, name)).personId)
      let people: string[]
      if (Array.isArray(args.withFriends) && args.withFriends.length) {
        people = [me, ...(await Promise.all((args.withFriends as string[]).map(idFor)))]
      } else if (group) {
        const { data } = await request<{ data: { members: Array<{ personId: string; isCurrent: boolean }> } }>(ctx, `/api/split/groups/${group.id}`)
        people = data.members.filter((m) => m.isCurrent).map((m) => m.personId)
      } else {
        throw new ToolError('Name the friends sharing it (withFriends) or a group')
      }
      people = [...new Set(people)]
      const payer = typeof args.paidBy === 'string' && args.paidBy ? await idFor(args.paidBy) : me
      let split: Record<string, unknown> = { method: 'equal', personIds: people }
      if (args.shares && typeof args.shares === 'object') {
        const amounts: Record<string, string> = {}
        for (const [name, value] of Object.entries(args.shares as Record<string, string>)) amounts[await idFor(name)] = value
        split = { method: 'exact', amounts }
      }
      const body: Record<string, unknown> = {
        kind: 'expense', description: args.description, cost: args.amount, currency: String(args.currency).toUpperCase(),
        date: `${args.date}T12:00:00.000Z`, category: args.category ?? 'general', notes: args.notes ?? null,
        groupId: group?.id ?? null, paid: { kind: 'single', personId: payer }, split,
      }
      if (typeof args.paidFromWallet === 'string' && args.paidFromWallet && payer === me) {
        body.myBooks = { fundingWalletId: (await resolveWallet(ctx, args.paidFromWallet)).id }
      }
      const { data } = await request<{ data: { id: string } }>(ctx, '/api/split/expenses', { method: 'POST', body })
      const { data: view } = await request<{ data: { me: unknown; shares: unknown } }>(ctx, `/api/split/expenses/${data.id}`)
      return { status: 'recorded', id: data.id, shares: view.shares, mine: view.me }
    },
  },
  {
    name: 'finance_settle_up',
    description: 'Record a payment between you and a friend (settling up), in full or in part. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      friendName: z.string(),
      direction: z.enum(['i_paid', 'they_paid']).describe('i_paid: you paid them; they_paid: they paid you'),
      amount: z.string().regex(/^\d+(\.\d+)?$/).optional().describe('Defaults to the full open balance in that currency'),
      currency: z.string().regex(/^[A-Za-z]{3}$/).describe('Currency code'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Default today'),
      groupName: z.string().optional().describe('Record it inside this group'),
      walletName: z.string().optional().describe('Wallet the money left or arrived in, for your books'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'record payments')
      const me = await myPersonId(ctx)
      const friend = await resolveFriend(ctx, args.friendName as string)
      const currency = String(args.currency).toUpperCase()
      let amount = args.amount as string | undefined
      if (!amount) {
        const open = friend.balances.find((b) => b.currency === currency)
        if (!open) throw new ToolError(`You and ${friend.name} are settled up in ${currency}`)
        amount = open.amount.replace(/^-/, '')
      }
      const iPaid = args.direction === 'i_paid'
      const group = typeof args.groupName === 'string' && args.groupName ? await resolveGroup(ctx, args.groupName) : null
      const body: Record<string, unknown> = {
        kind: 'payment', cost: amount, currency, date: `${(args.date as string | undefined) ?? todayOf(ctx)}T12:00:00.000Z`,
        groupId: group?.id ?? null,
        payment: iPaid ? { fromPersonId: me, toPersonId: friend.personId } : { fromPersonId: friend.personId, toPersonId: me },
      }
      if (typeof args.walletName === 'string' && args.walletName) {
        body.myBooks = { fundingWalletId: (await resolveWallet(ctx, args.walletName)).id }
      }
      const { data } = await request<{ data: { id: string } }>(ctx, '/api/split/expenses', { method: 'POST', body })
      return { status: 'recorded', id: data.id, amount, currency, friend: friend.name, direction: args.direction }
    },
  },
  {
    name: 'finance_shared_groups',
    description: 'Shared expense groups (trips, flats, couples): your balance in each. Name a group to get its members, who owes whom, and settings.',
    kind: 'read',
    schema: z.object({
      groupName: z.string().optional().describe('One group in detail'),
    }),
    execute: async (ctx, args) => {
      if (typeof args.groupName === 'string' && args.groupName) {
        const group = await resolveGroup(ctx, args.groupName)
        return (await request<{ data: unknown }>(ctx, `/api/split/groups/${group.id}`)).data
      }
      return (await request<{ data: unknown }>(ctx, '/api/split/groups')).data
    },
  },
  {
    name: 'finance_create_group',
    description: 'Create a shared expense group with friends (they must already be friends; add them first). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      name: z.string().min(1).max(100),
      type: z.enum(['home', 'trip', 'couple', 'other']).optional().describe('Default other'),
      members: z.array(z.string()).optional().describe('Friend names to add (you are always in it)'),
      simplifyDebts: z.boolean().optional().describe('Combine debts into fewer payments (default true)'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'create groups')
      const memberIds = await Promise.all(((args.members as string[] | undefined) ?? []).map(async (n) => (await resolveFriend(ctx, n)).personId))
      const { data } = await request<{ data: { id: string } }>(ctx, '/api/split/groups', {
        method: 'POST',
        body: { name: args.name, groupType: args.type ?? 'other', memberIds, simplifyDebts: args.simplifyDebts ?? true },
      })
      return { status: 'created', groupId: data.id, name: args.name }
    },
  },
  {
    name: 'finance_add_group_member',
    description: 'Add a friend to a shared expense group. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ groupName: z.string(), friendName: z.string() }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'change groups')
      const group = await resolveGroup(ctx, args.groupName as string)
      const friend = await resolveFriend(ctx, args.friendName as string)
      await request(ctx, `/api/split/groups/${group.id}/members`, { method: 'POST', body: { personId: friend.personId } })
      return { status: 'added', group: group.name, friend: friend.name }
    },
  },
  {
    name: 'finance_edit_shared_expense',
    description: 'Change a shared expense or payment by id (from finance_shared_expenses): description, date, amount, category, notes, who paid, or exact shares. An equal/percent/shares split re-splits a new amount automatically. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      id: z.string().uuid(),
      description: z.string().min(1).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
      category: z.string().optional().describe('Shared category slug'),
      notes: z.string().nullable().optional(),
      paidBy: z.string().optional().describe('Friend name or "me" (expenses only)'),
      shares: z.record(z.string(), z.string()).optional().describe('Exact amount owed per name ("me" for yourself); replaces the split'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'edit shared expenses')
      const { data: v } = await request<{ data: SharedExpenseView }>(ctx, `/api/split/expenses/${args.id}`)
      if (v.deletedAt) throw new ToolError('That expense is deleted; restore it first')
      const me = await myPersonId(ctx)
      const idFor = async (name: string) => (name.toLowerCase() === 'me' ? me : (await resolveFriend(ctx, name)).personId)
      const cost = (args.amount as string | undefined) ?? v.cost
      const body: Record<string, unknown> = {
        kind: v.kind, groupId: v.groupId, currency: v.currency, cost, version: v.version,
        date: typeof args.date === 'string' ? `${args.date}T12:00:00.000Z` : v.date,
        notes: args.notes !== undefined ? args.notes : v.notes,
        repeatInterval: v.repeatInterval,
      }
      if (v.kind === 'payment') {
        const from = v.shares.find((s) => Number(s.paid) > 0)
        const to = v.shares.find((s) => Number(s.owed) > 0)
        if (!from || !to) throw new ToolError('Could not read this payment')
        body.payment = { fromPersonId: from.personId, toPersonId: to.personId }
      } else {
        body.description = (args.description as string | undefined) ?? v.description
        body.category = (args.category as string | undefined) ?? v.category
        body.paid = typeof args.paidBy === 'string' && args.paidBy ? { kind: 'single', personId: await idFor(args.paidBy) } : v.paidInput
        if (args.shares && typeof args.shares === 'object') {
          const amounts: Record<string, string> = {}
          for (const [name, value] of Object.entries(args.shares as Record<string, string>)) amounts[await idFor(name)] = value
          body.split = { method: 'exact', amounts }
        } else {
          body.split = v.splitInput
          const fixed = (v.paidInput as { kind?: string } | null)?.kind === 'multiple' || ['exact', 'adjustment'].includes(String((v.splitInput as { method?: string } | null)?.method))
          if (args.amount !== undefined && args.amount !== v.cost && fixed) {
            throw new ToolError('This expense has exact amounts per person; pass shares (and paidBy) for the new amount')
          }
        }
      }
      await request(ctx, `/api/split/expenses/${args.id}`, { method: 'PATCH', body })
      const { data: after } = await request<{ data: SharedExpenseView }>(ctx, `/api/split/expenses/${args.id}`)
      return { status: 'updated', id: args.id, cost: after.cost, currency: after.currency, shares: after.shares, mine: after.me }
    },
  },
  {
    name: 'finance_delete_shared_expense',
    description: 'Delete a shared expense or payment by id (everyone in it sees it removed; it can be restored). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid() }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'delete shared expenses')
      await request(ctx, `/api/split/expenses/${args.id}`, { method: 'DELETE' })
      return { status: 'deleted', id: args.id }
    },
  },
  {
    name: 'finance_restore_shared_expense',
    description: 'Restore a deleted shared expense or payment by id. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid() }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'restore shared expenses')
      await request(ctx, `/api/split/expenses/${args.id}/restore`, { method: 'POST' })
      return { status: 'restored', id: args.id }
    },
  },
  {
    name: 'finance_shared_comments',
    description: 'Comments on a shared expense, oldest first',
    kind: 'read',
    schema: z.object({ id: z.string().uuid().describe('Shared expense id') }),
    execute: async (ctx, args) => {
      const { data } = await request<{ data: Array<{ name: string; body: string; createdAt: string; isMine: boolean }> }>(ctx, `/api/split/expenses/${args.id}/comments`)
      return data.map((c) => ({ by: c.isMine ? 'me' : c.name, at: c.createdAt, text: c.body }))
    },
  },
  {
    name: 'finance_comment_shared_expense',
    description: 'Add a comment to a shared expense; everyone in it sees it. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid(), text: z.string().min(1).max(1000) }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'comment')
      const { data } = await request<{ data: { id: string } }>(ctx, `/api/split/expenses/${args.id}/comments`, { method: 'POST', body: { body: args.text } })
      return { status: 'commented', commentId: data.id }
    },
  },
  {
    name: 'finance_invite_friend',
    description: 'Create a single-use invite link for a guest friend you added, so they can sign up and take over their shared history (valid 14 days; replaces older links). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ friendName: z.string() }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'invite friends')
      const friend = await resolveFriend(ctx, args.friendName as string)
      if (!friend.isGuest) throw new ToolError(`${friend.name} already has an account`)
      const { data } = await request<{ data: { url: string; expiresAt: string } }>(ctx, `/api/split/persons/${friend.personId}/invite`, { method: 'POST' })
      return { status: 'created', friend: friend.name, url: data.url, expiresAt: data.expiresAt }
    },
  },
  {
    name: 'finance_edit_transaction',
    description: 'Edit an existing transaction (description, type, date, amount, notes, category). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      id: z.string().uuid().describe('Transaction ID to edit'),
      description: z.string().optional(),
      type: z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('New date YYYY-MM-DD'),
      amount: z.string().regex(/^-?\d+(\.\d+)?$/).optional().describe('New signed amount, e.g. "-32.50"'),
      notes: z.string().optional().describe('New notes (empty string clears)'),
      categoryName: z.string().optional().describe('Category name (looked up; empty string clears)'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'edit transactions')
      const body: Record<string, unknown> = {}
      if (args.description !== undefined) body.description = args.description
      if (args.type !== undefined) body.type = args.type
      if (args.date !== undefined) body.transactionDate = `${args.date}T12:00:00.000Z`
      if (args.amount !== undefined) body.amount = args.amount
      if (args.notes !== undefined) body.notes = (args.notes as string) || null
      if (args.categoryName !== undefined) {
        body.categoryId = args.categoryName ? (await resolveCategory(ctx, args.categoryName as string)).id : null
      }
      const { data } = await request<{ data: unknown }>(ctx, `/api/transactions/${args.id}`, { method: 'PATCH', body })
      return { status: 'updated', ...(data as Record<string, unknown>) }
    },
  },
  {
    name: 'finance_delete_transaction',
    description: 'Soft-delete a transaction (recoverable). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid().describe('Transaction ID to delete') }),
    execute: async (ctx, { id }) => {
      requireWrite(ctx, 'delete transactions')
      const { data } = await request<{ data: unknown }>(ctx, `/api/transactions/${id}`, { method: 'DELETE' })
      return { status: 'deleted', ...(data as Record<string, unknown>) }
    },
  },
  {
    name: 'finance_restore_transaction',
    description: 'Restore a previously soft-deleted transaction. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid().describe('Transaction ID to restore') }),
    execute: async (ctx, { id }) => {
      requireWrite(ctx, 'restore transactions')
      const { data } = await request<{ data: unknown }>(ctx, `/api/transactions/${id}/restore`, { method: 'POST' })
      return { status: 'restored', ...(data as Record<string, unknown>) }
    },
  },
  {
    name: 'finance_create_wallet',
    description: 'Create a new wallet. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      name: z.string().min(1).describe('Wallet display name'),
      walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']).describe('Wallet type'),
      currency: z.string().min(3).max(16).describe('Currency/asset code, e.g. EUR, IDR, XAU_G'),
      institution: z.string().optional().describe('Bank/provider name'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'create wallets')
      const { data: assets } = await request<{ data: Array<{ id: string; code: string }> }>(ctx, '/api/assets')
      const asset = assets.find((a) => a.code.toLowerCase() === String(args.currency).toLowerCase())
      if (!asset) throw new ToolError(`Currency "${args.currency}" not found. Available: ${assets.map((a) => a.code).join(', ')}`)
      const { data } = await request<{ data: unknown }>(ctx, '/api/wallets', {
        method: 'POST',
        body: { name: args.name, walletType: args.walletType, assetId: asset.id, institution: args.institution },
      })
      return { status: 'created', wallet: data }
    },
  },
  {
    name: 'finance_edit_wallet',
    description: 'Edit an existing wallet (name, type, institution, active status). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      walletName: z.string().describe('Current wallet name'),
      newName: z.string().optional(),
      walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']).optional(),
      institution: z.string().optional().describe('New institution (empty string clears)'),
      isActive: z.boolean().optional(),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'edit wallets')
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const body: Record<string, unknown> = {}
      if (args.newName !== undefined) body.name = args.newName
      if (args.walletType !== undefined) body.walletType = args.walletType
      if (args.institution !== undefined) body.institution = (args.institution as string) || null
      if (args.isActive !== undefined) body.isActive = args.isActive
      const { data } = await request<{ data: unknown }>(ctx, `/api/wallets/${wallet.id}`, { method: 'PATCH', body })
      return { status: 'updated', wallet: data }
    },
  },
  {
    name: 'finance_reconcile',
    description: 'Compare a wallet\'s computed balance with an expected balance. Creating the fixing adjustment requires a write-scoped credential.',
    kind: 'write',
    proposable: true,
    schema: z.object({
      walletName: z.string().describe('Wallet to reconcile'),
      expectedBalance: z.string().regex(/^-?\d+(\.\d+)?$/).describe('Expected balance, e.g. "2212.90"'),
      autoAdjust: z.boolean().optional().describe('Create an adjustment transaction for the difference'),
    }),
    execute: async (ctx, args) => {
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const current = Math.round(num(wallet.balance) * 100) / 100
      const expected = parseFloat(args.expectedBalance as string)
      const difference = Math.round((expected - current) * 100) / 100
      let adjustment: unknown = null
      if (difference !== 0 && args.autoAdjust === true) {
        adjustment = await bookOrPropose(ctx, {
          transactionDate: new Date().toISOString(),
          type: 'adjustment',
          description: 'Reconciliation adjustment',
          notes: `Expected: ${expected}, was: ${current}, diff: ${difference}`,
          entries: [{ walletId: wallet.id, assetId: wallet.assetId, amount: String(difference) }],
        }, { adjustment: difference })
      }
      return {
        wallet: wallet.name,
        currency: wallet.currency,
        currentBalance: current,
        expectedBalance: expected,
        difference,
        matched: difference === 0,
        adjustment,
      }
    },
  },
  {
    name: 'finance_add_asset_price',
    description: 'Record a price for a quantity asset (e.g. gold grams). Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      assetCode: z.string().describe('Asset code, e.g. XAU_G'),
      price: z.string().regex(/^\d+(\.\d+)?$/).describe('Price per unit'),
      currency: z.string().min(3).max(16).describe('Price currency, e.g. EUR'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'record asset prices')
      const { data: assets } = await request<{ data: Array<{ id: string; code: string }> }>(ctx, '/api/assets')
      const asset = assets.find((a) => a.code.toLowerCase() === String(args.assetCode).toLowerCase())
      if (!asset) throw new ToolError(`Asset "${args.assetCode}" not found`)
      const { data } = await request<{ data: unknown }>(ctx, '/api/asset-prices', {
        method: 'POST',
        body: { assetId: asset.id, price: args.price, currency: args.currency },
      })
      return { status: 'recorded', price: data }
    },
  },
  {
    name: 'finance_approve_proposal',
    description: 'Approve a pending inbox proposal, booking its transaction. Requires a write-scoped credential — this bypasses the human approval step.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid().describe('Proposal ID') }),
    execute: async (ctx, { id }) => {
      requireWrite(ctx, 'approve proposals')
      const { data } = await request<{ data: unknown }>(ctx, `/api/inbox/${id}/approve`, { method: 'POST' })
      return { status: 'approved', proposal: data }
    },
  },
  {
    name: 'finance_reject_proposal',
    description: 'Reject a pending inbox proposal. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({ id: z.string().uuid().describe('Proposal ID') }),
    execute: async (ctx, { id }) => {
      requireWrite(ctx, 'reject proposals')
      const { data } = await request<{ data: unknown }>(ctx, `/api/inbox/${id}/reject`, { method: 'POST' })
      return { status: 'rejected', proposal: data }
    },
  },
]

export function getTool(name: string): FinanceTool | undefined {
  return financeTools.find((t) => t.name === name)
}
