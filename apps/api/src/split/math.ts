/**
 * Pure money math for shared expenses. Everything works in integer minor units (bigint) so
 * sums are exact; decimal strings only exist at the edges.
 */

export class SplitMathError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'SplitMathError'
    this.code = code
  }
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

/** Parses a decimal string into minor units. Rejects values finer than the currency allows. */
export function toMinor(value: string, precision: number): bigint {
  const v = value.trim()
  if (!DECIMAL_RE.test(v)) throw new SplitMathError('INVALID_AMOUNT', `Not a decimal amount: ${value}`)
  const negative = v.startsWith('-')
  const [whole, frac = ''] = (negative ? v.slice(1) : v).split('.')
  // numeric(20,8) holds 12 integer digits; refuse anything bigger before it reaches the database.
  if (whole.replace(/^0+/, '').length > 12) throw new SplitMathError('AMOUNT_TOO_LARGE', 'That amount is too large')
  const trimmed = frac.replace(/0+$/, '')
  if (trimmed.length > precision) {
    throw new SplitMathError('INVALID_AMOUNT', `${value} has more decimals than the currency allows (${precision})`)
  }
  const minor = BigInt(whole) * 10n ** BigInt(precision) + BigInt((trimmed + '0'.repeat(precision)).slice(0, precision) || '0')
  return negative ? -minor : minor
}

export function fromMinor(value: bigint, precision: number): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  if (precision === 0) return `${negative ? '-' : ''}${abs}`
  const factor = 10n ** BigInt(precision)
  const whole = abs / factor
  const frac = (abs % factor).toString().padStart(precision, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

/** Parses a non-negative decimal weight (percent or share) into an integer scaled by 10^4. */
function toWeight(value: string, label: string): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d{1,4})?$/.test(v)) throw new SplitMathError('INVALID_SPLIT', `${label} must be a number with at most 4 decimals`)
  const [whole, frac = ''] = v.split('.')
  return BigInt(whole) * 10000n + BigInt((frac + '0000').slice(0, 4))
}

/**
 * Largest-remainder allocation of `total` across weighted ids. Deterministic: ties on the
 * fractional part go to the lower id. Total and weights must be non-negative.
 */
export function allocate(total: bigint, weights: Array<{ id: string; weight: bigint }>): Map<string, bigint> {
  const sumW = weights.reduce((acc, w) => acc + w.weight, 0n)
  if (sumW <= 0n) throw new SplitMathError('INVALID_SPLIT', 'Weights must add up to more than zero')
  if (total < 0n) throw new SplitMathError('INVALID_SPLIT', 'Cannot allocate a negative total')
  const parts = weights.map((w) => ({ id: w.id, base: (total * w.weight) / sumW, rem: (total * w.weight) % sumW }))
  let left = total - parts.reduce((acc, p) => acc + p.base, 0n)
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.rem > b.rem ? -1 : 1))
  const out = new Map(parts.map((p) => [p.id, p.base]))
  for (const p of order) {
    if (left === 0n) break
    out.set(p.id, out.get(p.id)! + 1n)
    left -= 1n
  }
  return out
}

export type PaidInput =
  | { kind: 'single'; personId: string }
  | { kind: 'multiple'; amounts: Record<string, string> }

export type SplitInput =
  | { method: 'equal'; personIds: string[] }
  | { method: 'exact'; amounts: Record<string, string> }
  | { method: 'percent'; percents: Record<string, string> }
  | { method: 'shares'; shares: Record<string, string> }
  | { method: 'adjustment'; personIds: string[]; adjustments: Record<string, string> }

export type Share = { personId: string; paid: bigint; owed: bigint }

function uniqueIds(ids: string[], label: string): string[] {
  if (ids.length === 0) throw new SplitMathError('INVALID_SPLIT', `${label} needs at least one person`)
  if (new Set(ids).size !== ids.length) throw new SplitMathError('INVALID_SPLIT', `${label} lists a person twice`)
  return ids
}

