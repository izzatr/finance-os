import { describe, expect, it } from 'vitest'
import { nextRepeat, nextRepeatAfter } from './expenses'

const at = (d: string) => new Date(`${d}T12:00:00.000Z`)
const next = (d: string, i: Parameters<typeof nextRepeat>[1]) => nextRepeat(at(d), i)?.toISOString().slice(0, 10) ?? null

describe('nextRepeat', () => {
  it('steps each interval', () => {
    expect(next('2026-10-13', 'never')).toBeNull()
    expect(next('2026-10-13', 'weekly')).toBe('2026-10-20')
    expect(next('2026-10-13', 'fortnightly')).toBe('2026-10-27')
    expect(next('2026-10-13', 'monthly')).toBe('2026-11-13')
    expect(next('2026-10-13', 'quarterly')).toBe('2027-01-13')
    expect(next('2026-10-13', 'yearly')).toBe('2027-10-13')
  })

  it('clamps to the end of shorter months', () => {
    expect(next('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(next('2026-11-30', 'quarterly')).toBe('2027-02-28')
    expect(next('2027-11-30', 'quarterly')).toBe('2028-02-29')
    expect(next('2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  it('keeps the time of day', () => {
    expect(nextRepeat(at('2026-10-13'), 'quarterly')!.toISOString()).toBe('2027-01-13T12:00:00.000Z')
  })

  it('skips to the first occurrence after now', () => {
    expect(nextRepeatAfter(at('2026-01-13'), 'quarterly', at('2026-10-14'))!.toISOString().slice(0, 10)).toBe('2027-01-13')
  })
})
