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
}

export class ToolError extends Error {}

export type FinanceTool = {
  name: string
  description: string
  kind: 'read' | 'write'
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
type Person = { id: string; name: string }
type NewTransactionInput = {
  transactionDate: string
  type: string
  description: string
  notes?: string
  categoryId?: string
  externalRef?: string
  entries: Array<{ walletId: string; assetId: string; amount: string }>
  splits?: Array<{ personId: string; assetId?: string; amount: string }>
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

async function resolvePerson(ctx: FinanceToolContext, name: string): Promise<Person> {
  const { data } = await request<{ data: Person[] }>(ctx, '/api/people')
  const person = data.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!person) {
    throw new ToolError(`Person "${name}" not found. Available: ${data.map((p) => p.name).join(', ')}`)
  }
  return person
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
      body: { transaction, actorLabel: ctx.actorLabel },
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
    description: 'Spending breakdown by category, grouped by currency — top expense categories with totals and counts',
    kind: 'read',
    schema: z.object({
      currency: z.string().optional().describe('Filter by currency code (e.g. IDR, EUR, USD)'),
      limit: z.number().int().min(1).max(50).optional().describe('Max categories per currency (default 10)'),
    }),
    execute: async (ctx, { currency, limit }) => {
      const { data } = await request<{ data: Array<{ type: string; categoryName: string | null; currency: string }> }>(
        ctx, '/api/analytics/category-breakdown?type=expense',
      )
      const n = (limit as number | undefined) ?? 10
      let expenses = data.filter((c) => c.categoryName)
      if (typeof currency === 'string' && currency) {
        expenses = expenses.filter((c) => c.currency.toLowerCase() === currency.toLowerCase())
      }
      const grouped: Record<string, unknown[]> = {}
      for (const c of expenses) {
        const bucket = (grouped[c.currency] ??= [])
        if (bucket.length < n) bucket.push(c)
      }
      return grouped
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
    description: 'Monthly financial report: income, expenses, net, and top spending categories. Defaults to the current month.',
    kind: 'read',
    schema: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Month in YYYY-MM format (defaults to current month)'),
      walletName: z.string().optional().describe('Filter to a specific wallet'),
    }),
    execute: async (ctx, { month, walletName }) => {
      const m = (month as string | undefined) ?? new Date().toISOString().slice(0, 7)
      const from = `${m}-01`
      const next = new Date(`${m}-01T00:00:00.000Z`)
      next.setUTCMonth(next.getUTCMonth() + 1)
      const to = next.toISOString().slice(0, 10)
      const params: Record<string, string> = { from, to }
      if (typeof walletName === 'string' && walletName) {
        params.wallet = (await resolveWallet(ctx, walletName)).id
      }
      const qs = new URLSearchParams(params).toString()
      const { data: txns } = await request<{ data: RecentTx[] }>(ctx, `/api/transactions/search?${qs}`)
      let income = 0
      let expense = 0
      const byCategory: Record<string, { total: number; count: number }> = {}
      for (const tx of txns) {
        if (tx.amount > 0) income += tx.amount
        else expense += tx.amount
        const cat = tx.categoryName ?? 'Uncategorized'
        const entry = (byCategory[cat] ??= { total: 0, count: 0 })
        entry.total += Math.abs(tx.amount)
        entry.count++
      }
      const topCategories = Object.entries(byCategory)
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 10)
        .map(([name, v]) => ({ name, ...v }))
      return {
        month: m,
        wallet: (walletName as string | undefined) ?? 'all',
        transactionCount: txns.length,
        income: Math.round(income * 100) / 100,
        expense: Math.round(expense * 100) / 100,
        net: Math.round((income + expense) * 100) / 100,
        topCategories,
      }
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
    name: 'finance_people',
    description: 'List people you split expenses with, including their unsettled balances per currency',
    kind: 'read',
    schema: z.object({}),
    execute: async (ctx) => {
      const { data: people } = await request<{ data: Person[] }>(ctx, '/api/people')
      const { data: balances } = await request<{ data: Array<{ personId: string; balances: unknown[] }> }>(
        ctx, '/api/analytics/shared-balances',
      )
      const byId = new Map(balances.map((b) => [b.personId, b.balances]))
      return people.map((p) => ({ ...p, unsettled: byId.get(p.id) ?? [] }))
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
    schema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Transaction date YYYY-MM-DD'),
      type: z.enum(['expense', 'income', 'adjustment', 'fee']).describe('Transaction type'),
      description: z.string().min(1).describe('What the transaction is for'),
      amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Positive amount, e.g. "32.50" — the sign comes from the type'),
      walletName: z.string().describe('Wallet name'),
      categoryName: z.string().optional().describe('Category name (must already exist)'),
      notes: z.string().optional().describe('Additional notes'),
      splitWith: z.array(z.object({
        personName: z.string().describe('Person who owes part of this'),
        amount: z.string().regex(/^\d+(\.\d+)?$/).describe('Their share'),
      })).optional().describe('Split parts owed by people'),
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
        transaction.splits = []
        for (const part of args.splitWith as Array<{ personName: string; amount: string }>) {
          const person = await resolvePerson(ctx, part.personName)
          transaction.splits.push({ personId: person.id, amount: part.amount })
        }
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
    description: 'Create a recurring transaction rule. Propose-scoped credentials can only create inbox-mode rules (each occurrence still needs approval).',
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
      if (ctx.scope === 'read') throw new ToolError('This credential is read-only — it cannot create rules.')
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const wantsAuto = args.autoBook === true
      if (wantsAuto && ctx.scope !== 'write') {
        throw new ToolError('Auto-booking rules require a write-scoped credential. Create it without autoBook — occurrences will wait in the approval inbox.')
      }
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
    name: 'finance_settle_person',
    description: 'Settle all unsettled splits with a person for one currency — books a transfer into the given wallet. Requires a write-scoped credential.',
    kind: 'write',
    schema: z.object({
      personName: z.string().describe('Person to settle with'),
      walletName: z.string().describe('Wallet receiving the settlement (must match the splits\' currency)'),
    }),
    execute: async (ctx, args) => {
      requireWrite(ctx, 'settle balances')
      const person = await resolvePerson(ctx, args.personName as string)
      const wallet = await resolveWallet(ctx, args.walletName as string)
      const { data } = await request<{ data: unknown }>(ctx, `/api/people/${person.id}/settle`, {
        method: 'POST',
        body: { walletId: wallet.id, assetId: wallet.assetId },
      })
      return { status: 'settled', person: person.name, wallet: wallet.name, ...(data as Record<string, unknown>) }
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