export function computeOwed(cost: bigint, precision: number, split: SplitInput): Map<string, bigint> {
  switch (split.method) {
    case 'equal': {
      const ids = uniqueIds(split.personIds, 'An equal split')
      return allocate(cost, ids.map((id) => ({ id, weight: 1n })))
    }
    case 'exact': {
      const entries = Object.entries(split.amounts)
      uniqueIds(entries.map(([id]) => id), 'An exact split')
      const out = new Map<string, bigint>()
      for (const [id, amount] of entries) {
        const v = toMinor(amount, precision)
        if (v < 0n) throw new SplitMathError('INVALID_SPLIT', 'Amounts cannot be negative')
        out.set(id, v)
      }
      const sum = [...out.values()].reduce((a, b) => a + b, 0n)
      if (sum !== cost) {
        throw new SplitMathError('SPLIT_TOTAL_MISMATCH', `Amounts add up to ${fromMinor(sum, precision)}, not ${fromMinor(cost, precision)}`)
      }
      return out
    }
    case 'percent': {
      const entries = Object.entries(split.percents)
      uniqueIds(entries.map(([id]) => id), 'A percentage split')
      const weights = entries.map(([id, p]) => ({ id, weight: toWeight(p, 'A percentage') }))
      const sum = weights.reduce((a, w) => a + w.weight, 0n)
      if (sum !== 100n * 10000n) throw new SplitMathError('SPLIT_TOTAL_MISMATCH', 'Percentages must add up to 100')
      return allocate(cost, weights)
    }
    case 'shares': {
      const entries = Object.entries(split.shares)
      uniqueIds(entries.map(([id]) => id), 'A split by shares')
      const weights = entries.map(([id, s]) => ({ id, weight: toWeight(s, 'A share') }))
      return allocate(cost, weights)
    }
    case 'adjustment': {
      const ids = uniqueIds(split.personIds, 'An adjustment split')
      const adj = new Map<string, bigint>()
      for (const [id, amount] of Object.entries(split.adjustments)) {
        if (!ids.includes(id)) throw new SplitMathError('INVALID_SPLIT', 'Adjustments must belong to someone in the split')
        const v = toMinor(amount, precision)
        if (v < 0n) throw new SplitMathError('INVALID_SPLIT', 'Adjustments cannot be negative')
        adj.set(id, v)
      }
      const adjTotal = [...adj.values()].reduce((a, b) => a + b, 0n)
      if (adjTotal > cost) throw new SplitMathError('SPLIT_TOTAL_MISMATCH', 'Adjustments are larger than the total')
      const equal = allocate(cost - adjTotal, ids.map((id) => ({ id, weight: 1n })))
      return new Map(ids.map((id) => [id, equal.get(id)! + (adj.get(id) ?? 0n)]))
    }
    default:
      throw new SplitMathError('INVALID_SPLIT', 'Unknown split method')
  }
}

export function computePaid(cost: bigint, precision: number, paid: PaidInput): Map<string, bigint> {
  if (paid.kind === 'single') return new Map([[paid.personId, cost]])
  const entries = Object.entries(paid.amounts)
  uniqueIds(entries.map(([id]) => id), 'Paid by')
  const out = new Map<string, bigint>()
  for (const [id, amount] of entries) {
    const v = toMinor(amount, precision)
    if (v < 0n) throw new SplitMathError('INVALID_SPLIT', 'Paid amounts cannot be negative')
    if (v > 0n) out.set(id, v)
  }
  const sum = [...out.values()].reduce((a, b) => a + b, 0n)
  if (sum !== cost) {
    throw new SplitMathError('PAID_TOTAL_MISMATCH', `Paid amounts add up to ${fromMinor(sum, precision)}, not ${fromMinor(cost, precision)}`)
  }
  return out
}

/** Combines paid and owed maps into share rows; drops people with nothing paid and nothing owed. */
export function computeShares(cost: bigint, precision: number, paid: PaidInput, split: SplitInput): Share[] {
  if (cost <= 0n) throw new SplitMathError('INVALID_AMOUNT', 'The total must be more than zero')
  const paidMap = computePaid(cost, precision, paid)
  const owedMap = computeOwed(cost, precision, split)
  const ids = [...new Set([...paidMap.keys(), ...owedMap.keys()])].sort()
  const shares = ids
    .map((personId) => ({ personId, paid: paidMap.get(personId) ?? 0n, owed: owedMap.get(personId) ?? 0n }))
    .filter((s) => s.paid !== 0n || s.owed !== 0n)
  validateShares(cost, shares)
  return shares
}

export function validateShares(cost: bigint, shares: Share[]): void {
  if (new Set(shares.map((s) => s.personId)).size !== shares.length) {
    throw new SplitMathError('INVALID_SPLIT', 'A person appears twice')
  }
  let paid = 0n
  let owed = 0n
  for (const s of shares) {
    if (s.paid < 0n || s.owed < 0n) throw new SplitMathError('INVALID_SPLIT', 'Shares cannot be negative')
    paid += s.paid
    owed += s.owed
  }
  if (paid !== cost) throw new SplitMathError('PAID_TOTAL_MISMATCH', 'What people paid must add up to the total')
  if (owed !== cost) throw new SplitMathError('SPLIT_TOTAL_MISMATCH', 'What people owe must add up to the total')
}

