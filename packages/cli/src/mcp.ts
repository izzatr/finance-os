#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { api } from './api.js'

const server = new McpServer({
  name: 'finance-os',
  version: '0.1.0',
})

// ── balance ──────────────────────────────────────────────────────────────────

server.tool(
  'finance_balance',
  'Get wallet balances, optionally filtered by wallet name or currency',
  { filter: z.string().optional().describe('Wallet name or currency code to filter by (e.g. "checking", "EUR")') },
  async ({ filter }) => {
    const { data: wallets } = await api.wallets()
    const { data: summary } = await api.summary()

    let filtered = wallets
    if (filter) {
      const f = filter.toLowerCase()
      filtered = wallets.filter(w =>
        w.name.toLowerCase().includes(f) ||
        w.currency.toLowerCase() === f
      )
    }

    const byCurrency: Record<string, typeof filtered> = {}
    for (const w of filtered) {
      ;(byCurrency[w.currency] ??= []).push(w)
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          totalByCurrency: summary.byCurrency.map(c => ({
            currency: c.currency,
            balance: c.net,
          })),
          wallets: byCurrency,
        }, null, 2),
      }],
    }
  },
)

// ── summary ──────────────────────────────────────────────────────────────────

server.tool(
  'finance_summary',
  'Get complete financial summary: totals by currency, income/expense/transfers/adjustments/fees breakdown, date range, counts',
  {},
  async () => {
    const { data } = await api.summary()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── recent ───────────────────────────────────────────────────────────────────

server.tool(
  'finance_recent',
  'Get recent transactions (last 50), optionally filtered by wallet, category, or currency',
  {
    filter: z.string().optional().describe('Filter by wallet name, category name, or currency code'),
    limit: z.number().optional().describe('Number of transactions to return (default: 50)'),
  },
  async ({ filter, limit }) => {
    const { data: txns } = await api.recent()

    let filtered = txns
    if (filter) {
      const f = filter.toLowerCase()
      filtered = txns.filter(tx =>
        tx.walletName.toLowerCase().includes(f) ||
        (tx.categoryName?.toLowerCase().includes(f) ?? false) ||
        tx.currency.toLowerCase() === f ||
        tx.description.toLowerCase().includes(f)
      )
    }
    if (limit) filtered = filtered.slice(0, limit)

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(filtered, null, 2) }],
    }
  },
)

// ── spending ─────────────────────────────────────────────────────────────────

server.tool(
  'finance_spending',
  'Get spending breakdown by category, grouped by currency. Shows top expense categories with amounts and transaction counts.',
  {
    currency: z.string().optional().describe('Filter by currency code (IDR, EUR, USD)'),
    limit: z.number().optional().describe('Max categories per currency (default: 10)'),
  },
  async ({ currency, limit }) => {
    const { data: cats } = await api.categoryBreakdown()
    const n = limit ?? 10

    let expenses = cats.filter(c => c.type === 'expense' && c.categoryName)
    if (currency) {
      expenses = expenses.filter(c => c.currency.toLowerCase() === currency.toLowerCase())
    }

    // Group by currency
    const byCurrency: Record<string, typeof expenses> = {}
    for (const c of expenses) {
      ;(byCurrency[c.currency] ??= []).push(c)
    }

    // Take top N per currency
    const result: Record<string, typeof expenses> = {}
    for (const [curr, items] of Object.entries(byCurrency)) {
      result[curr] = items.slice(0, n)
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    }
  },
)

// ── add transaction ──────────────────────────────────────────────────────────

