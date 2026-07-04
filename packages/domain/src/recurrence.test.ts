import { describe, it, expect } from 'vitest'
import { nextOccurrences } from './recurrence.js'
import type { RecurringSchedule } from './recurrence.js'

function iso(y: number, m: number, d: number, h = 0, min = 0, s = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, s))
}

function isoStrings(dates: Date[]): string[] {
  return dates.map((d) => d.toISOString())
}

describe('nextOccurrences', () => {
  it('daily, interval 1: consecutive days after the anchor', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 3)
    expect(isoStrings(result)).toEqual([
      iso(2024, 1, 2).toISOString(),
      iso(2024, 1, 3).toISOString(),
      iso(2024, 1, 4).toISOString(),
    ])
  })

  it('daily, interval 3: every third day', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 3, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 3)
    expect(isoStrings(result)).toEqual([
      iso(2024, 1, 4).toISOString(),
      iso(2024, 1, 7).toISOString(),
      iso(2024, 1, 10).toISOString(),
    ])
  })

  it('weekly, interval 2, anchored mid-week: every other week on the same weekday', () => {
    // 2024-01-03 is a Wednesday
    const schedule: RecurringSchedule = { freq: 'weekly', interval: 2, startAt: iso(2024, 1, 3) }
    const result = nextOccurrences(schedule, iso(2024, 1, 3), 3)
    expect(isoStrings(result)).toEqual([
      iso(2024, 1, 17).toISOString(),
      iso(2024, 1, 31).toISOString(),
      iso(2024, 2, 14).toISOString(),
    ])
  })

  it('monthly on the 31st clamps through a non-leap February', () => {
    const schedule: RecurringSchedule = { freq: 'monthly', interval: 1, startAt: iso(2023, 1, 31) }
    const result = nextOccurrences(schedule, iso(2023, 1, 31), 3)
    expect(isoStrings(result)).toEqual([
      iso(2023, 2, 28).toISOString(), // clamped, non-leap
      iso(2023, 3, 31).toISOString(),
      iso(2023, 4, 30).toISOString(), // clamped (April has 30 days)
    ])
  })

  it('monthly on the 31st clamps through a leap February', () => {
    const schedule: RecurringSchedule = { freq: 'monthly', interval: 1, startAt: iso(2024, 1, 31) }
    const result = nextOccurrences(schedule, iso(2024, 1, 31), 2)
    expect(isoStrings(result)).toEqual([
      iso(2024, 2, 29).toISOString(), // clamped, leap year
      iso(2024, 3, 31).toISOString(),
    ])
  })

  it('yearly anchored on Feb 29 clamps to Feb 28 on a non-leap year', () => {
    const schedule: RecurringSchedule = { freq: 'yearly', interval: 1, startAt: iso(2024, 2, 29) }
    const result = nextOccurrences(schedule, iso(2024, 2, 29), 2)
    expect(isoStrings(result)).toEqual([
      iso(2025, 2, 28).toISOString(),
      iso(2026, 2, 28).toISOString(),
    ])
  })

  it('excludes an occurrence that falls exactly on `after` (strictly-after)', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 2), 1)
    expect(isoStrings(result)).toEqual([iso(2024, 1, 3).toISOString()])
  })

  it('truncates at endAt', () => {
    const schedule: RecurringSchedule = {
      freq: 'daily',
      interval: 1,
      startAt: iso(2024, 1, 1),
      endAt: iso(2024, 1, 4),
    }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 10)
    expect(isoStrings(result)).toEqual([
      iso(2024, 1, 2).toISOString(),
      iso(2024, 1, 3).toISOString(),
      iso(2024, 1, 4).toISOString(),
    ])
  })

  it('truncates at count even when more occurrences would exist', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 2)
    expect(result).toHaveLength(2)
  })

  it('interval 0 returns an empty array', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 0, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 5)
    expect(result).toEqual([])
  })

  it('negative interval also returns an empty array', () => {
    const schedule: RecurringSchedule = { freq: 'monthly', interval: -1, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 5)
    expect(result).toEqual([])
  })

  it('returns [] when count is 0', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt: iso(2024, 1, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 0)
    expect(result).toEqual([])
  })

  it('when `after` is before startAt, the first occurrence returned is startAt itself', () => {
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt: iso(2024, 6, 1) }
    const result = nextOccurrences(schedule, iso(2024, 1, 1), 1)
    expect(isoStrings(result)).toEqual([iso(2024, 6, 1).toISOString()])
  })

  it('yearly interval 2 skips a leap year correctly', () => {
    const schedule: RecurringSchedule = { freq: 'yearly', interval: 2, startAt: iso(2023, 3, 15) }
    const result = nextOccurrences(schedule, iso(2023, 3, 15), 2)
    expect(isoStrings(result)).toEqual([
      iso(2025, 3, 15).toISOString(),
      iso(2027, 3, 15).toISOString(),
    ])
  })

  it('preserves a non-midnight time-of-day from the anchor', () => {
    const schedule: RecurringSchedule = { freq: 'monthly', interval: 1, startAt: iso(2024, 1, 15, 9, 30, 45) }
    const result = nextOccurrences(schedule, iso(2024, 2, 1), 2)
    expect(isoStrings(result)).toEqual([
      iso(2024, 2, 15, 9, 30, 45).toISOString(),
      iso(2024, 3, 15, 9, 30, 45).toISOString(),
    ])
  })

  it('yearly Feb-29 anchor is restored (not left clamped) on the next leap year', () => {
    const schedule: RecurringSchedule = { freq: 'yearly', interval: 1, startAt: iso(2024, 2, 29) }
    const result = nextOccurrences(schedule, iso(2027, 6, 1), 2)
    expect(isoStrings(result)).toEqual([
      iso(2028, 2, 29).toISOString(), // leap year again: full anchor day restored
      iso(2029, 2, 28).toISOString(),
    ])
  })

  // ── far-future `after` (past the old 1000-iteration cliff) ────────────────

  const DAY_MS = 24 * 60 * 60 * 1000

  it('daily: `after` 5000 days past startAt still yields the correct next dates', () => {
    const startAt = iso(2024, 1, 1)
    const schedule: RecurringSchedule = { freq: 'daily', interval: 1, startAt }
    const after = new Date(startAt.getTime() + 5000 * DAY_MS) // exactly occurrence #5000
    const result = nextOccurrences(schedule, after, 3)
    expect(isoStrings(result)).toEqual([
      new Date(startAt.getTime() + 5001 * DAY_MS).toISOString(),
      new Date(startAt.getTime() + 5002 * DAY_MS).toISOString(),
      new Date(startAt.getTime() + 5003 * DAY_MS).toISOString(),
    ])
  })

  it('weekly interval 2: `after` thousands of weeks past startAt still yields correct dates', () => {
    const startAt = iso(2020, 1, 6) // a Monday
    const schedule: RecurringSchedule = { freq: 'weekly', interval: 2, startAt }
    // 2500 weeks out; occurrences fall every 14 days, so the next one is n=1251 (17514 days)
    const after = new Date(startAt.getTime() + 2500 * 7 * DAY_MS)
    const result = nextOccurrences(schedule, after, 2)
    expect(isoStrings(result)).toEqual([
      new Date(startAt.getTime() + 1251 * 14 * DAY_MS).toISOString(),
      new Date(startAt.getTime() + 1252 * 14 * DAY_MS).toISOString(),
    ])
  })

  it('monthly on the 31st: `after` more than 1000 months past startAt still clamps correctly', () => {
    const schedule: RecurringSchedule = { freq: 'monthly', interval: 1, startAt: iso(2000, 1, 31) }
    const result = nextOccurrences(schedule, iso(2150, 6, 15), 3) // ~1805 months past the anchor
    expect(isoStrings(result)).toEqual([
      iso(2150, 6, 30).toISOString(), // clamped (June has 30 days)
      iso(2150, 7, 31).toISOString(),
      iso(2150, 8, 31).toISOString(),
    ])
  })
})
