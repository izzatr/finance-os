import { describe, expect, it } from 'vitest'
import {
  allocate,
  computeShares,
  fromMinor,
  netPairs,
  pairwiseDebts,
  simplifyDebts,
  SplitMathError,
  toMinor,
  type Share,
} from '../split/math'

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n)
const owedOf = (shares: Share[]) => Object.fromEntries(shares.map((s) => [s.personId, fromMinor(s.owed, 2)]))

describe('toMinor / fromMinor', () => {
  it('round-trips amounts at the currency precision', () => {
    expect(toMinor('12.34', 2)).toBe(1234n)
    expect(toMinor('12.3', 2)).toBe(1230n)
    expect(toMinor('12', 2)).toBe(1200n)
    expect(toMinor('12.3400', 2)).toBe(1234n)
    expect(toMinor('-0.05', 2)).toBe(-5n)
    expect(toMinor('1500', 0)).toBe(1500n)
    expect(fromMinor(1234n, 2)).toBe('12.34')
    expect(fromMinor(-5n, 2)).toBe('-0.05')
    expect(fromMinor(1500n, 0)).toBe('1500')
  })

  it('rejects amounts finer than the currency allows and garbage', () => {
    expect(() => toMinor('1.005', 2)).toThrow(SplitMathError)
    expect(() => toMinor('10.5', 0)).toThrow(SplitMathError)
    expect(() => toMinor('abc', 2)).toThrow(SplitMathError)
    expect(() => toMinor('1e5', 2)).toThrow(SplitMathError)
    expect(() => toMinor('NaN', 2)).toThrow(SplitMathError)
  })
})

describe('allocate', () => {
  it('gives remainders to the largest fractional parts, ties by id', () => {
    const out = allocate(1000n, [{ id: 'b', weight: 1n }, { id: 'a', weight: 1n }, { id: 'c', weight: 1n }])
    expect(out.get('a')).toBe(334n)
    expect(out.get('b')).toBe(333n)
    expect(out.get('c')).toBe(333n)
  })
})

describe('computeShares', () => {
  it('splits equally with the extra cent going deterministically', () => {
    const shares = computeShares(10000n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: ['a', 'b', 'c'] })
    expect(owedOf(shares)).toEqual({ a: '33.34', b: '33.33', c: '33.33' })
    expect(shares.find((s) => s.personId === 'a')!.paid).toBe(10000n)
  })

  it('supports an equal split that excludes the payer', () => {
    const shares = computeShares(6000n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: ['b', 'c'] })
    expect(shares).toEqual([
      { personId: 'a', paid: 6000n, owed: 0n },
      { personId: 'b', paid: 0n, owed: 3000n },
      { personId: 'c', paid: 0n, owed: 3000n },
    ])
  })

  it('checks exact amounts add up', () => {
    expect(() => computeShares(2000n, 2, { kind: 'single', personId: 'a' }, { method: 'exact', amounts: { a: '5', b: '10' } }))
      .toThrow(/add up to 15.00, not 20.00/)
    const ok = computeShares(2000n, 2, { kind: 'single', personId: 'a' }, { method: 'exact', amounts: { a: '5', b: '15' } })
    expect(owedOf(ok)).toEqual({ a: '5.00', b: '15.00' })
  })

  it('splits by percent and requires 100', () => {
    expect(() => computeShares(1000n, 2, { kind: 'single', personId: 'a' }, { method: 'percent', percents: { a: '50', b: '40' } }))
      .toThrow(/100/)
    const ok = computeShares(1000n, 2, { kind: 'single', personId: 'a' }, { method: 'percent', percents: { a: '33.3333', b: '33.3333', c: '33.3334' } })
    expect(sum(ok.map((s) => s.owed))).toBe(1000n)
  })

  it('splits by shares', () => {
    const ok = computeShares(9000n, 2, { kind: 'single', personId: 'a' }, { method: 'shares', shares: { a: '1', b: '2' } })
    expect(owedOf(ok)).toEqual({ a: '30.00', b: '60.00' })
  })

  it('splits by adjustment: extras first, the rest equally', () => {
    const ok = computeShares(10000n, 2, { kind: 'single', personId: 'a' }, {
      method: 'adjustment', personIds: ['a', 'b'], adjustments: { b: '20' },
    })
    expect(owedOf(ok)).toEqual({ a: '40.00', b: '60.00' })
    expect(() => computeShares(1000n, 2, { kind: 'single', personId: 'a' }, {
      method: 'adjustment', personIds: ['a', 'b'], adjustments: { b: '20' },
    })).toThrow(/larger than the total/)
  })

  it('supports several payers and checks they add up', () => {
    const ok = computeShares(9000n, 2, { kind: 'multiple', amounts: { a: '60', b: '30' } }, { method: 'equal', personIds: ['a', 'b', 'c'] })
    expect(ok).toEqual([
      { personId: 'a', paid: 6000n, owed: 3000n },
      { personId: 'b', paid: 3000n, owed: 3000n },
      { personId: 'c', paid: 0n, owed: 3000n },
    ])
    expect(() => computeShares(9000n, 2, { kind: 'multiple', amounts: { a: '60' } }, { method: 'equal', personIds: ['a'] }))
      .toThrow(/Paid amounts add up/)
  })

  it('rejects zero/negative totals and duplicate people', () => {
    expect(() => computeShares(0n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: ['a'] })).toThrow()
    expect(() => computeShares(100n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: ['a', 'a'] })).toThrow(/twice/)
    expect(() => computeShares(100n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: [] })).toThrow()
  })
})

