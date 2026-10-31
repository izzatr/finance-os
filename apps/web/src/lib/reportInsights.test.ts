import { describe, expect, it } from 'vitest'
import type { MonthReport } from './api'
import { averageSaved, biggestChanges, heroHeadline, monthLabel, ordinal, paceSentence, shiftMonth } from './reportInsights'

function report(over: Partial<MonthReport> = {}): MonthReport {
  return {
    month: '2026-10',
    currency: 'USD',
    daysInMonth: 31,
    daysElapsed: 31,
    income: 4000,
    spent: 3000,
    fronted: 0,
    net: 1000,
    savingsRate: 25,
    usual: { months: 3, income: 4000, spent: 3200, net: 800, savingsRate: 20 },
    pace: [],
    spentByNow: 3000,
    usualByNow: 3200,
    categories: [],
    merchants: [],
    biggest: [],
    incomeSources: [],
    history: [],
    missing: [],
    ...over,
  }
}

describe('report wording', () => {
  it('formats months and ordinals', () => {
    expect(monthLabel('2026-10')).toBe('October')
    expect(monthLabel('2026-10', { year: true })).toBe('October 2026')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(['1', '2', '3', '4', '11', '12', '13', '21', '22', '31'].map((d) => ordinal(Number(d)))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '31st'])
  })

  it('leads with what you kept, or the shortfall', () => {
    expect(heroHeadline(report())).toEqual({ title: 'You kept $1,000', detail: '25% of your income · usually 20%', tone: 'good' })
    expect(heroHeadline(report({ income: 2000, net: -1000, savingsRate: -50 })).title).toBe('You spent $1,000 more than you earned')
    expect(heroHeadline(report({ income: 0, net: -3000, savingsRate: null })).title).toBe('You spent $3,000')
    expect(heroHeadline(report({ income: 0, spent: 0, net: 0, savingsRate: null })).title).toBe('Nothing recorded yet')
  })

  it('leads a running month with spending pace, not a noisy net', () => {
    expect(heroHeadline(report({ daysElapsed: 11, income: 2650, net: -690, spentByNow: 3340, usualByNow: 2952 }))).toEqual({
      title: '$3,340 spent so far',
      detail: '$388 more than usual by the 11th',
      tone: 'bad',
    })
    expect(heroHeadline(report({ daysElapsed: 2, spentByNow: 40, usual: null, usualByNow: null })).detail).toBeNull()
  })

  it('compares pace with the usual spend by the same day', () => {
    expect(paceSentence(report({ daysElapsed: 10, spentByNow: 1300, usualByNow: 1100 }))).toEqual({ title: '$200 more than usual by the 10th', tone: 'bad' })
    expect(paceSentence(report({ spentByNow: 3000, usualByNow: 3200 }))).toEqual({ title: '$200 less than usual', tone: 'good' })
    expect(paceSentence(report({ spentByNow: 3010, usualByNow: 3000 })).title).toBe('Right on your usual pace')
    expect(paceSentence(report({ usual: null, usualByNow: null, daysElapsed: 3, spentByNow: 50 })).title).toBe('$50 spent so far')
  })

  it('reports category changes, and only safe claims mid-month', () => {
    const categories = [
      { id: 'a', name: 'Eating out', spent: 520, usual: 300, count: 9 },
      { id: 'b', name: 'Groceries', spent: 250, usual: 400, count: 6 },
      { id: 'c', name: 'Health', spent: 90, usual: 0, count: 1 },
      { id: 'd', name: 'Rent', spent: 1500, usual: 1500, count: 1 },
    ]
    expect(biggestChanges(report({ categories })).map((c) => [c.name, c.direction, c.text])).toEqual([
      ['Eating out', 'up', '$220 more than usual'],
      ['Groceries', 'down', '$150 less than usual'],
      ['Health', 'new', '$90, usually nothing'],
    ])
    expect(biggestChanges(report({ categories, daysElapsed: 12 })).map((c) => [c.name, c.text])).toEqual([
      ['Eating out', 'Already $220 over a usual month'],
      ['Health', '$90, usually nothing'],
    ])
    expect(biggestChanges(report({ categories, usual: null }))).toEqual([])
  })

  it('averages saved money over complete months with activity', () => {
    const history = [
      { month: '2026-07', income: 0, spent: 0, net: 0 },
      { month: '2026-08', income: 4000, spent: 3000, net: 1000 },
      { month: '2026-09', income: 4000, spent: 3500, net: 500 },
      { month: '2026-10', income: 4000, spent: 100, net: 3900 },
    ]
    expect(averageSaved(report({ history, daysElapsed: 5 }))).toEqual({ amount: 750, months: 2 })
    expect(averageSaved(report({ history }))).toEqual({ amount: 1800, months: 3 })
  })
})
