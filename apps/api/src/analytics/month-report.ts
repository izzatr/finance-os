/**
 * Month report: the numbers behind the Reports page, computed in one display currency.
 *
 * Pure function so the arithmetic can be unit-tested without a database. The route
 * (routes/analytics.ts) loads raw income/expense rows plus split shares and passes them in.
 *
 * Definitions (these are what the UI sentences are built on, keep them in sync):
 * - spent    = your share of expenses: expense amount minus the split shares other people owe
 *              you on that transaction. Money you fronted for others is reported separately.
 * - income   = income-type transactions. Transfers, adjustments, fees and settlements are
 *              not income or spending.
 * - usual    = average of the up-to-3 calendar months before the report month that have any
 *              income or spending. Null when there is no earlier history.
 * - "by now" = cumulative spend up to the same day of the month (clamped to month length).
 */

export type ReportRow = {
  /** Entry sits in a Friends (shared balances) wallet. */
  friendsWallet?: boolean
  transactionId: string
  date: string // YYYY-MM-DD (transactions are calendar dates stored at 12:00 UTC)
  type: 'income' | 'expense'
  amount: number // signed entry amount in `currency`
  currency: string
  categoryId: string | null
  categoryName: string | null
  description: string
}

/**
 * A shared-expense projection: `friendsShare` is the part of the bill other people owe you
 * (a positive entry in your Friends wallet). When the payment itself is a separate (linked,
 * imported) transaction, `linkedTo` names it so both are reported as one purchase.
 */
export type SharedMeta = { transactionId: string; linkedTo: string | null }

export type SplitShare = { transactionId: string; currency: string; amount: number } // positive = owed to you

export type Converter = (amount: number, from: string) => number | null // null when no rate is known

export type MonthReport = {
  month: string
  currency: string
  daysInMonth: number
  /** Days of the month that have happened: full month for past months, today for the current one. */
  daysElapsed: number
  income: number
  spent: number
  fronted: number
  net: number
  savingsRate: number | null
  usual: { months: number; income: number; spent: number; net: number; savingsRate: number | null } | null
  pace: Array<{ day: number; current: number | null; usual: number | null }>
  spentByNow: number
  usualByNow: number | null
  categories: Array<{ id: string | null; name: string; spent: number; usual: number | null; count: number }>
  merchants: Array<{ name: string; spent: number; count: number }>
  biggest: Array<{ transactionId: string; description: string; date: string; spent: number; categoryName: string | null }>
  incomeSources: Array<{ name: string; amount: number }>
  history: Array<{ month: string; income: number; spent: number; net: number }>
  missing: string[]
}

const round = (n: number) => Math.round(n * 100) / 100

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

type Tx = {
  id: string
  date: string
  month: string
  day: number
  type: 'income' | 'expense'
  value: number // positive, display currency, your share for expenses
  fronted: number
  categoryId: string | null
  categoryName: string | null
  description: string
}

// A reference UUID plus any "for reservation:"-style lead-in words that only introduce it.
const UUID = /\s*(?:\b(?:for|reservation|ref|reference|id)\b\s*:?\s*)*\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/** A readable merchant/source name: bank exports append reference UUIDs and FX notes
 *  ("(USD 100.00) (USD 1 = IDR 17,643.74)") that make names long and stop grouping. */