export type Debt = { from: string; to: string; amount: bigint }

/**
 * Who owes whom for one expense. Each debtor's shortfall is spread over the creditors in
 * proportion to what they are owed (largest remainder), so the result is exact.
 */
export function pairwiseDebts(shares: Share[]): Debt[] {
  const creditors = shares
    .map((s) => ({ id: s.personId, net: s.paid - s.owed }))
    .filter((s) => s.net > 0n)
  const debtors = shares
    .map((s) => ({ id: s.personId, net: s.owed - s.paid }))
    .filter((s) => s.net > 0n)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
  if (creditors.length === 0 || debtors.length === 0) return []
  // Every debtor but the last splits their shortfall over creditors in proportion to each
  // creditor's claim (capped at what that creditor still has open). The last debtor takes exactly
  // what is left, which equals their shortfall because claims and shortfalls have equal totals.
  const debts: Debt[] = []
  const creditorLeft = new Map(creditors.map((c) => [c.id, c.net]))
  for (const [i, d] of debtors.entries()) {
    const isLast = i === debtors.length - 1
    const alloc = isLast
      ? new Map([...creditorLeft.entries()])
      : allocateCapped(d.net, creditors.map((c) => ({ id: c.id, weight: c.net })), creditorLeft)
    for (const [cid, amount] of alloc) {
      if (amount === 0n) continue
      creditorLeft.set(cid, creditorLeft.get(cid)! - amount)
      debts.push({ from: d.id, to: cid, amount })
    }
  }
  return debts
}

/** Proportional allocation that never takes more from a creditor than they have left. */
function allocateCapped(
  amount: bigint,
  weights: Array<{ id: string; weight: bigint }>,
  left: Map<string, bigint>,
): Map<string, bigint> {
  const raw = allocate(amount, weights)
  let overflow = 0n
  for (const [id, v] of raw) {
    const cap = left.get(id)!
    if (v > cap) {
      overflow += v - cap
      raw.set(id, cap)
    }
  }
  // Hand any capped overflow to creditors with room, lowest id first (only ever a few units).
  for (const w of [...weights].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (overflow === 0n) break
    const room = left.get(w.id)! - raw.get(w.id)!
    const take = room < overflow ? room : overflow
    raw.set(w.id, raw.get(w.id)! + take)
    overflow -= take
  }
  return raw
}

export type Transfer = { from: string; to: string; amount: bigint }

/**
 * Minimal settle-up plan from net balances (positive = is owed). Greedy largest-first; produces
 * at most n-1 transfers and preserves every person's net.
 */
export function simplifyDebts(nets: Map<string, bigint>): Transfer[] {
  const creditors = [...nets].filter(([, v]) => v > 0n).map(([id, v]) => ({ id, v }))
  const debtors = [...nets].filter(([, v]) => v < 0n).map(([id, v]) => ({ id, v: -v }))
  const sum = creditors.reduce((a, c) => a + c.v, 0n) - debtors.reduce((a, d) => a + d.v, 0n)
  if (sum !== 0n) throw new SplitMathError('UNBALANCED', 'Balances do not add up to zero')
  const byLargest = (a: { id: string; v: bigint }, b: { id: string; v: bigint }) =>
    a.v === b.v ? (a.id < b.id ? -1 : 1) : a.v > b.v ? -1 : 1
  const out: Transfer[] = []
  while (creditors.length && debtors.length) {
    creditors.sort(byLargest)
    debtors.sort(byLargest)
    const c = creditors[0]
    const d = debtors[0]
    const amount = c.v < d.v ? c.v : d.v
    out.push({ from: d.id, to: c.id, amount })
    c.v -= amount
    d.v -= amount
    if (c.v === 0n) creditors.shift()
    if (d.v === 0n) debtors.shift()
  }
  return out
}

/** Nets a list of directed debts into one signed amount per unordered pair. */
export function netPairs(debts: Debt[]): Transfer[] {
  const pair = new Map<string, bigint>()
  for (const d of debts) {
    const [a, b] = d.from < d.to ? [d.from, d.to] : [d.to, d.from]
    const key = `${a}|${b}`
    // positive = a owes b
    pair.set(key, (pair.get(key) ?? 0n) + (d.from === a ? d.amount : -d.amount))
  }
  const out: Transfer[] = []
  for (const [key, v] of pair) {
    if (v === 0n) continue
    const [a, b] = key.split('|')
    out.push(v > 0n ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v })
  }
  return out.sort((x, y) => (x.from + x.to < y.from + y.to ? -1 : 1))
}
