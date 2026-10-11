/**
 * Client mirror of the server's shared-expense math (apps/api/src/split/math.ts), used for live
 * previews in the split editor. Everything works in integer minor units (bigint) so the numbers
 * shown before saving are exactly what the server will store.
 */
import { currencySymbol } from './format'

export class SplitMathError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'SplitMathError'
    this.code = code
  }
}

const DECIMAL_RE = /^-?\d+(\.\d+)?$/

/** Minor-unit digits of an ISO currency (JPY 0, EUR 2, ...), as the server derives them. */
export function currencyPrecision(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** Parses a decimal string into minor units. Rejects values finer than the currency allows. */
export function toMinor(value: string, precision: number): bigint {
  const v = value.trim()
  if (!DECIMAL_RE.test(v)) throw new SplitMathError('INVALID_AMOUNT', `Not a decimal amount: ${value}`)
  const negative = v.startsWith('-')
  const [whole, frac = ''] = (negative ? v.slice(1) : v).split('.')
  const trimmed = frac.replace(/0+$/, '')
  if (trimmed.length > precision) {
    throw new SplitMathError('INVALID_AMOUNT', precision === 0 ? `${value}: this currency has no decimals` : `${value} has more than ${precision} decimals`)
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

function toWeight(value: string, label: string): bigint {
  const v = value.trim()
  if (!/^\d+(\.\d{1,4})?$/.test(v)) throw new SplitMathError('INVALID_SPLIT', `${label} must be a number with at most 4 decimals`)
  const [whole, frac = ''] = v.split('.')
  return BigInt(whole) * 10000n + BigInt((frac + '0000').slice(0, 4))
}

/** Largest-remainder allocation; ties on the remainder go to the lower id (same as the server). */
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

export type SplitMethod = SplitInput['method']
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

export function computeShares(cost: bigint, precision: number, paid: PaidInput, split: SplitInput): Share[] {
  if (cost <= 0n) throw new SplitMathError('INVALID_AMOUNT', 'The total must be more than zero')
  const paidMap = computePaid(cost, precision, paid)
  const owedMap = computeOwed(cost, precision, split)
  const ids = [...new Set([...paidMap.keys(), ...owedMap.keys()])].sort()
  return ids
    .map((personId) => ({ personId, paid: paidMap.get(personId) ?? 0n, owed: owedMap.get(personId) ?? 0n }))
    .filter((s) => s.paid !== 0n || s.owed !== 0n)
}

// ---------------------------------------------------------------------------------------------
// Editor helpers

/** Empty or malformed numbers count as zero for running totals; the final check is stricter. */
function looseMinor(value: string | undefined, precision: number): bigint | null {
  const v = (value ?? '').trim().replace(',', '.')
  if (!v) return 0n
  try {
    return toMinor(v, precision)
  } catch {
    return null
  }
}

function looseWeight(value: string | undefined): bigint | null {
  const v = (value ?? '').trim().replace(',', '.')
  if (!v) return 0n
  try {
    return toWeight(v, 'Value')
  } catch {
    return null
  }
}

/** Cleans a typed number ("12,5" -> "12.5", "" -> "0") for the payload. */
export function cleanNumber(value: string | undefined): string {
  const v = (value ?? '').trim().replace(',', '.')
  return v === '' ? '0' : v
}

export type SplitDraft = {
  method: SplitMethod
  /** Who is in the split for equal / adjustment. */
  included: string[]
  amounts: Record<string, string>
  percents: Record<string, string>
  shares: Record<string, string>
  adjustments: Record<string, string>
}

export function emptySplitDraft(personIds: string[]): SplitDraft {
  return { method: 'equal', included: [...personIds], amounts: {}, percents: {}, shares: {}, adjustments: {} }
}

/** Turns the editor state into the API's split input for the given participants. */
export function splitInputFromDraft(draft: SplitDraft, participants: string[]): SplitInput {
  const pick = (rec: Record<string, string>) => Object.fromEntries(participants.map((id) => [id, cleanNumber(rec[id])]))
  switch (draft.method) {
    case 'equal':
      return { method: 'equal', personIds: participants.filter((id) => draft.included.includes(id)) }
    case 'exact':
      return { method: 'exact', amounts: pick(draft.amounts) }
    case 'percent':
      return { method: 'percent', percents: pick(draft.percents) }
    case 'shares':
      return { method: 'shares', shares: pick(draft.shares) }
    case 'adjustment': {
      const ids = participants.filter((id) => draft.included.includes(id))
      return {
        method: 'adjustment',
        personIds: ids,
        adjustments: Object.fromEntries(ids.filter((id) => (draft.adjustments[id] ?? '').trim() !== '').map((id) => [id, cleanNumber(draft.adjustments[id])])),
      }
    }
  }
}

/** Seeds the editor from a saved split (editing an expense). */
export function draftFromSplitInput(split: SplitInput | null | undefined, participants: string[]): SplitDraft {
  const base = emptySplitDraft(participants)
  if (!split) return base
  switch (split.method) {
    case 'equal':
      return { ...base, included: [...split.personIds] }
    case 'exact':
      return { ...base, method: 'exact', amounts: { ...split.amounts } }
    case 'percent':
      return { ...base, method: 'percent', percents: { ...split.percents } }
    case 'shares':
      return { ...base, method: 'shares', shares: { ...split.shares } }
    case 'adjustment':
      return { ...base, method: 'adjustment', included: [...split.personIds], adjustments: { ...split.adjustments } }
  }
}

export type SplitPreview = {
  /** Each person's share when the split is valid. */
  owed: Map<string, bigint> | null
  /** One plain sentence about what is still missing, or null when it adds up. */
  error: string | null
  /** Footer text, e.g. "€12.00 of €20.00 · €8.00 left". */
  summary: string
}

/** Live state of the split editor: per-person amounts, a running total and what is left. */
export function previewSplit(costText: string, currency: string, draft: SplitDraft, participants: string[]): SplitPreview {
  const precision = currencyPrecision(currency)
  const cost = looseMinor(costText, precision) ?? 0n
  const fmt = (v: bigint) => formatMinor(v, currency)
  let summary = ''
  let error: string | null = null

  if (draft.method === 'equal' || draft.method === 'adjustment') {
    const ids = participants.filter((id) => draft.included.includes(id))
    if (ids.length === 0) error = 'Pick at least one person'
    if (draft.method === 'equal') {
      summary = ids.length ? `${fmt(cost / BigInt(ids.length))}/person · ${ids.length} ${ids.length === 1 ? 'person' : 'people'}` : 'Nobody selected'
    } else {
      let adj = 0n
      for (const id of ids) {
        const v = looseMinor(draft.adjustments[id], precision)
        if (v === null) error = 'Use plain amounts for adjustments'
        else adj += v
      }
      summary = `${fmt(adj)} in adjustments · ${fmt(cost - adj > 0n ? cost - adj : 0n)} shared equally`
      if (!error && adj > cost) error = 'Adjustments are larger than the total'
    }
  } else if (draft.method === 'exact') {
    let sum = 0n
    for (const id of participants) {
      const v = looseMinor(draft.amounts[id], precision)
      if (v === null) error = precision === 0 ? `${currency} has no decimals` : 'Use plain amounts like 12.50'
      else sum += v
    }
    const left = cost - sum
    summary = `${fmt(sum)} of ${fmt(cost)} · ${left >= 0n ? `${fmt(left)} left` : `${fmt(-left)} over`}`
    if (!error && left !== 0n) error = left > 0n ? `${fmt(left)} still to assign` : `${fmt(-left)} too much`
  } else if (draft.method === 'percent') {
    let sum = 0n
    for (const id of participants) {
      const v = looseWeight(draft.percents[id])
      if (v === null) error = 'Percentages can have at most 4 decimals'
      else sum += v
    }
    const left = 100n * 10000n - sum
    summary = `${weightText(sum)}% of 100% · ${left >= 0n ? `${weightText(left)}% left` : `${weightText(-left)}% over`}`
    if (!error && left !== 0n) error = 'Percentages must add up to 100'
  } else {
    let sum = 0n
    for (const id of participants) {
      const v = looseWeight(draft.shares[id])
      if (v === null) error = 'Shares can have at most 4 decimals'
      else sum += v
    }
    summary = `${weightText(sum)} ${sum === 10000n ? 'share' : 'shares'} in total`
    if (!error && sum === 0n) error = 'Give at least one person a share'
  }

  let owed: Map<string, bigint> | null = null
  if (!error && cost > 0n) {
    try {
      owed = computeOwed(cost, precision, splitInputFromDraft(draft, participants))
    } catch (err) {
      error = err instanceof Error ? err.message : 'This split does not add up'
    }
  }
  return { owed, error, summary }
}

function weightText(v: bigint): string {
  const whole = v / 10000n
  const frac = (v % 10000n).toString().padStart(4, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export type PaidDraft = { mode: 'single'; personId: string } | { mode: 'multiple'; amounts: Record<string, string> }

export function paidInputFromDraft(draft: PaidDraft, participants: string[]): PaidInput {
  if (draft.mode === 'single') return { kind: 'single', personId: draft.personId }
  return {
    kind: 'multiple',
    amounts: Object.fromEntries(participants.filter((id) => (draft.amounts[id] ?? '').trim() !== '').map((id) => [id, cleanNumber(draft.amounts[id])])),
  }
}

/** Running total for "paid by multiple people". */
export function previewPaid(costText: string, currency: string, draft: PaidDraft, participants: string[]): { error: string | null; summary: string } {
  if (draft.mode === 'single') return { error: participants.includes(draft.personId) ? null : 'Pick who paid', summary: '' }
  const precision = currencyPrecision(currency)
  const cost = looseMinor(costText, precision) ?? 0n
  let sum = 0n
  let error: string | null = null
  for (const id of participants) {
    const v = looseMinor(draft.amounts[id], precision)
    if (v === null) error = precision === 0 ? `${currency} has no decimals` : 'Use plain amounts like 12.50'
    else sum += v
  }
  const left = cost - sum
  const summary = `${formatMinor(sum, currency)} of ${formatMinor(cost, currency)} · ${left >= 0n ? `${formatMinor(left, currency)} left` : `${formatMinor(-left, currency)} over`}`
  if (!error && left !== 0n) error = left > 0n ? `${formatMinor(left, currency)} still unpaid` : `${formatMinor(-left, currency)} too much`
  return { error, summary }
}

// ---------------------------------------------------------------------------------------------
// Display

export function currencySymbolFor(currency: string): string {
  return currencySymbol(currency)
}

/** `€12.50`, `¥1,500`, `Rp50.000`, with the currency's own decimals. */
export function formatMinor(value: bigint, currency: string): string {
  return formatAmount(fromMinor(value, currencyPrecision(currency)), currency)
}

/** Formats a decimal string or number with the currency's own decimals. Sign is a leading minus. */
export function formatAmount(amount: string | number, currency: string): string {
  const num = typeof amount === 'string' ? Number(amount) : amount
  const precision = currencyPrecision(currency)
  const abs = Math.abs(num)
  const text = currency === 'IDR'
    ? abs.toLocaleString('id-ID', { maximumFractionDigits: 0 })
    : abs.toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision })
  return `${num < 0 ? '-' : ''}${currencySymbol(currency)}${text}`
}

/** "owes you €40.00" / "you owe €12.00" for one signed balance (positive = they owe me). */
export function balancePhrase(amount: string | number, currency: string): string {
  const num = typeof amount === 'string' ? Number(amount) : amount
  return num >= 0 ? `owes you ${formatAmount(num, currency)}` : `you owe ${formatAmount(-num, currency)}`
}

export function isZeroAmount(amount: string): boolean {
  return /^-?0*(\.0*)?$/.test(amount.trim())
}