export function displayName(description: string): string {
  const cleaned = description
    .replace(UUID, '')
    .replace(/\(\s*[A-Z]{3}\s+[\d.,]+\s*(=\s*[A-Z]{3}\s+[\d.,]+\s*)?\)/g, '')
    .replace(/[\s:,-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return cleaned || description.trim()
}

export function buildMonthReport(input: {
  month: string
  currency: string
  today: string // YYYY-MM-DD
  rows: ReportRow[]
  splits: SplitShare[]
  shared?: SharedMeta[]
  convert: Converter
}): MonthReport {
  const { month, currency, today, convert } = input
  const missing = new Set<string>()
  const conv = (amount: number, from: string) => {
    const v = convert(amount, from)
    if (v === null) missing.add(from)
    return v
  }

  // Split shares per transaction, in the display currency.
  const owed = new Map<string, number>()
  for (const s of input.splits) {
    const v = conv(s.amount, s.currency)
    if (v === null) continue
    owed.set(s.transactionId, (owed.get(s.transactionId) ?? 0) + v)
  }

  // One record per transaction (a transaction may have several entries, e.g. card + cash).
  const txs = new Map<string, Tx>()
  for (const r of input.rows) {
    const v = conv(r.amount, r.currency)
    if (v === null) continue
    const existing = txs.get(r.transactionId)
    if (existing) {
      existing.value += r.type === 'expense' ? -v : v
      continue
    }
    txs.set(r.transactionId, {
      id: r.transactionId,
      date: r.date,
      month: r.date.slice(0, 7),
      day: Number(r.date.slice(8, 10)),
      type: r.type,
      value: r.type === 'expense' ? -v : v,
      fronted: 0,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      description: r.description.trim(),
    })
  }
  for (const tx of txs.values()) {
    if (tx.type !== 'expense') continue
    // Never let a split push your share below zero (bad data, or someone owes more than the bill).
    const share = Math.min(Math.max(owed.get(tx.id) ?? 0, 0), Math.max(tx.value, 0))
    tx.fronted = share
    tx.value -= share
  }

  // Shared expenses: what friends owe you back already reduces the value (it is a positive entry in
  // the Friends wallet); report it as fronted. A projection linked to an imported payment is folded
  // into that payment so the purchase appears once, at your share.
  const friendsPart = new Map<string, number>()
  for (const r of input.rows) {
    if (!r.friendsWallet || r.type !== 'expense' || r.amount <= 0) continue
    const v = conv(r.amount, r.currency)
    if (v !== null) friendsPart.set(r.transactionId, (friendsPart.get(r.transactionId) ?? 0) + v)
  }
  for (const [id, v] of friendsPart) {
    const tx = txs.get(id)
    if (tx) tx.fronted += v
  }
  for (const m of input.shared ?? []) {
    if (!m.linkedTo) continue
    const proj = txs.get(m.transactionId)
    const target = txs.get(m.linkedTo)
    if (!proj || !target || proj.type !== 'expense' || target.type !== 'expense') continue
    target.value += proj.value
    target.fronted += proj.fronted
    txs.delete(m.transactionId)
  }

  const byMonth = new Map<string, Tx[]>()
  for (const tx of txs.values()) {
    const list = byMonth.get(tx.month) ?? []
    list.push(tx)
    byMonth.set(tx.month, list)
  }
  const totals = (m: string) => {
    let income = 0
    let spent = 0
    let fronted = 0
    for (const tx of byMonth.get(m) ?? []) {
      if (tx.type === 'income') income += tx.value
      else { spent += tx.value; fronted += tx.fronted }
    }
    return { income, spent, fronted }
  }
  const rate = (income: number, spent: number) => (income > 0 ? round(((income - spent) / income) * 100) : null)

  const daysInMonth = daysIn(month)
  const todayMonth = today.slice(0, 7)
  const daysElapsed = todayMonth > month ? daysInMonth : todayMonth < month ? 0 : Math.min(Number(today.slice(8, 10)), daysInMonth)

  const current = totals(month)

  // Baseline months: the up-to-3 previous months that have any activity.
  const baseline: string[] = []
  for (let i = 1; i <= 3; i += 1) {
    const m = shiftMonth(month, -i)
    if ((byMonth.get(m) ?? []).length > 0) baseline.push(m)
  }
  let usual: MonthReport['usual'] = null
  if (baseline.length > 0) {
    const sums = baseline.map(totals).reduce((a, b) => ({ income: a.income + b.income, spent: a.spent + b.spent, fronted: 0 }))
    const income = sums.income / baseline.length
    const spent = sums.spent / baseline.length
    usual = { months: baseline.length, income: round(income), spent: round(spent), net: round(income - spent), savingsRate: rate(income, spent) }
  }

  // Cumulative daily spend, this month vs the baseline average at the same day.
  const dailySpend = (m: string) => {
    const days = new Array<number>(daysIn(m) + 1).fill(0)
    for (const tx of byMonth.get(m) ?? []) if (tx.type === 'expense') days[tx.day] += tx.value
    return days
  }
  const cumulative = (days: number[], day: number) => {
    let sum = 0
    for (let d = 1; d <= Math.min(day, days.length - 1); d += 1) sum += days[d]
    return sum
  }
  const currentDaily = dailySpend(month)
  const baselineDaily = baseline.map(dailySpend)
  // On the report month's last day, "usual by now" is a whole usual month, so a 30-day month
  // is compared with all of a 31-day baseline month (and matches `usual.spent` exactly).
  const usualAt = (day: number) => (baselineDaily.length
    ? baselineDaily.reduce((s, days) => s + cumulative(days, day >= daysInMonth ? days.length : day), 0) / baselineDaily.length
    : null)
  const pace = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const u = usualAt(day)
    return { day, current: day <= daysElapsed ? round(cumulative(currentDaily, day)) : null, usual: u === null ? null : round(u) }
  })
  const usualByNowRaw = usualAt(daysElapsed)

  // Categories this month, plus categories that are usually there but not (yet) this month.
  const catKey = (tx: Tx) => tx.categoryId ?? '__none__'
  const cats = new Map<string, { id: string | null; name: string; spent: number; base: number; count: number }>()
  const touch = (tx: Tx) => {
    const k = catKey(tx)
    if (!cats.has(k)) cats.set(k, { id: tx.categoryId, name: tx.categoryName ?? 'Uncategorized', spent: 0, base: 0, count: 0 })
    return cats.get(k)!
  }
  for (const tx of byMonth.get(month) ?? []) {
    if (tx.type !== 'expense') continue
    const c = touch(tx)
    c.spent += tx.value
    c.count += 1
  }
  for (const m of baseline) {
    for (const tx of byMonth.get(m) ?? []) if (tx.type === 'expense') touch(tx).base += tx.value
  }
  const categories = [...cats.values()]
    .map((c) => ({ id: c.id, name: c.name, spent: round(c.spent), usual: baseline.length ? round(c.base / baseline.length) : null, count: c.count }))
    .filter((c) => c.spent > 0 || (c.usual ?? 0) > 0)
    .sort((a, b) => b.spent - a.spent || (b.usual ?? 0) - (a.usual ?? 0))

  const monthTx = (byMonth.get(month) ?? []).filter((tx) => tx.type === 'expense' && tx.value > 0)
  const merchantMap = new Map<string, { name: string; spent: number; count: number }>()
  for (const tx of monthTx) {
    if (!tx.description) continue
    const name = displayName(tx.description)
    const k = name.toLowerCase()
    const m = merchantMap.get(k) ?? { name, spent: 0, count: 0 }
    m.spent += tx.value
    m.count += 1
    merchantMap.set(k, m)
  }
  const merchants = [...merchantMap.values()].sort((a, b) => b.spent - a.spent).slice(0, 5).map((m) => ({ ...m, spent: round(m.spent) }))

  const biggest = [...monthTx]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((tx) => ({ transactionId: tx.id, description: tx.description || 'Expense', date: tx.date, spent: round(tx.value), categoryName: tx.categoryName }))

  const sources = new Map<string, number>()
  for (const tx of byMonth.get(month) ?? []) {
    if (tx.type !== 'income') continue
    const k = tx.categoryName ?? (tx.description ? displayName(tx.description) : 'Other income')
    sources.set(k, (sources.get(k) ?? 0) + tx.value)
  }
  const incomeSources = [...sources.entries()].map(([name, amount]) => ({ name, amount: round(amount) })).sort((a, b) => b.amount - a.amount)

  const history = Array.from({ length: 12 }, (_, i) => {
    const m = shiftMonth(month, i - 11)
    const t = totals(m)
    return { month: m, income: round(t.income), spent: round(t.spent), net: round(t.income - t.spent) }
  })

  return {
    month,
    currency,
    daysInMonth,
    daysElapsed,
    income: round(current.income),
    spent: round(current.spent),
    fronted: round(current.fronted),
    net: round(current.income - current.spent),
    savingsRate: rate(current.income, current.spent),
    usual,
    pace,
    spentByNow: round(cumulative(currentDaily, daysElapsed)),
    usualByNow: usualByNowRaw === null ? null : round(usualByNowRaw),
    categories,
    merchants,
    biggest,
    incomeSources,
    history,
    missing: [...missing].sort(),
  }
}
