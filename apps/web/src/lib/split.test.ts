import { describe, expect, it } from 'vitest'
import * as server from '../../../api/src/split/math'
import {
  allocate,
  computeOwed,
  computeShares,
  currencyPrecision,
  emptySplitDraft,
  formatAmount,
  fromMinor,
  previewPaid,
  previewSplit,
  splitInputFromDraft,
  toMinor,
  type SplitInput,
} from './split'

const A = '00000000-0000-4000-8000-00000000000a'
const B = '00000000-0000-4000-8000-00000000000b'
const C = '00000000-0000-4000-8000-00000000000c'

describe('split math (client mirror)', () => {
  it('parses and prints minor units per currency precision', () => {
    expect(toMinor('12.5', 2)).toBe(1250n)
    expect(toMinor('1500', 0)).toBe(1500n)
    expect(() => toMinor('10.5', 0)).toThrow(/no decimals/)
    expect(() => toMinor('1.234', 2)).toThrow()
    expect(fromMinor(-1250n, 2)).toBe('-12.50')
    expect(fromMinor(1500n, 0)).toBe('1500')
    expect(currencyPrecision('JPY')).toBe(0)
    expect(currencyPrecision('EUR')).toBe(2)
  })

  it('gives remainder cents to the largest fractional part, ties to the lower id', () => {
    // 10.00 / 3: 3.33 each, one cent left; equal remainders so the lowest id gets it
    expect([...allocate(1000n, [{ id: C, weight: 1n }, { id: A, weight: 1n }, { id: B, weight: 1n }])]).toEqual([[C, 333n], [A, 334n], [B, 333n]])
    // 1.00 split 1:2 -> 33.33.. and 66.66..; the larger fraction (B) takes the cent
    const out = allocate(100n, [{ id: A, weight: 1n }, { id: B, weight: 2n }])
    expect(out.get(A)).toBe(33n)
    expect(out.get(B)).toBe(67n)
  })

  it('splits JPY with whole yen only', () => {
    const owed = computeOwed(1000n, 0, { method: 'equal', personIds: [A, B, C] })
    expect([owed.get(A), owed.get(B), owed.get(C)]).toEqual([334n, 333n, 333n])
  })

  it('handles exact, percent, shares and adjustment like the server', () => {
    const cases: SplitInput[] = [
      { method: 'exact', amounts: { [A]: '5.00', [B]: '15' } },
      { method: 'percent', percents: { [A]: '33.3333', [B]: '33.3333', [C]: '33.3334' } },
      { method: 'shares', shares: { [A]: '1', [B]: '2', [C]: '0.5' } },
      { method: 'adjustment', personIds: [A, B, C], adjustments: { [B]: '2.50' } },
    ]
    for (const split of cases) {
      expect([...computeOwed(2000n, 2, split)]).toEqual([...server.computeOwed(2000n, 2, split)])
    }
  })

  it('matches the server on randomised splits and payers', () => {
    let seed = 42
    const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n }
    const ids = [A, B, C]
    for (let i = 0; i < 300; i++) {
      const precision = rand(2) === 0 ? 0 : 2
      const cost = BigInt(1 + rand(100000))
      const people = ids.slice(0, 1 + rand(3))
      const method = (['equal', 'shares', 'adjustment', 'percent'] as const)[rand(4)]
      let split: SplitInput
      if (method === 'equal') split = { method, personIds: people }
      else if (method === 'shares') split = { method, shares: Object.fromEntries(people.map((p) => [p, String(1 + rand(5))])) }
      else if (method === 'adjustment') split = { method, personIds: people, adjustments: { [people[0]]: fromMinor(BigInt(rand(Number(cost) + 1)), precision) } }
      else {
        const first = rand(101)
        split = { method, percents: people.length === 1 ? { [people[0]]: '100' } : { [people[0]]: String(first), [people[1]]: String(100 - first), ...(people[2] ? { [people[2]]: '0' } : {}) } }
      }
      const paid = { kind: 'single' as const, personId: people[rand(people.length)] }
      expect(computeShares(cost, precision, paid, split)).toEqual(server.computeShares(cost, precision, paid, split))
    }
  })

  it('rejects the same inputs as the server', () => {
    expect(() => computeOwed(2000n, 2, { method: 'exact', amounts: { [A]: '5', [B]: '5' } })).toThrow(/add up to 10.00, not 20.00/)
    expect(() => computeOwed(2000n, 2, { method: 'percent', percents: { [A]: '50', [B]: '49' } })).toThrow(/100/)
    expect(() => computeOwed(100n, 2, { method: 'adjustment', personIds: [A], adjustments: { [A]: '2' } })).toThrow(/larger than the total/)
  })
})

describe('split editor preview', () => {
  const ids = [A, B]

  it('shows what is left for exact amounts', () => {
    const draft = { ...emptySplitDraft(ids), method: 'exact' as const, amounts: { [A]: '12' } }
    const p = previewSplit('20', 'EUR', draft, ids)
    expect(p.summary).toBe('€12.00 of €20.00 · €8.00 left')
    expect(p.error).toBe('€8.00 still to assign')
    expect(p.owed).toBeNull()
    const ok = previewSplit('20', 'EUR', { ...draft, amounts: { [A]: '12', [B]: '8' } }, ids)
    expect(ok.error).toBeNull()
    expect(ok.owed?.get(B)).toBe(800n)
  })

  it('tracks percentages and equal splits with excluded people', () => {
    const pct = previewSplit('10', 'EUR', { ...emptySplitDraft(ids), method: 'percent', percents: { [A]: '60' } }, ids)
    expect(pct.summary).toBe('60% of 100% · 40% left')
    expect(pct.error).toMatch(/100/)
    const eq = previewSplit('10', 'EUR', { ...emptySplitDraft(ids), included: [A] }, ids)
    expect(eq.owed?.get(A)).toBe(1000n)
    expect(eq.owed?.has(B)).toBe(false)
    expect(splitInputFromDraft({ ...emptySplitDraft(ids), included: [B] }, ids)).toEqual({ method: 'equal', personIds: [B] })
  })

  it('flags decimals on a currency without them', () => {
    const p = previewSplit('1000', 'JPY', { ...emptySplitDraft(ids), method: 'exact', amounts: { [A]: '500.5', [B]: '499.5' } }, ids)
    expect(p.error).toMatch(/no decimals/)
    const paid = previewPaid('1000', 'JPY', { mode: 'multiple', amounts: { [A]: '600' } }, ids)
    expect(paid.summary).toBe('¥600 of ¥1,000 · ¥400 left')
  })

  it('formats with the currency own decimals', () => {
    expect(formatAmount('1500', 'JPY')).toBe('¥1,500')
    expect(formatAmount('-128.40000000', 'EUR')).toBe('-€128.40')
  })
})
