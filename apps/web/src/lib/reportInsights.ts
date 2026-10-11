import type { MonthReport } from './api'
import { formatMoney } from './format'

/*
 * Plain-language sentences for the Reports page. Kept pure so the wording rules are tested:
 * a report is only useful if every sentence is true, so mid-month numbers are compared with
 * the usual spend *by the same day*, never with a whole usual month.
 */

export function monthLabel(month: string, opts: { year?: boolean } = {}): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC', ...(opts.year ? { year: 'numeric' } : {}) })
}

export function shortMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export const isInProgress = (r: MonthReport) => r.daysElapsed > 0 && r.daysElapsed < r.daysInMonth

/** Differences of the whole amounts shown on screen, so the sentence matches mental math. */
export const shownDiff = (a: number, b: number) => Math.round(a) - Math.round(b)

/** Ignore differences smaller than this share of the comparison (or a tiny absolute amount). */
function meaningful(diff: number, base: number): boolean {
  return Math.abs(diff) >= Math.max(base * 0.05, 1)
}

export function heroHeadline(r: MonthReport): { title: string; detail: string | null; tone: 'good' | 'bad' | 'neutral' } {
  const fmt = (n: number) => formatMoney(Math.abs(n), r.currency)
  // A running month's net is noise (pay often lands on the 1st and 15th, rent on the 1st),
  // so lead with spending against the usual pace instead of "you kept / overspent".
  if (isInProgress(r)) {
    const pace = r.usualByNow === null ? null : paceSentence(r)
    return { title: `${fmt(r.spentByNow)} spent so far`, detail: pace?.title ?? null, tone: pace?.tone ?? 'neutral' }
  }
  let title: string
  if (r.income === 0 && r.spent === 0) title = 'Nothing recorded yet'
  else if (r.income === 0) title = `You spent ${fmt(r.spent)}`
  else if (r.net >= 0) title = `You kept ${fmt(r.net)}`
  else title = `You spent ${fmt(r.net)} more than you earned`

  let detail: string | null = null
  if (r.savingsRate !== null && r.net >= 0) {
    detail = `${Math.round(r.savingsRate)}% of your income`
    if (r.usual?.savingsRate != null) detail += ` · usually ${Math.round(r.usual.savingsRate)}%`
  }
  return { title, detail, tone: r.net >= 0 ? 'good' : 'bad' }
}

export function paceSentence(r: MonthReport): { title: string; tone: 'good' | 'bad' | 'neutral' } {
  const fmt = (n: number) => formatMoney(Math.abs(n), r.currency)
  if (r.daysElapsed === 0) return { title: 'This month has not started yet', tone: 'neutral' }
  if (r.usualByNow === null) {
    return { title: isInProgress(r) ? `${fmt(r.spentByNow)} spent so far` : `${fmt(r.spent)} spent`, tone: 'neutral' }
  }
  const diff = shownDiff(r.spentByNow, r.usualByNow)
  const when = isInProgress(r) ? ` by the ${ordinal(r.daysElapsed)}` : ''
  if (!meaningful(diff, r.usualByNow)) return { title: `Right on your usual pace${when}`, tone: 'neutral' }
  return diff > 0
    ? { title: `${fmt(diff)} more than usual${when}`, tone: 'bad' }
    : { title: `${fmt(diff)} less than usual${when}`, tone: 'good' }
}

export type Change = { name: string; spent: number; usual: number; diff: number; text: string; direction: 'up' | 'down' | 'new' }

/**
 * The categories that moved the most against a usual month. While the month is still running,
 * only report categories that already went past a whole usual month (a safe claim); "down"
 * would be meaningless before the month ends.
 */
export function biggestChanges(r: MonthReport, limit = 3): Change[] {
  if (!r.usual) return []
  const fmt = (n: number) => formatMoney(Math.abs(n), r.currency)
  const running = isInProgress(r)
  const out: Change[] = []
  for (const c of r.categories) {
    const usual = c.usual ?? 0
    const diff = shownDiff(c.spent, usual)
    // Big enough to matter for this category, and at least $15-ish in absolute terms.
    if (Math.abs(diff) < Math.max(usual * 0.05, 15)) continue
    if (usual === 0) {
      out.push({ name: c.name, spent: c.spent, usual, diff, direction: 'new', text: `${fmt(c.spent)}, usually nothing` })
    } else if (diff > 0) {
      out.push({ name: c.name, spent: c.spent, usual, diff, direction: 'up', text: running ? `Already ${fmt(diff)} over a usual month` : `${fmt(diff)} more than usual` })
    } else if (!running) {
      out.push({ name: c.name, spent: c.spent, usual, diff, direction: 'down', text: `${fmt(diff)} less than usual` })
    }
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, limit)
}

export function averageSaved(r: MonthReport): { amount: number; months: number } | null {
  // Months with any activity, excluding the running month (incomplete months skew it).
  const months = r.history.filter((h) => (h.income !== 0 || h.spent !== 0) && !(h.month === r.month && isInProgress(r)))
  if (months.length < 2) return null
  return { amount: months.reduce((s, h) => s + h.net, 0) / months.length, months: months.length }
}
