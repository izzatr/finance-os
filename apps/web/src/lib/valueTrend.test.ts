import { buildValueTrend } from './valueTrend'

describe('buildValueTrend', () => {
  it('returns the plain ledger trend when there are no holdings', () => {
    expect(buildValueTrend(
      [{ date: '2026-01-14T10:00:00Z', balance: 100 }, { date: '2026-02-28T10:00:00Z', balance: 65.73 }],
      [],
    )).toEqual([{ date: '2026-01-14', balance: 100 }, { date: '2026-02-28', balance: 65.73 }])
  })

  it('adds holdings market value from the first valued day and carries cash forward', () => {
    const trend = buildValueTrend(
      [
        { date: '2025-06-30T00:00:00Z', balance: 2_655_000 },
        { date: '2026-10-31T10:44:00Z', balance: 0 },
      ],
      [
        { date: '2026-10-29', baseValue: null },
        { date: '2026-10-30', baseValue: null },
        { date: '2026-10-31', baseValue: 34_123_846.94 },
      ],
    )
    expect(trend).toEqual([
      { date: '2025-06-30', balance: 2_655_000 },
      { date: '2026-10-31', balance: 34_123_846.94 },
    ])
  })

  it('carries the last known holdings value over days with a missing price', () => {
    const trend = buildValueTrend(
      [{ date: '2026-10-01T00:00:00Z', balance: 10 }],
      [
        { date: '2026-10-02', baseValue: 100 },
        { date: '2026-10-03', baseValue: null },
        { date: '2026-10-04', baseValue: 120 },
      ],
    )
    expect(trend.map((point) => point.balance)).toEqual([10, 110, 110, 130])
  })
})
