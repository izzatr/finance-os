export type LedgerPoint = { date: string; balance: number }
export type HoldingsPoint = { date: string; baseValue: number | null }
export type ValuePoint = { date: string; balance: number }

/**
 * Daily wallet value = ledger (cash) balance + market value of holdings on that day.
 *
 * Ledger points are end-of-day balances (sparse, any ISO timestamp). Holdings points come from
 * the portfolio history endpoint (one per day). A null holdings value means "no positions yet"
 * before the first valued day and "price not known" afterwards, so it counts as 0 before the
 * first valued day and carries the last known value forward after it. Days before holdings exist
 * are only included where the ledger moved, keeping old wallets' charts as sparse as before.
 */
export function buildValueTrend(ledger: LedgerPoint[], holdings: HoldingsPoint[]): ValuePoint[] {
  const ledgerByDay = new Map<string, number>()
  for (const point of [...ledger].sort((a, b) => a.date.localeCompare(b.date))) ledgerByDay.set(point.date.slice(0, 10), point.balance)

  const holdingsByDay = new Map<string, number | null>()
  for (const point of holdings) holdingsByDay.set(point.date.slice(0, 10), point.baseValue)
  const firstValuedDay = [...holdings].sort((a, b) => a.date.localeCompare(b.date)).find((point) => point.baseValue !== null)?.date.slice(0, 10) ?? null

  const days = new Set(ledgerByDay.keys())
  if (firstValuedDay) for (const day of holdingsByDay.keys()) if (day >= firstValuedDay) days.add(day)

  let cash = 0
  let holdingsValue = 0
  const out: ValuePoint[] = []
  for (const day of [...days].sort()) {
    if (ledgerByDay.has(day)) cash = ledgerByDay.get(day)!
    const valued = holdingsByDay.get(day)
    if (valued !== undefined && valued !== null) holdingsValue = valued
    out.push({ date: day, balance: Math.round((cash + holdingsValue) * 100) / 100 })
  }
  return out
}