describe('pairwiseDebts', () => {
  it('maps a simple one-payer split', () => {
    const shares = computeShares(9000n, 2, { kind: 'single', personId: 'a' }, { method: 'equal', personIds: ['a', 'b', 'c'] })
    expect(pairwiseDebts(shares)).toEqual([
      { from: 'b', to: 'a', amount: 3000n },
      { from: 'c', to: 'a', amount: 3000n },
    ])
  })

  it('treats a payment as the recipient owing the payer', () => {
    expect(pairwiseDebts([{ personId: 'a', paid: 500n, owed: 0n }, { personId: 'b', paid: 0n, owed: 500n }]))
      .toEqual([{ from: 'b', to: 'a', amount: 500n }])
  })

  it('is exact for random multi-payer expenses (property)', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let run = 0; run < 2000; run++) {
      const people = ['a', 'b', 'c', 'd', 'e'].slice(0, 2 + rnd(4))
      const cost = BigInt(1 + rnd(100000))
      const payers = people.filter(() => rnd(2) === 0)
      const realPayers = payers.length ? payers : [people[0]]
      const paid = allocate(cost, realPayers.map((id) => ({ id, weight: BigInt(1 + rnd(5)) })))
      const owed = allocate(cost, people.map((id) => ({ id, weight: BigInt(rnd(4)) })).filter((w) => w.weight > 0n).concat([{ id: people[0], weight: 1n }]).filter((w, i, arr) => arr.findIndex((x) => x.id === w.id) === i))
      const shares: Share[] = people.map((id) => ({ id, paid: paid.get(id) ?? 0n, owed: owed.get(id) ?? 0n }))
        .map(({ id, paid: p, owed: o }) => ({ personId: id, paid: p, owed: o }))
      const debts = pairwiseDebts(shares)
      for (const s of shares) {
        const out = sum(debts.filter((d) => d.from === s.personId).map((d) => d.amount))
        const inn = sum(debts.filter((d) => d.to === s.personId).map((d) => d.amount))
        expect(inn - out).toBe(s.paid - s.owed)
      }
      for (const d of debts) expect(d.amount > 0n).toBe(true)
    }
  })
})

describe('simplifyDebts', () => {
  it('collapses a chain', () => {
    const nets = new Map([['a', 1000n], ['b', 0n], ['c', -1000n]])
    expect(simplifyDebts(nets)).toEqual([{ from: 'c', to: 'a', amount: 1000n }])
  })

  it('preserves every net and uses at most n-1 transfers (property)', () => {
    let seed = 7
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    for (let run = 0; run < 1000; run++) {
      const n = 2 + rnd(7)
      const ids = Array.from({ length: n }, (_, i) => `p${i}`)
      const values = ids.map(() => BigInt(rnd(20000)) - 10000n)
      values[n - 1] -= sum(values)
      const nets = new Map(ids.map((id, i) => [id, values[i]]))
      const transfers = simplifyDebts(nets)
      expect(transfers.length).toBeLessThanOrEqual(n - 1)
      for (const id of ids) {
        const got = sum(transfers.filter((t) => t.to === id).map((t) => t.amount)) - sum(transfers.filter((t) => t.from === id).map((t) => t.amount))
        expect(got).toBe(nets.get(id))
      }
    }
  })

  it('refuses unbalanced input', () => {
    expect(() => simplifyDebts(new Map([['a', 5n]]))).toThrow(SplitMathError)
  })
})

describe('netPairs', () => {
  it('nets opposite debts between the same two people', () => {
    expect(netPairs([
      { from: 'a', to: 'b', amount: 500n },
      { from: 'b', to: 'a', amount: 200n },
      { from: 'c', to: 'a', amount: 100n },
      { from: 'a', to: 'c', amount: 100n },
    ])).toEqual([{ from: 'a', to: 'b', amount: 300n }])
  })
})
