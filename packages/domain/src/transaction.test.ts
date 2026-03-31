import { describe, it, expect } from 'vitest'
import {
  transactionSchema,
  transactionEntrySchema,
  transactionTypeSchema,
} from './index.js'
import type { Transaction, TransactionEntry } from './index.js'

// ── transactionEntrySchema ────────────────────────────────────────────────────

describe('transactionEntrySchema', () => {
  const valid: TransactionEntry = {
    walletId: '550e8400-e29b-41d4-a716-446655440000',
    assetId: '550e8400-e29b-41d4-a716-446655440001',
    amount: '1234.56',
  }

  it('accepts a valid positive decimal amount', () => {
    const result = transactionEntrySchema.safeParse({ ...valid })
    expect(result.success).toBe(true)
  })

  it('accepts a valid negative decimal amount', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '-99.99' })
    expect(result.success).toBe(true)
  })

  it('accepts a valid integer amount', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '10000' })
    expect(result.success).toBe(true)
  })

  it('accepts a valid negative integer amount', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '-10000' })
    expect(result.success).toBe(true)
  })

  it('accepts amount with no decimal part', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '0' })
    expect(result.success).toBe(true)
  })

  it('rejects amount with comma separator', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '1.234,56' })
    expect(result.success).toBe(false)
  })

  it('rejects amount with spaces', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '1 000' })
    expect(result.success).toBe(false)
  })

  it('rejects amount with leading + sign', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '+100' })
    expect(result.success).toBe(false)
  })

  it('rejects amount with currency symbol', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '€100' })
    expect(result.success).toBe(false)
  })

  it('rejects amount with trailing zeros stripped (e.g. 1.00.00)', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, amount: '1.00.00' })
    expect(result.success).toBe(false)
  })

  it('accepts notes if provided', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, notes: 'Monthly fee' })
    expect(result.success).toBe(true)
  })

  it('accepts notes as null', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, notes: null })
    expect(result.success).toBe(true)
  })

  it('accepts notes as undefined', () => {
    const { notes: _notes, ...rest } = valid
    const result = transactionEntrySchema.safeParse(rest)
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID walletId', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, walletId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects a non-UUID assetId', () => {
    const result = transactionEntrySchema.safeParse({ ...valid, assetId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})

// ── transactionSchema ─────────────────────────────────────────────────────────

describe('transactionSchema', () => {
  const validEntry: TransactionEntry = {
    walletId: '550e8400-e29b-41d4-a716-446655440000',
    assetId: '550e8400-e29b-41d4-a716-446655440001',
    amount: '100.00',
  }

  const base: Transaction = {
    transactionDate: '2026-03-27T00:00:00.000Z',
    type: 'expense' as const,
    description: 'Test transaction',
    entries: [validEntry],
  }

  describe('type field', () => {
    for (const type of ['expense', 'income', 'transfer', 'exchange', 'adjustment', 'fee'] as const) {
      it(`accepts type "${type}"`, () => {
        const result = transactionSchema.safeParse({ ...base, type })
        expect(result.success).toBe(true)
      })
    }

    it('rejects unknown transaction types', () => {
      const result = transactionSchema.safeParse({ ...base, type: 'unknown' as any })
      expect(result.success).toBe(false)
    })

    it('rejects empty string as type', () => {
      const result = transactionSchema.safeParse({ ...base, type: '' as any })
      expect(result.success).toBe(false)
    })
  })

  describe('transactionDate', () => {
    it('accepts ISO 8601 datetime with offset', () => {
      const result = transactionSchema.safeParse({ ...base, transactionDate: '2026-03-27T00:00:00.000Z' })
      expect(result.success).toBe(true)
    })

    it('accepts ISO 8601 datetime with +02:00 offset', () => {
      const result = transactionSchema.safeParse({ ...base, transactionDate: '2026-03-27T00:00:00.000+02:00' })
      expect(result.success).toBe(true)
    })

    it('rejects date without timezone offset', () => {
      const result = transactionSchema.safeParse({ ...base, transactionDate: '2026-03-27T00:00:00' })
      expect(result.success).toBe(false)
    })

    it('rejects plain date string', () => {
      const result = transactionSchema.safeParse({ ...base, transactionDate: '2026-03-27' })
      expect(result.success).toBe(false)
    })
  })

  describe('entries', () => {
    it('rejects empty entries array', () => {
      const result = transactionSchema.safeParse({ ...base, entries: [] })
      expect(result.success).toBe(false)
    })

    it('accepts multiple entries', () => {
      const result = transactionSchema.safeParse({
        ...base,
        entries: [
          validEntry,
          { ...validEntry, walletId: '550e8400-e29b-41d4-a716-446655440002', amount: '-50.00' },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('rejects entries with invalid amount', () => {
      const result = transactionSchema.safeParse({
        ...base,
        entries: [{ ...validEntry, amount: 'not-a-number' }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('description', () => {
    it('accepts a non-empty description', () => {
      const result = transactionSchema.safeParse({ ...base, description: 'Groceries purchase' })
      expect(result.success).toBe(true)
    })

    it('rejects an empty description', () => {
      const result = transactionSchema.safeParse({ ...base, description: '' })
      expect(result.success).toBe(false)
    })

    it('accepts a description at max length (255)', () => {
      const result = transactionSchema.safeParse({ ...base, description: 'x'.repeat(255) })
      expect(result.success).toBe(true)
    })

    it('rejects a description over 255 characters', () => {
      const result = transactionSchema.safeParse({ ...base, description: 'x'.repeat(256) })
      expect(result.success).toBe(false)
    })
  })

  describe('optional fields', () => {
    it('accepts notes as a string', () => {
      const result = transactionSchema.safeParse({ ...base, notes: 'Optional note' })
      expect(result.success).toBe(true)
    })

    it('accepts notes as null', () => {
      const result = transactionSchema.safeParse({ ...base, notes: null })
      expect(result.success).toBe(true)
    })

    it('omitting notes is valid', () => {
      const { notes: _notes, ...rest } = base
      const result = transactionSchema.safeParse(rest)
      expect(result.success).toBe(true)
    })

    it('accepts externalRef', () => {
      const result = transactionSchema.safeParse({ ...base, externalRef: 'tr-statement:2026-03:foo' })
      expect(result.success).toBe(true)
    })

    it('omitting id is valid (create mode)', () => {
      const result = transactionSchema.safeParse(base)
      expect(result.success).toBe(true)
    })
  })
})

// ── Regression: GH issue – double-escaped regex was breaking amounts ───────────
// This was the actual bug: `/-?\\d+(\\.\\d+)?$/` inside a regex literal
// made the amount validation reject all valid numeric strings.

describe('REGRESSION: GH amount validation (2026-03-27)', () => {
  const entry = {
    walletId: '550e8400-e29b-41d4-a716-446655440000',
    assetId: '550e8400-e29b-41d4-a716-446655440001',
  }

  const base = {
    transactionDate: '2026-03-27T00:00:00.000Z',
    type: 'expense' as const,
    description: 'Regression test',
    entries: [] as any[],
  }

  it('accepts amount "-123.45" (the original failing case)', () => {
    const result = transactionSchema.safeParse({
      ...base,
      entries: [{ ...entry, amount: '-123.45' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts amount "17671374" (large integer from Local Bank import)', () => {
    const result = transactionSchema.safeParse({
      ...base,
      entries: [{ ...entry, amount: '17671374' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts amount "-10000" (integer from Local Bank Feesible)', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'expense',
      entries: [{ ...entry, amount: '-10000' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts amount "-32.50" (floating point from skill example)', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'expense',
      entries: [{ ...entry, amount: '-32.50' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts income amount "4382407" (large integer income)', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'income',
      entries: [{ ...entry, amount: '4382407' }],
    })
    expect(result.success).toBe(true)
  })
})
