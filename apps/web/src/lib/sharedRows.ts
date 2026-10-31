import type { RecentTransaction } from './api'

export type ActivityRowItem = RecentTransaction & { id: string }

/**
 * A shared expense projects into the books as one transaction with up to two entries (the
 * Friends wallet and the wallet you paid from). Show it as one row: when both entries share a
 * currency the row carries their sum (your own share), otherwise the real-money leg. Everything
 * else stays one row per wallet entry, so a transfer still shows both legs.
 */
export function collapseSharedRows(rows: RecentTransaction[]): ActivityRowItem[] {
  const out: ActivityRowItem[] = []
  const byTx = new Map<string, ActivityRowItem>()
  const legs = new Map<string, RecentTransaction[]>()
  for (const r of rows) {
    if (!r.sharedExpenseId) {
      out.push({ ...r, id: r.entryId })
      continue
    }
    const seen = legs.get(r.id)
    if (seen) {
      seen.push(r)
      const all = seen
      const real = all.find((x) => !x.friendsWallet) ?? all[0]
      const sameCurrency = all.every((x) => x.currency === real.currency)
      const merged = byTx.get(r.id)!
      merged.amount = sameCurrency ? Math.round(all.reduce((s, x) => s + x.amount, 0) * 1e8) / 1e8 : real.amount
      merged.currency = real.currency
      merged.walletName = real.friendsWallet ? 'Shared' : `Shared · ${real.walletName}`
      continue
    }
    legs.set(r.id, [r])
    const row: ActivityRowItem = { ...r, id: r.entryId, walletName: r.friendsWallet ? 'Shared' : `Shared · ${r.walletName}` }
    byTx.set(r.id, row)
    out.push(row)
  }
  return out
}