server.tool(
  'finance_add_transaction',
  'Add a new transaction (expense, income, transfer, adjustment, fee). Amount should be negative for expenses and positive for income.',
  {
    date: z.string().describe('Transaction date in YYYY-MM-DD format'),
    type: z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']).describe('Transaction type'),
    description: z.string().describe('What the transaction is for'),
    amount: z.string().describe('Amount as string, negative for expenses (e.g. "-32.50")'),
    walletName: z.string().describe('Wallet name (e.g. "Main Checking", "Savings", "Cash")'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async ({ date, type, description, amount, walletName, notes }) => {
    // Look up wallet
    const { data: wallets } = await api.wallets()
    const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
    if (!wallet) {
      const names = wallets.map(w => w.name).join(', ')
      return {
        content: [{ type: 'text' as const, text: `Wallet "${walletName}" not found. Available: ${names}` }],
        isError: true,
      }
    }

    const result = await api.createTransaction({
      transactionDate: `${date}T00:00:00.000Z`,
      type,
      description,
      notes,
      entries: [{
        walletId: wallet.id,
        assetId: wallet.assetId,
        amount,
      }],
    })

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          transaction: { date, type, description, amount, wallet: wallet.name, currency: wallet.currency },
        }, null, 2),
      }],
    }
  },
)

// ── wallets ──────────────────────────────────────────────────────────────────

server.tool(
  'finance_wallets',
  'List all wallets with their type, institution, currency, and current balance',
  {},
  async () => {
    const { data } = await api.wallets()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── categories ───────────────────────────────────────────────────────────────

server.tool(
  'finance_categories',
  'List all transaction categories with their IDs, names, and slugs',
  {},
  async () => {
    const { data } = await api.categories()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    }
  },
)

// ── create wallet ────────────────────────────────────────────────────────────

server.tool(
  'finance_create_wallet',
  'Create a new wallet',
  {
    name: z.string().describe('Wallet display name'),
    walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']).describe('Wallet type'),
    currency: z.enum(['IDR', 'EUR', 'USD']).describe('Wallet currency'),
    institution: z.string().optional().describe('Bank/provider name (e.g. "Example Bank", "City Credit Union")'),
  },
  async ({ name, walletType, currency, institution }) => {
    const { data: assetList } = await api.assets()
    const asset = assetList.find(a => a.code === currency)
    if (!asset) {
      return {
        content: [{ type: 'text' as const, text: `Currency "${currency}" not found` }],
        isError: true,
      }
    }

    const result = await api.createWallet({
      name,
      walletType,
      assetId: asset.id,
      institution,
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, wallet: result.data }, null, 2) }],
    }
  },
)

// ── delete transaction ──────────────────────────────────────────────────────

server.tool(
  'finance_delete_transaction',
  'Soft-delete a transaction (recoverable). Use when removing duplicate or incorrect transactions.',
  {
    id: z.string().describe('Transaction ID to delete'),
  },
  async ({ id }) => {
    const result = await api.deleteTransaction(id)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...result.data }, null, 2) }],
    }
  },
)

// ── restore transaction ─────────────────────────────────────────────────────

server.tool(
  'finance_restore_transaction',
  'Restore a previously soft-deleted transaction.',
  {
    id: z.string().describe('Transaction ID to restore'),
  },
  async ({ id }) => {
    const result = await api.restoreTransaction(id)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...result.data }, null, 2) }],
    }
  },
)

// ── search ──────────────────────────────────────────────────────────────────

server.tool(
  'finance_search',
  'Search transactions by text, wallet, category, or date range. Returns matching transactions with wallet and category info.',
  {
    q: z.string().optional().describe('Text search on description (e.g. "groceries", "rent")'),
    wallet: z.string().optional().describe('Wallet ID to filter by'),
    walletName: z.string().optional().describe('Wallet name to filter by (looked up to ID)'),
    category: z.string().optional().describe('Category ID to filter by'),
    from: z.string().optional().describe('Start date YYYY-MM-DD'),
    to: z.string().optional().describe('End date YYYY-MM-DD'),
    includeDeleted: z.boolean().optional().describe('Include soft-deleted transactions'),
  },
  async ({ q, wallet, walletName, category, from, to, includeDeleted }) => {
    // Resolve walletName → ID if needed
    let walletId = wallet
    if (!walletId && walletName) {
      const { data: wallets } = await api.wallets()
      const found = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
      if (found) walletId = found.id
    }

    const result = await api.searchTransactions({
      q, wallet: walletId, category, from, to, includeDeleted,
    })

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }],
    }
  },
)

