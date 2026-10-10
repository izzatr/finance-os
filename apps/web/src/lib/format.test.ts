import { describe, expect, it } from 'vitest'
import { ArrowDownLeft, ArrowLeftRight, Bus, ShoppingCart, Tag, Utensils } from 'lucide-react'
import { dayLabel, formatCurrency, formatCurrencyShort, formatSigned, groupByDay, splitMoney } from './format'
import { categoryIcon } from './categoryIcon'

describe('money formatting', () => {
  it('formats EUR with two decimals and IDR without', () => {
    expect(formatCurrency(1234.5, 'EUR')).toBe('€1,234.50')
    expect(formatCurrency(-50000, 'IDR')).toBe('-Rp50.000')
  })

  it('shortens millions for tiles but keeps smaller values exact', () => {
    expect(formatCurrencyShort(18_400_000, 'IDR')).toBe('Rp18.4M')
    expect(formatCurrencyShort(31880.04, 'EUR')).toBe('€31,880.04')
  })

  it('always signs list amounts with a true minus', () => {
    expect(formatSigned(10, 'EUR')).toBe('+€10.00')
    expect(formatSigned(-4.2, 'EUR')).toBe('\u2212€4.20')
  })

  it('splits cents off for the hero number', () => {
    expect(splitMoney(39421.8, 'EUR')).toEqual({ whole: '€39,421', cents: '.80' })
    expect(splitMoney(18400000, 'IDR')).toEqual({ whole: 'Rp18.400.000', cents: '' })
  })
})

describe('groupByDay', () => {
  const now = new Date(2026, 9, 10, 15, 0)
  // stored like the API does: the calendar date at 12:00 UTC
  const at = (d: number) => `2026-10-${String(d).padStart(2, '0')}T12:00:00.000Z`

  it('groups by local day, labels today/yesterday, and totals per currency', () => {
    const groups = groupByDay(
      [
        { id: 'a', transactionDate: at(10), amount: -42.18, currency: 'EUR', type: 'expense' },
        { id: 'b', transactionDate: at(10), amount: -3.8, currency: 'EUR', type: 'expense' },
        { id: 'c', transactionDate: at(10), amount: -50000, currency: 'IDR', type: 'expense' },
        { id: 'd', transactionDate: at(9), amount: 3450, currency: 'EUR', type: 'income' },
        { id: 'e', transactionDate: at(9), amount: -200, currency: 'EUR', type: 'transfer' },
        { id: 'f', transactionDate: at(6), amount: -12.42, currency: 'EUR', type: 'expense' },
      ],
      now,
    )
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', dayLabel('2026-10-06', now)])
    expect(groups[0].items.map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect(groups[0].totals).toEqual([
      { currency: 'EUR', amount: expect.closeTo(-45.98, 5) },
      { currency: 'IDR', amount: -50000 },
    ])
    // transfers move money between your own wallets, so they do not count toward the day
    expect(groups[1].totals).toEqual([{ currency: 'EUR', amount: 3450 }])
  })

  it('keeps a noon-UTC date on its calendar day even late in the evening locally', () => {
    const lateNight = new Date(2026, 9, 10, 23, 30)
    expect(groupByDay([{ transactionDate: at(10), amount: -1, currency: 'EUR', type: 'expense' }], lateNight)[0].label).toBe('Today')
  })

  it('adds the year only outside the current year', () => {
    expect(dayLabel('2026-10-06', now)).not.toMatch(/2026/)
    expect(dayLabel('2025-10-06', now)).toMatch(/2025/)
  })
})

describe('categoryIcon', () => {
  it('matches common category names', () => {
    expect(categoryIcon('Groceries')).toBe(ShoppingCart)
    expect(categoryIcon('Eating out')).toBe(Utensils)
    expect(categoryIcon('Public transport')).toBe(Bus)
  })

  it('falls back by transaction type', () => {
    expect(categoryIcon(null, 'transfer')).toBe(ArrowLeftRight)
    expect(categoryIcon('Misc', 'income')).toBe(ArrowDownLeft)
    expect(categoryIcon('Misc', 'expense')).toBe(Tag)
  })
})
