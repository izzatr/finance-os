import { buildValueTrend } from './valueTrend'

describe('buildValueTrend', () => {
  it('returns the plain ledger trend when there are no holdings', () => {
    expect(buildValueTrend(
      [{ date: '2026-02-03T10:00:00Z', balance: 200 }, { date: '2026-03-16T10:00:00Z', balance: 148.2 }],
      [],
    )).toEqual([{ date: '2026-02-03', balance: 200 }, { date: '2026-03-16', balance: 148.2 }])
  })

  it('adds holdings market value from the first valued day and carries cash forward', () => {
    const trend = buildValueTrend(
      [
        { date: '2025-06-30T00:00:00Z', balance: 2_500 },
        { date: '2026-10-31T10:44:00Z', balance: 0 },
      ],
      [
        { date: '2026-10-29', baseValue: null },
        { date: '2026-10-30', baseValue: null },
        { date: '2026-10-31', baseValue: 3_400.5 },
      ],
    )
    expect(trend).toEqual([
      { date: '2025-06-30', balance: 2_500 },
      { date: '2026-10-31', balance: 3_400.5 },
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