// ── edit transaction ────────────────────────────────────────────────────────

server.tool(
  'finance_edit_transaction',
  'Edit an existing transaction. Can update description, type, date, amount, notes, or category.',
  {
    id: z.string().describe('Transaction ID to edit'),
    description: z.string().optional().describe('New description'),
    type: z.enum(['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee']).optional().describe('New type'),
    date: z.string().optional().describe('New date YYYY-MM-DD'),
    amount: z.string().optional().describe('New amount (e.g. "-32.50")'),
    notes: z.string().optional().describe('New notes (empty string to clear)'),
    categoryName: z.string().optional().describe('Category name (looked up to ID)'),
  },
  async ({ id, description, type, date, amount, notes, categoryName }) => {
    const body: Record<string, unknown> = {}
    if (description !== undefined) body.description = description
    if (type !== undefined) body.type = type
    if (date !== undefined) body.transactionDate = `${date}T00:00:00.000Z`
    if (amount !== undefined) body.amount = amount
    if (notes !== undefined) body.notes = notes || null

    if (categoryName !== undefined) {
      const { data: cats } = await api.categories()
      const cat = cats.find(c => c.name.toLowerCase() === categoryName.toLowerCase())
      body.categoryId = cat?.id ?? null
    }

    const result = await api.updateTransaction(id, body)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, ...result.data }, null, 2) }],
    }
  },
)

// ── edit wallet ─────────────────────────────────────────────────────────────

server.tool(
  'finance_edit_wallet',
  'Edit an existing wallet. Can update name, type, institution, or active status.',
  {
    walletName: z.string().describe('Current wallet name to find'),
    newName: z.string().optional().describe('New wallet name'),
    walletType: z.enum(['bank', 'cash', 'ewallet', 'crypto', 'investment', 'credit', 'custom']).optional().describe('New type'),
    institution: z.string().optional().describe('New institution (empty to clear)'),
    isActive: z.boolean().optional().describe('Active status'),
  },
  async ({ walletName, newName, walletType, institution, isActive }) => {
    const { data: wallets } = await api.wallets()
    const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
    if (!wallet) {
      return {
        content: [{ type: 'text' as const, text: `Wallet "${walletName}" not found. Available: ${wallets.map(w => w.name).join(', ')}` }],
        isError: true,
      }
    }

    const body: Record<string, unknown> = {}
    if (newName !== undefined) body.name = newName
    if (walletType !== undefined) body.walletType = walletType
    if (institution !== undefined) body.institution = institution || null
    if (isActive !== undefined) body.isActive = isActive

    const result = await api.updateWallet(wallet.id, body)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true, wallet: result.data }, null, 2) }],
    }
  },
)

// ── transfer ────────────────────────────────────────────────────────────────

server.tool(
  'finance_transfer',
  'Transfer money between wallets. Both wallets must use the same currency.',
  {
    date: z.string().describe('Transfer date YYYY-MM-DD'),
    amount: z.string().describe('Amount to transfer (positive number, e.g. "50.00")'),
    fromWallet: z.string().describe('Source wallet name'),
    toWallet: z.string().describe('Target wallet name'),
    description: z.string().optional().describe('Transfer description'),
    notes: z.string().optional().describe('Additional notes'),
  },
  async ({ date, amount, fromWallet, toWallet, description, notes }) => {
    const { data: wallets } = await api.wallets()
    const src = wallets.find(w => w.name.toLowerCase() === fromWallet.toLowerCase())
    const dst = wallets.find(w => w.name.toLowerCase() === toWallet.toLowerCase())

    if (!src) return { content: [{ type: 'text' as const, text: `Source wallet "${fromWallet}" not found` }], isError: true }
    if (!dst) return { content: [{ type: 'text' as const, text: `Target wallet "${toWallet}" not found` }], isError: true }
    if (src.assetId !== dst.assetId) return { content: [{ type: 'text' as const, text: `Wallets use different currencies (${src.currency} vs ${dst.currency})` }], isError: true }

    const result = await api.createTransaction({
      transactionDate: `${date}T00:00:00.000Z`,
      type: 'transfer',
      description: description ?? `Transfer from ${src.name} to ${dst.name}`,
      notes,
      entries: [
        { walletId: src.id, assetId: src.assetId, amount: `-${amount}` },
        { walletId: dst.id, assetId: dst.assetId, amount },
      ],
    })

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          transfer: { date, amount, from: src.name, to: dst.name, currency: src.currency },
        }, null, 2),
      }],
    }
  },
)

