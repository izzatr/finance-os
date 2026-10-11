import { describe, expect, it } from 'vitest'
import { displayName, buildMonthReport, daysIn, shiftMonth, type ReportRow } from '../analytics/month-report'

// 1 EUR = 1.10 USD; IDR has no rate, so it must be reported as missing and excluded.
const convert = (amount: number, from: string) => (from === 'USD' ? amount : from === 'EUR' ? amount * 1.1 : null)

let n = 0
function row(date: string, type: 'income' | 'expense', amount: number, extra: Partial<ReportRow> = {}): ReportRow {
  n += 1
  return { transactionId: `t${n}`, date, type, amount, currency: 'USD', categoryId: null, categoryName: null, description: `tx ${n}`, ...extra }
}
const food = { categoryId: 'c-food', categoryName: 'Eating out' }
const rent = { categoryId: 'c-rent', categoryName: 'Rent', description: 'Landlord' }

describe('month helpers', () => {
  it('shifts across year boundaries and knows month lengths', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 3)).toBe('2027-02')
    expect(daysIn('2028-02')).toBe(29)
    expect(daysIn('2026-10')).toBe(31)
  })
})

describe('buildMonthReport', () => {
  const rows: ReportRow[] = [
    // Baseline: August and September (July is empty, so usual averages 2 months, not 3).
    row('2026-08-01', 'income', 3000),
    row('2026-08-02', 'expense', -1000, rent),
    row('2026-08-10', 'expense', -200, food),
    row('2026-09-01', 'income', 3000),
    row('2026-09-02', 'expense', -1000, rent),
    row('2026-09-20', 'expense', -400, food),
    // October, reported on the 10th.
    row('2026-10-01', 'income', 3200),
    row('2026-10-02', 'expense', -1000, rent),
    row('2026-10-05', 'expense', -90, { ...food, description: 'Hako ' }),
    row('2026-10-08', 'expense', -60, { ...food, description: 'hako', transactionId: 'split-dinner' }),
    row('2026-10-09', 'expense', -100, { currency: 'EUR', description: 'Train' }),
    row('2026-10-09', 'expense', -50000, { currency: 'IDR', description: 'Kopi' }),
  ]
  const report = buildMonthReport({
    month: '2026-10',
    currency: 'USD',
    today: '2026-10-10',
    rows,
    splits: [{ transactionId: 'split-dinner', currency: 'USD', amount: 30 }],
    convert,
  })

  it('counts only your share of split expenses and converts currencies', () => {
    // 1000 rent + 90 + (60 - 30 owed by a friend) + 100 EUR * 1.1
    expect(report.spent).toBe(1230)
    expect(report.fronted).toBe(30)
    expect(report.income).toBe(3200)
    expect(report.net).toBe(1970)
    expect(report.savingsRate).toBe(61.56)
    expect(report.missing).toEqual(['IDR'])
  })

  it('averages only earlier months that have activity', () => {
    expect(report.usual).toEqual({ months: 2, income: 3000, spent: 1300, net: 1700, savingsRate: 56.67 })
  })

  it('compares spend so far with the usual spend at the same day', () => {
    expect(report.daysElapsed).toBe(10)
    expect(report.spentByNow).toBe(1230)
    // By day 10: Aug 1000 + 200 = 1200, Sep 1000 → average 1100
    expect(report.usualByNow).toBe(1100)
    expect(report.pace).toHaveLength(31)
    expect(report.pace[9]).toEqual({ day: 10, current: 1230, usual: 1100 })
    expect(report.pace[10].current).toBeNull()
    expect(report.pace[30].usual).toBe(1300)
  })

  it('ranks categories with their usual amount, including uncategorized', () => {
    expect(report.categories).toEqual([
      { id: 'c-rent', name: 'Rent', spent: 1000, usual: 1000, count: 1 },
      { id: null, name: 'Uncategorized', spent: 110, usual: 0, count: 1 },
      { id: 'c-food', name: 'Eating out', spent: 120, usual: 300, count: 2 },
    ].sort((a, b) => b.spent - a.spent))
  })

  it('groups merchants case-insensitively and lists the biggest purchases', () => {
    expect(report.merchants[0]).toEqual({ name: 'Landlord', spent: 1000, count: 1 })
    expect(report.merchants).toContainEqual({ name: 'Hako', spent: 120, count: 2 })
    expect(report.biggest.map((b) => b.spent)).toEqual([1000, 110, 90])
  })

  it('returns twelve months of history ending at the report month', () => {
    expect(report.history).toHaveLength(12)
    expect(report.history[11]).toEqual({ month: '2026-10', income: 3200, spent: 1230, net: 1970 })
    expect(report.history[10]).toEqual({ month: '2026-09', income: 3000, spent: 1400, net: 1600 })
    expect(report.history[0].month).toBe('2025-11')
  })

  it('compares a finished short month with whole baseline months', () => {
    const sep = buildMonthReport({
      month: '2026-09', currency: 'USD', today: '2026-10-10', splits: [], convert,
      rows: [row('2026-08-31', 'expense', -50), row('2026-08-10', 'expense', -100), row('2026-09-05', 'expense', -120)],
    })
    expect(sep.usual?.spent).toBe(150)
    expect(sep.usualByNow).toBe(150)
    expect(sep.pace[29].usual).toBe(150)
  })

  it('treats past months as complete and has no usual without history', () => {
    const past = buildMonthReport({ month: '2026-08', currency: 'USD', today: '2026-10-10', rows, splits: [], convert })
    expect(past.daysElapsed).toBe(31)
    expect(past.usual).toBeNull()
    expect(past.usualByNow).toBeNull()
    expect(past.pace[30]).toEqual({ day: 31, current: 1200, usual: null })
  })
})

describe('displayName', () => {
  it('drops reference ids and FX notes so names stay short and group together', () => {
    expect(displayName('Claude.ai Subscription (USD 100.00) (USD 1 = IDR 17,643.74)')).toBe('Claude.ai Subscription')
    expect(displayName('Saveback cash reward 1872fdd5-f60e-42b5-bb8e-3e875cadcf71 for reservation: 1edb3591-b665-4ca5-b51a-aa011a44c09d')).toBe('Saveback cash reward')
    expect(displayName('Interest payment for payout collection 019de1a9-1f8f-7ada-8a71-9cf289f46ba1')).toBe('Interest payment for payout collection')
    expect(displayName('EDEKA 5494')).toBe('EDEKA 5494')
    expect(displayName('Rent')).toBe('Rent')
  })
})
