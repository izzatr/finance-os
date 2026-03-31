#!/usr/bin/env node
import { api } from './api.js'

const CURRENCY_FMT: Record<string, (n: number) => string> = {
  IDR: (n) => `Rp${Math.abs(n).toLocaleString('id-ID', { maximumFractionDigits: 0 })}`,
  EUR: (n) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  USD: (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
}

function fmt(amount: number, currency: string): string {
  const fn = CURRENCY_FMT[currency] ?? ((n: number) => `${currency} ${n.toFixed(2)}`)
  return `${amount < 0 ? '-' : ''}${fn(amount)}`
}

function pad(s: string, n: number) { return s.padEnd(n) }
function rpad(s: string, n: number) { return s.padStart(n) }

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (const arg of args) {
    const m = arg.match(/^--(\w[\w-]*)=(.+)$/)
    if (m) flags[m[1]] = m[2]
    else if (arg.startsWith('--')) flags[arg.slice(2)] = 'true'
  }
  return flags
}

function printTxns(txns: Array<{ transactionDate: string; amount: number; currency: string; description: string; categoryName: string | null; walletName: string }>) {
  let lastDate = ''
  for (const tx of txns) {
    const date = new Date(tx.transactionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (date !== lastDate) {
      if (lastDate) console.log()
      console.log(`  ${date}`)
      lastDate = date
    }
    const amt = rpad(fmt(tx.amount, tx.currency), 18)
    const cat = tx.categoryName ?? ''
    console.log(`    ${amt} ${pad(tx.description, 30)} ${pad(cat, 20)} ${tx.walletName}`)
  }
}

const commands: Record<string, () => Promise<void>> = {
  async balance() {
    const { data: wallets } = await api.wallets()
    const { data: summary } = await api.summary()

    console.log('\n  BALANCE BY CURRENCY\n')
    for (const c of summary.byCurrency) {
      console.log(`  ${pad(c.currency, 6)} ${rpad(fmt(c.net, c.currency), 20)}`)
    }

    console.log('\n  WALLETS\n')
    for (const w of wallets.sort((a, b) => a.currency.localeCompare(b.currency) || b.balance - a.balance)) {
      const bal = typeof w.balance === 'string' ? parseFloat(w.balance) : w.balance
      console.log(`  ${pad(w.name, 25)} ${pad(w.walletType, 12)} ${rpad(fmt(bal, w.currency), 20)}`)
    }
    console.log()
  },

  async recent() {
    const { data: txns } = await api.recent()
    console.log()
    printTxns(txns)
    console.log()
  },

  async spend() {
    const { data: cats } = await api.categoryBreakdown()
    const expenses = cats.filter(c => c.type === 'expense' && c.categoryName)

    const byCurrency: Record<string, typeof expenses> = {}
    for (const c of expenses) {
      ;(byCurrency[c.currency] ??= []).push(c)
    }

    for (const [currency, items] of Object.entries(byCurrency)) {
      console.log(`\n  TOP SPENDING — ${currency}\n`)
      for (const c of items.slice(0, 10)) {
        console.log(`  ${pad(c.categoryName!, 25)} ${rpad(fmt(c.total, currency), 18)} ${rpad(String(c.count), 4)} txns`)
      }
    }
    console.log()
  },

  async summary() {
    const { data: s } = await api.summary()

    console.log('\n  FINANCE OS SUMMARY\n')
    console.log(`  Tracking since: ${s.dateRange.from ? new Date(s.dateRange.from).toLocaleDateString() : 'N/A'}`)
    console.log(`  Transactions:   ${s.transactionCount}`)
    console.log(`  Wallets:        ${s.walletCount}`)
    console.log(`  Categories:     ${s.categoryCount}`)

    console.log('\n  BY CURRENCY\n')
    for (const c of s.byCurrency) {
      console.log(`  ${c.currency}`)
      console.log(`    Balance:     ${rpad(fmt(c.net, c.currency), 20)}`)
      console.log(`    Income:      ${rpad(fmt(c.income, c.currency), 20)}`)
      console.log(`    Expense:     ${rpad(fmt(c.expense, c.currency), 20)}`)
      if (c.transfer) console.log(`    Transfers:   ${rpad(fmt(c.transfer, c.currency), 20)}`)
      if (c.adjustment) console.log(`    Adjustments: ${rpad(fmt(c.adjustment, c.currency), 20)}`)
      if (c.fee) console.log(`    Fees:        ${rpad(fmt(c.fee, c.currency), 20)}`)
      console.log()
    }
  },

  async wallets() {
    const { data } = await api.wallets()
    console.log(JSON.stringify(data, null, 2))
  },

  async categories() {
    const { data } = await api.categories()
    for (const c of data) {
      console.log(`  ${pad(c.name, 30)} ${c.id}`)
    }
  },

  // ── New commands ────────────────────────────────────────────────────────

  async search() {
    const query = process.argv[3] ?? ''
    const flags = parseFlags(process.argv.slice(3))

    const { data: txns } = await api.searchTransactions({
      q: query && !query.startsWith('--') ? query : undefined,
      wallet: flags.wallet,
      category: flags.category,
      from: flags.from,
      to: flags.to,
      includeDeleted: flags['include-deleted'] === 'true',
    })

    console.log(`\n  Found ${txns.length} transactions\n`)
    printTxns(txns)
    console.log()
  },

  async delete() {
    const id = process.argv[3]
    if (!id) {
      console.error('  Usage: finance delete <transaction-id>')
      process.exit(1)
    }
    const result = await api.deleteTransaction(id)
    console.log(`  Soft-deleted transaction ${result.data.id}`)
    console.log(`  Deleted at: ${result.data.deletedAt}`)
    console.log(`  (Use "finance restore ${id}" to undo)`)
  },

  async restore() {
    const id = process.argv[3]
    if (!id) {
      console.error('  Usage: finance restore <transaction-id>')
      process.exit(1)
    }
    const result = await api.restoreTransaction(id)
    console.log(`  Restored transaction ${result.data.id}`)
  },

  async month() {
    const m = process.argv[3] ?? new Date().toISOString().slice(0, 7)
    const from = `${m}-01`
    const nextMonth = new Date(`${m}-01`)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    const to = nextMonth.toISOString().slice(0, 10)

    const flags = parseFlags(process.argv.slice(4))

    const { data: txns } = await api.searchTransactions({ from, to, wallet: flags.wallet })

    let income = 0, expense = 0
    const byCategory: Record<string, { total: number; count: number; currency: string }> = {}

    for (const tx of txns) {
      if (tx.amount > 0) income += tx.amount
      else expense += tx.amount
      const cat = tx.categoryName ?? 'Uncategorized'
      const entry = byCategory[cat] ??= { total: 0, count: 0, currency: tx.currency }
      entry.total += Math.abs(tx.amount)
      entry.count++
    }

    console.log(`\n  MONTHLY REPORT — ${m}\n`)
    console.log(`  Transactions:  ${txns.length}`)
    console.log(`  Income:        ${income.toFixed(2)}`)
    console.log(`  Expense:       ${expense.toFixed(2)}`)
    console.log(`  Net:           ${(income + expense).toFixed(2)}`)

    const sorted = Object.entries(byCategory).sort(([, a], [, b]) => b.total - a.total).slice(0, 15)
    if (sorted.length > 0) {
      console.log(`\n  TOP CATEGORIES\n`)
      for (const [name, data] of sorted) {
        console.log(`  ${pad(name, 25)} ${rpad(fmt(data.total, data.currency), 18)} ${rpad(String(data.count), 4)} txns`)
      }
    }
    console.log()
  },

  async reconcile() {
    const walletName = process.argv[3]
    const expectedStr = process.argv[4]
    if (!walletName || !expectedStr) {
      console.error('  Usage: finance reconcile <wallet-name> <expected-balance>')
      process.exit(1)
    }

    const { data: wallets } = await api.wallets()
    const wallet = wallets.find(w => w.name.toLowerCase() === walletName.toLowerCase())
    if (!wallet) {
      console.error(`  Wallet "${walletName}" not found`)
      process.exit(1)
    }

    const current = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
    const expected = parseFloat(expectedStr)
    const diff = Math.round((expected - current) * 100) / 100

    console.log(`\n  RECONCILE — ${wallet.name} (${wallet.currency})\n`)
    console.log(`  Current:   ${fmt(current, wallet.currency)}`)
    console.log(`  Expected:  ${fmt(expected, wallet.currency)}`)
    console.log(`  Difference: ${diff === 0 ? 'MATCH' : fmt(diff, wallet.currency)}`)

    if (diff !== 0) {
      console.log(`\n  To auto-adjust, use the MCP tool: finance_reconcile with autoAdjust=true`)
    }
    console.log()
  },

  async export() {
    const flags = parseFlags(process.argv.slice(3))

    const { data: txns } = await api.searchTransactions({
      wallet: flags.wallet,
      from: flags.from,
      to: flags.to,
    })

    // CSV header
    console.log('date,type,description,amount,currency,wallet,category,notes')
    for (const tx of txns) {
      const date = tx.transactionDate.slice(0, 10)
      const desc = tx.description.replace(/"/g, '""')
      const notes = (tx.notes ?? '').replace(/"/g, '""')
      const cat = tx.categoryName ?? ''
      console.log(`${date},${tx.type},"${desc}",${tx.amount},${tx.currency},"${tx.walletName}","${cat}","${notes}"`)
    }
  },

  async help() {
    console.log(`
  finance-os CLI

  Usage: finance <command> [options]

  Commands:
    balance                          Show wallet balances by currency
    recent                           Show recent transactions (last 50)
    spend                            Show spending by category
    summary                          Full financial overview
    wallets                          List wallets (JSON)
    categories                       List categories with IDs

    search <query> [flags]           Search transactions
      --wallet=<id>                    Filter by wallet ID
      --category=<id>                  Filter by category ID
      --from=YYYY-MM-DD               Start date
      --to=YYYY-MM-DD                 End date
      --include-deleted                Include soft-deleted

    delete <id>                      Soft-delete a transaction
    restore <id>                     Restore a deleted transaction

    month [YYYY-MM] [--wallet=<id>]  Monthly report (default: current month)
    reconcile <wallet> <balance>     Compare expected vs actual balance

    export [flags]                   Export transactions as CSV
      --wallet=<id>                    Filter by wallet
      --from=YYYY-MM-DD               Start date
      --to=YYYY-MM-DD                 End date

    help                             Show this help

  Environment:
    FINANCE_API_URL   API base URL (default: http://localhost:27032)
`)
  },
}

const cmd = process.argv[2] ?? 'help'
const fn = commands[cmd]
if (!fn) {
  console.error(`Unknown command: ${cmd}. Run "finance help" for usage.`)
  process.exit(1)
}
fn().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