// ── monthly report ──────────────────────────────────────────────────────────

server.tool(
  'finance_monthly_report',
  'Get a monthly financial report: income, expenses by category, top spending, net savings. Defaults to current month.',
  {
    month: z.string().optional().describe('Month in YYYY-MM format (defaults to current month)'),
    walletName: z.string().optional().describe('Filter to a specific wallet'),
  },
  async ({ month, walletName }) => {
    const m = month ?? new Date().toISOString().slice(0, 7)
    const from = `${m}-01`
    const nextMonth = new Date(`${m}-01`)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const to = nextMonth.toISOString().slice(0, 10)

    let walletId: string | undefined
    if (walletName) {
      const { data: wallets } = await api.wallets()
      const w = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
      if (w) walletId = w.id
    }

    const { data: txns } = await api.searchTransactions({ from, to, wallet: walletId })

    // Compute totals
    let income = 0, expense = 0
    const byCategory: Record<string, { total: number; count: number }> = {}

    for (const tx of txns) {
      if (tx.amount > 0) income += tx.amount
      else expense += tx.amount
      const cat = tx.categoryName ?? 'Uncategorized'
      const entry = byCategory[cat] ??= { total: 0, count: 0 }
      entry.total += Math.abs(tx.amount)
      entry.count++
    }

    const topCategories = Object.entries(byCategory)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10)
      .map(([name, data]) => ({ name, ...data }))

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          month: m,
          wallet: walletName ?? 'all',
          transactionCount: txns.length,
          income: Math.round(income * 100) / 100,
          expense: Math.round(expense * 100) / 100,
          net: Math.round((income + expense) * 100) / 100,
          topCategories,
        }, null, 2),
      }],
    }
  },
)

// ── reconcile ───────────────────────────────────────────────────────────────

server.tool(
  'finance_reconcile',
  'Compare a wallet\'s computed balance with an expected balance. Optionally creates an adjustment transaction to fix the difference.',
  {
    walletName: z.string().describe('Wallet name to reconcile'),
    expectedBalance: z.string().describe('Expected balance (e.g. "2212.90")'),
    autoAdjust: z.boolean().optional().describe('Auto-create adjustment transaction if difference found (default: false)'),
  },
  async ({ walletName, expectedBalance, autoAdjust }) => {
    const { data: wallets } = await api.wallets()
    const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
    if (!wallet) {
      return { content: [{ type: 'text' as const, text: `Wallet "${walletName}" not found` }], isError: true }
    }

    const currentBalance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
    const expected = parseFloat(expectedBalance)
    const difference = Math.round((expected - currentBalance) * 100) / 100

    let adjustmentCreated = false
    if (difference !== 0 && autoAdjust) {
      await api.createTransaction({
        transactionDate: new Date().toISOString(),
        type: 'adjustment',
        description: `Reconciliation adjustment`,
        notes: `Expected: ${expectedBalance}, was: ${currentBalance}, diff: ${difference}`,
        entries: [{
          walletId: wallet.id,
          assetId: wallet.assetId,
          amount: String(difference),
        }],
      })
      adjustmentCreated = true
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          wallet: wallet.name,
          currency: wallet.currency,
          currentBalance,
          expectedBalance: expected,
          difference,
          matched: difference === 0,
          adjustmentCreated,
        }, null, 2),
      }],
    }
  },
)

// ── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
